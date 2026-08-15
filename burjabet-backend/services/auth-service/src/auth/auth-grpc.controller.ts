import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { buildSuccessResponseHeader } from './utils/grpc-helpers';

@Controller()
export class AuthGrpcController {
  constructor(private readonly authService: AuthService) {}

  @GrpcMethod('AuthService', 'ValidateToken')
  async validateToken(data: any): Promise<any> {
    const token = data?.Body?.Token || '';
    const result = await this.authService.validateToken(token);

    return {
      ResponseHeader: buildSuccessResponseHeader(
        data?.RequestHeader?.RequestId,
        'Token Validation',
        'Token validation completed',
      ),
      Response: {
        Valid: Boolean(result.valid),
        UserId: result.userId || '',
        WalletAddress: result.walletAddress || '',
      },
    };
  }

  @GrpcMethod('AuthService', 'GetUserById')
  async getUserById(data: any): Promise<any> {
    const userId = data?.Body?.UserId || '';
    const walletAddress = data?.Body?.WalletAddress || '';

    const user = userId
      ? await this.authService.getUserById(userId)
      : walletAddress
        ? await this.authService.getUserByWallet(walletAddress)
        : null;

    return {
      ResponseHeader: buildSuccessResponseHeader(
        data?.RequestHeader?.RequestId,
        'Get User',
        'User fetched successfully',
      ),
      Response: user
        ? {
            Id: user.id,
            WalletAddress: user.wallet_address,
            BalanceSol: user.balance_sol,
            CreatedAt: user.created_at?.toISOString?.() || String(user.created_at),
          }
        : {
            Id: '',
            WalletAddress: '',
            BalanceSol: '0',
            CreatedAt: '',
          },
    };
  }
}


