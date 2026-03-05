import { IsEnum } from 'class-validator';
import { OrgRole } from '@feedback/db';

export class UpdateOrgMemberDto {
  @IsEnum(OrgRole)
  role!: OrgRole;
}
