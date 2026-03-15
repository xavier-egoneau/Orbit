# Workflow spec → plan → dev

Cinq commandes pour structurer un projet sans overhead documentaire inutile. Disponible pour **Claude Code** et **GitHub Copilot**.

---

## Installation

### Claude Code
Copie le dossier `.claude/` à la racine de ton projet.
Les commandes sont dans `.claude/commands/` et s'invoquent avec `/nom`.

### GitHub Copilot
Copie le dossier `.github/` à la racine de ton projet.
Les prompts sont dans `.github/prompts/` et s'invoquent avec `/nom` dans le chat Copilot.
(Fonctionnalité en public preview — nécessite VS Code avec GitHub Copilot)

---

## Commandes

Les deux versions s'invoquent de la même façon : `/spec`, `/plan`, `/dev`, `/resume`, `/add`.

### `/spec` — Spécification

Lance en début de projet ou avant une nouvelle feature significative.

Pose 6 questions :
1. Objectif principal
2. Utilisateurs / contexte
3. Périmètre (IN / OUT)
4. Contraintes techniques
5. Critère de succès (MVP)
6. Commande de tests (`npm test`, `vitest`... ou "aucun")

**Produit :**
- `spec.md` — la spécification du projet
- `CLAUDE.md` ou `.github/copilot-instructions.md` — constitution + commande de tests

---

### `/plan` — Planification

Lance après `/spec` ou `/add`. Lit `context.md` si présent (sinon `spec.md`).

Analyse les dépendances, propose une décomposition en groupes `[séquentiel]` / `[parallélisable]`. Valide avec toi avant d'écrire.

**Produit :**
- `tasks.md` — tâches avec checkboxes, groupées et marquées (écrasé à chaque appel)

---

### `/dev` — Implémentation

Lance après `/plan`. Nécessite `tasks.md`.

Cite la constitution avant chaque tâche, implémente, vérifie, lance les tests. La tâche n'est cochée que si constitution respectée **et** tests verts.

| | Claude Code | Copilot |
|---|---|---|
| Groupes `[parallélisable]` | Agents en parallèle | Séquentiel |

---

### `/resume` — Reprendre une session

Lance en début de session sur un projet existant.

Lit `spec.md`, `tasks.md` et le fichier de constitution, produit un résumé d'état et indique la prochaine action. Ne modifie aucun fichier.

---

### `/add` — Ajouter une feature / démarrer une US

Lance pour travailler sur une nouvelle US ou feature dans un projet existant.

Pose 3 questions ciblées, vérifie la compatibilité avec la constitution, écrit `context.md` — la spec de l'US en cours. Ne touche pas à `spec.md`.

---

## Constitution — comment ça marche

`/spec` génère les principes non-négociables du projet en impératif (`JAMAIS de backend`, `TOUJOURS localStorage`...) dans le fichier de constitution :

- **Claude Code** → `CLAUDE.md` (chargé automatiquement à chaque session)
- **Copilot** → `.github/copilot-instructions.md` (chargé automatiquement dans tous les chats)

`/dev` cite les principes applicables **avant chaque tâche** et vérifie leur respect **après** — checkpoint actif, pas suggestion passive.

---

## Quand utiliser quoi

| Situation | Commande |
|-----------|----------|
| Nouveau projet | `/spec` → `/plan` → `/dev` |
| Nouvelle session sur projet existant | `/resume` |
| Nouvelle US / feature mid-project | `/add` → `/plan` → `/dev` |
| Périmètre flou | `/spec` obligatoire |
| Tâche isolée et claire | `/dev` directement |

---

## Fichiers du workflow

```
projet/
├── .claude/                           ← Claude Code
│   ├── commands/
│   │   ├── spec.md
│   │   ├── plan.md
│   │   ├── dev.md
│   │   ├── resume.md
│   │   └── add.md
│   └── README.md
├── .github/                           ← GitHub Copilot
│   ├── copilot-instructions.md
│   ├── prompts/
│   │   ├── spec.prompt.md
│   │   ├── plan.prompt.md
│   │   ├── dev.prompt.md
│   │   ├── resume.prompt.md
│   │   └── add.prompt.md
│   └── README.md
│
│   — fichiers générés par les commandes —
│
├── CLAUDE.md                          ← constitution Claude Code (auto-chargé)
├── spec.md                            ← spécification globale du projet
├── context.md                         ← US en cours (écrasé à chaque /add)
└── tasks.md                           ← tâches [ ] / [x] (écrasé à chaque /plan)
```

> La version Copilot génère `.github/copilot-instructions.md` à la place de `CLAUDE.md`.
