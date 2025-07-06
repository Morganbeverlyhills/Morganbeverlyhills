import { Injectable } from '@nestjs/common';

@Injectable()
export class SmsService {
  // In future we will inject queue, database, and SMS provider
  async sendBulk(): Promise<void> {
    // TODO: Implement bulk SMS logic
  }
}