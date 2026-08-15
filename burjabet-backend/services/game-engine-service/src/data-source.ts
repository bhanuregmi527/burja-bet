import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';
import { User } from './entities/user.entity';
import { GameRound } from './entities/game-round.entity';
import { Bet } from './entities/bet.entity';

config();

export default new DataSource({
  type: 'postgres',
  ...(process.env.POSTGRES_URL
    ? { url: process.env.POSTGRES_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_DATABASE || 'burja',
      }),
  entities: [User, GameRound, Bet],
  migrations: [
    path.join(__dirname, 'migrations', '*.js'),
    path.join(__dirname, 'migrations', '*.ts'),
  ],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
//   logging: process.env.NODE_ENV === 'production',
});

