import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { BotModule } from './bot/bot.module';
import { SecretsModule } from './secrets';

@Module({
  imports: [
    SecretsModule, // Validates env vars on startup
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    HttpModule,
    BotModule,
  ],
})
export class AppModule {}
