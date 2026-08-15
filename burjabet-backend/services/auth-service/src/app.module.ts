import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { User } from './entities/user.entity';
import { TwitterAccount } from './entities/twitter.entity';
import { SecretsModule } from './secrets';

@Module({
  imports: [
    SecretsModule, // Validates env vars on startup
    ConfigModule.forRoot({
      isGlobal: true
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      ...(process.env.POSTGRES_URL
        ? { url: process.env.POSTGRES_URL }
        : {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT),
            username: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE,
          }),
      entities: [User, TwitterAccount],
      migrations: ['dist/migrations/*.js'],
      migrationsTableName: 'typeorm_migrations',
      migrationsRun: process.env.NODE_ENV !== 'test', // auto-run migrations on startup
      synchronize: false, // Use migrations instead of synchronize in production
      logging: process.env.NODE_ENV === 'development',
      retryAttempts: 3,
      retryDelay: 3000,
    }),
    AuthModule,
  ],
})
export class AppModule {}

