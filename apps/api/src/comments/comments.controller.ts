import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CommentsService } from './comments.service';
import { CreateCommentDto, UpdateCommentDto } from './dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { ProjectMemberGuard } from '../projects/guards/project-member.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthenticatedUser {
  id: string;
}

@Controller('v1/projects/:projectId/threads/:threadId/comments')
@UseGuards(SessionGuard, ProjectMemberGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(CsrfGuard)
  async create(
    @Param('threadId') threadId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommentDto,
  ): Promise<Record<string, unknown>> {
    return this.commentsService.create(threadId, user.id, dto);
  }

  @Get()
  async findAll(@Param('threadId') threadId: string): Promise<Record<string, unknown>[]> {
    return this.commentsService.findAll(threadId);
  }

  @Patch(':commentId')
  @UseGuards(CsrfGuard)
  async update(
    @Param('commentId') commentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Body() dto: UpdateCommentDto,
  ): Promise<Record<string, unknown>> {
    const role =
      (req as Request & { projectMember?: { role: string }; projectRole?: string }).projectMember
        ?.role ||
      (req as Request & { projectRole?: string }).projectRole ||
      'viewer';
    return this.commentsService.update(commentId, user.id, role, dto);
  }

  @Delete(':commentId')
  @UseGuards(CsrfGuard)
  async remove(
    @Param('commentId') commentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const role =
      (req as Request & { projectMember?: { role: string }; projectRole?: string }).projectMember
        ?.role ||
      (req as Request & { projectRole?: string }).projectRole ||
      'viewer';
    await this.commentsService.softDelete(commentId, user.id, role);
    return { message: 'Comment deleted' };
  }
}
