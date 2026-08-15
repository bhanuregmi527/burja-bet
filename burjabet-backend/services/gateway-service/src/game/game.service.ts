import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';
import { Observable } from 'rxjs';

type GrpcCallback<T> = (err: grpc.ServiceError | null, res?: T) => void;

interface GameEngineServiceClient {
  prepareBet(
    request: {
      userId: string;
      amount: string;
      symbol: string;
    },
    callback: GrpcCallback<{ success: boolean; betId: string; message: string }>,
  ): grpc.ClientUnaryCall;

  placeBet(
    request: {
      userId: string;
      amount: string;
      symbol: string;
    },
    callback: GrpcCallback<{ success: boolean; betId: string; message: string; points?: number | string }>,
  ): grpc.ClientUnaryCall;

  getCurrentRound(
    request: {},
    callback: GrpcCallback<{
      roundId: string;
      status: string;
      phase: number;
      timeRemaining: number;
      result: string;
      deposits: string;
    }>,
  ): grpc.ClientUnaryCall;
}

@Injectable()
export class GameService {
  private gameEngineClient: GameEngineServiceClient;

  constructor(private configService: ConfigService) {
    const PROTO_PATH = join(__dirname, '../common/proto/game.proto');
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const gameProto = grpc.loadPackageDefinition(
      packageDefinition,
    ) as any;

    const gamePkg = gameProto?.game;
    if (!gamePkg?.GameEngineService) {
      throw new Error('GameEngineService client not found in loaded proto (expected package game)');
    }

    const gameServiceUrl =
      this.configService.get<string>('GAME_ENGINE_GRPC_URL') ||
      'localhost:50052';

    const client = new gamePkg.GameEngineService(
      gameServiceUrl,
      grpc.credentials.createInsecure(),
    );

    this.gameEngineClient = client;
  }

  async prepareBet(
    userId: string,
    amount: string,
    symbol: string,
  ): Promise<{ success: boolean; betId?: string; message: string }> {
    return new Promise((resolve, reject) => {
      this.gameEngineClient.prepareBet({ userId, amount, symbol }, (err, res) => {
        if (err) return reject(err);
        if (!res) return reject(new Error('Empty response from game-engine prepareBet'));
        resolve(res);
      });
    });
  }

  async placeBet(
    userId: string,
    amount: string,
    symbol: string,
  ): Promise<{ success: boolean; betId?: string; message: string; points?: number }> {
    return new Promise((resolve, reject) => {
      this.gameEngineClient.placeBet({ userId, amount, symbol }, (err, res) => {
        if (err) return reject(err);
        if (!res) return reject(new Error('Empty response from game-engine placeBet'));
        const points = res.points !== undefined ? Number(res.points) : undefined;
        resolve({ ...res, points });
      });
    });
  }

  async getCurrentRound(): Promise<{
    roundId: string;
    status: string;
    phase: number;
    timeRemaining: number;
    result: string | null;
    deposits: Array<{ player: string; symbol: string; amount: number }>;
  }> {
    return new Promise((resolve, reject) => {
      this.gameEngineClient.getCurrentRound({}, (err, response) => {
        if (err) return reject(err);
        if (!response) return reject(new Error('Empty response from game-engine getCurrentRound'));
        let deposits: Array<{ player: string; symbol: string; amount: number }> = [];
        try {
          deposits = response.deposits ? JSON.parse(response.deposits) : [];
        } catch (e) {
          // If parsing fails, use empty array
          deposits = [];
        }
        resolve({
          ...response,
          result: response.result || null,
          deposits,
        });
      });
    });
  }
}

