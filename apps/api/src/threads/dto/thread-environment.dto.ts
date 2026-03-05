import { IsOptional, IsString, IsInt, IsNumber, MaxLength } from 'class-validator';

export class ThreadEnvironmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  browserName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  browserVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  osName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  osVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  viewportMode?: string;

  @IsOptional()
  @IsInt()
  viewportWidth?: number;

  @IsOptional()
  @IsInt()
  viewportHeight?: number;

  @IsOptional()
  @IsNumber()
  devicePixelRatio?: number;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
