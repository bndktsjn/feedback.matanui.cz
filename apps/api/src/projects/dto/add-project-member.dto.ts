import { IsUUID, IsEnum } from 'class-validator';
import { ProjectRole } from '@feedback/db';

export class AddProjectMemberDto {
  @IsUUID()
  userId!: string;

  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
