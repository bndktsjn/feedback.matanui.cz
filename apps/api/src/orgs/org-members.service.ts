import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrgRole } from '@feedback/db';
import { PrismaService } from '../prisma/prisma.service';
import { AddOrgMemberDto, UpdateOrgMemberDto } from './dto';

@Injectable()
export class OrgMembersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string) {
    return this.prisma.organizationMember.findMany({
      where: { orgId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async add(orgId: string, dto: AddOrgMemberDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId: dto.userId } },
    });
    if (existing) throw new ConflictException('User is already a member');

    if (dto.role === OrgRole.owner) {
      throw new ForbiddenException('Cannot add another owner');
    }

    return this.prisma.organizationMember.create({
      data: { orgId, userId: dto.userId, role: dto.role },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
    });
  }

  async updateRole(orgId: string, memberId: string, dto: UpdateOrgMemberDto) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { id: memberId, orgId },
    });
    if (!member) throw new NotFoundException('Member not found');

    if (member.role === OrgRole.owner) {
      throw new ForbiddenException('Cannot change the owner role');
    }
    if (dto.role === OrgRole.owner) {
      throw new ForbiddenException('Cannot promote to owner');
    }

    return this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
      },
    });
  }

  async remove(orgId: string, memberId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { id: memberId, orgId },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (member.role === OrgRole.owner) {
      throw new ForbiddenException('Cannot remove the owner');
    }

    await this.prisma.organizationMember.delete({ where: { id: memberId } });
  }
}
