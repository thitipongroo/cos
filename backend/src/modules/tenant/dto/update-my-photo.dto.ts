import { IsOptional, IsString, IsUrl, ValidateIf, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMyPhotoDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'File-service URL of the uploaded image, or null to clear the photo and fall back to initials.',
    example: 'https://files.cos.local/f/9f1c…/avatar.jpg',
  })
  @IsOptional()
  // null is a meaningful value here (clear the photo), so the URL rules only apply to a real string.
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(2048)
  @IsUrl({ require_tld: false })
  photo_url?: string | null;
}
