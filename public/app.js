const $ = (id) => document.getElementById(id);
const projectSelect = $('projectSelect');
const newProjectBtn = $('newProjectBtn');
const exportLink = $('exportLink');
const statsEl = $('stats');
const taskGroups = $('taskGroups');
const emptyState = $('emptyState');
const hideDone = $('hideDone');
const historyList = $('historyList');
const progressBar = $('progressBar');
const progressLabel = $('progressLabel');
const nextDeadline = $('nextDeadline');
const docxFile = $('docxFile');
const docxKind = $('docxKind');
const docxProject = $('docxProject');
const importBtn = $('importBtn');
const importMsg = $('importMsg');
const adviceDetails = $('adviceDetails');
const adviceBtn = $('adviceBtn');
const advicePanel = $('advicePanel');
const adviceResume = $('adviceResume');
const adviceList = $('adviceList');
const decalagesBox = $('decalagesBox');
const decalagesList = $('decalagesList');
const applyBtn = $('applyBtn');
const adviceMsg = $('adviceMsg');
const profileNotes = $('profileNotes');
const paceFactor = $('paceFactor');
const surpriseTypeBoxes = [...document.querySelectorAll('.surprise-type')];
const surpriseFreq = $('surpriseFreq');
const saveProfileBtn = $('saveProfileBtn');
const profileMsg = $('profileMsg');
const chatMessages = $('chatMessages');
const chatForm = $('chatForm');
const chatInput = $('chatInput');
const toast = $('toast');

let currentSlug = null;
let currentView = null;
let lastAdvice = null;
let nextTaskId = null;
let toastTimer = null;
let surprisePrefs = { types: ['festif'], frequence: 'parfois' };
const chatHistory = [];

const TOASTS = {
  jalon: [
    '🎉 Jalon validé, bravo !',
    '⭐ GG, ce jalon est à toi !',
    '🏆 Jalon bouclé — bien joué !',
    '💥 Jalon validé !',
    '🌟 Encore un jalon de franchi !',
    '🔥 Jalon dans la poche !',
    '👑 Un jalon de plus, chapeau !',
  ],
  tache: [
    '✅ Tâche terminée !',
    '👏 Bien joué !',
    '🚀 Une de moins !',
    "✨ C'est fait, nickel !",
    '💪 Encore une !',
  ],
  sous: [
    '🔹 Sous-jalon validé !',
    '🧩 Mini-étape bouclée !',
    '💫 Petit pas, belle avancée !',
  ],
  reopen: ['↩️ Jalon réouvert', '↩️ Tâche réouverte'],
};

