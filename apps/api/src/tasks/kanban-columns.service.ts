import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKanbanColumnDto, UpdateKanbanColumnDto } from './dto';

@Injectable()
export class KanbanColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: string): Promise<Record<string, unknown>[]> {
    return this.prisma.kanbanColumn.findMany({
      where: { projectId },
      include: {
        _count: { select: { tasks: true } },
      },
      orderBy: { position: 'asc' },
    });
  }

  async create(projectId: string, dto: CreateKanbanColumnDto): Promise<Record<string, unknown>> {
    const maxPos = await this.prisma.kanbanColumn.aggregate({
      where: { projectId },
      _max: { position: true },
    });
    const position = dto.position ?? (maxPos._max.position ?? -1) + 1;

    return this.prisma.kanbanColumn.create({
      data: {
        projectId,
        name: dto.name,
        position,
        color: dto.color,
      },
    });
  }

  async update(columnId: string, dto: UpdateKanbanColumnDto): Promise<Record<string, unknown>> {
    const col = await this.prisma.kanbanColumn.findUnique({
      where: { id: columnId },
    });
    if (!col) throw new NotFoundException('Kanban column not found');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.color !== undefined) data.color = dto.color;

    return this.prisma.kanbanColumn.update({
      where: { id: columnId },
      data,
    });
  }

  async remove(columnId: string): Promise<void> {
    const col = await this.prisma.kanbanColumn.findUnique({
      where: { id: columnId },
    });
    if (!col) throw new NotFoundException('Kanban column not found');

    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { kanbanColumnId: columnId },
        data: { kanbanColumnId: null },
      }),
      this.prisma.kanbanColumn.delete({ where: { id: columnId } }),
    ]);
  }
}
