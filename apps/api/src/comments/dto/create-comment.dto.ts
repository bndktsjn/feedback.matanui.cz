import { IsString, IsOptional, IsEmail, MinLength, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  guestEmail?: string;
}
