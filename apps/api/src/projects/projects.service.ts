import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    orgId: string,
    dto: CreateProjectDto,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const slug = dto.slug || this.slugify(dto.name);

    const existing = await this.prisma.project.findUnique({
      where: { orgId_slug: { orgId, slug } },
    });
    if (existing) throw new ConflictException('Project slug already taken in this organization');

    return this.prisma.$transaction(async (tx) => {
      const apiKey = `fb_${randomUUID().replace(/-/g, '')}`;
      const project = await tx.project.create({
        data: {
          orgId,
          name: dto.name,
          slug,
          baseUrl: dto.baseUrl,
          description: dto.description,
          settings: { apiKey },
        },
      });

      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId,
          role: 'admin',
        },
      });

      return project;
    });
  }

  async findAllForOrg(orgId: string): Promise<Record<string, unknown>[]> {
    return this.prisma.project.findMany({
      where: { orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        baseUrl: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(projectId: string): Promise<Record<string, unknown>> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId, deletedAt: null },
      select: {
        id: true,
        orgId: true,
        name: true,
        slug: true,
        baseUrl: true,
        description: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(projectId: string, dto: UpdateProjectDto): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.baseUrl !== undefined) data.baseUrl = dto.baseUrl;
    if (dto.description !== undefined) data.description = dto.description;

    // Merge settings flags into existing settings JSON
    if (dto.publicWorkspace !== undefined || dto.allowAnonymousComments !== undefined) {
      const existing = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { settings: true },
      });
      const currentSettings = (existing?.settings || {}) as Record<string, unknown>;
      if (dto.publicWorkspace !== undefined) currentSettings.publicWorkspace = dto.publicWorkspace;
      if (dto.allowAnonymousComments !== undefined) currentSettings.allowAnonymousComments = dto.allowAnonymousComments;
      // If publicWorkspace is turned off, also disable anonymous comments
      if (dto.publicWorkspace === false) currentSettings.allowAnonymousComments = false;
      data.settings = currentSettings;
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data,
      select: {
        id: true,
        orgId: true,
        name: true,
        slug: true,
        baseUrl: true,
        description: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findPublicBySlug(slug: string): Promise<Record<string, unknown>> {
    const project = await this.prisma.project.findFirst({
      where: { slug, deletedAt: null },
      select: {
        id: true,
        orgId: true,
        name: true,
        slug: true,
        baseUrl: true,
        description: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const settings = (project.settings || {}) as Record<string, unknown>;
    if (!settings.publicWorkspace) {
      throw new NotFoundException('Project not found');
    }
    // Strip apiKey from public response
    const { apiKey, ...publicSettings } = settings;
    return { ...project, settings: publicSettings };
  }

  async softDelete(projectId: string): Promise<void> {
    await this.prisma.project.update({
      where: { id: projectId },
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
