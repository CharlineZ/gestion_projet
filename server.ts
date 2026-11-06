import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTasksFromDoc, generateTemplateFromProfile, getAdvice, Decalage } from './lib/ai.js';
import { docxToText } from './lib/docx.js';
import { MissingApiKey, MODEL, getClient } from './lib/mistral.js';
import {
  addHistory,
  createProject,
  getProfile,
  getProject,
  listProjects,
  normalizeTasks,
  saveProfile,
  saveProject,
} from './lib/store.js';
import { computeView, isValidDate, ProjectView, slugify, SURPRISE_TYPES, SurprisePrefs, SurpriseType, Task, todayISO } from './lib/types.js';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(rootDir, 'public');
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY = 20 * 1024 * 1024;

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage, limit = MAX_BODY): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Corps trop volumineux'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const buf = await readBody(req, 1024 * 1024);
  return JSON.parse(buf.toString('utf8'));
}

function toMarkdown(view: ProjectView): string {
  const { project, tasks, stats, today } = view;
  const lines: string[] = [];
  lines.push(`# ${project.name}`);
  lines.push('');
  lines.push(
    `Généré le ${today} — total: ${stats.total}, terminées: ${stats.done}, en retard: ${stats.late}, jalons validés: ${stats.flagsDone}/${stats.flags}`,
  );
  lines.push('');
  lines.push('## Tâches');
  lines.push('');
  const sorted = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.due ?? '9999').localeCompare(b.due ?? '9999');
  });
  for (const t of sorted) {
    const check = t.done ? '[x]' : '[ ]';
    const due = t.due ? ` — échéance ${t.due}` : '';
    const flags: string[] = [];
    if (t.flag) flags.push('JALON');
    if (t.late) flags.push(`EN RETARD de ${t.overdueDays} j`);
    if (t.validatedLate) flags.push('validé en retard');
    if (t.priority === 'haute') flags.push('priorité haute');
    const tag = flags.length ? ` (${flags.join(', ')})` : '';
    const desc = t.description ? ` — ${t.description}` : '';
    lines.push(`- ${check} ${t.title}${due}${tag}${desc}`);
  }
  lines.push('');
  lines.push('## Historique');
  lines.push('');
  for (const h of [...project.history].reverse().slice(0, 50)) {
    lines.push(`- ${h.at.slice(0, 19).replace('T', ' ')} — ${h.action} : ${h.detail}`);
  }
  lines.push('');
  return lines.join('\n');
}

