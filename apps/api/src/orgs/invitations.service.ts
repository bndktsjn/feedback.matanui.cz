import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { OrgRole } from '@feedback/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';

const INVITATION_EXPIRY_DAYS = 7;

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, dto: CreateInvitationDto, invitedById: string) {
    const email = dto.email.toLowerCase().trim();
    const role = dto.role || OrgRole.member;

    if (role === OrgRole.owner) {
      throw new ForbiddenException('Cannot invite as owner');
    }

    // Check if user is already a member
    const existingUser = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
    });
    if (existingUser) {
      const existingMember = await this.prisma.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: existingUser.id } },
      });
      if (existingMember) {
        throw new ConflictException('User is already a member of this organization');
      }
    }

    // Check for existing pending invitation
    const existingInvite = await this.prisma.organizationInvitation.findFirst({
      where: { orgId, email, status: 'pending' },
    });
    if (existingInvite) {
      throw new ConflictException(
        'A pending invitation already exists for this email. Revoke it first or wait for it to expire.',
      );
    }

    const token = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 3600_000);

    return this.prisma.organizationInvitation.create({
      data: {
        orgId,
        email,
        role,
        token,
        status: 'pending',
        invitedById,
        expiresAt,
      },
      include: {
        invitedBy: {
          select: { id: true, email: true, displayName: true },
        },
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  async findAllForOrg(orgId: string) {
    return this.prisma.organizationInvitation.findMany({
      where: { orgId },
      include: {
        invitedBy: {
          select: { id: true, email: true, displayName: true },
        },
        acceptedBy: {
          select: { id: true, email: true, displayName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(orgId: string, invitationId: string) {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { id: invitationId, orgId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'pending') {
      throw new BadRequestException('Only pending invitations can be revoked');
    }

    return this.prisma.organizationInvitation.update({
      where: { id: invitationId },
      data: { status: 'revoked' },
    });
  }

  async resend(orgId: string, invitationId: string) {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { id: invitationId, orgId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'pending') {
      throw new BadRequestException('Only pending invitations can be resent');
    }

    // Regenerate token and extend expiry
    const token = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 3600_000);

    return this.prisma.organizationInvitation.update({
      where: { id: invitationId },
      data: { token, expiresAt },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  async getByToken(token: string) {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
        invitedBy: {
          select: { id: true, displayName: true },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found or invalid');
    }

    // Check if expired (mark as expired if so)
    if (invitation.status === 'pending' && invitation.expiresAt < new Date()) {
      await this.prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('This invitation has expired. Please request a new one.');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException(
        `This invitation has already been ${invitation.status}. Please request a new one.`,
      );
    }

    return invitation;
  }

  async accept(token: string, userId: string) {
    const invitation = await this.getByToken(token);

    // Check if user is already a member
    const existingMember = await this.prisma.organizationMember.findUnique({
      where: {
        orgId_userId: { orgId: invitation.orgId, userId },
      },
    });
    if (existingMember) {
      // Mark invitation as accepted anyway and return the org
      await this.prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedAt: new Date(), acceptedById: userId },
      });
      return {
        alreadyMember: true,
        organization: invitation.organization,
      };
    }

    // Transaction: create membership + update invitation
    const result = await this.prisma.$transaction(async (tx) => {
      const member = await tx.organizationMember.create({
        data: {
          orgId: invitation.orgId,
          userId,
          role: invitation.role,
        },
        include: {
          user: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
        },
      });

      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedAt: new Date(), acceptedById: userId },
      });

      return member;
    });

    return {
      alreadyMember: false,
      organization: invitation.organization,
      membership: result,
    };
  }
}
