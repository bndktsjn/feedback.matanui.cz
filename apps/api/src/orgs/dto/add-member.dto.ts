import { IsUUID, IsEnum } from 'class-validator';
import { OrgRole } from '@feedback/db';

export class AddOrgMemberDto {
  @IsUUID()
  userId!: string;

  @IsEnum(OrgRole)
  role!: OrgRole;
}
