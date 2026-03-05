import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ThreadEnvironmentDto } from '../../threads/dto/thread-environment.dto';

export class OverlayCreateThreadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(1)
  message!: string;

  @IsString()
  @MaxLength(2048)
  pageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  pageTitle?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsOptional()
  @IsEnum(['general', 'bug', 'design', 'content'])
  type?: string;

  @IsOptional()
  @IsEnum(['pin', 'panel'])
  contextType?: string;

  @IsOptional()
  @IsEnum(['desktop', 'tablet', 'mobile'])
  viewport?: string;

  @IsOptional()
  @IsNumber()
  xPct?: number;

  @IsOptional()
  @IsNumber()
  yPct?: number;

  @IsOptional()
  anchorData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  targetSelector?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  screenshotUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  authorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  authorEmail?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThreadEnvironmentDto)
  environment?: ThreadEnvironmentDto;
}