const SURPRISES = {
  fun: [
    '😂 Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon ils tombent dans le bateau.',
    "😂 J'ai raconté une blague à mon ordinateur… il n'a pas ri. 🤖",
    '😂 Le secret du bonheur ? Ne pas avoir de 秘密. Bon ok, celui-là est nul. 😅',
  ],
  citations: [
    "💪 « Petit à petit, l'oiseau fait son nid. »",
    "🌱 « Ce n'est pas parce que les choses sont difficiles que nous n'osons pas, c'est parce que nous n'osons pas qu'elles sont difficiles. »",
    "✨ « Chaque expert a été un jour un débutant. »",
    '🔥 « Le meilleur moment pour commencer, c\u2019était hier. Le deuxième meilleur, c\u2019est maintenant. »',
  ],
  festif: ['🎊🎉✨ WOW !', '🥳🎈 Bravo, champion·ne !', '🎆🌟 La fête est ici !', '🕺💃 Tu danses la victoire !'],
  pause: [
    "☕ Pause 5 min — tu l'as mérité ! 💧 Bois un verre d'eau.",
    '🧘 3 respirations profondes, épaules basses. Tu gères. 💙',
    '🌿 60 secondes pour regarder par la fenêtre. Tes yeux te remercient. 👀',
  ],
  defi: [
    "🎯 Mini-défi : 2 minutes, une seule chose à la fois. C'est parti !",
    '🏃 Défi express : lève-toi 30 secondes et étire-toi. 💪',
    '📵 Défi : 2 min sans écran, juste toi et tes pensées. 🧠',
  ],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shouldSurprise() {
  if (surprisePrefs.frequence === 'souvent') return true;
  if (surprisePrefs.frequence === 'rarement') return Math.random() < 0.2;
  return Math.random() < 0.5;
}

function surpriseText() {
  const types = surprisePrefs.types.length ? surprisePrefs.types : ['festif'];
  const type = pick(types);
  const pool = SURPRISES[type] || SURPRISES.festif;
  return `🎁 ${pick(pool)}`;
}

function msg(el, text, isError) {
  el.textContent = text || '';
  el.classList.toggle('error', !!isError);
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function toastEvent(kind, { surprise = false } = {}) {
  let text = pick(TOASTS[kind] || TOASTS.tache);
  if (surprise && shouldSurprise()) text += '\n' + surpriseText();
  showToast(text);
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`);
  return data;
}

async function loadProjects(selectSlug) {
  const projects = await api('/api/projects');
  projectSelect.innerHTML = '';
  for (const p of projects) {
    const opt = document.createElement('option');
    opt.value = p.slug;
    opt.textContent = `${p.name} (${p.stats.done}/${p.stats.total}${p.stats.late ? `, ${p.stats.late} en retard` : ''})`;
    projectSelect.appendChild(opt);
  }
  if (projects.length === 0) {
    currentSlug = null;
    currentView = null;
    render();
    return;
  }
  currentSlug = selectSlug && projects.some((p) => p.slug === selectSlug) ? selectSlug : projects[0].slug;
  projectSelect.value = currentSlug;
  await refreshView();
}

async function refreshView() {
  if (!currentSlug) return;
  const { view } = await api(`/api/projects/${currentSlug}`);
  currentView = view;
  render();
}

function daysUntil(due, today) {
  return Math.round((new Date(due + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86_400_000);
}

function badge(text, cls) {
  const span = document.createElement('span');
  span.className = 'badge' + (cls ? ' ' + cls : '');
  span.textContent = text;
  return span;
}

function subtaskRow(t, s) {
  const li = document.createElement('li');
  li.className = 'subtask' + (s.done ? ' done' : '');
  const label = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = s.done;
  cb.addEventListener('change', () => toggleSubtask(t.id, s.id, cb.checked));
  label.appendChild(cb);
  const span = document.createElement('span');
  span.textContent = s.title;
  label.appendChild(span);
  li.appendChild(label);
  return li;
}

function taskCard(t) {
  const li = document.createElement('li');
  li.className =
    'task' +
    (t.late ? ' late' : '') +
    (t.validatedLate ? ' validatedLate' : '') +
    (t.done ? ' done' : '') +
    (t.id === nextTaskId ? ' next' : '');

  const label = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = t.done;
  cb.setAttribute('aria-label', `Valider : ${t.title}`);
  cb.addEventListener('change', () => toggleFlag(t.id, cb.checked));
  label.appendChild(cb);
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = t.title;
  label.appendChild(title);
  li.appendChild(label);

  if (t.flag) li.appendChild(badge('⭐ JALON', 'flag'));
  if (t.due) {
    if (t.late) li.appendChild(badge(`🚨 EN RETARD de ${t.overdueDays} j (échéance ${t.due})`, 'late'));
    else if (t.validatedLate) li.appendChild(badge(`validé en retard (échéance ${t.due})`, 'validatedLate'));
    else if (t.done) li.appendChild(badge(`✅ échéance ${t.due} respectée`, 'done-ok'));
    else {
      const n = daysUntil(t.due, currentView.today);
      const txt = n === 0 ? `⏰ aujourd'hui (${t.due})` : n === 1 ? `⏰ demain (${t.due})` : `📅 dans ${n} j (${t.due})`;
      li.appendChild(badge(txt, 'due'));
    }
  } else {
    li.appendChild(badge('sans échéance', 'nodate'));
  }
  if (t.priority === 'haute') li.appendChild(badge('priorité haute', 'prio-haute'));
  if (t.description) {
    const desc = document.createElement('span');
    desc.className = 'desc';
    desc.textContent = t.description;
    li.appendChild(desc);
  }

  const subs = t.subtasks || [];
  if (subs.length || !t.done) {
    const subWrap = document.createElement('div');
    subWrap.className = 'subtasks-wrap';
    const doneSubs = subs.filter((s) => s.done).length;
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'subtasks-toggle';
    toggleBtn.textContent = `🧩 sous-jalons ${doneSubs}/${subs.length}`;
    const panel = document.createElement('div');
    panel.className = 'subtasks';
    panel.hidden = true;
    if (subs.length) {
      const ul = document.createElement('ul');
      for (const s of subs) ul.appendChild(subtaskRow(t, s));
      panel.appendChild(ul);
    }
    const addRow = document.createElement('div');
    addRow.className = 'subtask-add';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Nouveau sous-jalon…';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '➕';
    addBtn.title = 'Ajouter un sous-jalon';
    const add = async () => {
      const title = input.value.trim();
      if (!title) return;
      try {
        const { view } = await api(`/api/projects/${currentSlug}/subtasks-add`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskId: t.id, title }),
        });
        currentView = view;
        render();
        showToast('🧩 Sous-jalon ajouté !');
      } catch (e) {
        alert(e.message);
      }
    };
    addBtn.addEventListener('click', add);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    });
    addRow.appendChild(input);
    addRow.appendChild(addBtn);
    panel.appendChild(addRow);
    toggleBtn.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
    });
    subWrap.appendChild(toggleBtn);
    subWrap.appendChild(panel);
    li.appendChild(subWrap);
  }
  return li;
}

