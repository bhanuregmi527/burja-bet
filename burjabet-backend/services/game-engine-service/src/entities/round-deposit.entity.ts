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

@Entity('round_deposits')
@Index(['round_id'])
@Index(['user_id'])
@Index(['signature'], { unique: true })
export class RoundDeposit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  round_id: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 9,
  })
  amount: string; // SOL amount as string

  @Column({ type: 'varchar', length: 255 })
  signature: string; // Solana tx signature

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}


