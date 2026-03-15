# /dev — Implémentation

Tu viens d'être invoqué par `/dev`. Objectif : implémenter les tâches dans l'ordre, en parallélisant les blocs qui le permettent.

## Process

**Étape 1 — Vérifie les prérequis :**

- Lis `tasks.md`. Si absent, dis à l'utilisateur de lancer `/plan` d'abord et arrête-toi.
- Lis `CLAUDE.md` — constitution et règles non-négociables.
- Lis `spec.md` — architecture du projet, stack, patterns existants.
- Lis `context.md` si présent — périmètre de l'US en cours (prend le dessus sur `spec.md` pour le scope).

**Étape 2 — Traite les groupes de tâches dans l'ordre :**

Pour chaque groupe dans `tasks.md` :

### Groupe `[séquentiel]`

Pour chaque tâche non cochée, applique ce cycle :

1. **Avant de coder** — cite explicitement les principes de la constitution qui s'appliquent. Format :
   ```
   Constitution applicable :
   - [principe X] → impact : [ce que ça interdit ou impose ici]
   ```
   Si aucun principe ne s'applique, indique-le explicitement.
2. Annonce la tâche traitée
3. Implémente-la complètement
4. **Après avoir codé** — vérifie que chaque principe cité est respecté. Corrige si nécessaire.
5. **Lance les tests** si une commande est définie dans `CLAUDE.md` (`Commande de tests`). Si les tests échouent, corrige avant de continuer — ne coche pas la tâche tant que les tests ne passent pas.
6. Coche la tâche dans `tasks.md` (`- [x]`) uniquement après validation et tests verts
7. Passe à la tâche suivante

### Groupe `[parallélisable]`

1. Annonce que tu vas dispatcher les tâches en agents parallèles
2. Cite les principes de la constitution applicables au groupe entier
3. Lance **un agent `coder` par tâche** simultanément via le tool `Agent`, en passant à chacun :
   - La description précise de sa tâche
   - La constitution extraite de `CLAUDE.md`
   - L'instruction de vérifier la constitution avant de livrer
4. Attends que tous les agents aient terminé
5. Vérifie que chaque livraison respecte la constitution
6. **Lance les tests** si une commande est définie dans `CLAUDE.md`. Si les tests échouent, identifie quel agent a introduit la régression et corrige avant de continuer.
7. Coche toutes les tâches du groupe dans `tasks.md` uniquement après tests verts
7. Passe au groupe suivant

## Règles

- **Ne pas mélanger les groupes** — un groupe entier doit être terminé avant de passer au suivant
- **La citation de la constitution est obligatoire** — avant chaque tâche séquentielle, avant chaque dispatch parallèle
- **Si une tâche bloque**, signale-le clairement et propose une alternative plutôt que de sauter
- **Arrête et demande** si une tâche est ambiguë plutôt que de l'interpréter seul
- Continue jusqu'à ce que toutes les tâches soient cochées, ou jusqu'à ce que l'utilisateur demande de s'arrêter