function mergeTasks(existing: Task[], incoming: Task[]): { added: Task[]; skipped: number } {
  const existingLower = new Set(existing.map((t) => t.title.toLowerCase()));
  const added: Task[] = [];
  let skipped = 0;
  let nextIndex = existing.length + 1;
  for (const t of incoming) {
    const key = t.title.toLowerCase();
    const dup = existingLower.has(key) || [...existingLower].some((e) => e.includes(key) || key.includes(e));
    if (dup) {
      skipped++;
      continue;
    }
    added.push({ ...t, id: `t${nextIndex++}` });
    existingLower.add(key);
  }
  return { added, skipped };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  try {
    if (req.method === 'POST' && path === '/api/chat') {
      const client = getClient();
      const body = (await readJson(req)) as { messages?: ChatMessage[] };
      const messages = body.messages;
      if (
        !Array.isArray(messages) ||
        messages.length === 0 ||
        messages.some((m) => !m || !['user', 'assistant', 'system'].includes(m.role) || typeof m.content !== 'string')
      ) {
        sendJson(res, 400, { error: 'Corps invalide : { "messages": [{ "role", "content" }] }' });
        return;
      }
      const projectSlug = req.headers['x-project'];
      const full: ChatMessage[] = [...messages];
      if (typeof projectSlug === 'string' && projectSlug) {
        const p = await getProject(projectSlug);
        if (p) {
          full.unshift({
            role: 'system',
            content: `Contexte : état actuel du projet "${p.name}" (date du jour ${todayISO()}) : ${JSON.stringify(computeView(p))}`,
          });
        }
      }
      const completion = await client.chat.complete({ model: MODEL, messages: full });
      const reply = completion.choices?.[0]?.message?.content;
      sendJson(res, 200, { reply: typeof reply === 'string' ? reply : '' });
      return;
    }

    if (req.method === 'POST' && path === '/api/import') {
      const name = String(req.headers['x-project'] ?? '').trim();
      const kind = req.headers['x-kind'] === 'hebdomadaire' ? 'hebdomadaire' : 'global';
      const filename = String(req.headers['x-filename'] ?? 'document.docx');
      if (!name) {
        sendJson(res, 400, { error: 'En-tête x-project (nom du projet) requis.' });
        return;
      }
      const buffer = await readBody(req);
      const text = await docxToText(buffer);
      const profile = await getProfile();
      const existing = await getProject(slugify(name));
      const raw = await extractTasksFromDoc(text, kind, profile, existing ? existing.tasks.map((t) => t.title) : []);
      const incoming = normalizeTasks(raw, 1);
      let project;
      if (existing) {
        const { added, skipped } = mergeTasks(existing.tasks, incoming);
        existing.tasks.push(...added);
        if (!existing.sources.includes(filename)) existing.sources.push(filename);
        addHistory(existing, 'import', `${filename} (${kind}) : ${added.length} tâche(s) ajoutée(s), ${skipped} doublon(s) ignoré(s)`);
        project = existing;
      } else {
        project = createProject(name, incoming, [filename]);
        addHistory(project, 'creation', `Créé depuis ${filename} (${kind}) : ${incoming.length} tâche(s)`);
      }
      await saveProject(project);
      sendJson(res, 200, { view: computeView(project), imported: incoming.length });
      return;
    }

    if (req.method === 'POST' && path === '/api/projects/new') {
      const body = (await readJson(req)) as { name?: string };
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(res, 400, { error: 'Champ "name" requis.' });
        return;
      }
      if (await getProject(slugify(name))) {
        sendJson(res, 409, { error: 'Un projet avec ce nom existe déjà.' });
        return;
      }
      const profile = await getProfile();
      const raw = await generateTemplateFromProfile(name, profile);
      const project = createProject(name, normalizeTasks(raw, 1), []);
      addHistory(project, 'creation', `Nouveau projet généré à partir du profil (${project.tasks.length} tâche(s))`);
      await saveProject(project);
      sendJson(res, 200, { view: computeView(project) });
      return;
    }

    if (req.method === 'GET' && path === '/api/projects') {
      const projects = await listProjects();
      sendJson(
        res,
        200,
        projects.map((p) => ({ name: p.name, slug: p.slug, sources: p.sources, stats: computeView(p).stats })),
      );
      return;
    }

    const projectMatch = path.match(/^\/api\/projects\/([a-z0-9-]+)(\/(flags|advice|apply|export|subtasks|subtasks-add))?$/);
    if (projectMatch) {
      const slug = projectMatch[1];
      const action = projectMatch[3];
      const project = await getProject(slug);
      if (!project) {
        sendJson(res, 404, { error: 'Projet introuvable' });
        return;
      }

      if (req.method === 'GET' && !action) {
        sendJson(res, 200, { view: computeView(project) });
        return;
      }

      if (req.method === 'GET' && action === 'export') {
        const md = toMarkdown(computeView(project));
        res.writeHead(200, {
          'content-type': 'text/markdown; charset=utf-8',
          'content-disposition': `attachment; filename="${slug}.md"`,
        });
        res.end(md);
        return;
      }

      if (req.method === 'POST' && action === 'flags') {
        const body = (await readJson(req)) as { taskId?: string; done?: boolean };
        const task = project.tasks.find((t) => t.id === body.taskId);
        if (!task || typeof body.done !== 'boolean') {
          sendJson(res, 400, { error: 'taskId et done (booléen) requis.' });
          return;
        }
        task.done = body.done;
        task.doneAt = body.done ? new Date().toISOString() : null;
        const view = computeView(project);
        const status = view.tasks.find((t) => t.id === task.id);
        addHistory(
          project,
          body.done ? 'jalon validé' : 'jalon invalidé',
          `${task.title}${status?.validatedLate ? ' (validé en retard)' : ''}`,
        );
        await saveProject(project);
        sendJson(res, 200, { view: computeView(project) });
        return;
      }

      if (req.method === 'POST' && action === 'subtasks') {
        const body = (await readJson(req)) as { taskId?: string; subId?: string; done?: boolean };
        const task = project.tasks.find((t) => t.id === body.taskId);
        const sub = task?.subtasks?.find((s) => s.id === body.subId);
        if (!task || !sub || typeof body.done !== 'boolean') {
          sendJson(res, 400, { error: 'taskId, subId et done (booléen) requis.' });
          return;
        }
        const wasDone = task.done;
        const wasAllSubsDone = (task.subtasks ?? []).length > 0 && (task.subtasks ?? []).every((s) => s.done);
        sub.done = body.done;
        sub.doneAt = body.done ? new Date().toISOString() : null;
        addHistory(project, body.done ? 'sous-jalon validé' : 'sous-jalon réouvert', `${task.title} › ${sub.title}`);
        task.subtasks = task.subtasks ?? [];
        const allSubsDone = task.subtasks.length > 0 && task.subtasks.every((s) => s.done);
        if (allSubsDone && !wasDone) {
          task.done = true;
          task.doneAt = new Date().toISOString();
          addHistory(project, 'jalon auto-validé', `${task.title} (tous les sous-jalons sont faits)`);
        } else if (!allSubsDone && wasAllSubsDone && wasDone) {
          task.done = false;
          task.doneAt = null;
          addHistory(project, 'jalon réouvert', `${task.title} (un sous-jalon a été décoché)`);
        }
        await saveProject(project);
        sendJson(res, 200, { view: computeView(project) });
        return;
      }

      if (req.method === 'POST' && action === 'subtasks-add') {
        const body = (await readJson(req)) as { taskId?: string; title?: string };
        const task = project.tasks.find((t) => t.id === body.taskId);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!task || !title) {
          sendJson(res, 400, { error: 'taskId et title requis.' });
          return;
        }
        task.subtasks = task.subtasks ?? [];
        task.subtasks.push({ id: `${task.id}-s${task.subtasks.length + 1}`, title, done: false, doneAt: null });
        addHistory(project, 'sous-jalon ajouté', `${task.title} › ${title}`);
        await saveProject(project);
        sendJson(res, 200, { view: computeView(project) });
        return;
      }

      if (req.method === 'POST' && action === 'advice') {
        const view = computeView(project);
        const profile = await getProfile();
        const advice = await getAdvice(view, profile);
        sendJson(res, 200, { advice, today: view.today });
        return;
      }

      if (req.method === 'POST' && action === 'apply') {
        const body = (await readJson(req)) as { decalages?: Decalage[] };
        if (!Array.isArray(body.decalages)) {
          sendJson(res, 400, { error: 'Champ "decalages" (tableau) requis.' });
          return;
        }
        let applied = 0;
        for (const d of body.decalages) {
          const task = project.tasks.find((t) => t.id === d?.taskId);
          if (!task || task.done || typeof d.nouvelleDate !== 'string' || !isValidDate(d.nouvelleDate)) continue;
          const old = task.due;
          task.due = d.nouvelleDate;
          addHistory(
            project,
            'décalage',
            `${task.title} : ${old ?? 'sans date'} → ${d.nouvelleDate} (${typeof d.raison === 'string' ? d.raison : 'conseil IA'})`,
          );
          applied++;
        }
        await saveProject(project);
        sendJson(res, 200, { view: computeView(project), applied });
        return;
      }
    }

    if (path === '/api/profile') {
      if (req.method === 'GET') {
        sendJson(res, 200, { profile: await getProfile() });
        return;
      }
      if (req.method === 'PUT') {
        const body = (await readJson(req)) as { notes?: string; paceFactor?: number };
        const current = await getProfile();
        const notes = typeof body.notes === 'string' ? body.notes : current.notes;
        const paceFactor =
          typeof body.paceFactor === 'number' && body.paceFactor >= 0.5 && body.paceFactor <= 3
            ? body.paceFactor
            : current.paceFactor;
        const b = (body as { surprises?: { types?: unknown; frequence?: unknown } }).surprises;
        const types = Array.isArray(b?.types) ? (b.types as unknown[]).filter((t): t is SurpriseType => SURPRISE_TYPES.includes(t as SurpriseType)).slice(0, 5) : current.surprises.types;
        const frequence = b && ['souvent', 'parfois', 'rarement'].includes(b.frequence as string) ? (b.frequence as SurprisePrefs['frequence']) : current.surprises.frequence;
        await saveProfile({ notes, paceFactor, surprises: { types, frequence }, updatedAt: current.updatedAt });
        sendJson(res, 200, { profile: await getProfile() });
        return;
      }
    }

    if (req.method === 'GET') {
      const pathname = path === '/' ? '/index.html' : path;
      const filePath = normalize(join(publicDir, pathname));
      if (!filePath.startsWith(publicDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      try {
        const data = await readFile(filePath);
        const types: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
        };
        res.writeHead(200, { 'content-type': types[extname(filePath)] ?? 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('404');
      }
      return;
    }

    res.writeHead(405);
    res.end();
  } catch (err) {
    if (err instanceof MissingApiKey) {
      sendJson(res, 500, { error: err.message });
      return;
    }
    console.error(err);
    sendJson(res, 502, { error: "Erreur lors de l'appel à l'API Mistral ou traitement en échec." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Suivi de projet disponible sur http://${HOST}:${PORT} (écoute en local uniquement)`);
});
