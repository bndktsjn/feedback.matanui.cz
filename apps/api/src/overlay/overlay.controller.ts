import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { OverlayCreateThreadDto } from './dto/overlay-create-thread.dto';
import { Prisma } from '@feedback/db';

interface ProjectFromGuard {
  id: string;
  orgId: string;
  baseUrl: string;
  settings: unknown;
}

@Controller('v1/overlay')
@UseGuards(ApiKeyGuard)
export class OverlayController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get('config')
  async getConfig(@Req() req: Request): Promise<Record<string, unknown>> {
    const project = (req as Request & { project: ProjectFromGuard }).project;
    const fullProject = await this.prisma.project.findUnique({
      where: { id: project.id },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        settings: true,
        urlRules: {
          select: { pattern: true, ruleType: true },
        },
      },
    });
    return {
      projectId: fullProject?.id,
      projectName: fullProject?.name,
      baseUrl: fullProject?.baseUrl,
      urlRules: fullProject?.urlRules || [],
    };
  }

  @Post('threads')
  async createThread(
    @Req() req: Request,
    @Body() dto: OverlayCreateThreadDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>> {
    const project = (req as Request & { project: ProjectFromGuard }).project;
    const env = dto.environment;

    const thread = await this.prisma.thread.create({
      data: {
        projectId: project.id,
        authorId: null,
        title: dto.title,
        message: dto.message,
        pageUrl: dto.pageUrl,
        pageTitle: dto.pageTitle,
        status: 'open',
        priority:
          (dto.priority as Prisma.EnumThreadPriorityFieldUpdateOperationsInput['set']) ?? 'medium',
        type: (dto.type as Prisma.EnumThreadTypeFieldUpdateOperationsInput['set']) ?? 'general',
        contextType:
          (dto.contextType as Prisma.EnumContextTypeFieldUpdateOperationsInput['set']) ?? 'panel',
        viewport:
          (dto.viewport as Prisma.EnumViewportTypeFieldUpdateOperationsInput['set']) ?? 'desktop',
        xPct: dto.xPct,
        yPct: dto.yPct,
        anchorData: dto.anchorData as Prisma.InputJsonValue,
        targetSelector: dto.targetSelector,
        screenshotUrl: dto.screenshotUrl,
        createdVia: 'overlay',
        ...(env
          ? {
              environment: {
                create: {
                  browserName: env.browserName,
                  browserVersion: env.browserVersion,
                  osName: env.osName,
                  osVersion: env.osVersion,
                  viewportMode: env.viewportMode,
                  viewportWidth: env.viewportWidth,
                  viewportHeight: env.viewportHeight,
                  devicePixelRatio: env.devicePixelRatio,
                  userAgent: env.userAgent,
                },
              },
            }
          : {}),
      },
    });

    // Handle base64 screenshot from widget mode
    if (dto.screenshotDataUrl && dto.screenshotDataUrl.startsWith('data:image/')) {
      try {
        const base64Data = dto.screenshotDataUrl.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const mimeMatch = dto.screenshotDataUrl.match(/^data:(image\/\w+);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const ext = mimeType === 'image/jpeg' ? '.jpg' : '.png';
        const { url } = await this.storage.upload(buffer, `screenshot${ext}`, mimeType, 'screenshots');
        await this.prisma.thread.update({
          where: { id: thread.id },
          data: { screenshotUrl: url },
        });
      } catch (err) {
        console.error('Failed to upload widget screenshot:', err);
      }
    }

    res.status(201);
    return { id: thread.id, status: thread.status, createdAt: thread.createdAt };
  }

  // ── Agent endpoints: read threads, comments, update status ──

  @Get('threads')
  async listThreads(
    @Req() req: Request,
    @Query('pageUrl') pageUrl?: string,
    @Query('viewport') viewport?: string,
    @Query('status') status?: string,
  ): Promise<Record<string, unknown>[]> {
    const project = (req as Request & { project: ProjectFromGuard }).project;
    const where: Prisma.ThreadWhereInput = {
      projectId: project.id,
      deletedAt: null,
    };
    if (pageUrl) where.pageUrl = pageUrl.replace(/\/+$/, '');
    if (viewport) where.viewport = viewport as Prisma.EnumViewportTypeFilter['equals'];
    if (status) where.status = status as Prisma.EnumThreadStatusFilter['equals'];

    const threads = await this.prisma.thread.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true, title: true, message: true, pageUrl: true, pageTitle: true,
        status: true, priority: true, type: true, contextType: true,
        viewport: true, xPct: true, yPct: true, anchorData: true,
        targetSelector: true, screenshotUrl: true, guestEmail: true,
        createdAt: true, updatedAt: true,
        author: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
        _count: { select: { comments: true } },
      },
    });

    return threads.map((t) => ({
      ...t,
      xPct: t.xPct != null ? Number(t.xPct) : null,
      yPct: t.yPct != null ? Number(t.yPct) : null,
      screenshotUrl: StorageService.normalizeUrl(t.screenshotUrl),
    }));
  }

  @Get('threads/:threadId')
  async getThread(
    @Req() req: Request,
    @Param('threadId') threadId: string,
  ): Promise<Record<string, unknown>> {
    const project = (req as Request & { project: ProjectFromGuard }).project;
    const thread = await this.prisma.thread.findFirst({
      where: { id: threadId, projectId: project.id, deletedAt: null },
      include: {
        author: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
        comments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, content: true, guestEmail: true, createdAt: true,
            author: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
          },
        },
        environment: true,
        _count: { select: { comments: true } },
      },
    });
    if (!thread) return {};
    return {
      ...thread,
      xPct: thread.xPct != null ? Number(thread.xPct) : null,
      yPct: thread.yPct != null ? Number(thread.yPct) : null,
      screenshotUrl: StorageService.normalizeUrl(thread.screenshotUrl),
    };
  }

  @Post('threads/:threadId/comments')
  async addComment(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @Body() body: { content: string; guestEmail?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>> {
    const project = (req as Request & { project: ProjectFromGuard }).project;
    const thread = await this.prisma.thread.findFirst({
      where: { id: threadId, projectId: project.id, deletedAt: null },
    });
    if (!thread) return {};

    const comment = await this.prisma.comment.create({
      data: {
        threadId,
        authorId: null,
        guestEmail: body.guestEmail?.toLowerCase(),
        content: body.content,
      },
    });
    res.status(201);
    return { id: comment.id, content: comment.content, createdAt: comment.createdAt };
  }

  @Patch('threads/:threadId')
  async updateThread(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @Body() body: { status?: string; xPct?: number; yPct?: number },
  ): Promise<Record<string, unknown>> {
    const project = (req as Request & { project: ProjectFromGuard }).project;
    const thread = await this.prisma.thread.findFirst({
      where: { id: threadId, projectId: project.id, deletedAt: null },
    });
    if (!thread) return {};

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.status === 'resolved' && thread.status !== 'resolved') {
      data.resolvedAt = new Date();
    }
    if (body.xPct != null) data.xPct = body.xPct;
    if (body.yPct != null) data.yPct = body.yPct;

    const updated = await this.prisma.thread.update({
      where: { id: threadId },
      data,
    });
    return { id: updated.id, status: updated.status, xPct: updated.xPct != null ? Number(updated.xPct) : null, yPct: updated.yPct != null ? Number(updated.yPct) : null };
  }
}
