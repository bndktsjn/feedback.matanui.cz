import { IsEmail, IsString } from 'class-validator';

export class ChangeEmailDto {
  @IsEmail()
  newEmail!: string;

  @IsString()
  password!: string;
}
