import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProjectMembersService } from './project-members.service';
import { AddProjectMemberDto, UpdateProjectMemberDto } from './dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { ProjectMemberGuard } from './guards/project-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

interface AuthenticatedUser {
  id: string;
}

@Controller('v1/projects/:projectId/members')
@UseGuards(SessionGuard, ProjectMemberGuard)
export class ProjectMembersController {
  constructor(private readonly membersService: ProjectMembersService) {}

  @Get('search')
  async search(
    @Param('projectId') projectId: string,
    @Query('q') q?: string,
  ): Promise<Record<string, unknown>[]> {
    return this.membersService.search(projectId, q);
  }

  @Get()
  async findAll(@Param('projectId') projectId: string): Promise<Record<string, unknown>[]> {
    return this.membersService.findAll(projectId);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @Roles('admin')
  async add(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddProjectMemberDto,
  ): Promise<Record<string, unknown>> {
    return this.membersService.add(projectId, dto, user.id);
  }

  @Patch(':memberId')
  @UseGuards(CsrfGuard)
  @Roles('admin')
  async updateRole(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateProjectMemberDto,
  ): Promise<Record<string, unknown>> {
    return this.membersService.updateRole(projectId, memberId, dto);
  }

  @Delete(':memberId')
  @UseGuards(CsrfGuard)
  @Roles('admin')
  async remove(
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
  ): Promise<{ message: string }> {
    await this.membersService.remove(projectId, memberId);
    return { message: 'Member removed' };
  }
}
