import { Injectable, UnauthorizedException, ConflictException, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { User } from '../entities/user.entity';
import { RedisService } from '../redis/redis.service';
import { UserRepository } from '../repositories/user.repository';
import { AuthRequest } from '@shared/types';
import { 
  LoginRequestDto, 
  LoginResponseDto, 
  UpdateUserRequestDto, 
  UpdateUserResponseDto,
  ErrorResponseDto,
} from './dto';
import {
  buildSuccessResponseHeader,
  buildErrorResponseHeader,
  getRequestId,
} from './utils/grpc-helpers';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async login(loginRequest: LoginRequestDto): Promise<LoginResponseDto> {
    const requestId = getRequestId(loginRequest.RequestHeader);
    const { walletAddress, signature, message } = loginRequest.Body;

    try {
      const timestampMatch = message.match(/Timestamp:\s*(\d+)/);
      if (!timestampMatch) {
        throw new UnauthorizedException('Message must contain a timestamp');
      }

      const messageTimestamp = parseInt(timestampMatch[1], 10);
      const currentTime = Date.now();
      const maxAge = 5 * 60 * 1000;

      if (Math.abs(currentTime - messageTimestamp) > maxAge) {
        throw new UnauthorizedException('Message expired. Please sign again.');
      }

      const signatureHash = Buffer.from(signature, 'base64').toString('hex');
      const usedSignatureKey = `used_signature:${signatureHash}`;
      const wasUsed = await this.redisService.exists(usedSignatureKey);
      
      if (wasUsed) {
        throw new UnauthorizedException('This signature has already been used');
      }

      await this.redisService.set(usedSignatureKey, '1', 600);

      const messageBytes = new TextEncoder().encode(message);

      let signatureBytes: Uint8Array;
      try {
        signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
      } catch (error) {
        throw new UnauthorizedException('Invalid signature format');
      }

      let publicKey: PublicKey;
      try {
        publicKey = new PublicKey(walletAddress);
      } catch (error) {
        throw new UnauthorizedException('Invalid wallet address format');
      }

      try {
        const publicKeyBytes = publicKey.toBytes();
        const isValid = nacl.sign.detached.verify(
          messageBytes,
          signatureBytes,
          publicKeyBytes,
        );

        if (!isValid) {
          throw new UnauthorizedException('Signature verification failed');
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException('Signature verification error');
      }

      let user = await this.userRepository.findByWalletAddress(walletAddress, false);

      if (!user) {
        const inviteCode = this.generateInviteCode();
        console.log('inviteCode', inviteCode);
        user = await this.userRepository.create({
          wallet_address: walletAddress,
          balance_sol: '0.000000000',
          invite_code: inviteCode,
        });
      }

      const payload = {
        sub: user.id,
        userId: user.id,
        walletAddress: user.wallet_address,
      };
      const accessToken = this.jwtService.sign(payload);

      return {
        ResponseHeader: buildSuccessResponseHeader(
          requestId,
          'Login Successful',
          'User authenticated successfully',
        ),
        Response: {
          accessToken,
          user: {
            id: user.id,
            walletAddress: user.wallet_address,
            balanceSol: user.balance_sol,
            createdAt: user.created_at,
          },
        },
      };
    } catch (error) {
      const errorResponse: ErrorResponseDto = {
        ResponseHeader: buildErrorResponseHeader(
          requestId,
          error.status?.toString() || '401',
          error.message || 'Authentication failed',
          'Authentication Error',
          error.message || 'Invalid signature or expired message',
        ),
      };

      throw new HttpException(errorResponse, error.status || HttpStatus.UNAUTHORIZED);
    }
  }

  async validateToken(token: string): Promise<{ valid: boolean; userId?: string; walletAddress?: string }> {
    try {
      const payload = this.jwtService.verify(token);
      return {
        valid: true,
        userId: payload.userId || payload.sub,
        walletAddress: payload.walletAddress,
      };
    } catch (error) {
      return {
        valid: false,
      };
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    return await this.userRepository.findById(userId, false);
  }

  async getUserByWallet(walletAddress: string): Promise<User | null> {
    return await this.userRepository.findByWalletAddress(walletAddress, false);
  }

  async updateUser(
    userId: string,
    updateRequest: UpdateUserRequestDto,
  ): Promise<UpdateUserResponseDto> {
    const requestId = getRequestId(updateRequest.RequestHeader);
    const updateData = updateRequest.Body;

    try {
      const user = await this.userRepository.findById(userId, false);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check username uniqueness if username is being updated
      if (updateData.username && updateData.username !== user.username) {
        const existingUser = await this.userRepository.findByUsername(updateData.username, false);
        if (existingUser && existingUser.id !== userId) {
          throw new ConflictException('Username already taken');
        }
      }

      const updatePayload: Partial<User> = {};
      if (updateData.username !== undefined) {
        updatePayload.username = updateData.username || null;
      }
      if (updateData.fullname !== undefined) {
        updatePayload.fullname = updateData.fullname || null;
      }
      if (updateData.profilePicture !== undefined) {
        updatePayload.profile_picture = updateData.profilePicture || null;
      }

      const updatedUser = await this.userRepository.update(userId, updatePayload);

      return {
        ResponseHeader: buildSuccessResponseHeader(
          requestId,
          'User Updated',
          'User profile updated successfully',
        ),
        Response: {
          id: updatedUser.id,
          walletAddress: updatedUser.wallet_address,
          balanceSol: updatedUser.balance_sol,
          username: updatedUser.username,
          fullname: updatedUser.fullname,
          inviteCode: updatedUser.invite_code,
          profilePicture: updatedUser.profile_picture,
          twitter: updatedUser.twitter
            ? {
                id: updatedUser.twitter.id,
                twitterId: updatedUser.twitter.twitter_id,
                name: updatedUser.twitter.name,
                displayName: updatedUser.twitter.display_name,
              }
            : null,
          burjaPoints: updatedUser.burja_points,
          createdAt: updatedUser.created_at,
          updatedAt: updatedUser.updated_at,
        },
      };
    } catch (error) {
      const statusCode = error.status || (error instanceof HttpException ? error.getStatus() : 500);
      const errorResponse: ErrorResponseDto = {
        ResponseHeader: buildErrorResponseHeader(
          requestId,
          statusCode.toString(),
          error.message || 'Failed to update user',
          'Update Error',
          error.message || 'An error occurred while updating user profile',
        ),
      };

      throw new HttpException(errorResponse, statusCode);
    }
  }

  private generateInviteCode(): string {
    // Generate a random 8-character alphanumeric code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async registerBotUser(
    walletAddress: string,
    username: string,
    avatar: string,
  ): Promise<{ token: string; userId: string }> {
    try {
      // Check if user already exists
      let user = await this.userRepository.findByWalletAddress(walletAddress);

      if (!user) {
        // Create new bot user
        user = new User();
        user.wallet_address = walletAddress;
        user.username = username;
        user.profile_picture = avatar;
        user.bio = 'Vault Liquidity Provider';
        user.balance_sol = '0';
        user.burja_points = 0;
        user.invite_code = this.generateInviteCode();

        await this.userRepository.save(user);
      }

      // Generate JWT token
      const token = this.jwtService.sign(
        { sub: user.id, wallet: user.wallet_address },
        { expiresIn: '7d' }
      );

      return { token, userId: user.id };
    } catch (error) {
      throw new HttpException(
        {
          message: 'Failed to register bot user',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}

