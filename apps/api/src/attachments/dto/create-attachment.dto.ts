import { IsString, IsEnum, IsUUID, MaxLength } from 'class-validator';

export class CreateAttachmentDto {
  @IsEnum(['thread', 'comment', 'task'])
  attachableType!: string;

  @IsUUID()
  attachableId!: string;

  @IsString()
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;
}
