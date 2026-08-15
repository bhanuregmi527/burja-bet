import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { GameEngineService } from './game-engine.service';

interface PlaceBetRequest {
  userId: string;
  amount: string;
  symbol: string;
}

interface PlaceBetResponse {
  success: boolean;
  betId: string;
  message: string;
  points?: number;
}

interface GetCurrentRoundRequest {
  // Empty
}

interface GetCurrentRoundResponse {
  roundId: string;
  status: string;
  phase: number;
  timeRemaining: number;
  result: string;
  deposits: string; // JSON string of deposits array
}

@Controller()
export class GameEngineGrpcController {
  constructor(private readonly gameEngineService: GameEngineService) {}

  @GrpcMethod('GameEngineService', 'PrepareBet')
  async prepareBet(data: PlaceBetRequest): Promise<PlaceBetResponse> {
    const result = await this.gameEngineService.prepareBet({
      userId: data.userId,
      amount: data.amount,
      symbol: data.symbol,
    });

    return {
      success: result.success,
      betId: result.betId || '',
      message: result.message,
      points: result.points,
    };
  }

  @GrpcMethod('GameEngineService', 'PlaceBet')
  async placeBet(data: PlaceBetRequest): Promise<PlaceBetResponse> {
    try {
      const result = await this.gameEngineService.placeBet({
        userId: data.userId,
        amount: data.amount,
        symbol: data.symbol,
      });

      return {
        success: result.success,
        betId: result.betId || '',
        message: result.message,
        points: result.points,
      };
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'Internal error';
      // Never let exceptions bubble to gRPC client as INTERNAL.
      return { success: false, betId: '', message: msg };
    }
  }

  @GrpcMethod('GameEngineService', 'GetCurrentRound')
  async getCurrentRound(
    data: GetCurrentRoundRequest,
  ): Promise<GetCurrentRoundResponse> {
    const round = await this.gameEngineService.getCurrentRound();

    return {
      roundId: round.roundId,
      status: round.status,
      phase: round.phase,
      timeRemaining: round.timeRemaining,
      result: round.result || '',
      deposits: JSON.stringify(round.deposits || []),
    };
  }
}

