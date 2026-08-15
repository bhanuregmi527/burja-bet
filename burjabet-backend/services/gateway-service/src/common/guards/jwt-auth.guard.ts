import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

type GrpcCallback<T> = (err: grpc.ServiceError | null, res?: T) => void;

interface AuthServiceClient {
  validateToken(
    request: any,
    callback: GrpcCallback<{
      Response?: { Valid?: boolean; UserId?: string; WalletAddress?: string };
    }>,
  ): grpc.ClientUnaryCall;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private authServiceClient: AuthServiceClient;

  constructor(private configService: ConfigService) {
    const PROTO_PATH = join(__dirname, '../proto/auth.proto');
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const authProto = grpc.loadPackageDefinition(
      packageDefinition,
    ) as any;

    const authPkg = authProto?.burja?.auth?.v1;
    if (!authPkg?.AuthService) {
      throw new Error('AuthService client not found in loaded proto (expected package burja.auth.v1)');
    }

    const authServiceUrl =
      this.configService.get<string>('AUTH_GRPC_URL') ||
      'localhost:50051';

    const client = new authPkg.AuthService(
      authServiceUrl,
      grpc.credentials.createInsecure(),
    );

    this.authServiceClient = client;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const response = await new Promise<any>((resolve, reject) => {
        this.authServiceClient.validateToken(
          {
            RequestHeader: {},
            Body: { Token: token },
          },
          (err, res) => {
          if (err) return reject(err);
          if (!res) return reject(new UnauthorizedException('Empty auth response'));
          resolve(res);
          },
        );
      });

      const valid = Boolean(response?.Response?.Valid);
      if (!valid) {
        throw new UnauthorizedException('Invalid token');
      }

      // Attach user info to request
      request.user = {
        id: response?.Response?.UserId,
        walletAddress: response?.Response?.WalletAddress,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token validation failed');
    }
  }
}

