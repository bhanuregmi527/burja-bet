import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlockchainModule } from './blockchain/blockchain.module';
import { SecretsModule } from './secrets';

@Module({
  imports: [
    SecretsModule, // Validates env vars on startup
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BlockchainModule,
  ],
})
export class AppModule {}

