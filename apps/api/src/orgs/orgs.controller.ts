import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrgsService } from './orgs.service';
import { CreateOrgDto, UpdateOrgDto } from './dto';
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

@Controller('v1/orgs')
@UseGuards(SessionGuard)
export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

  @Post()
  @UseGuards(CsrfGuard)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrgDto,
  ): Promise<Record<string, unknown>> {
    return this.orgsService.create(dto, user.id);
  }

  @Get()
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.orgsService.findAllForUser(user.id);
  }

  @Get(':orgId')
  @UseGuards(OrgMemberGuard)
  async findOne(@Param('orgId') orgId: string): Promise<Record<string, unknown>> {
    return this.orgsService.findOne(orgId);
  }

  @Patch(':orgId')
  @UseGuards(OrgMemberGuard, CsrfGuard)
  @Roles('owner', 'admin')
  async update(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrgDto,
  ): Promise<Record<string, unknown>> {
    return this.orgsService.update(orgId, dto);
  }

  @Delete(':orgId')
  @UseGuards(OrgMemberGuard, CsrfGuard)
  @Roles('owner')
  async remove(@Param('orgId') orgId: string) {
    await this.orgsService.softDelete(orgId);
    return { message: 'Organization deleted' };
  }
}
