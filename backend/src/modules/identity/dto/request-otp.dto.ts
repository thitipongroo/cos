import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestOtpDto {
  @ApiProperty({ example: '+66812345678', description: 'E.164 format phone number' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'phoneNumber must be E.164 format (e.g. +66812345678)' })
  phoneNumber!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+66812345678' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneNumber!: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be a 6-digit number' })
  otp!: string;
}
