import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrgDto, UpdateOrgDto } from './dto';

@Injectable()
export class OrgsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrgDto, userId: string): Promise<Record<string, unknown>> {
    const slug = dto.slug || this.slugify(dto.name);

    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Organization slug already taken');

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.name,
          slug,
          billingEmail: dto.billingEmail,
          ownerId: userId,
        },
      });

      await tx.organizationMember.create({
        data: {
          orgId: org.id,
          userId,
          role: 'owner',
        },
      });

      return org;
    });
  }

  async findAllForUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: {
        userId,
        organization: { deletedAt: null },
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return memberships.map((m) => ({
      ...m.organization,
      role: m.role,
    }));
  }

  async findOne(orgId: string): Promise<Record<string, unknown>> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        billingEmail: true,
        plan: true,
        settings: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(orgId: string, dto: UpdateOrgDto): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.billingEmail !== undefined) data.billingEmail = dto.billingEmail;

    return this.prisma.organization.update({
      where: { id: orgId },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        billingEmail: true,
        plan: true,
        settings: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async softDelete(orgId: string) {
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { deletedAt: new Date() },
    });
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
