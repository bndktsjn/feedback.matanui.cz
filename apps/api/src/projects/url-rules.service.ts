import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUrlRuleDto } from './dto';

@Injectable()
export class UrlRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: string): Promise<Record<string, unknown>[]> {
    return this.prisma.allowedUrlRule.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(projectId: string, dto: CreateUrlRuleDto): Promise<Record<string, unknown>> {
    return this.prisma.allowedUrlRule.create({
      data: {
        projectId,
        pattern: dto.pattern,
        ruleType: dto.ruleType || 'glob',
      },
    });
  }

  async remove(projectId: string, ruleId: string): Promise<void> {
    const rule = await this.prisma.allowedUrlRule.findFirst({
      where: { id: ruleId, projectId },
    });
    if (!rule) throw new NotFoundException('URL rule not found');

    await this.prisma.allowedUrlRule.delete({ where: { id: ruleId } });
  }
}
