import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@feedback/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreateThreadDto, UpdateThreadDto, ThreadQueryDto } from './dto';

@Injectable()
export class ThreadsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    projectId: string,
    authorId: string | null,
    dto: CreateThreadDto,
  ): Promise<Record<string, unknown>> {
    const env = dto.environment;
    return this.prisma.thread.create({
      data: {
        projectId,
        authorId,
        ...((!authorId && dto.guestEmail) ? { guestEmail: dto.guestEmail.toLowerCase() } : {}),
        title: dto.title,
        message: dto.message,
        pageUrl: dto.pageUrl?.replace(/\/+$/, '') || dto.pageUrl,
        pageTitle: dto.pageTitle,
        status: (dto.status as Prisma.EnumThreadStatusFieldUpdateOperationsInput['set']) ?? 'open',
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
        createdVia: dto.createdVia ?? 'overlay',
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
      include: {
        author: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
        environment: true,
      },
    });
  }

  async findAll(
    projectId: string,
    query: ThreadQueryDto,
  ): Promise<{ data: Record<string, unknown>[]; total: number }> {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const skip = (page - 1) * perPage;

    const where: Prisma.ThreadWhereInput = {
      projectId,
      deletedAt: null,
    };
    if (query.status) where.status = query.status as Prisma.EnumThreadStatusFilter['equals'];
    if (query.priority)
      where.priority = query.priority as Prisma.EnumThreadPriorityFilter['equals'];
    if (query.type) where.type = query.type as Prisma.EnumThreadTypeFilter['equals'];
    if (query.pageUrl) where.pageUrl = query.pageUrl.replace(/\/+$/, '');
    if (query.viewport)
      where.viewport = query.viewport as Prisma.EnumViewportTypeFilter['equals'];

    const [rawData, total] = await this.prisma.$transaction([
      this.prisma.thread.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, projectId: true, authorId: true, guestEmail: true,
          title: true, message: true, pageUrl: true, pageTitle: true,
          status: true, priority: true, type: true, contextType: true,
          viewport: true, xPct: true, yPct: true, anchorData: true,
          targetSelector: true, screenshotUrl: true, createdVia: true,
          resolvedAt: true, resolvedBy: true, createdAt: true, updatedAt: true,
          author: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
          environment: true,
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.thread.count({ where }),
    ]);

    // Convert Prisma Decimal to plain numbers for clean JSON serialization
    const data = rawData.map((t) => ({
      ...t,
      xPct: t.xPct != null ? Number(t.xPct) : null,
      yPct: t.yPct != null ? Number(t.yPct) : null,
    }));

    return { data, total };
  }

  async findOne(threadId: string): Promise<Record<string, unknown>> {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId, deletedAt: null },
      include: {
        author: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
        comments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, threadId: true, authorId: true, guestEmail: true,
            content: true, createdAt: true, updatedAt: true,
            author: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
          },
        },
        environment: true,
        _count: { select: { comments: true } },
      },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    // Fetch polymorphic attachments for this thread
    const attachments = await this.prisma.attachment.findMany({
      where: { attachableType: 'thread', attachableId: threadId },
      orderBy: { createdAt: 'asc' },
    });

    // Fetch comment attachments for all comments in one query
    const commentIds = thread.comments.map((c) => c.id);
    const commentAttachments = commentIds.length > 0
      ? await this.prisma.attachment.findMany({
          where: { attachableType: 'comment', attachableId: { in: commentIds } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const commentAttMap = new Map<string, typeof commentAttachments>();
    for (const ca of commentAttachments) {
      const list = commentAttMap.get(ca.attachableId) || [];
      list.push(ca);
      commentAttMap.set(ca.attachableId, list);
    }

    return {
      ...thread,
      xPct: thread.xPct != null ? Number(thread.xPct) : null,
      yPct: thread.yPct != null ? Number(thread.yPct) : null,
      attachments,
      comments: thread.comments.map((c) => ({
        ...c,
        attachments: commentAttMap.get(c.id) || [],
      })),
    };
  }

  async statusCounts(
    projectId: string,
    pageUrl?: string,
    viewport?: string,
  ): Promise<{ open: number; resolved: number }> {
    const baseWhere: Prisma.ThreadWhereInput = {
      projectId,
      deletedAt: null,
      ...(pageUrl ? { pageUrl: pageUrl.replace(/\/+$/, '') } : {}),
      ...(viewport
        ? { viewport: viewport as Prisma.EnumViewportTypeFilter['equals'] }
        : {}),
    };

    const [openCount, resolvedCount] = await this.prisma.$transaction([
      this.prisma.thread.count({ where: { ...baseWhere, status: 'open' } }),
      this.prisma.thread.count({ where: { ...baseWhere, status: 'resolved' } }),
    ]);

    return { open: openCount, resolved: resolvedCount };
  }

  async update(
    threadId: string,
    userId: string,
    userRole: string,
    dto: UpdateThreadDto,
  ): Promise<Record<string, unknown>> {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId, deletedAt: null },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    // Authors can edit own, admins can edit all
    if (thread.authorId !== userId && userRole !== 'admin') {
      throw new ForbiddenException('Can only edit your own threads');
    }

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.message !== undefined) data.message = dto.message;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.contextType !== undefined) data.contextType = dto.contextType;
    if (dto.viewport !== undefined) data.viewport = dto.viewport;
    if (dto.xPct !== undefined) data.xPct = dto.xPct;
    if (dto.yPct !== undefined) data.yPct = dto.yPct;
    if (dto.targetSelector !== undefined) data.targetSelector = dto.targetSelector;
    if (dto.screenshotUrl !== undefined) data.screenshotUrl = dto.screenshotUrl;

    // Track resolution
    if (dto.status === 'resolved' && thread.status !== 'resolved') {
      data.resolvedAt = new Date();
      data.resolvedBy = userId;
    }

    return this.prisma.thread.update({
      where: { id: threadId },
      data,
      include: {
        author: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async softDelete(threadId: string, userId: string, userRole: string): Promise<void> {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId, deletedAt: null },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    if (thread.authorId !== userId && userRole !== 'admin') {
      throw new ForbiddenException('Can only delete your own threads');
    }

    await this.prisma.thread.update({
      where: { id: threadId },
      data: { deletedAt: new Date() },
    });
  }
}
