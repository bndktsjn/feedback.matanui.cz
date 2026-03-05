import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@feedback/db';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto, TaskQueryDto } from './dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    projectId: string,
    createdBy: string,
    dto: CreateTaskDto,
  ): Promise<Record<string, unknown>> {
    return this.prisma.task.create({
      data: {
        projectId,
        createdBy,
        title: dto.title,
        description: dto.description,
        status: (dto.status as Prisma.EnumTaskStatusFieldUpdateOperationsInput['set']) ?? 'todo',
        priority:
          (dto.priority as Prisma.EnumThreadPriorityFieldUpdateOperationsInput['set']) ?? 'medium',
        assigneeId: dto.assigneeId,
        threadId: dto.threadId,
        kanbanColumnId: dto.kanbanColumnId,
        position: dto.position ?? 0,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: {
        assignee: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
        creator: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
        kanbanColumn: true,
      },
    });
  }

  async findAll(
    projectId: string,
    query: TaskQueryDto,
  ): Promise<{ data: Record<string, unknown>[]; total: number }> {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const skip = (page - 1) * perPage;

    const where: Prisma.TaskWhereInput = {
      projectId,
      deletedAt: null,
    };
    if (query.status) where.status = query.status as Prisma.EnumTaskStatusFilter['equals'];
    if (query.priority)
      where.priority = query.priority as Prisma.EnumThreadPriorityFilter['equals'];
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.threadId) where.threadId = query.threadId;
    if (query.kanbanColumnId) where.kanbanColumnId = query.kanbanColumnId;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        skip,
        take: perPage,
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
        include: {
          assignee: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
          creator: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
          kanbanColumn: true,
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(taskId: string): Promise<Record<string, unknown>> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId, deletedAt: null },
      include: {
        assignee: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
        creator: {
          select: { id: true, email: true, displayName: true, avatarUrl: true },
        },
        kanbanColumn: true,
        thread: { select: { id: true, title: true, status: true } },
        history: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            changer: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(
    taskId: string,
    userId: string,
    dto: UpdateTaskDto,
  ): Promise<Record<string, unknown>> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId, deletedAt: null },
    });
    if (!task) throw new NotFoundException('Task not found');

    const data: Record<string, unknown> = {};
    const historyEntries: { field: string; oldValue: string; newValue: string }[] = [];

    const trackChange = (field: string, oldVal: unknown, newVal: unknown) => {
      if (newVal !== undefined && String(oldVal) !== String(newVal)) {
        data[field] = newVal;
        historyEntries.push({
          field,
          oldValue: String(oldVal ?? ''),
          newValue: String(newVal ?? ''),
        });
      }
    };

    trackChange('title', task.title, dto.title);
    trackChange('description', task.description, dto.description);
    trackChange('status', task.status, dto.status);
    trackChange('priority', task.priority, dto.priority);
    trackChange('assigneeId', task.assigneeId, dto.assigneeId);
    trackChange('kanbanColumnId', task.kanbanColumnId, dto.kanbanColumnId);
    trackChange('position', task.position, dto.position);
    trackChange(
      'dueDate',
      task.dueDate,
      dto.dueDate !== undefined ? (dto.dueDate ? new Date(dto.dueDate) : null) : undefined,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data,
        include: {
          assignee: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
          creator: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
          kanbanColumn: true,
        },
      });

      if (historyEntries.length > 0) {
        await tx.taskHistory.createMany({
          data: historyEntries.map((h) => ({
            taskId,
            changedBy: userId,
            field: h.field,
            oldValue: h.oldValue,
            newValue: h.newValue,
          })),
        });
      }

      return updated;
    });
  }

  async softDelete(taskId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId, deletedAt: null },
    });
    if (!task) throw new NotFoundException('Task not found');

    await this.prisma.task.update({
      where: { id: taskId },
      data: { deletedAt: new Date() },
    });
  }
}
