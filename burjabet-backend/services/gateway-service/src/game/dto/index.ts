import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PlaceBetDto {
  @ApiProperty({ description: 'Bet amount in SOL' })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({ description: 'Symbol to bet on (Langur Burja symbol)' })
  @IsString()
  @IsNotEmpty()
  symbol: string;
}

export class PlaceBetResponseDto {
  @ApiProperty({ description: 'Whether the bet was placed successfully' })
  success: boolean;

  @ApiProperty({ description: 'Bet ID', required: false })
  betId?: string;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Updated user points', required: false })
  points?: number;
}

export class CurrentRoundResponseDto {
  @ApiProperty({ description: 'Round ID' })
  roundId: string;

  @ApiProperty({ description: 'Round status' })
  status: string;

  @ApiProperty({ description: 'Current phase (1: Betting, 2: Rolling, 3: Settlement)' })
  phase: number;

  @ApiProperty({ description: 'Time remaining in current phase (seconds)' })
  timeRemaining: number;

  @ApiProperty({ description: 'Dice results (JSON string)', required: false })
  result: string | null;
}

