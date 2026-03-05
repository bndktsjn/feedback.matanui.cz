import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { OrgMemberGuard } from './guards/org-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

// ── Org-scoped invitation management (owner/admin only) ──

@Controller('v1/orgs/:orgId/invitations')
@UseGuards(SessionGuard, OrgMemberGuard)
export class OrgInvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get()
  @Roles('owner', 'admin')
  async findAll(@Param('orgId') orgId: string) {
    return this.invitationsService.findAllForOrg(orgId);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @Roles('owner', 'admin')
  async create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.create(orgId, dto, user.id);
  }

  @Delete(':invitationId')
  @UseGuards(CsrfGuard)
  @Roles('owner', 'admin')
  async revoke(
    @Param('orgId') orgId: string,
    @Param('invitationId') invitationId: string,
  ) {
    await this.invitationsService.revoke(orgId, invitationId);
    return { message: 'Invitation revoked' };
  }

  @Post(':invitationId/resend')
  @UseGuards(CsrfGuard)
  @Roles('owner', 'admin')
  async resend(
    @Param('orgId') orgId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitationsService.resend(orgId, invitationId);
  }
}

// ── Public invitation token routes (for accepting invites) ──

@Controller('v1/invitations')
export class InvitationTokenController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get(':token')
  async getByToken(@Param('token') token: string) {
    return this.invitationsService.getByToken(token);
  }

  @Post(':token/accept')
  @UseGuards(SessionGuard, CsrfGuard)
  async accept(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invitationsService.accept(token, user.id);
  }
}
