import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { GatewayModule } from './gateway/gateway.module';
import { GameModule } from './game/game.module';
import { WebsocketModule } from './websocket/websocket.module';
import { AuthModule } from './auth/auth.module';
import { SecretsModule } from './secrets';

@Module({
  imports: [
    SecretsModule, // Validates env vars on startup
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    GatewayModule,
    GameModule,
    AuthModule,
    WebsocketModule,
  ],
})
export class AppModule {}

