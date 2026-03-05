import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { KanbanColumnsService } from './kanban-columns.service';
import { CreateKanbanColumnDto, UpdateKanbanColumnDto } from './dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { ProjectMemberGuard } from '../projects/guards/project-member.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/projects/:projectId/kanban-columns')
@UseGuards(SessionGuard, ProjectMemberGuard)
export class KanbanColumnsController {
  constructor(private readonly columnsService: KanbanColumnsService) {}

  @Get()
  async findAll(@Param('projectId') projectId: string): Promise<Record<string, unknown>[]> {
    return this.columnsService.findAll(projectId);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @Roles('admin')
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateKanbanColumnDto,
  ): Promise<Record<string, unknown>> {
    return this.columnsService.create(projectId, dto);
  }

  @Patch(':columnId')
  @UseGuards(CsrfGuard)
  @Roles('admin')
  async update(
    @Param('columnId') columnId: string,
    @Body() dto: UpdateKanbanColumnDto,
  ): Promise<Record<string, unknown>> {
    return this.columnsService.update(columnId, dto);
  }

  @Delete(':columnId')
  @UseGuards(CsrfGuard)
  @Roles('admin')
  async remove(@Param('columnId') columnId: string): Promise<{ message: string }> {
    await this.columnsService.remove(columnId);
    return { message: 'Kanban column deleted' };
  }
}
