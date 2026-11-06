# Suivi de projet + chat Mistral (local)

App web Node.js + TypeScript qui combine :

- **Suivi de projet en temps réel** : import de tes documents Word (gestion globale
  et hebdomadaire), extraction des tâches/jalons par l'IA, validation des jalons
  (flags) en direct, mise en évidence de ce qui est **en retard**.
- **Conseils IA** (`mistral-small-latest`) : analyse des retards et proposition de
  **décalages d'échéances** applicables en un clic, au fur et à mesure de ton
  avancement.
- **Profil** : ce que l'IA « sait de toi » (notes libres + facteur de rythme),
  réutilisé pour générer de **nouveaux fichiers de suivi adaptés** sur un autre
  projet (avec ou sans nouveau Word).
- **Chat** avec contexte du projet courant.

La clé `MISTRAL_API_KEY` reste côté serveur (fichier `.env`, jamais envoyé au
navigateur ni commité — voir `.gitignore`). Les données de suivi sont stockées
localement dans `data/` (ignoré par git).

## Installation

```bash
npm install
cp .env.example .env   # puis éditer .env et y mettre ta clé MISTRAL_API_KEY
```

## Lancement en local

```bash
npm run dev    # avec rechargement automatique
# ou
npm start      # sans rechargement
```

Puis ouvrir <http://localhost:3000>.

## Utilisation

1. **Importer un Word** (panneau de droite) : choisis ton `.docx` (global ou
   hebdomadaire), indique le nom du projet si c'est un nouveau, puis clique sur
   « Importer ». L'IA extrait les tâches, jalons et échéances et les enregistre.
   Réimporter un doc hebdo fusionne sans doublons.
2. **Valider les jalons** : coche les cases des tâches/jalons au fur et à mesure ;
   l'affichage se rafraîchit toutes les 3 s et signale les validations en retard.
3. **Voir les retards** : badge rouge « EN RETARD de N j » + stats en haut.
4. **Conseils IA** : bouton « Analyser les retards et conseiller » → résumé,
   conseils, et décalages proposés avec bouton « Appliquer ces décalages »
   (chaque décalage est tracé dans l'historique du projet).
5. **Profil** : décris tes habitudes (rythme, horaires, biais connus). Il sert
   aux conseils et à la génération de nouveaux projets.
6. **Nouveau projet adapté** : bouton « Nouveau projet » → l'IA génère une
   structure de tâches/jalons/échéances calibrée sur ton profil, prête à être
   ajustée. Tu peux aussi repartir d'un nouveau Word via l'import.
7. **Exporter** : lien « Exporter (.md) » télécharge le suivi complet (tâches,
   retards, historique) en Markdown.
8. **Sous-jalons** 🧩 : chaque tâche peut être décomposée en sous-étapes cochables
   (extraites automatiquement par l'IA depuis les Word via `sousTaches`, ou ajoutées
   à la main avec le bouton ➕). **Chaque** sous-jalon validé déclenche une
   **mini-surprise** (selon tes goûts). Quand ils sont **tous** faits, le jalon
   parent est **validé automatiquement** (un seul toast, pas de doublon) ; décocher
   un sous-jalon réouvre le jalon.
9. **Toasts aléatoires & surprises** 🎁 : à chaque jalon validé, un message de
   félicitation tiré au hasard s'affiche, parfois complété d'une surprise choisie
   selon **tes goûts** (blagues 😂, citations 💪, festif 🎉, pause bien-être ☕,
   mini-défi 🎯) et la fréquence réglée dans le panneau **Profil** (à chaque jalon /
   parfois / rarement).
10. **⏱️ Timer focus visuel** : anneau SVG coloré qui se vide (vert → rouge selon le
    temps restant), modes 🎯 Focus / ☕ Pause, durées 5–60 min (persistées en
    localStorage), à la fin bascule automatique vers l'autre mode + toast surprise.
11. **🫧 Fidgets numériques** : bulles à éclater (compteur 🫧 x/32, surprise +
    rechargement auto), palette de tuiles qui changent de teinte au clic, et
    **⏳ sablier sensoriel « émotions + textures »** (canvas physique : 5 émotions
    en points colorés — chacune sa gravité — plus 4 textures : ✨ paillettes
    scintillantes, 🫧 bulles translucides flottantes, 🫠 slime gluant qui s'empile
    haut, 🪙 pièces qui tournent ; tout se mélange dans le col ; clic ou ↺ pour
    retourner, auto-retournement + toast surprise quand il est vide).

## Vérification du typage

```bash
npm run typecheck
```

## Confidentialité / accès

Le serveur écoute par défaut sur `127.0.0.1` (localhost) : **seule ta machine
peut s'y connecter**. Ne mets pas `HOST=0.0.0.0` et ne déploie pas l'app telle
quelle en public (aucune authentification n'est prévue). `.env` et `data/`
sont exclus de git.

## Structure

- `server.ts` — serveur HTTP + routes API (`/api/import`, `/api/projects/...`, `/api/profile`, `/api/chat`)
- `lib/types.ts` — types + calcul des retards (`computeView`)
- `lib/store.ts` — stockage JSON local (`data/projects/*.json`, `data/profile.json`)
- `lib/ai.ts` — prompts IA (extraction Word, conseils de décalage, template profil)
- `lib/mistral.ts` — client SDK officiel + appels JSON
- `lib/docx.ts` — lecture des `.docx` (mammoth)
- `public/` — interface (suivi, conseils, profil, chat)
