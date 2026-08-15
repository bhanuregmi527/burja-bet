import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SolanaService } from './solana.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [SolanaService],
  exports: [SolanaService],
})
export class SolanaModule {}

