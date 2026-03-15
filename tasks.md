# Tasks — Orbit MCP Server

## [Phase A — Persistance] [séquentiel]
> L'index repo est recalculé à chaque redémarrage (coûteux). On le cache sur disque.

- [x] Créer `server/services/persistence.ts` — save/load du RepoIndex en JSON sur disque
- [x] Intégrer dans `RepoIndexer` : charger le cache au démarrage, sauvegarder après `buildIndex()`

## [Phase B — Support git] [séquentiel]
> Nouvelle capacité indépendante — touche des fichiers distincts.

- [x] Créer `server/services/gitBridge.ts` — wrapper git (status, log, diff, blame)
- [x] Créer `server/tools/gitTools.ts` — tools MCP : `git_status`, `git_log`, `git_diff`, `git_blame`
- [x] Enregistrer dans `server/index.ts`

## [Phase C — Multi-onglets] [séquentiel]
> Refactor de `browserSession.ts` — impacte aussi `diagnostics.ts`.

- [x] Refactorer `browserSession.ts` : gérer plusieurs pages (Map<id, Page>, page active)
- [x] Ajouter `browser_new_tab`, `browser_switch_tab`, `browser_list_tabs`, `browser_close_tab` dans `browserTools.ts`
- [x] Mettre à jour `diagnostics.ts` pour opérer sur la page active (déjà correct via activeTab())
