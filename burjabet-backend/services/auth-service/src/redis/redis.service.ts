import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Cluster, Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redisClient: Cluster | Redis;

  constructor(private configService: ConfigService) {
    const redisNodes = this.configService.get<string>('REDIS_NODES');
    const redisHost = this.configService.get<string>('REDIS_HOST');
    const redisPort = this.configService.get<string>('REDIS_PORT');

    console.log('redisNodes', redisNodes);
    console.log('redisHost', redisHost);
    console.log('redisPort', redisPort);

    if (redisNodes && redisNodes.includes(',')) {
      // Redis Cluster mode
      const nodes = redisNodes.split(',').map((node) => {
        const [host, port] = node.trim().split(':');
        return { host, port: parseInt(port, 10) };
      });

      this.redisClient = new Cluster(nodes, {
        redisOptions: {
          // password: this.configService.get<string>('REDIS_PASSWORD'),
        },
      });
    } else {
      // Redis Standalone mode
      const host = redisHost || 'localhost';
      const port = parseInt(redisPort || '6379', 10);

      this.redisClient = new Redis({
        host,
        port,
        password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      });
    }

    this.redisClient.on('ready', () => console.log('✅ Redis ready'));
    this.redisClient.on('error', (error) => console.error('Redis error', error));
  }

  async get(key: string): Promise<string | null> {
    return await this.redisClient.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redisClient.setex(key, ttlSeconds, value);
    } else {
      await this.redisClient.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redisClient.exists(key);
    return result === 1;
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
  }
}
