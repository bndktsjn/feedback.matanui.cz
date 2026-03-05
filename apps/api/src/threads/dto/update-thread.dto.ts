import { IsString, IsOptional, IsEnum, IsNumber, MaxLength, MinLength } from 'class-validator';

export class UpdateThreadDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  message?: string;

  @IsOptional()
  @IsEnum(['open', 'in_progress', 'resolved', 'closed'])
  status?: string;

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
  @IsString()
  @MaxLength(512)
  targetSelector?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  screenshotUrl?: string;
}
