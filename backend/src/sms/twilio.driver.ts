import { Injectable, Logger } from '@nestjs/common';
import { ISmsDriver } from './interfaces/sms-driver.interface';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as twilio from 'twilio';

@Injectable()
export class TwilioDriver implements ISmsDriver {
  private readonly client: twilio.Twilio;
  private readonly from: string;
  private readonly logger = new Logger(TwilioDriver.name);

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.from = process.env.TWILIO_FROM || '';

    if (!accountSid || !authToken || !this.from) {
      this.logger.warn('Twilio credentials not fully set; SMS sending disabled.');
      // Provide dummy client, calls will reject.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.client = {};
      return;
    }
    this.client = twilio(accountSid, authToken);
  }

  async send(to: string, body: string): Promise<void> {
    if (!this.client || !this.from) {
      this.logger.warn('Twilio not configured, skipping send.');
      return;
    }
    try {
      await this.client.messages.create({ to, from: this.from, body });
      this.logger.debug(`SMS sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send SMS to ${to}`, err as Error);
    }
  }
}