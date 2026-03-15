# /spec — Spécification du projet

Tu viens d'être invoqué par `/spec`. Objectif : comprendre le projet avant toute ligne de code.

## Process

**Étape 1 — Pose ces 6 questions une par une, attends chaque réponse :**

1. Quel est l'objectif principal ? Qu'est-ce que l'utilisateur doit pouvoir faire ?
2. Qui sont les utilisateurs ? Quel est le contexte d'usage ?
3. Quel est le périmètre ? (ce qui est IN / ce qui est OUT explicitement)
4. Quelles sont les contraintes techniques importantes ? (stack, données, dépendances)
5. Quel est le critère de succès minimal — comment sait-on que c'est done ?
6. Quelle commande lance les tests ? (ex: `npm test`, `vitest`, `pytest` — répondre "aucun" si pas de tests)

**Étape 2 — Génère `spec.md` à la racine du projet :**

```markdown
# Spec — [Nom du projet]

## Objectif
...

## Utilisateurs
...

## Périmètre
**IN :** ...
**OUT :** ...

## Contraintes
...

## Succès (MVP)
...
```

**Étape 3 — Crée ou met à jour `CLAUDE.md` à la racine avec une section `## Constitution` :**

Extrais de spec.md 3 à 5 principes non-négociables pour ce projet (ex: "pas de backend", "mobile-first", "données en localStorage uniquement"). Format :

```markdown
## Constitution

Principes non-négociables pour ce projet :
- [principe 1]
- [principe 2]
- ...

## Contexte projet

- Lis toujours `tasks.md` s'il existe au début de la session
- Après chaque tâche complétée, coche-la dans `tasks.md` immédiatement
- Respecte la constitution ci-dessus à chaque implémentation
- Commande de tests : [réponse à la question 6, ou "aucun"]
```

## Règles

- Ne planifie pas, ne code pas. `/plan` vient ensuite.
- Si spec.md existe déjà, propose de le mettre à jour plutôt que de l'écraser.
