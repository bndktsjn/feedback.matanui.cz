import { IsString, IsOptional, MinLength, MaxLength, Matches, IsUrl } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @IsUrl({}, { message: 'baseUrl must be a valid URL' })
  @MaxLength(512)
  baseUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
