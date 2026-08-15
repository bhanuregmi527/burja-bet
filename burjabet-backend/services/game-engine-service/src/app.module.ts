import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { GameEngineModule } from './game-engine/game-engine.module';
import { GameRound } from './entities/game-round.entity';
import { Bet } from './entities/bet.entity';
import { User } from './entities/user.entity';
import { RoundDeposit } from './entities/round-deposit.entity';
import { SecretsModule } from './secrets';

@Module({
  imports: [
    SecretsModule, // Validates env vars on startup
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
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
      // Entities managed by this service
      entities: [User, GameRound, Bet, RoundDeposit],
      migrations: ['dist/migrations/*.js'],
      migrationsTableName: 'typeorm_migrations',
      migrationsRun: process.env.NODE_ENV !== 'test',
      synchronize: false,
      // logging: process.env.NODE_ENV === 'development',
      retryAttempts: 3,
      retryDelay: 3000,
    }),
    GameEngineModule,
  ],
})
export class AppModule {}