function render() {
  exportLink.href = currentSlug ? `/api/projects/${currentSlug}/export` : '#';
  exportLink.style.pointerEvents = currentSlug ? 'auto' : 'none';
  if (!currentView) {
    progressBar.style.width = '0%';
    progressLabel.textContent = '';
    nextDeadline.textContent = '';
    statsEl.innerHTML = '';
    taskGroups.innerHTML = '';
    historyList.innerHTML = '';
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = currentView.tasks.length > 0;
  renderProgress();
  renderStats();
  renderGroups();
  renderHistory();
}

function renderProgress() {
  const s = currentView.stats;
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  progressBar.style.width = pct + '%';
  progressLabel.textContent = s.total ? `${s.done}/${s.total} terminées — ${pct} %` : 'Aucune tâche pour l\u2019instant';
  nextTaskId = null;
  const open = currentView.tasks.filter((t) => !t.done);
  const late = open.filter((t) => t.late);
  if (s.total > 0 && s.done === s.total) {
    nextDeadline.textContent = '🎉 Tout est terminé — bravo !';
  } else if (late.length) {
    nextDeadline.textContent = `🚨 ${late.length} en retard — les Conseils IA proposent des décalages`;
  } else {
    const withDue = open.filter((t) => t.due).sort((a, b) => a.due.localeCompare(b.due));
    if (withDue.length) {
      const n = daysUntil(withDue[0].due, currentView.today);
      nextTaskId = withDue[0].id;
      nextDeadline.textContent =
        n === 0 ? `⏰ Aujourd'hui : ${withDue[0].title}` : n <= 7 ? `⏰ Prochaine échéance : ${withDue[0].title} dans ${n} j` : `🗓️ Prochaine échéance : ${withDue[0].title} (${withDue[0].due})`;
    } else {
      nextDeadline.textContent = '🌟 Aucune échéance proche — avance à ton rythme';
    }
  }
}

function renderStats() {
  const s = currentView.stats;
  statsEl.innerHTML = '';
  const stats = [
    [`✅ ${s.done}/${s.total} terminées`, 'ok'],
    [`🚨 ${s.late} en retard`, s.late ? 'late' : ''],
    [`⭐ jalons ${s.flagsDone}/${s.flags}`, ''],
    [`🧩 sous-jalons ${s.subtasksDone}/${s.subtasks}`, ''],
    ...(s.validatedLate ? [[`🟠 ${s.validatedLate} validé(s) en retard`, '']] : []),
  ];
  for (const [label, cls] of stats) {
    const span = document.createElement('span');
    span.className = 'stat' + (cls ? ' ' + cls : '');
    span.textContent = label;
    statsEl.appendChild(span);
  }
}

function renderGroups() {
  taskGroups.innerHTML = '';
  const today = currentView.today;
  const open = currentView.tasks.filter((t) => !t.done);
  const groups = [
    { key: 'late', title: '🚨 En retard', cls: 'g-late', items: open.filter((t) => t.late) },
    { key: 'today', title: '⏰ Aujourd\u2019hui', cls: 'g-today', items: open.filter((t) => !t.late && t.due && daysUntil(t.due, today) === 0) },
    { key: 'week', title: '📅 Cette semaine', cls: 'g-week', items: open.filter((t) => !t.late && t.due && daysUntil(t.due, today) > 0 && daysUntil(t.due, today) <= 7) },
    { key: 'later', title: '🗓️ Plus tard', cls: 'g-later', items: open.filter((t) => !t.late && t.due && daysUntil(t.due, today) > 7) },
    { key: 'nodate', title: '❔ Sans date', cls: 'g-nodate', items: open.filter((t) => !t.due) },
    { key: 'done', title: '✅ Terminées', cls: 'g-done', items: currentView.tasks.filter((t) => t.done) },
  ];
  for (const g of groups) {
    if (g.key === 'done' && hideDone.checked && g.items.length) continue;
    if (!g.items.length) continue;
    const section = document.createElement('section');
    section.className = 'task-group ' + g.cls;
    const h = document.createElement('h3');
    h.textContent = `${g.title} (${g.items.length})`;
    section.appendChild(h);
    const ul = document.createElement('ul');
    ul.className = 'tasks';
    for (const t of g.items) ul.appendChild(taskCard(t));
    section.appendChild(ul);
    taskGroups.appendChild(section);
  }
}

function renderHistory() {
  historyList.innerHTML = '';
  for (const h of [...currentView.project.history].reverse().slice(0, 30)) {
    const li = document.createElement('li');
    li.textContent = `${h.at.slice(0, 19).replace('T', ' ')} — ${h.action} : ${h.detail}`;
    historyList.appendChild(li);
  }
}

async function toggleFlag(taskId, done) {
  try {
    const { view } = await api(`/api/projects/${currentSlug}/flags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId, done }),
    });
    const task = currentView?.tasks.find((t) => t.id === taskId);
    currentView = view;
    render();
    await loadProjects(currentSlug);
    if (done) toastEvent(task?.flag ? 'jalon' : 'tache', { surprise: !!task?.flag });
    else showToast(pick(TOASTS.reopen));
  } catch (e) {
    alert(e.message);
  }
}

async function toggleSubtask(taskId, subId, done) {
  try {
    const { view } = await api(`/api/projects/${currentSlug}/subtasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId, subId, done }),
    });
    const wasDone = currentView?.tasks.find((t) => t.id === taskId)?.done;
    currentView = view;
    render();
    await loadProjects(currentSlug);
    const nowTask = view.tasks.find((t) => t.id === taskId);
    if (done) {
      if (nowTask?.done && !wasDone) {
        showToast(`🏁 Tous les sous-jalons sont faits — jalon « ${nowTask.title} » validé automatiquement !\n${surpriseText()}`);
      } else {
        showToast(`${pick(TOASTS.sous)}\n${surpriseText()}`);
      }
    } else if (wasDone && nowTask && !nowTask.done) {
      showToast(`↩️ Jalon « ${nowTask.title} » réouvert (un sous-jalon a été décoché)`);
    }
  } catch (e) {
    alert(e.message);
  }
}

