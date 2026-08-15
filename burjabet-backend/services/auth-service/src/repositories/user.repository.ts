import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findById(userId: string, includeTwitter = false): Promise<User | null> {
    return await this.userRepository.findOne({ 
      where: { id: userId },
      ...(includeTwitter && { relations: ['twitter'] }),
    });
  }

  async findByWalletAddress(walletAddress: string, includeTwitter = false): Promise<User | null> {
    return await this.userRepository.findOne({ 
      where: { wallet_address: walletAddress },
      ...(includeTwitter && { relations: ['twitter'] }),
    });
  }

  async findByUsername(username: string, includeTwitter = false): Promise<User | null> {
    return await this.userRepository.findOne({ 
      where: { username },
      ...(includeTwitter && { relations: ['twitter'] }),
    });
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return await this.userRepository.save(user);
  }

  async save(user: User): Promise<User> {
    return await this.userRepository.save(user);
  }

  async update(userId: string, updateData: Partial<User>): Promise<User> {
    await this.userRepository.update({ id: userId }, updateData);
    const updatedUser = await this.findById(userId, true);
    if (!updatedUser) {
      throw new Error('User not found after update');
    }
    return updatedUser;
  }
}

