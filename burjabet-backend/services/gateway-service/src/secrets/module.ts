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
          PORT: z.number().int().positive().optional(),
          NODE_ENV: z.string().optional(),
          CORS_ORIGIN: z.string().optional(),
          AUTH_SERVICE_URL: z.string().min(1, 'AUTH_SERVICE_URL is required'),
          AUTH_GRPC_URL: z.string().min(1, 'AUTH_GRPC_URL is required'),
          GAME_ENGINE_GRPC_URL: z.string().min(1, 'GAME_ENGINE_GRPC_URL is required'),
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
