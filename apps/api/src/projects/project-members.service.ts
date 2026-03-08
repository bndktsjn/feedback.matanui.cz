import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@feedback/db';
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

  private readonly logger = new Logger(ProjectMembersService.name);

  async search(projectId: string, query?: string, excludeUserId?: string): Promise<Record<string, unknown>[]> {
    // Single source of truth: query User table directly.
    // Returns users who are explicit project members OR org owners/admins.
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { orgId: true },
    });
    if (!project) {
      this.logger.warn(`search: project ${projectId} not found`);
      return [];
    }

    // Build a strongly-typed Prisma where clause
    const andConditions: Prisma.UserWhereInput[] = [
      { deletedAt: null },
      {
        OR: [
          { projectMemberships: { some: { projectId } } },
          {
            orgMemberships: {
              some: {
                orgId: project.orgId,
                role: { in: ['owner', 'admin'] },
              },
            },
          },
        ],
      },
    ];

    if (excludeUserId) {
      andConditions.push({ id: { not: excludeUserId } });
    }

    if (query && query.trim()) {
      andConditions.push({
        OR: [
          { displayName: { contains: query.trim(), mode: 'insensitive' } },
          { email: { contains: query.trim(), mode: 'insensitive' } },
        ],
      });
    }

    try {
      const users = await this.prisma.user.findMany({
        where: { AND: andConditions },
        select: { id: true, email: true, displayName: true, avatarUrl: true },
        take: 10,
        orderBy: { displayName: 'asc' },
      });
      this.logger.debug(`search: projectId=${projectId} query="${query || ''}" → ${users.length} results`);
      return users;
    } catch (err) {
      this.logger.error(`search failed for project ${projectId}:`, err);
      throw err;
    }
  }

  async remove(projectId: string, memberId: string): Promise<void> {
    const member = await this.prisma.projectMember.findUnique({
      where: { id: memberId, projectId },
    });
    if (!member) throw new NotFoundException('Member not found');

    await this.prisma.projectMember.delete({ where: { id: memberId } });
  }

  /** List all org members with assignment status for project member picker */
  async findAvailableOrgMembers(projectId: string): Promise<Record<string, unknown>[]> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { orgId: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const existingProjectMembers = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true, role: true },
    });
    const assignedMap = new Map(existingProjectMembers.map((m) => [m.userId, m.role]));

    const orgMembers = await this.prisma.organizationMember.findMany({
      where: { orgId: project.orgId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return orgMembers.map((m) => ({
      id: m.id,
      userId: m.userId,
      orgRole: m.role,
      assigned: assignedMap.has(m.userId),
      projectRole: assignedMap.get(m.userId) || null,
      user: m.user,
    }));
  }
}
