import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class AuthService {
  private readonly httpClient: AxiosInstance;
  private readonly authServiceUrl: string;

  constructor(private configService: ConfigService) {
    this.authServiceUrl =
      this.configService.get<string>('AUTH_SERVICE_URL') ||
      'http://localhost:3001';

    this.httpClient = axios.create({
      baseURL: this.authServiceUrl,
      timeout: 5000,
    });
  }

  // Proxy to auth-service (which exposes POST /login, expecting { Body: { walletAddress, signature, message } })
  async login(loginDto: any) {
    const response = await this.httpClient.post('/login', loginDto);
    return response.data;
  }

  // Register bot user with wallet, username, and avatar
  async registerBotUser(
    wallet: string,
    username: string,
    avatar: string
  ): Promise<{ token: string; userId: string }> {
    const response = await this.httpClient.post('/bot/register', {
      walletAddress: wallet,
      username,
      avatar,
    });
    return response.data;
  }
}
