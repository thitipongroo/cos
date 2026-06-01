import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CosRole, CosSubRole } from '@cos/types';

export class ChangeRoleDto {
  @ApiProperty({ enum: [...Object.values(CosRole), ...Object.values(CosSubRole)] })
  @IsEnum({ ...CosRole, ...CosSubRole })
  role!: CosRole | CosSubRole;
}
