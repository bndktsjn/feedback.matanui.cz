import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrgMembersService } from './org-members.service';
import { AddOrgMemberDto, UpdateOrgMemberDto } from './dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { OrgMemberGuard } from './guards/org-member.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/orgs/:orgId/members')
@UseGuards(SessionGuard, OrgMemberGuard)
export class OrgMembersController {
  constructor(private readonly membersService: OrgMembersService) {}

  @Get()
  async findAll(@Param('orgId') orgId: string) {
    return this.membersService.findAll(orgId);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @Roles('owner', 'admin')
  async add(@Param('orgId') orgId: string, @Body() dto: AddOrgMemberDto) {
    return this.membersService.add(orgId, dto);
  }

  @Patch(':memberId')
  @UseGuards(CsrfGuard)
  @Roles('owner', 'admin')
  async updateRole(
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateOrgMemberDto,
  ) {
    return this.membersService.updateRole(orgId, memberId, dto);
  }

  @Delete(':memberId')
  @UseGuards(CsrfGuard)
  @Roles('owner', 'admin')
  async remove(@Param('orgId') orgId: string, @Param('memberId') memberId: string) {
    await this.membersService.remove(orgId, memberId);
    return { message: 'Member removed' };
  }
}
