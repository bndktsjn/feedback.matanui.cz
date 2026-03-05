import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UrlRulesService } from './url-rules.service';
import { CreateUrlRuleDto } from './dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { ProjectMemberGuard } from './guards/project-member.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/projects/:projectId/url-rules')
@UseGuards(SessionGuard, ProjectMemberGuard)
export class UrlRulesController {
  constructor(private readonly urlRulesService: UrlRulesService) {}

  @Get()
  async findAll(@Param('projectId') projectId: string): Promise<Record<string, unknown>[]> {
    return this.urlRulesService.findAll(projectId);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @Roles('admin')
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateUrlRuleDto,
  ): Promise<Record<string, unknown>> {
    return this.urlRulesService.create(projectId, dto);
  }

  @Delete(':ruleId')
  @UseGuards(CsrfGuard)
  @Roles('admin')
  async remove(
    @Param('projectId') projectId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<{ message: string }> {
    await this.urlRulesService.remove(projectId, ruleId);
    return { message: 'URL rule removed' };
  }
}
