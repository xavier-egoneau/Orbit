# /resume — Reprendre une session

Tu viens d'être invoqué par `/resume`. Objectif : reconstruire le contexte du projet en cours et identifier la prochaine action.

## Process

**Étape 1 — Lis les fichiers de contexte dans cet ordre :**

1. `CLAUDE.md` — constitution et principes du projet
2. `spec.md` — objectif, périmètre, contraintes
3. `context.md` — US en cours (si présent)
4. `tasks.md` — état des tâches

Si `spec.md` est absent → dis à l'utilisateur de lancer `/spec`.
Si `tasks.md` est absent → dis à l'utilisateur de lancer `/plan`.

**Étape 2 — Produis un résumé d'état structuré :**

```
## Résumé du projet
[Nom et objectif en 1-2 phrases tirées de spec.md]

## US en cours  ← uniquement si context.md existe
[Objectif + périmètre IN/OUT de l'US active]

## Constitution active
[Liste des principes non-négociables]

## État des tâches
Complétées : X / Y
[x] Tâche A
[x] Tâche B
...

Restantes :
[ ] Tâche C
[ ] Tâche D
...

## Prochaine action
→ [Première tâche non cochée, avec son groupe séquentiel/parallélisable]
```

**Étape 3 — Demande comment continuer :**

Propose les options :
- Taper `/dev` pour continuer l'implémentation
- Taper `/add` pour ajouter une nouvelle feature
- Poser une question ou donner une instruction directe

## Règles

- Ne modifie aucun fichier — ce skill est lecture seule
- Ne commence pas à implémenter sans que l'utilisateur le demande explicitement
