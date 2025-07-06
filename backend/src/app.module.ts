import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsModule } from './sms/sms.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SmsModule,
    BlockchainModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}