import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ThreadsService } from './threads.service';
import { CreateThreadDto, UpdateThreadDto, ThreadQueryDto } from './dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { ProjectMemberGuard } from '../projects/guards/project-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthenticatedUser {
  id: string;
}

@Controller('v1/projects/:projectId/threads')
@UseGuards(SessionGuard, ProjectMemberGuard)
export class ThreadsController {
  constructor(private readonly threadsService: ThreadsService) {}

  @Post()
  @UseGuards(CsrfGuard)
  async create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateThreadDto,
  ): Promise<Record<string, unknown>> {
    return this.threadsService.create(projectId, user.id, dto);
  }

  @Get()
  async findAll(
    @Param('projectId') projectId: string,
    @Query() query: ThreadQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>[]> {
    const result = await this.threadsService.findAll(projectId, query);
    res.set('X-Total-Count', String(result.total));
    return result.data;
  }

  @Get('status-counts')
  async statusCounts(
    @Param('projectId') projectId: string,
    @Query('pageUrl') pageUrl?: string,
    @Query('viewport') viewport?: string,
  ): Promise<{ open: number; resolved: number }> {
    return this.threadsService.statusCounts(projectId, pageUrl, viewport);
  }

  @Get(':threadId')
  async findOne(@Param('threadId') threadId: string): Promise<Record<string, unknown>> {
    return this.threadsService.findOne(threadId);
  }

  @Patch(':threadId')
  @UseGuards(CsrfGuard)
  async update(
    @Param('threadId') threadId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Body() dto: UpdateThreadDto,
  ): Promise<Record<string, unknown>> {
    const role =
      (req as Request & { projectMember?: { role: string }; projectRole?: string }).projectMember
        ?.role ||
      (req as Request & { projectRole?: string }).projectRole ||
      'viewer';
    return this.threadsService.update(threadId, user.id, role, dto);
  }

  @Delete(':threadId')
  @UseGuards(CsrfGuard)
  async remove(
    @Param('threadId') threadId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const role =
      (req as Request & { projectMember?: { role: string }; projectRole?: string }).projectMember
        ?.role ||
      (req as Request & { projectRole?: string }).projectRole ||
      'viewer';
    await this.threadsService.softDelete(threadId, user.id, role);
    return { message: 'Thread deleted' };
  }
}
