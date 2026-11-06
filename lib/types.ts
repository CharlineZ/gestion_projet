export type Priority = 'haute' | 'moyenne' | 'basse';

export type SubTask = {
  id: string;
  title: string;
  done: boolean;
  doneAt: string | null;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  due: string | null;
  flag: boolean;
  priority: Priority;
  done: boolean;
  doneAt: string | null;
  subtasks: SubTask[];
};

export type HistoryEntry = { at: string; action: string; detail: string };

export type Project = {
  name: string;
  slug: string;
  sources: string[];
  tasks: Task[];
  createdAt: string;
  history: HistoryEntry[];
};

export type SurpriseType = 'fun' | 'citations' | 'festif' | 'pause' | 'defi';
export type SurprisePrefs = { types: SurpriseType[]; frequence: 'souvent' | 'parfois' | 'rarement' };

export const SURPRISE_TYPES: SurpriseType[] = ['fun', 'citations', 'festif', 'pause', 'defi'];
export const DEFAULT_SURPRISES: SurprisePrefs = { types: ['festif', 'citations'], frequence: 'parfois' };

export type Profile = {
  notes: string;
  paceFactor: number;
  surprises: SurprisePrefs;
  updatedAt: string;
};

export type TaskStatus = Task & {
  late: boolean;
  validatedLate: boolean;
  overdueDays: number;
};

export type ProjectStats = {
  total: number;
  done: number;
  late: number;
  validatedLate: number;
  flags: number;
  flagsDone: number;
  subtasks: number;
  subtasksDone: number;
};

export type ProjectView = {
  project: Project;
  tasks: TaskStatus[];
  stats: ProjectStats;
  today: string;
};

const DIACRITICS = /[\u0300-\u036f]/g;

export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'projet';
}

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00').getTime());
}

export function computeView(project: Project, now = new Date()): ProjectView {
  const today = todayISO(now);
  const tasks: TaskStatus[] = project.tasks.map((t) => {
    const dueDay = t.due ? dateOnly(t.due) : null;
    const doneDay = t.doneAt ? dateOnly(t.doneAt) : null;
    const late = !t.done && dueDay !== null && dueDay < today;
    const validatedLate = t.done && dueDay !== null && doneDay !== null && doneDay > dueDay;
    let overdueDays = 0;
    if (late && dueDay) {
      overdueDays = Math.max(1, Math.round((now.getTime() - new Date(dueDay + 'T23:59:59').getTime()) / 86_400_000));
    }
    return { ...t, subtasks: t.subtasks ?? [], late, validatedLate, overdueDays };
  });
  const subtasks = tasks.flatMap((t) => t.subtasks);
  const stats: ProjectStats = {
    total: tasks.length,
    done: tasks.filter((t) => t.done).length,
    late: tasks.filter((t) => t.late).length,
    validatedLate: tasks.filter((t) => t.validatedLate).length,
    flags: tasks.filter((t) => t.flag).length,
    flagsDone: tasks.filter((t) => t.flag && t.done).length,
    subtasks: subtasks.length,
    subtasksDone: subtasks.filter((s) => s.done).length,
  };
  return { project, tasks, stats, today };
}
