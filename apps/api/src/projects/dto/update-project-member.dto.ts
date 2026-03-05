import { IsEnum } from 'class-validator';
import { ProjectRole } from '@feedback/db';

export class UpdateProjectMemberDto {
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
