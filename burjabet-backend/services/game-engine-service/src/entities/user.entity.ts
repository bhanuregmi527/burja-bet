import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 44, unique: true })
  wallet_address: string;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 9,
    default: '0.000000000',
  })
  balance_sol: string;

  @Column({ type: 'integer', default: 0 })
  burja_points: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}

