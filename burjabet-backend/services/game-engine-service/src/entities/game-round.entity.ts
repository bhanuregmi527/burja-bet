import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { GameRoundStatus, GameRoundResult } from '../types';

@Entity('game_rounds')
export class GameRound {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb', nullable: true })
  result: GameRoundResult | null;

  @Column({
    type: 'enum',
    enum: GameRoundStatus,
    default: GameRoundStatus.OPEN,
  })
  status: GameRoundStatus;

  @OneToMany(() => require('./bet.entity').Bet, (bet: any) => bet.round)
  bets: any[];

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}

