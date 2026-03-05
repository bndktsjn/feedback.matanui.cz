import { Module } from '@nestjs/common';
import { OrgsService } from './orgs.service';
import { OrgMembersService } from './org-members.service';
import { InvitationsService } from './invitations.service';
import { OrgsController } from './orgs.controller';
import { OrgMembersController } from './org-members.controller';
import { OrgInvitationsController, InvitationTokenController } from './invitations.controller';
import { OrgMemberGuard } from './guards/org-member.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [OrgsController, OrgMembersController, OrgInvitationsController, InvitationTokenController],
  providers: [OrgsService, OrgMembersService, InvitationsService, OrgMemberGuard],
  exports: [OrgsService, OrgMembersService, InvitationsService, OrgMemberGuard],
})
export class OrgsModule {}
