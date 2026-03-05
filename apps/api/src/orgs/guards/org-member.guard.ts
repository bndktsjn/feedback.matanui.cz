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
export class OrgMemberGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: { id: string } }).user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const orgId = request.params.orgId;
    if (!orgId) throw new ForbiddenException('Missing orgId parameter');

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId, deletedAt: null },
    });
    if (!org) throw new NotFoundException('Organization not found');

    const membership = await this.prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this organization');

    // Check role requirements
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(membership.role)) {
        throw new ForbiddenException('Insufficient role');
      }
    }

    (request as Request & { org: typeof org; orgMember: typeof membership }).org = org;
    (request as Request & { org: typeof org; orgMember: typeof membership }).orgMember = membership;

    return true;
  }
}
