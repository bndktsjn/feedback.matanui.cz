import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto, UpdateCommentDto } from './dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    threadId: string,
    authorId: string | null,
    dto: CreateCommentDto,
  ): Promise<Record<string, unknown>> {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId, deletedAt: null },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    return this.prisma.comment.create({
      data: {
        threadId,
        authorId,
        ...((!authorId && dto.guestEmail) ? { guestEmail: dto.guestEmail.toLowerCase() } : {}),
        content: dto.content,
      },
      include: {
        author: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async findAll(threadId: string): Promise<Record<string, unknown>[]> {
    return this.prisma.comment.findMany({
      where: { threadId, deletedAt: null },
      include: {
        author: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(
    commentId: string,
    userId: string,
    userRole: string,
    dto: UpdateCommentDto,
  ): Promise<Record<string, unknown>> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId, deletedAt: null },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    if (comment.authorId !== userId && userRole !== 'admin') {
      throw new ForbiddenException('Can only edit your own comments');
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { content: dto.content },
      include: {
        author: { select: { id: true, email: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async softDelete(commentId: string, userId: string, userRole: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId, deletedAt: null },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    if (comment.authorId !== userId && userRole !== 'admin') {
      throw new ForbiddenException('Can only delete your own comments');
    }

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
  }
}