projectSelect.addEventListener('change', () => {
  currentSlug = projectSelect.value;
  lastAdvice = null;
  advicePanel.hidden = true;
  refreshView();
});

hideDone.addEventListener('change', () => render());

newProjectBtn.addEventListener('click', async () => {
  const name = prompt('Nom du nouveau projet :');
  if (!name || !name.trim()) return;
  newProjectBtn.disabled = true;
  try {
    const { view } = await api('/api/projects/new', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    await loadProjects(view.project.slug);
    showToast(`✨ Projet "${view.project.name}" créé (${view.tasks.length} tâches proposées)`);
  } catch (e) {
    alert(e.message);
  } finally {
    newProjectBtn.disabled = false;
  }
});

importBtn.addEventListener('click', async () => {
  const file = docxFile.files[0];
  const name = docxProject.value.trim() || (projectSelect.options[projectSelect.selectedIndex]?.text || '').split(' (')[0];
  if (!file) return msg(importMsg, 'Choisis un fichier .docx. 📎', true);
  if (!name) return msg(importMsg, 'Indique le nom du projet.', true);
  importBtn.disabled = true;
  msg(importMsg, 'Extraction du texte et analyse par l\u2019IA en cours… 🤖');
  try {
    const { view, imported } = await api('/api/import', {
      method: 'POST',
      headers: {
        'x-project': name,
        'x-kind': docxKind.value,
        'x-filename': file.name,
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      body: file,
    });
    msg(importMsg, `✅ ${imported} tâche(s) extraites de ${file.name}.`);
    docxFile.value = '';
    await loadProjects(view.project.slug);
    showToast(`📥 ${imported} tâche(s) ajoutées !`);
  } catch (e) {
    msg(importMsg, e.message, true);
  } finally {
    importBtn.disabled = false;
  }
});

adviceBtn.addEventListener('click', async () => {
  if (!currentSlug) return msg(adviceMsg, 'Sélectionne un projet d\u2019abord.', true);
  adviceBtn.disabled = true;
  msg(adviceMsg, 'Analyse en cours… 🤖');
  try {
    const { advice } = await api(`/api/projects/${currentSlug}/advice`, { method: 'POST' });
    lastAdvice = advice;
    adviceResume.textContent = advice.resume || '';
    adviceList.innerHTML = '';
    for (const c of advice.conseils) {
      const li = document.createElement('li');
      li.textContent = c;
      adviceList.appendChild(li);
    }
    decalagesList.innerHTML = '';
    const tasksById = Object.fromEntries(currentView.tasks.map((t) => [t.id, t]));
    for (const d of advice.decalages) {
      const t = tasksById[d.taskId];
      if (!t) continue;
      const li = document.createElement('li');
      li.textContent = `${t.title} : ${t.due ?? 'sans date'} → ${d.nouvelleDate} — ${d.raison}`;
      decalagesList.appendChild(li);
    }
    decalagesBox.hidden = advice.decalages.length === 0;
    advicePanel.hidden = false;
    adviceDetails.open = true;
    msg(adviceMsg, '');
  } catch (e) {
    msg(adviceMsg, e.message, true);
  } finally {
    adviceBtn.disabled = false;
  }
});

applyBtn.addEventListener('click', async () => {
  if (!currentSlug || !lastAdvice) return;
  applyBtn.disabled = true;
  try {
    const { view, applied } = await api(`/api/projects/${currentSlug}/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decalages: lastAdvice.decalages }),
    });
    currentView = view;
    render();
    await loadProjects(currentSlug);
    msg(adviceMsg, `${applied} décalage(s) appliqué(s).`);
    advicePanel.hidden = true;
    lastAdvice = null;
    showToast(`📅 ${applied} échéance(s) décalée(s)`);
  } catch (e) {
    msg(adviceMsg, e.message, true);
  } finally {
    applyBtn.disabled = false;
  }
});

async function loadProfile() {
  const { profile } = await api('/api/profile');
  profileNotes.value = profile.notes || '';
  paceFactor.value = profile.paceFactor ?? 1.2;
  surprisePrefs = profile.surprises || surprisePrefs;
  for (const box of surpriseTypeBoxes) box.checked = surprisePrefs.types.includes(box.value);
  surpriseFreq.value = surprisePrefs.frequence || 'parfois';
  if (!profile.surprises || !profile.surprises.types.length) {
    setTimeout(() => showToast('🎁 Configure tes goûts de surprises dans le panneau Profil !'), 1500);
  }
}

saveProfileBtn.addEventListener('click', async () => {
  try {
    const types = surpriseTypeBoxes.filter((b) => b.checked).map((b) => b.value);
    await api('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        notes: profileNotes.value,
        paceFactor: Number(paceFactor.value),
        surprises: { types, frequence: surpriseFreq.value },
      }),
    });
    surprisePrefs = { types, frequence: surpriseFreq.value };
    msg(profileMsg, 'Profil enregistré. 🧠');
    showToast('🧠 Profil enregistré — tes surprises sont prêtes !');
  } catch (e) {
    msg(profileMsg, e.message, true);
  }
});

function addChat(role, text) {
  const div = document.createElement('div');
  div.className = role === 'user' ? 'msg-user' : role === 'error' ? 'msg-error' : 'msg-assistant';
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = chatInput.value.trim();
  if (!content) return;
  chatInput.value = '';
  addChat('user', content);
  chatHistory.push({ role: 'user', content });
  try {
    const headers = { 'content-type': 'application/json' };
    if (currentSlug) headers['x-project'] = currentSlug;
    const { reply } = await api('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: chatHistory }),
    });
    addChat('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    addChat('error', err.message);
  }
});

loadProfile();
loadProjects();
setInterval(() => {
  if (currentSlug) refreshView().catch(() => {});
}, 3000);

/* ================= ⏱️ Timer focus ================= */
const timerMode = $('timerMode');
const timerDuration = $('timerDuration');
const timerRing = $('timerRing');
const timerTime = $('timerTime');
const timerStart = $('timerStart');
const timerReset = $('timerReset');
const timerMsg = $('timerMsg');
const RING_LEN = 2 * Math.PI * 52;
let timerTotal = 25 * 60;
let timerLeft = 25 * 60;
let timerRunning = false;
let timerTick = null;

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function timerColor() {
  const f = timerTotal > 0 ? timerLeft / timerTotal : 1;
  return `hsl(${Math.round(115 * f)} 85% 55%)`;
}

function renderTimer() {
  timerTime.textContent = fmtTime(Math.max(0, timerLeft));
  timerRing.style.stroke = timerColor();
  const f = timerTotal > 0 ? timerLeft / timerTotal : 0;
  timerRing.style.strokeDashoffset = String(RING_LEN * (1 - f));
}

function timerSetTotal() {
  timerTotal = Number(timerDuration.value) * 60;
  timerLeft = timerTotal;
  renderTimer();
}

function timerStop() {
  timerRunning = false;
  clearInterval(timerTick);
  timerTick = null;
  timerStart.textContent = '▶️ Démarrer';
}

function timerFinish() {
  timerStop();
  timerLeft = 0;
  renderTimer();
  const wasFocus = timerMode.value === 'focus';
  timerMode.value = wasFocus ? 'pause' : 'focus';
  timerDuration.value = wasFocus ? '5' : '25';
  timerSetTotal();
  localStorage.setItem('timerMode', timerMode.value);
  localStorage.setItem('timerDuration', timerDuration.value);
  msg(timerMsg, wasFocus ? '⏰ Focus terminé ! Passe en pause ☕ (5 min suggérées).' : '⏰ Pause terminée ! Prêt·e pour un nouveau focus 🎯');
  showToast((wasFocus ? '🎯 Focus terminé, bravo !\n' : '☕ Pause terminée !\n') + surpriseText());
}

timerStart.addEventListener('click', () => {
  if (timerRunning) {
    timerStop();
    msg(timerMsg, '⏸️ En pause.');
    return;
  }
  if (timerLeft <= 0) timerSetTotal();
  timerRunning = true;
  timerStart.textContent = '⏸️ Pause';
  msg(timerMsg, timerMode.value === 'focus' ? '🎯 Focus en cours…' : '☕ Pause en cours…');
  timerTick = setInterval(() => {
    timerLeft = Math.max(0, timerLeft - 0.25);
    renderTimer();
    if (timerLeft <= 0) timerFinish();
  }, 250);
});

timerReset.addEventListener('click', () => {
  timerStop();
  timerSetTotal();
  msg(timerMsg, '');
});

timerMode.addEventListener('change', () => {
  localStorage.setItem('timerMode', timerMode.value);
  if (!timerRunning) msg(timerMsg, '');
});
timerDuration.addEventListener('change', () => {
  localStorage.setItem('timerDuration', timerDuration.value);
  if (!timerRunning) timerSetTotal();
});

timerMode.value = localStorage.getItem('timerMode') || 'focus';
timerDuration.value = localStorage.getItem('timerDuration') || '25';
timerRing.style.strokeDasharray = String(RING_LEN);
timerSetTotal();

/* ================= 🫧 Fidget numérique ================= */
const bubbleGrid = $('bubbleGrid');
const bubbleCount = $('bubbleCount');
const bubbleReset = $('bubbleReset');
const paletteGrid = $('paletteGrid');
const fidgetBubbles = $('fidgetBubbles');
const fidgetPalette = $('fidgetPalette');
const BUBBLE_COUNT = 32;
const TILE_COUNT = 24;
let poppedCount = 0;

function updateBubbleCount() {
  bubbleCount.textContent = `🫧 ${poppedCount}/${BUBBLE_COUNT}`;
}

function buildBubbles() {
  bubbleGrid.innerHTML = '';
  poppedCount = 0;
  updateBubbleCount();
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bubble';
    b.setAttribute('aria-label', 'Bulle à éclater');
    b.addEventListener('click', () => {
      if (b.classList.contains('popped')) return;
      b.classList.add('popped');
      poppedCount++;
      updateBubbleCount();
      if (poppedCount === BUBBLE_COUNT) {
        showToast('🫧✨ Toutes les bulles sont éclatées !\n' + surpriseText());
        setTimeout(buildBubbles, 900);
      }
    });
    bubbleGrid.appendChild(b);
  }
}

bubbleReset.addEventListener('click', buildBubbles);

function randHue() {
  return `hsl(${Math.floor(Math.random() * 360)} 80% 65%)`;
}

function buildPalette() {
  paletteGrid.innerHTML = '';
  for (let i = 0; i < TILE_COUNT; i++) {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'tile';
    t.style.background = randHue();
    t.addEventListener('click', () => {
      t.style.background = randHue();
    });
    paletteGrid.appendChild(t);
  }
}

document.querySelectorAll('.fidget-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.fidget-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.getAttribute('data-fidget');
    fidgetBubbles.hidden = which !== 'bubbles';
    fidgetPalette.hidden = which !== 'palette';
    if (typeof fidgetSand !== 'undefined') fidgetSand.hidden = which !== 'sand';
  });
});

buildBubbles();
buildPalette();

/* ================= ⏳ Sablier sensoriel (émotions + textures) ================= */
const sandCanvas = $('sandCanvas');
const sandLegend = $('sandLegend');
const sandFlip = $('sandFlip');
const sandState = $('sandState');
const fidgetSand = $('fidgetSand');
const sctx = sandCanvas.getContext('2d');
const SW = sandCanvas.width;
const SH = sandCanvas.height;
const TOP_Y = 12;
const NECK_Y = Math.floor(SH / 2);
const BOT_Y = SH - 12;
const CX = SW / 2;
const NECK_HALF = 7;
const WIDE_HALF = SW / 2 - 14;
const GRAV = 0.35;
const COL_W = 3;

function wallAt(y) {
  if (y <= NECK_Y) {
    const t = (y - TOP_Y) / (NECK_Y - TOP_Y);
    const half = WIDE_HALF + (NECK_HALF - WIDE_HALF) * t;
    return [CX - half, CX + half];
  }
  const t = (y - NECK_Y) / (BOT_Y - NECK_Y);
  const half = NECK_HALF + (WIDE_HALF - NECK_HALF) * t;
  return [CX - half, CX + half];
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const GLITTER_COLORS = ['#fde047', '#f9a8d4', '#e9d5ff', '#ffffff', '#fca5a5', '#a5f3fc'];

// kind: 'dot' (émotion classique) | 'glitter' | 'bubble' | 'slime' | 'coin'
const MATERIALS = [
  { label: 'Joie', emoji: '🟡', color: '#facc15', kind: 'dot', g: 1.0, r: 4, n: 55 },
  { label: 'Colère', emoji: '🔴', color: '#ef4444', kind: 'dot', g: 1.35, r: 2.6, n: 55 },
  { label: 'Tristesse', emoji: '🔵', color: '#3b82f6', kind: 'dot', g: 0.55, r: 4.6, n: 45 },
  { label: 'Peur', emoji: '🟣', color: '#a855f7', kind: 'dot', g: 0.8, r: 3.4, n: 45, jitter: true },
  { label: 'Calme', emoji: '🟢', color: '#22c55e', kind: 'dot', g: 0.4, r: 5, n: 35 },
  { label: 'Paillettes', emoji: '✨', kind: 'glitter', g: 0.9, r: 2.2, n: 40 },
  { label: 'Bulles', emoji: '🫧', color: '#7dd3fc', kind: 'bubble', g: 0.22, r: 5, n: 22, wobble: true },
  { label: 'Slime', emoji: '🫠', color: '#86efac', kind: 'slime', g: 0.3, r: 6, n: 18 },
  { label: 'Pièces', emoji: '🪙', color: '#fbbf24', kind: 'coin', g: 1.15, r: 3.5, n: 26 },
];

let particles = [];
const heightmap = new Float32Array(Math.ceil(SW / COL_W));
let sandEmpty = false;

function spawnParticles() {
  particles = [];
  heightmap.fill(0);
  for (const m of MATERIALS) {
    for (let i = 0; i < m.n; i++) {
      const y = TOP_Y + 6 + Math.random() * (NECK_Y - TOP_Y - 34);
      const [l, r] = wallAt(y);
      particles.push({
        x: l + m.r + Math.random() * Math.max(1, r - l - 2 * m.r),
        y,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 0,
        r: m.r,
        color: m.kind === 'glitter' ? GLITTER_COLORS[Math.floor(Math.random() * GLITTER_COLORS.length)] : m.color,
        g: m.g,
        kind: m.kind,
        jitter: m.jitter ? 0.6 : m.wobble ? 0.9 : 0,
        phase: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI,
      });
    }
  }
}

function stepSand() {
  let below = 0;
  for (const p of particles) {
    p.vy = Math.min(p.vy + GRAV * p.g, 6);
    p.y += p.vy;
    p.x += p.vx + (p.jitter ? (Math.random() - 0.5) * p.jitter : 0);
    p.vx *= 0.99;
    if (p.kind === 'coin') p.rot += p.vx * 0.25;
    let [l, r] = wallAt(p.y);
    if (r - l < 2 * p.r) {
      l = CX - NECK_HALF;
      r = CX + NECK_HALF;
    }
    if (p.x < l + p.r) {
      p.x = l + p.r;
      p.vx = Math.abs(p.vx) * 0.3;
      p.vy *= 0.6;
    }
    if (p.x > r - p.r) {
      p.x = r - p.r;
      p.vx = -Math.abs(p.vx) * 0.3;
      p.vy *= 0.6;
    }
    if (p.y > NECK_Y + 5) below++;
    if (p.y >= BOT_Y - p.r) {
      const col = Math.max(0, Math.min(heightmap.length - 1, Math.floor(p.x / COL_W)));
      const restY = BOT_Y - heightmap[col] - p.r;
      if (p.y > restY) {
        p.y = restY;
        p.vy = 0;
        p.vx *= 0.5;
        const stack = p.kind === 'slime' ? 2.2 : 1.5;
        heightmap[col] = Math.min(heightmap[col] + p.r * stack, NECK_Y - 24);
        const slideDiff = p.kind === 'slime' ? 7 : 3;
        const nc = p.x / COL_W < col ? col - 1 : col + 1;
        if (nc >= 0 && nc < heightmap.length && heightmap[nc] < heightmap[col] - slideDiff) {
          p.x += nc < col ? -0.8 : 0.8;
        }
      }
    }
    if (p.y < TOP_Y + p.r) {
      p.y = TOP_Y + p.r;
      p.vy = Math.abs(p.vy) * 0.3;
    }
  }
  return particles.length ? below / particles.length : 0;
}

function drawParticle(p, t) {
  if (p.kind === 'glitter') {
    const tw = 0.55 + 0.45 * Math.sin(t * 6 + p.phase);
    sctx.save();
    sctx.translate(p.x, p.y);
    sctx.rotate(p.phase + t * 2);
    sctx.globalAlpha = tw;
    sctx.fillStyle = p.color;
    sctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
    sctx.globalAlpha = 1;
    sctx.restore();
    return;
  }
  if (p.kind === 'bubble') {
    const g = sctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.1, p.x, p.y, p.r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.45, hexA(p.color, 0.22));
    g.addColorStop(1, hexA(p.color, 0.55));
    sctx.fillStyle = g;
    sctx.beginPath();
    sctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    sctx.fill();
    sctx.strokeStyle = hexA(p.color, 0.9);
    sctx.lineWidth = 1;
    sctx.stroke();
    return;
  }
  if (p.kind === 'slime') {
    const wob = Math.sin(t * 3 + p.phase) * 0.25;
    sctx.fillStyle = p.color;
    sctx.beginPath();
    sctx.ellipse(p.x, p.y, p.r * (1 + wob * 0.4), p.r * (1 - wob * 0.4), 0, 0, Math.PI * 2);
    sctx.fill();
    sctx.fillStyle = 'rgba(255,255,255,0.4)';
    sctx.beginPath();
    sctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.28, 0, Math.PI * 2);
    sctx.fill();
    return;
  }
  if (p.kind === 'coin') {
    sctx.save();
    sctx.translate(p.x, p.y);
    sctx.rotate(p.rot);
    sctx.fillStyle = p.color;
    sctx.beginPath();
    sctx.arc(0, 0, p.r, 0, Math.PI * 2);
    sctx.fill();
    sctx.strokeStyle = '#b45309';
    sctx.lineWidth = 1.2;
    sctx.beginPath();
    sctx.arc(0, 0, p.r * 0.62, 0, Math.PI * 2);
    sctx.stroke();
    sctx.beginPath();
    sctx.moveTo(-p.r * 0.9, 0);
    sctx.lineTo(p.r * 0.9, 0);
    sctx.stroke();
    sctx.restore();
    return;
  }
  sctx.fillStyle = p.color;
  sctx.beginPath();
  sctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  sctx.fill();
}

function drawSand(t) {
  sctx.clearRect(0, 0, SW, SH);
  sctx.strokeStyle = '#8b5cf6';
  sctx.lineWidth = 4;
  sctx.lineJoin = 'round';
  sctx.beginPath();
  sctx.moveTo(CX - WIDE_HALF, TOP_Y);
  sctx.lineTo(CX - NECK_HALF, NECK_Y);
  sctx.lineTo(CX - WIDE_HALF, BOT_Y);
  sctx.moveTo(CX + WIDE_HALF, TOP_Y);
  sctx.lineTo(CX + NECK_HALF, NECK_Y);
  sctx.lineTo(CX + WIDE_HALF, BOT_Y);
  sctx.moveTo(CX - WIDE_HALF - 5, TOP_Y);
  sctx.lineTo(CX + WIDE_HALF + 5, TOP_Y);
  sctx.moveTo(CX - WIDE_HALF - 5, BOT_Y);
  sctx.lineTo(CX + WIDE_HALF + 5, BOT_Y);
  sctx.stroke();
  for (const p of particles) drawParticle(p, t);
}

function flipSand() {
  spawnParticles();
  sandEmpty = false;
  sandState.textContent = '⏳ en cours…';
  sandCanvas.classList.remove('flip');
  void sandCanvas.offsetWidth;
  sandCanvas.classList.add('flip');
}

function sandLoop() {
  if (!fidgetSand.hidden) {
    const t = Date.now() / 1000;
    const frac = stepSand();
    drawSand(t);
    if (!sandEmpty && frac > 0.95) {
      sandEmpty = true;
      sandState.textContent = '⏳ vide !';
      showToast('⏳ Le sablier est vide !\n' + surpriseText());
      setTimeout(flipSand, 1400);
    }
  }
  requestAnimationFrame(sandLoop);
}

sandFlip.addEventListener('click', flipSand);
sandCanvas.addEventListener('click', flipSand);

for (const m of MATERIALS) {
  const item = document.createElement('span');
  item.className = 'sand-legend-item';
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = m.color || GLITTER_COLORS[0];
  item.appendChild(dot);
  item.appendChild(document.createTextNode(`${m.emoji} ${m.label}`));
  sandLegend.appendChild(item);
}

spawnParticles();
requestAnimationFrame(sandLoop);
