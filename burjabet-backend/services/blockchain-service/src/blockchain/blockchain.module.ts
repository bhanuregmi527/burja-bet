import { Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { BlockchainController } from './blockchain.controller';
import { KafkaModule } from '../kafka/kafka.module';
import { SolanaModule } from '../solana/solana.module';

@Module({
  imports: [KafkaModule, SolanaModule],
  controllers: [BlockchainController],
  providers: [BlockchainService],
  exports: [BlockchainService],
})
export class BlockchainModule {}

