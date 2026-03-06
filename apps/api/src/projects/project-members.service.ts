import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddProjectMemberDto, UpdateProjectMemberDto } from './dto';

@Injectable()
export class ProjectMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: string): Promise<Record<string, unknown>[]> {
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async add(
    projectId: string,
    dto: AddProjectMemberDto,
    inviterId: string,
  ): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: dto.userId } },
    });
    if (existing) throw new ConflictException('User is already a project member');

    return this.prisma.projectMember.create({
      data: {
        projectId,
        userId: dto.userId,
        role: dto.role,
        invitedBy: inviterId,
      },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
    });
  }

  async updateRole(
    projectId: string,
    memberId: string,
    dto: UpdateProjectMemberDto,
  ): Promise<Record<string, unknown>> {
    const member = await this.prisma.projectMember.findUnique({
      where: { id: memberId, projectId },
    });
    if (!member) throw new NotFoundException('Member not found');

    return this.prisma.projectMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
    });
  }

  async search(projectId: string, query?: string): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = { projectId };
    if (query && query.trim()) {
      where.user = {
        OR: [
          { displayName: { contains: query.trim(), mode: 'insensitive' } },
          { email: { contains: query.trim(), mode: 'insensitive' } },
        ],
        deletedAt: null,
      };
    }
    const members = await this.prisma.projectMember.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
      take: 10,
      orderBy: { joinedAt: 'asc' },
    });
    return members.map((m) => (m as { user: Record<string, unknown> }).user);
  }

  async remove(projectId: string, memberId: string): Promise<void> {
    const member = await this.prisma.projectMember.findUnique({
      where: { id: memberId, projectId },
    });
    if (!member) throw new NotFoundException('Member not found');

    await this.prisma.projectMember.delete({ where: { id: memberId } });
  }
}
