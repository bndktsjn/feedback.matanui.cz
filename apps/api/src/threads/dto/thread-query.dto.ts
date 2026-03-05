import { IsOptional, IsEnum, IsInt, IsString, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ThreadQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number = 20;

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
  @IsString()
  @MaxLength(2048)
  pageUrl?: string;

  @IsOptional()
  @IsEnum(['desktop', 'tablet', 'mobile'])
  viewport?: string;
}
