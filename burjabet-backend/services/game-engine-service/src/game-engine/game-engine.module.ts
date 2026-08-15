import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameEngineService } from './game-engine.service';
import { GameEngineGrpcController } from './game-engine-grpc.controller';
import { GameRound } from '../entities/game-round.entity';
import { Bet } from '../entities/bet.entity';
import { User } from '../entities/user.entity';
import { RoundDeposit } from '../entities/round-deposit.entity';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GameRound, Bet, User, RoundDeposit]),
    KafkaModule,
  ],
  controllers: [GameEngineGrpcController],
  providers: [GameEngineService],
  exports: [GameEngineService],
})
export class GameEngineModule {}

