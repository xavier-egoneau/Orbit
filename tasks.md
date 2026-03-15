# Tasks — Orbit MCP Server

## [Fondations] [séquentiel]
> Refactor de l'architecture avant d'ajouter des langages

- [x] Définir l'interface `LanguagePlugin` dans `server/services/plugins/languagePlugin.ts`
- [x] Extraire la logique JS/TS vers `server/services/plugins/typescriptPlugin.ts`
- [x] Refactorer `RepoIndexer` pour utiliser un registre de plugins

## [Nouveaux plugins] [parallélisable]
> Tâches indépendantes — fichiers distincts

- [x] Créer `server/services/plugins/pythonPlugin.ts` — regex-based : symboles (class/def), routes via décorateurs (@app.get, @router.post), imports
- [x] Créer `server/services/plugins/genericPlugin.ts` — fallback pour Go, Ruby, Rust, etc. : symboles simples, pas de routes

## [Intégration] [séquentiel]
> Câbler les plugins et valider

- [x] Enregistrer les plugins dans `RepoIndexer` et mettre à jour les extensions indexables
- [x] Vérifier la compilation TypeScript
