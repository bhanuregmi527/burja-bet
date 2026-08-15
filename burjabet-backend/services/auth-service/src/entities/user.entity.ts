import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
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

  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fullname: string | null;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  invite_code: string | null;

  @Column({ type: 'text', nullable: true })
  profile_picture: string | null;

  @OneToOne(() => require('./twitter.entity').TwitterAccount, (twitter: any) => twitter.user, { nullable: true })
  twitter: any | null;

  @Column({ type: 'integer', default: 0 })
  burja_points: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}

