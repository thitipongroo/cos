import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CosRole } from '@cos/types';

export class ChangeRoleDto {
  @ApiProperty({ enum: Object.values(CosRole) })
  @IsEnum(CosRole)
  role!: CosRole;
}
