// Step-up verification DTOs (ADR-078). class-validator, never hand-written checks (QM-4).

import { IsIn, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { STEP_UP_ACTIONS, type StepUpAction } from '../step-up/step-up.service';

export class RequestStepUpDto {
  // A closed set, not a free string. The action is half of what the minted token is bound to, so an
  // open field would let a caller mint a token for an action nobody has reviewed.
  @ApiProperty({ enum: STEP_UP_ACTIONS, description: 'The high-value action being confirmed' })
  @IsIn(STEP_UP_ACTIONS as unknown as string[])
  action!: StepUpAction;
}

export class VerifyStepUpDto {
  @ApiProperty({ enum: STEP_UP_ACTIONS })
  @IsIn(STEP_UP_ACTIONS as unknown as string[])
  action!: StepUpAction;

  @ApiProperty({ example: '123456', description: '6-digit code from SMS or email' })
  @IsString()
  @Length(6, 6)
  // Digits only. Without this a caller could submit a 6-character string that is not a code at all
  // and still burn one of the three attempts — cheap, but it is an attempt budget worth protecting.
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}
