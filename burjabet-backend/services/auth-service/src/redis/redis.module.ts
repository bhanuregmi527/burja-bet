import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [ ConfigModule.forRoot({
    isGlobal: true,
    envFilePath: '.env',
  })],
  providers: [RedisService, ConfigService],
  exports: [RedisService, ConfigService],
})
export class RedisModule {}
