# /add — Ajouter une feature en cours de projet

Tu viens d'être invoqué par `/add`. Objectif : intégrer une nouvelle feature dans un projet existant sans repartir de zéro.

## Process

**Étape 1 — Vérifie les prérequis :**

- Lis `spec.md` et `tasks.md`. Si absents, dis à l'utilisateur de lancer `/spec` et `/plan` d'abord.
- Lis `CLAUDE.md` pour prendre en compte la constitution.

**Étape 2 — Pose 3 questions ciblées :**

1. Quelle feature veux-tu ajouter ? (description en 1-2 phrases)
2. Quel est le périmètre exact ? (ce qui est IN / ce qui est OUT)
3. Y a-t-il des contraintes spécifiques à cette feature ? (si non, la constitution existante s'applique)

**Étape 3 — Vérifie la compatibilité avec la constitution :**

Analyse si la feature demandée entre en conflit avec un principe de la constitution dans `CLAUDE.md`. Si oui, signale le conflit et demande comment le résoudre avant de continuer.

**Étape 4 — Écris `context.md` à la racine :**

Ce fichier remplace tout `context.md` existant — il représente l'US en cours, pas une accumulation.

```markdown
# Context — [Nom de la feature / US]

**Objectif :** ...
**IN :** ...
**OUT :** ...
**Contraintes spécifiques :** ...
**Critères d'acceptance :** ...
```

Ne modifie pas `spec.md`.

## Règles

- Ne commence pas à implémenter — lance `/plan` puis `/dev` ensuite
- Ne touche jamais à `spec.md` — la constitution reste dans `CLAUDE.md`
- `context.md` est écrasé à chaque `/add` — il représente toujours l'US active
- Si la feature contredit la constitution, bloque et demande une décision explicite
