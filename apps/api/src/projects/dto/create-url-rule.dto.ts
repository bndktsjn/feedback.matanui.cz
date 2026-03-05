import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateUrlRuleDto {
  @IsString()
  @MaxLength(512)
  pattern!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ruleType?: string;
}
