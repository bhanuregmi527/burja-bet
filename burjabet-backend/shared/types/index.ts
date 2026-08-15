// Shared types across microservices

export enum GameRoundStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum BetStatus {
  PENDING = 'PENDING',
  WON = 'WON',
  LOST = 'LOST',
}

export interface UserDepositEvent {
  walletAddress: string;
  amount: string; // SOL amount as string
  signature: string;
  timestamp: number;
  roundId: string; // Round ID encoded in the deposit tx memo
}

export interface GamePayoutEvent {
  walletAddress: string;
  amount: string; // SOL amount as string
  roundId: string;
  betIds: string[];
}

export interface GameRoundResult {
  dice1: number;
  dice2: number;
  dice3: number;
}

export interface BetRequest {
  userId: string;
  amount: string;
  symbol: string; // Langur Burja symbol
}

export interface AuthRequest {
  walletAddress: string;
  signature: string;
  message: string; // Full message that was signed (must include timestamp)
}

