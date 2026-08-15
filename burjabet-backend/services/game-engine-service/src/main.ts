import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Burja Bet - Game Engine Service API')
    .setDescription('Game loop, RNG, and betting logic')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Connect gRPC microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'game',
      protoPath: join(__dirname, './proto/game.proto'),
      url: `0.0.0.0:${process.env.GRPC_PORT || 50052}`,
    },
  });

  // Start all microservices
  await app.startAllMicroservices();

  const port = process.env.PORT || 3003;
  await app.listen(port, '0.0.0.0');
  console.log(`Game engine service is running on: http://0.0.0.0:${port}`);
  console.log(`Swagger documentation: http://0.0.0.0:${port}/api`);
  console.log(`gRPC server running on: 0.0.0.0:${process.env.GRPC_PORT || 50052}`);
}

bootstrap();

