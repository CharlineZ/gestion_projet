import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SURPRISES, HistoryEntry, Priority, Profile, Project, SubTask, Task, slugify } from './types.js';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
export const dataDir = join(rootDir, 'data');
const projectsDir = join(dataDir, 'projects');
const profilePath = join(dataDir, 'profile.json');

export async function ensureDirs(): Promise<void> {
  await mkdir(projectsDir, { recursive: true });
}

export async function listProjects(): Promise<Project[]> {
  await ensureDirs();
  const files = (await readdir(projectsDir)).filter((f) => f.endsWith('.json'));
  const projects: Project[] = [];
  for (const f of files) {
    try {
      projects.push(JSON.parse(await readFile(join(projectsDir, f), 'utf8')));
    } catch {
      // ignore les fichiers illisibles
    }
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProject(slug: string): Promise<Project | null> {
  try {
    return JSON.parse(await readFile(join(projectsDir, `${slug}.json`), 'utf8'));
  } catch {
    return null;
  }
}

export async function saveProject(project: Project): Promise<void> {
  await ensureDirs();
  await writeFile(join(projectsDir, `${project.slug}.json`), JSON.stringify(project, null, 2));
}

export function normalizeTasks(raw: unknown, startIndex: number): Task[] {
  const arr = Array.isArray(raw) ? raw : [];
  const tasks: Task[] = [];
  let i = startIndex;
  for (const item of arr) {
    const t = item as Record<string, unknown>;
    if (!t || typeof t.title !== 'string' || !t.title.trim()) continue;
    const due = typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t.due) ? t.due.slice(0, 10) : null;
    const priority: Priority = ['haute', 'moyenne', 'basse'].includes(t.priority as string)
      ? (t.priority as Priority)
      : 'moyenne';
    const taskId = `t${i++}`;
    const rawSubs = Array.isArray(t.sousTaches) ? t.sousTaches : [];
    const subtasks: SubTask[] = rawSubs
      .filter((s): s is string => typeof s === 'string' && !!s.trim())
      .slice(0, 8)
      .map((s, j) => ({ id: `${taskId}-s${j + 1}`, title: s.trim(), done: false, doneAt: null }));
    tasks.push({
      id: taskId,
      title: t.title.trim(),
      description: typeof t.description === 'string' ? t.description : '',
      due,
      flag: t.flag === true,
      priority,
      done: false,
      doneAt: null,
      subtasks,
    });
  }
  return tasks;
}

export function createProject(name: string, tasks: Task[], sources: string[]): Project {
  return {
    name,
    slug: slugify(name),
    sources,
    tasks,
    createdAt: new Date().toISOString(),
    history: [],
  };
}

export function addHistory(project: Project, action: string, detail: string): void {
  const entry: HistoryEntry = { at: new Date().toISOString(), action, detail };
  project.history.push(entry);
  if (project.history.length > 200) project.history = project.history.slice(-200);
}

export async function getProfile(): Promise<Profile> {
  try {
    const p = JSON.parse(await readFile(profilePath, 'utf8')) as Partial<Profile>;
    return {
      notes: p.notes ?? '',
      paceFactor: p.paceFactor ?? 1.2,
      surprises: { ...DEFAULT_SURPRISES, ...(p.surprises ?? {}) },
      updatedAt: p.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { notes: '', paceFactor: 1.2, surprises: DEFAULT_SURPRISES, updatedAt: new Date().toISOString() };
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await ensureDirs();
  profile.updatedAt = new Date().toISOString();
  await writeFile(profilePath, JSON.stringify(profile, null, 2));
}
