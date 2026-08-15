// Local types for game-engine-service
// Defined locally to avoid shared module resolution issues

export enum GameRoundStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum BetStatus {
  PREPARED = 'PREPARED', // Bet intent prepared, awaiting on-chain deposit
  PENDING = 'PENDING',
  WON = 'WON',
  LOST = 'LOST',
}

export interface GameRoundResult {
  dice1: number;
  dice2: number;
  dice3: number;
  dice4: number;
  dice5: number;
  dice6: number;
}

export interface GamePayoutEvent {
  walletAddress: string;
  amount: string; // SOL amount as string
  roundId: string;
  betIds: string[];
}

export interface UserDepositEvent {
  walletAddress: string;
  amount: string; // SOL amount as string
  signature: string;
  timestamp: number;
  roundId: string;
}

export interface BetRequest {
  userId: string;
  amount: string;
  symbol: string; // Langur Burja symbol
}

