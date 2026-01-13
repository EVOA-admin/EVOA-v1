import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto/users.dto';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) { }

    async getProfile(userId: string) {
        return this.userRepository.findOne({ where: { id: userId } });
    }

    async updateProfile(userId: string, dto: UpdateProfileDto) {
        await this.userRepository.update({ id: userId }, dto);
        return this.userRepository.findOne({ where: { id: userId } });
    }
}
