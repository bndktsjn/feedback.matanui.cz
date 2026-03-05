import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { OrgsModule } from './orgs/orgs.module';
import { ProjectsModule } from './projects/projects.module';
import { ThreadsModule } from './threads/threads.module';
import { CommentsModule } from './comments/comments.module';
import { StorageModule } from './storage/storage.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { TasksModule } from './tasks/tasks.module';
import { MentionsModule } from './mentions/mentions.module';
import { OverlayModule } from './overlay/overlay.module';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    MentionsModule,
    HealthModule,
    AuthModule,
    OrgsModule,
    ProjectsModule,
    ThreadsModule,
    CommentsModule,
    AttachmentsModule,
    TasksModule,
    OverlayModule,
  ],
})
export class AppModule {}
