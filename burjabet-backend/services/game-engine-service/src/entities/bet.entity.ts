import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { BetStatus } from '../types';

@Entity('bets')
@Index(['round_id'])
@Index(['user_id'])
export class Bet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  round_id: string;

  @ManyToOne(() => require('./game-round.entity').GameRound, (round: any) => round.bets)
  @JoinColumn({ name: 'round_id' })
  round: any;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 9,
  })
  amount: string;

  @Column({ type: 'varchar', length: 50 })
  symbol: string; // Langur Burja symbol

  @Column({
    type: 'enum',
    enum: BetStatus,
    default: BetStatus.PENDING,
  })
  status: BetStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  deposit_signature: string | null; // Solana transaction signature that activated this bet

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}

