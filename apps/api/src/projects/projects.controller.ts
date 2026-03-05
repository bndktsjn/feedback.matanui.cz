import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { OrgMemberGuard } from '../orgs/guards/org-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

interface AuthenticatedUser {
  id: string;
}

@Controller('v1/orgs/:orgId/projects')
@UseGuards(SessionGuard, OrgMemberGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @UseGuards(CsrfGuard)
  async create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ): Promise<Record<string, unknown>> {
    return this.projectsService.create(orgId, dto, user.id);
  }

  @Get()
  async findAll(@Param('orgId') orgId: string): Promise<Record<string, unknown>[]> {
    return this.projectsService.findAllForOrg(orgId);
  }

  @Get(':projectId')
  async findOne(@Param('projectId') projectId: string): Promise<Record<string, unknown>> {
    return this.projectsService.findOne(projectId);
  }

  @Patch(':projectId')
  @UseGuards(CsrfGuard)
  @Roles('owner', 'admin')
  async update(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<Record<string, unknown>> {
    return this.projectsService.update(projectId, dto);
  }

  @Delete(':projectId')
  @UseGuards(CsrfGuard)
  @Roles('owner', 'admin')
  async remove(@Param('projectId') projectId: string): Promise<{ message: string }> {
    await this.projectsService.softDelete(projectId);
    return { message: 'Project deleted' };
  }
}
