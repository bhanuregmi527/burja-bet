import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISecretsAdapter } from './adapter';

@Injectable()
export class SecretsService implements ISecretsAdapter {
  constructor(private readonly config: ConfigService) {}

  SERVICE_NAME = this.config.get('SERVICE_NAME') || 'auth-service';
  LOG_LEVEL = this.config.get('LOG_LEVEL') || 'info';
  
  PORT = this.config.get('PORT') ? parseInt(this.config.get('PORT'), 10) : 3001;
  GRPC_PORT = this.config.get('GRPC_PORT') ? parseInt(this.config.get('GRPC_PORT'), 10) : 50051;
  NODE_ENV = this.config.get('NODE_ENV');

  JWT_SECRET = this.config.get('JWT_SECRET');
  JWT_EXPIRES_IN = this.config.get('JWT_EXPIRES_IN');
  POSTGRES_URL = this.config.get('POSTGRES_URL');
  REDIS_NODES = this.config.get('REDIS_NODES');
}
