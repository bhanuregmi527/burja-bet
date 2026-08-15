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
          KAFKA_BROKERS: z.string().min(1, 'KAFKA_BROKERS is required'),
          PORT: z.number().int().positive().optional(),
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
