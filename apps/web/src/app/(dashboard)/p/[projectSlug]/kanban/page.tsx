'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, orgs, projects } from '@/lib/api';

interface KanbanColumn {
  id: string;
  name: string;
  position: number;
  color: string | null;
  _count: { tasks: number };
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  position: number;
  assignee: { id: string; displayName: string; avatarUrl: string | null } | null;
  dueDate: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'border-l-gray-300',
  medium: 'border-l-blue-400',
  high: 'border-l-orange-400',
  critical: 'border-l-red-500',
};

export default function KanbanPage() {
  const params = useParams();
  const projectSlug = params.projectSlug as string;

  const [projectId, setProjectId] = useState<string | null>(null);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [tasksByColumn, setTasksByColumn] = useState<Record<string, Task[]>>({});
  const [unassignedTasks, setUnassignedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBoard = useCallback(async (pid: string) => {
    const cols = (await apiFetch(`/projects/${pid}/kanban-columns`)) as KanbanColumn[];
    setColumns(cols);

    const allTasks = (await apiFetch(`/projects/${pid}/tasks`)) as Task[];
    const grouped: Record<string, Task[]> = {};
    const unassigned: Task[] = [];

    for (const col of cols) {
      grouped[col.id] = [];
    }
    for (const task of allTasks) {
      const colId = (task as Task & { kanbanColumnId?: string }).kanbanColumnId;
      if (colId && grouped[colId]) {
        grouped[colId].push(task);
      } else {
        unassigned.push(task);
      }
    }

    // Sort by position within each column
    for (const colId of Object.keys(grouped)) {
      grouped[colId].sort((a, b) => a.position - b.position);
    }

    setTasksByColumn(grouped);
    setUnassignedTasks(unassigned);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const orgList = await orgs.list();
        for (const org of orgList) {
          const projList = (await projects.list(org.id)) as {
            id: string;
            slug: string;
          }[];
          const found = projList.find((p) => p.slug === projectSlug);
          if (found) {
            setProjectId(found.id);
            await loadBoard(found.id);
            break;
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectSlug, loadBoard]);

  if (loading) return <div className="text-gray-500">Loading kanban board...</div>;
  if (!projectId) return <div className="text-gray-500">Project not found.</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Kanban Board</h1>

      <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
        {/* Unassigned column */}
        {unassignedTasks.length > 0 && (
          <div className="w-72 flex-shrink-0">
            <div className="rounded-lg bg-gray-100 p-3">
              <h3 className="mb-3 text-sm font-semibold text-gray-600">
                Unassigned ({unassignedTasks.length})
              </h3>
              <div className="space-y-2">
                {unassignedTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </div>
          </div>
        )}

        {columns.map((col) => (
          <div key={col.id} className="w-72 flex-shrink-0">
            <div className="rounded-lg bg-gray-100 p-3">
              <div className="mb-3 flex items-center gap-2">
                {col.color && (
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: col.color }} />
                )}
                <h3 className="text-sm font-semibold text-gray-700">
                  {col.name} ({tasksByColumn[col.id]?.length || 0})
                </h3>
              </div>
              <div className="space-y-2">
                {(tasksByColumn[col.id] || []).map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
                {(tasksByColumn[col.id] || []).length === 0 && (
                  <p className="py-4 text-center text-xs text-gray-400">No tasks</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {columns.length === 0 && unassignedTasks.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <p>No kanban columns configured.</p>
            <p className="mt-1 text-sm">Create columns in project settings to use the board.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  return (
    <div
      className={`rounded-md border-l-4 bg-white p-3 shadow-sm ${PRIORITY_COLORS[task.priority] || 'border-l-gray-300'}`}
    >
      <p className="text-sm font-medium text-gray-900">{task.title}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
          {task.status}
        </span>
        {task.assignee && (
          <span className="text-xs text-gray-500">{task.assignee.displayName}</span>
        )}
      </div>
      {task.dueDate && (
        <p className="mt-1 text-xs text-gray-400">
          Due: {new Date(task.dueDate).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
