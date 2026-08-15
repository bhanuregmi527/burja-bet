export abstract class ISecretsAdapter {
  SERVICE_NAME: string;
  LOG_LEVEL: string;
  PORT?: number;
  GRPC_PORT?: number;
  NODE_ENV?: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  POSTGRES_URL: string;
  REDIS_NODES?: string;
}
