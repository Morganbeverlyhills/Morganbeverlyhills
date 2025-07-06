import { Injectable } from '@nestjs/common';
import { TwilioDriver } from './twilio.driver';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

interface SendBulkInput {
  numbers: string[];
  message: string;
}

@Injectable()
export class SmsService {
  constructor(
    private readonly driver: TwilioDriver,
    private readonly prisma: PrismaService,
  ) {}

  async sendBulk(input: SendBulkInput): Promise<void> {
    const { numbers, message } = input;
    const batchId = uuidv4();
    // For now we store plaintext, later encrypt
    await this.prisma.batch.create({
      data: {
        id: batchId,
        cipherText: message,
        recipients: numbers.length,
      },
    });

    await Promise.all(numbers.map((n) => this.driver.send(n, message)));
  }
}