import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const apiKey = (request.headers['x-api-key'] as string) || (request.query['key'] as string);

    if (!apiKey) {
      throw new ForbiddenException('Missing API key');
    }

    const allProjects = await this.prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, orgId: true, baseUrl: true, settings: true },
    });

    const project = allProjects.find((p) => {
      const settings = p.settings as Record<string, unknown> | null;
      return settings?.apiKey === apiKey;
    });

    if (!project) {
      throw new NotFoundException('Invalid API key');
    }

    (request as Request & { project: typeof project }).project = project;
    return true;
  }
}
