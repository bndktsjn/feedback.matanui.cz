import { Controller, Get, Param } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('v1/public/projects')
export class PublicProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get('by-slug/:slug')
  async findBySlug(@Param('slug') slug: string): Promise<Record<string, unknown>> {
    return this.projectsService.findPublicBySlug(slug);
  }
}
