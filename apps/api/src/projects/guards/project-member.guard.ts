import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: { id: string } }).user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const projectId = request.params.projectId;
    if (!projectId) throw new ForbiddenException('Missing projectId parameter');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId, deletedAt: null },
      include: { organization: { select: { id: true, deletedAt: true } } },
    });
    if (!project || project.organization.deletedAt) {
      throw new NotFoundException('Project not found');
    }

    // Check project membership first
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });

    // If not a direct project member, check org membership → implicit project access
    if (!membership) {
      const orgMember = await this.prisma.organizationMember.findUnique({
        where: { orgId_userId: { orgId: project.orgId, userId: user.id } },
      });
      if (!orgMember) {
        throw new ForbiddenException('Not a member of this project');
      }
      // Map org role → implicit project role: owner/admin → admin, member → member
      const implicitRole =
        orgMember.role === 'owner' || orgMember.role === 'admin' ? 'admin' : 'member';
      (request as Request & { projectRole: string }).projectRole = implicitRole;
      (request as Request & { project: typeof project }).project = project;
      return this.checkRoles(context, implicitRole);
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    (request as Request & { project: typeof project }).project = project;
    (request as Request & { projectMember: typeof membership }).projectMember = membership;
    return true;
  }

  private checkRoles(context: ExecutionContext, role: string): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
