import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GameService } from './game.service';
import { PlaceBetDto, PlaceBetResponseDto, CurrentRoundResponseDto } from './dto';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@ApiTags('Game')
@Controller('game')
export class GameController {
  private readonly logger = new Logger(GameController.name);
  constructor(
    private readonly gameService: GameService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @Post('bet/prepare')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prepare a bet (awaiting on-chain deposit)' })
  @ApiResponse({
    status: 200,
    description: 'Bet prepared successfully',
    type: PlaceBetResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async prepareBet(
    @Body() placeBetDto: PlaceBetDto,
    @Request() req: any,
  ): Promise<PlaceBetResponseDto> {
    const userId = req.user.id;
    const result = await this.gameService.prepareBet(
      userId,
      placeBetDto.amount,
      placeBetDto.symbol,
    );

    return {
      success: result.success,
      betId: result.betId,
      message: result.message,
    };
  }

  @Post('bet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Place a bet' })
  @ApiResponse({
    status: 200,
    description: 'Bet placed successfully',
    type: PlaceBetResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async placeBet(
    @Body() placeBetDto: PlaceBetDto,
    @Request() req: any,
  ): Promise<PlaceBetResponseDto> {
    const userId = req.user.id;
    const walletAddress = req.user.walletAddress || '';
    this.logger.log(
      `[PlaceBet] request received userId=${userId} symbol=${placeBetDto.symbol} amount=${placeBetDto.amount}`,
    );
    const result = await this.gameService.placeBet(
      userId,
      placeBetDto.amount,
      placeBetDto.symbol,
    );
    this.logger.log(
      `[PlaceBet] response userId=${userId} success=${result.success} betId=${result.betId || ''} message=${result.message}`,
    );

    // Emit deposit activity event if bet was successful
    if (result.success && walletAddress) {
      // Truncate wallet address for display (first 4 + last 4 chars)
      const truncatedWallet = walletAddress.length > 8
        ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
        : walletAddress;

      // Normalize symbol to lowercase to match frontend
      const normalizedSymbol = placeBetDto.symbol.toLowerCase();

      this.websocketGateway.broadcastDepositActivity({
        player: truncatedWallet,
        symbol: normalizedSymbol,
        amount: parseFloat(placeBetDto.amount),
      });

      // Send points update to frontend (client will filter by userId)
      if (result.points !== undefined) {
        this.websocketGateway.broadcastPointsUpdate({
          userId,
          points: result.points,
        });
      }
    }

    return {
      success: result.success,
      betId: result.betId,
      message: result.message,
      points: result.points,
    };
  }

  @Get('round/current')
  @ApiOperation({ summary: 'Get current game round information' })
  @ApiResponse({
    status: 200,
    description: 'Current round information',
    type: CurrentRoundResponseDto,
  })
  async getCurrentRound(): Promise<CurrentRoundResponseDto> {
    return await this.gameService.getCurrentRound();
  }
}

