import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISecretsAdapter } from './adapter';

@Injectable()
export class SecretsService implements ISecretsAdapter {
  constructor(private readonly config: ConfigService) {}

  SERVICE_NAME = this.config.get('SERVICE_NAME') || 'gateway-service';
  LOG_LEVEL = this.config.get('LOG_LEVEL') || 'info';

  PORT = this.config.get('PORT') ? parseInt(this.config.get('PORT'), 10) : 3004;
  NODE_ENV = this.config.get('NODE_ENV');
  CORS_ORIGIN = this.config.get('CORS_ORIGIN') || '*';

  AUTH_SERVICE_URL = this.config.get('AUTH_SERVICE_URL');
  AUTH_GRPC_URL = this.config.get('AUTH_GRPC_URL');
  GAME_ENGINE_GRPC_URL = this.config.get('GAME_ENGINE_GRPC_URL');
}
