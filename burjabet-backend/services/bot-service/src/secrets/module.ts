import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { ISecretsAdapter } from './adapter';
import { SecretsService } from './service';
import { LogLevelEnum } from './types';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env'],
      isGlobal: true,
    }),
  ],
  providers: [
    {
      provide: ISecretsAdapter,
      useFactory: (config: ConfigService) => {
        const SecretsSchema = z.object({
          SERVICE_NAME: z.string(),
          LOG_LEVEL: z.nativeEnum(LogLevelEnum).optional(),
          SOLANA_RPC_URL: z.string().url('SOLANA_RPC_URL must be a valid URL'),
          GATEWAY_URL: z.string().min(1, 'GATEWAY_URL is required'),
          WS_URL: z.string().min(1, 'WS_URL is required'),
          AUTH_SERVICE_URL: z.string().min(1, 'AUTH_SERVICE_URL is required'),
          BOT_DEPOSIT_SOL: z.number().positive().optional(),
          BOT_BET_SOL: z.number().positive().optional(),
          FUNDING_WALLET_SECRET_KEY: z.string().optional(),
        });

        const secret = new SecretsService(config);

        try {
          return SecretsSchema.parse(secret);
        } catch (error) {
          const message = error.issues.map(
            (i) => `❌ SecretsService.${i.path.join('.')}: ${i.message}`,
          ).join('\n');
          throw new Error(`\n${message}`);
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [ISecretsAdapter],
})
export class SecretsModule {}
