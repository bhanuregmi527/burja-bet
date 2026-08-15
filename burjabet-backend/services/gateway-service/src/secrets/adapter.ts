export abstract class ISecretsAdapter {
  SERVICE_NAME: string;
  LOG_LEVEL: string;

  PORT?: number;
  NODE_ENV?: string;
  CORS_ORIGIN?: string;

  AUTH_SERVICE_URL: string;
  AUTH_GRPC_URL: string;
  GAME_ENGINE_GRPC_URL: string;
}
