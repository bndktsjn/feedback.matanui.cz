import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectMembersService } from './project-members.service';
import { UrlRulesService } from './url-rules.service';
import { ProjectsController } from './projects.controller';
import { ProjectMembersController } from './project-members.controller';
import { UrlRulesController } from './url-rules.controller';
import { ProjectMemberGuard } from './guards/project-member.guard';
import { AuthModule } from '../auth/auth.module';
import { OrgsModule } from '../orgs/orgs.module';

@Module({
  imports: [AuthModule, OrgsModule],
  controllers: [ProjectsController, ProjectMembersController, UrlRulesController],
  providers: [ProjectsService, ProjectMembersService, UrlRulesService, ProjectMemberGuard],
  exports: [ProjectsService, ProjectMembersService, ProjectMemberGuard],
})
export class ProjectsModule {}
