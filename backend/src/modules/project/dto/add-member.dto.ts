import { IsString, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CosRole } from '@cos/types';

export class AddMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  user_id!: string;

  @ApiProperty({ enum: CosRole })
  @IsString()
  @IsEnum(CosRole)
  role!: CosRole;
}
