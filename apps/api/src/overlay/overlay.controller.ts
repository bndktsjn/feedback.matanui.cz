import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { OverlayCreateThreadDto } from './dto/overlay-create-thread.dto';
import { Prisma } from '@feedback/db';

interface ProjectFromGuard {
  id: string;
  orgId: string;
  baseUrl: string;
  settings: unknown;
}

@Controller('v1/overlay')
@UseGuards(ApiKeyGuard)
export class OverlayController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get('config')
  async getConfig(@Req() req: Request): Promise<Record<string, unknown>> {
    const project = (req as Request & { project: ProjectFromGuard }).project;
    const fullProject = await this.prisma.project.findUnique({
      where: { id: project.id },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        settings: true,
        urlRules: {
          select: { pattern: true, ruleType: true },
        },
      },
    });
    return {
      projectId: fullProject?.id,
      projectName: fullProject?.name,
      baseUrl: fullProject?.baseUrl,
      urlRules: fullProject?.urlRules || [],
    };
  }

  @Post('threads')
  async createThread(
    @Req() req: Request,
    @Body() dto: OverlayCreateThreadDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Record<string, unknown>> {
    const project = (req as Request & { project: ProjectFromGuard }).project;
    const env = dto.environment;

    const thread = await this.prisma.thread.create({
      data: {
        projectId: project.id,
        authorId: null,
        title: dto.title,
        message: dto.message,
        pageUrl: dto.pageUrl,
        pageTitle: dto.pageTitle,
        status: 'open',
        priority:
          (dto.priority as Prisma.EnumThreadPriorityFieldUpdateOperationsInput['set']) ?? 'medium',
        type: (dto.type as Prisma.EnumThreadTypeFieldUpdateOperationsInput['set']) ?? 'general',
        contextType:
          (dto.contextType as Prisma.EnumContextTypeFieldUpdateOperationsInput['set']) ?? 'panel',
        viewport:
          (dto.viewport as Prisma.EnumViewportTypeFieldUpdateOperationsInput['set']) ?? 'desktop',
        xPct: dto.xPct,
        yPct: dto.yPct,
        anchorData: dto.anchorData as Prisma.InputJsonValue,
        targetSelector: dto.targetSelector,
        screenshotUrl: dto.screenshotUrl,
        createdVia: 'overlay',
        ...(env
          ? {
              environment: {
                create: {
                  browserName: env.browserName,
                  browserVersion: env.browserVersion,
                  osName: env.osName,
                  osVersion: env.osVersion,
                  viewportMode: env.viewportMode,
                  viewportWidth: env.viewportWidth,
                  viewportHeight: env.viewportHeight,
                  devicePixelRatio: env.devicePixelRatio,
                  userAgent: env.userAgent,
                },
              },
            }
          : {}),
      },
    });

    // Handle base64 screenshot from widget mode
    if (dto.screenshotDataUrl && dto.screenshotDataUrl.startsWith('data:image/')) {
      try {
        const base64Data = dto.screenshotDataUrl.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const mimeMatch = dto.screenshotDataUrl.match(/^data:(image\/\w+);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const ext = mimeType === 'image/jpeg' ? '.jpg' : '.png';
        const { url } = await this.storage.upload(buffer, `screenshot${ext}`, mimeType, 'screenshots');
        await this.prisma.thread.update({
          where: { id: thread.id },
          data: { screenshotUrl: url },
        });
      } catch (err) {
        console.error('Failed to upload widget screenshot:', err);
      }
    }

    res.status(201);
    return { id: thread.id, status: thread.status, createdAt: thread.createdAt };
  }
}
