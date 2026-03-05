import { Module } from '@nestjs/common';
import { OrgsService } from './orgs.service';
import { OrgMembersService } from './org-members.service';
import { OrgsController } from './orgs.controller';
import { OrgMembersController } from './org-members.controller';
import { OrgMemberGuard } from './guards/org-member.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [OrgsController, OrgMembersController],
  providers: [OrgsService, OrgMembersService, OrgMemberGuard],
  exports: [OrgsService, OrgMembersService, OrgMemberGuard],
})
export class OrgsModule {}
