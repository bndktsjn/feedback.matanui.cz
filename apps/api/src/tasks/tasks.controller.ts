import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, TaskQueryDto } from './dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { ProjectMemberGuard } from '../projects/guards/project-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthenticatedUser {
  id: string;
}

@Controller('v1/projects/:projectId/tasks')
@UseGuards(SessionGuard, ProjectMemberGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @UseGuards(CsrfGuard)
  async create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaskDto,
  ): Promise<Record<string, unknown>> {
    return this.tasksService.create(projectId, user.id, dto);
  }

  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Query() query: TaskQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>[]> {
    const result = await this.tasksService.findAll(projectId, query);
    res.set('X-Total-Count', String(result.total));
    return result.data;
  }

  @Get(':taskId')
  async findOne(@Param('taskId') taskId: string): Promise<Record<string, unknown>> {
    return this.tasksService.findOne(taskId);
  }

  @Patch(':taskId')
  @UseGuards(CsrfGuard)
  async update(
    @Param('taskId') taskId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTaskDto,
  ): Promise<Record<string, unknown>> {
    return this.tasksService.update(taskId, user.id, dto);
  }

  @Delete(':taskId')
  @UseGuards(CsrfGuard)
  async remove(@Param('taskId') taskId: string): Promise<{ message: string }> {
    await this.tasksService.softDelete(taskId);
    return { message: 'Task deleted' };
  }
}
