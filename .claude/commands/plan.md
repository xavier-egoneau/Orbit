# /plan — Planification des tâches

Tu viens d'être invoqué par `/plan`. Objectif : décomposer le projet en tâches actionnables et identifier ce qui peut être parallélisé.

## Process

**Étape 1 — Vérifie les prérequis :**

- Lis `CLAUDE.md` pour prendre en compte la constitution.
- Lis `context.md` s'il existe — il définit le périmètre de l'US en cours.
- Sinon, lis `spec.md`. Si absent également, dis à l'utilisateur de lancer `/spec` d'abord et arrête-toi.

> Priorité de lecture : `context.md` > `spec.md`. Si `context.md` est présent, c'est lui qui délimite le périmètre à planifier.

**Étape 2 — Analyse les dépendances entre tâches :**

Pour chaque groupe de tâches, détermine :
- Est-ce que les tâches dépendent du résultat d'un groupe précédent ? → `[séquentiel]`
- Est-ce que les tâches sont indépendantes (fichiers différents, domaines distincts, pas de dépendance mutuelle) ? → `[parallélisable]`

**Étape 3 — Génère `tasks.md` à la racine :**

```markdown
# Tasks — [Nom du projet]

## [Groupe fondations] [séquentiel]
- [ ] Tâche concrète et actionnable
- [ ] ...

## [Groupe features] [parallélisable]
> Tâches indépendantes — seront traitées simultanément par plusieurs agents
- [ ] ...
- [ ] ...

## [Groupe intégration] [séquentiel]
> Nécessite que [groupe précédent] soit complet
- [ ] ...
```

**Règles de décomposition :**

- Chaque tâche = une action concrète vérifiable
- Maximum 20 tâches au total — regroupe ce qui peut l'être
- Ordre logique : fondations → fonctionnalités → polish
- Pas de tâches de documentation ou de "review" — uniquement du code qui tourne
- Les tâches `[parallélisable]` doivent toucher des fichiers/domaines distincts — jamais le même fichier en parallèle

**Étape 4 — Présente le plan à l'utilisateur** avant d'écrire `tasks.md` :

- Montre la liste complète avec les marqueurs séquentiel/parallélisable
- Justifie brièvement les choix de parallélisme
- Demande validation ou ajustements
- Écris `tasks.md` seulement après accord

## Règles

- Ne commence pas à implémenter. `/dev` vient ensuite.
- `tasks.md` est toujours écrasé — chaque `/plan` repart de zéro pour l'US en cours.
