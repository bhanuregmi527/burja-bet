import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // SecretsModule validates all env vars during app module initialization
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  const logger = new Logger('Bootstrap');
  logger.log('Bot service started. Running scheduled tasks...');

  // The app runs as a worker; no HTTP listener needed.
  process.on('SIGINT', async () => {
    logger.log('Shutting down bot service...');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start bot service', err);
  process.exit(1);
});
