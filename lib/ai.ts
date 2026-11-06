import { completeJson, getClient } from './mistral.js';
import { Profile, ProjectView, todayISO } from './types.js';

const MAX_DOC_TEXT = 12_000;

export type RawTask = {
  title: string;
  description: string;
  due: string | null;
  flag: boolean;
  priority: 'haute' | 'moyenne' | 'basse';
  sousTaches: string[];
};

export type Decalage = { taskId: string; nouvelleDate: string; raison: string };

export type Advice = { resume: string; conseils: string[]; decalages: Decalage[] };

const TASK_SCHEMA = `Schéma attendu :
{
  "taches": [
    { "titre": "string", "description": "string", "echeance": "YYYY-MM-DD ou null", "jalon": true|false, "priorite": "haute"|"moyenne"|"basse", "sousTaches": ["string"] }
  ]
}`;

export async function extractTasksFromDoc(
  docText: string,
  kind: 'global' | 'hebdomadaire',
  profile: Profile,
  existingTitles: string[],
): Promise<RawTask[]> {
  const kindLabel = kind === 'global' ? 'document de gestion GLOBAL du projet' : 'document HEBDOMADAIRE (semaine en cours)';
  const system = `Tu es un assistant de gestion de projet. On te fournit le contenu texte d'un ${kindLabel} au format Word.
Extrais les tâches, jalons et échéances qui y figurent. Réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant ou après).
${TASK_SCHEMA}
Règles :
- une tâche par action concrète (verbe d'action), pas de généralités ;
- les sections "TABLEAU (...)" décrivent les tableaux du document, chaque ligne au format "En-tête: valeur | En-tête: valeur" (cellules vides omises) ; pour un planning en ●, les colonnes marquées ● sont les périodes actives de la ligne ;
- "jalon": true pour les étapes importantes à valider explicitement (livrables, revues, décisions, remises, fins de contrat) ;
- "sousTaches": décompose la tâche en 2 à 4 sous-étapes concrètes et cochables quand c'est pertinent (sinon tableau vide) ;
- "echeance": déduis-la des dates du document ; interprète les dates relatives ("vendredi", "la semaine prochaine", "dans 3 jours") par rapport à la date du jour fournie ; si aucune date n'est déductible, mets null ;
- "priorite": haute pour les jalons ou urgences, basse pour le reste, sinon moyenne.`;
  const user = `Date du jour : ${todayISO()}
Ce qu'on sait de l'utilisateur (profil) : ${JSON.stringify(profile)}
Titres de tâches déjà existants (ne pas les dupliquer) : ${JSON.stringify(existingTitles)}

Contenu du document :
${docText.slice(0, MAX_DOC_TEXT)}`;
  const raw = (await completeJson(getClient(), system, user)) as { taches?: unknown };
  const arr = Array.isArray(raw?.taches) ? raw.taches : [];
  const out: RawTask[] = [];
  for (const item of arr) {
    const t = item as Record<string, unknown>;
    if (!t || typeof t.title !== 'string' || !t.title.trim()) continue;
    out.push({
      title: t.title.trim(),
      description: typeof t.description === 'string' ? t.description : '',
      due: typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t.due) ? t.due.slice(0, 10) : null,
      flag: t.flag === true,
      priority: ['haute', 'moyenne', 'basse'].includes(t.priority as string) ? (t.priority as RawTask['priority']) : 'moyenne',
      sousTaches: Array.isArray(t.sousTaches)
        ? t.sousTaches.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()).slice(0, 8)
        : [],
    });
  }
  return out;
}

export async function getAdvice(view: ProjectView, profile: Profile): Promise<Advice> {
  const system = `Tu es un coach de gestion de projet. On te donne l'état actuel d'un projet (tâches, échéances, retards, jalons validés) et le profil de l'utilisateur.
Analyse ce qui est en retard et ce qui risque de l'être, puis propose des conseils concrets et des décalages d'échéances réalistes, à appliquer au fur et à mesure.
Réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant ou après) :
{
  "resume": "string (2-3 phrases sur la situation)",
  "conseils": ["string (conseil actionnable)"],
  "decalages": [{ "taskId": "string", "nouvelleDate": "YYYY-MM-DD", "raison": "string" }]
}
Règles :
- ne décale que des tâches non terminées, en utilisant leur taskId exact ;
- les nouvelles dates doivent être >= la date du jour et tenir compte du facteur de rythme de l'utilisateur (${''}paceFactor) ;
- si rien n'est en retard et tout va bien, "decalages" est un tableau vide et les conseils sont de simples encouragements.`;
  const user = `Date du jour : ${view.today}
Profil de l'utilisateur : ${JSON.stringify(profile)}
État du projet (tâches avec statut calculé) : ${JSON.stringify(view, null, 2)}`;
  const raw = (await completeJson(getClient(), system, user)) as Partial<Advice>;
  return {
    resume: typeof raw.resume === 'string' ? raw.resume : '',
    conseils: Array.isArray(raw.conseils) ? raw.conseils.filter((c) => typeof c === 'string') : [],
    decalages: Array.isArray(raw.decalages)
      ? raw.decalages.filter(
          (d): d is Decalage =>
            !!d && typeof d.taskId === 'string' && typeof d.nouvelleDate === 'string' && typeof d.raison === 'string',
        )
      : [],
  };
}

export async function generateTemplateFromProfile(name: string, profile: Profile): Promise<RawTask[]> {
  const system = `Tu es un assistant de gestion de projet. L'utilisateur démarre un nouveau projet nommé "${name}".
À partir de ce qu'on sait de lui (son profil, notamment son rythme et ses habitudes), propose une structure de suivi adaptée : tâches de démarrage, jalons de revue, échéances réalistes.
Réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant ou après).
${TASK_SCHEMA}
Règles :
- jalon: true pour la revue hebdomadaire et les livrables clés ;
- répartis les échéances sur les 2 à 4 prochaines semaines, en respectant le facteur de rythme (paceFactor) et les jours ouvrés usuels ;
- priorité haute pour le jalon de la première revue.`;
  const user = `Date du jour : ${todayISO()}
Profil de l'utilisateur (ce qu'on sait de lui) : ${JSON.stringify(profile)}\nNom du nouveau projet : ${name}`;
  const raw = (await completeJson(getClient(), system, user)) as { taches?: unknown };
  const arr = Array.isArray(raw?.taches) ? raw.taches : [];
  const out: RawTask[] = [];
  for (const item of arr) {
    const t = item as Record<string, unknown>;
    if (!t || typeof t.title !== 'string' || !t.title.trim()) continue;
    out.push({
      title: t.title.trim(),
      description: typeof t.description === 'string' ? t.description : '',
      due: typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t.due) ? t.due.slice(0, 10) : null,
      flag: t.flag === true,
      priority: ['haute', 'moyenne', 'basse'].includes(t.priority as string) ? (t.priority as RawTask['priority']) : 'moyenne',
      sousTaches: Array.isArray(t.sousTaches)
        ? t.sousTaches.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()).slice(0, 8)
        : [],
    });
  }
  return out;
}
