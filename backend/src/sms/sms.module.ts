import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { TwilioDriver } from './twilio.driver';

@Module({
  providers: [SmsService, TwilioDriver],
  exports: [SmsService],
})
export class SmsModule {}