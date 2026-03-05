import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { KanbanColumnsService } from './kanban-columns.service';
import { TasksController } from './tasks.controller';
import { KanbanColumnsController } from './kanban-columns.controller';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [TasksController, KanbanColumnsController],
  providers: [TasksService, KanbanColumnsService],
  exports: [TasksService, KanbanColumnsService],
})
export class TasksModule {}
