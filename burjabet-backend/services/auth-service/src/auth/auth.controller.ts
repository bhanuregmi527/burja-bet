import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { 
  LoginRequestDto, 
  LoginResponseDto, 
  ErrorResponseDto,
  UpdateUserRequestDto,
  UpdateUserResponseDto,
} from './dto';

@ApiTags('User')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with wallet signature' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid signature',
    type: ErrorResponseDto,
  })
  async login(@Body() loginRequest: LoginRequestDto): Promise<LoginResponseDto> {
    return await this.authService.login(loginRequest);
  }

  @Post('user/update')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UpdateUserResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Username already taken',
    type: ErrorResponseDto,
  })
  async updateUser(
    @Body() updateRequest: UpdateUserRequestDto,
    @Request() req: any,
  ): Promise<UpdateUserResponseDto> {
    const userId = req.user.id;
    return await this.authService.updateUser(userId, updateRequest);
  }

  @Post('bot/register')
  @HttpCode(HttpStatus.OK)
  async registerBotUser(
    @Body() body: { walletAddress: string; username: string; avatar: string }
  ): Promise<{ token: string; userId: string }> {
    return await this.authService.registerBotUser(body.walletAddress, body.username, body.avatar);
  }
}