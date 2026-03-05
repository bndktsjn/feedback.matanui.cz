import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MentionsService {
  constructor(private readonly prisma: PrismaService) {}

  async extractAndSave(
    mentionableType: string,
    mentionableId: string,
    content: string,
  ): Promise<void> {
    const mentionRegex = /@\[([^\]]+)\]\(([0-9a-f-]+)\)/g;
    const mentions: { userId: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(content)) !== null) {
      const userId = match[2];
      if (userId && !mentions.find((m) => m.userId === userId)) {
        mentions.push({ userId });
      }
    }

    if (mentions.length === 0) return;

    await this.prisma.mention.createMany({
      data: mentions.map((m) => ({
        mentionableType,
        mentionableId,
        mentionedUserId: m.userId,
      })),
      skipDuplicates: true,
    });
  }

  async findForEntity(
    mentionableType: string,
    mentionableId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.mention.findMany({
      where: { mentionableType, mentionableId },
      include: {
        mentionedUser: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
    });
  }

  async findForUser(userId: string): Promise<Record<string, unknown>[]> {
    return this.prisma.mention.findMany({
      where: { mentionedUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
