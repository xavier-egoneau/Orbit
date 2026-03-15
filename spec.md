# Spec — Orbit MCP Server

## Objectif

Serveur MCP TypeScript permettant à un agent IA de travailler sur une application locale comme un développeur autonome, via la boucle :

1. Ouvrir l'application dans un navigateur
2. Observer le comportement réel
3. Lire les logs navigateur et runtime
4. Retrouver les fichiers source concernés
5. Modifier le code
6. Relancer / retester
7. Vérifier le résultat

Ce n'est pas un simple MCP "filesystem + terminal" : le serveur combine analyse structurée du repo, navigation dans le code, contexte runtime et pilotage navigateur.

**Phase actuelle (axe 2)** : relier runtime, navigateur et source — permettre à un agent de partir d'un comportement observé (URL ouverte, erreur console, log runtime) et remonter directement vers les fichiers source les plus probables à modifier.

## Utilisateurs

Développeur solo travaillant en local, via un agent IA connecté au serveur MCP (Claude Code, Codex, GitHub Copilot, ou tout client MCP compatible). Usage strictement local.

## Périmètre

**IN :**
- Analyse repo TS/JS/TSX/JSX via API TypeScript (AST, symboles, imports, routes, composants, handlers UI)
- Pilotage navigateur via Playwright (ouvrir URL, screenshot, logs console, exécuter JS, fermer)
- Gestion runtime : lancer/arrêter des process locaux, lire leurs logs
- Pont source/runtime/browser : relier une URL ouverte aux fichiers source candidats, agréger page + logs + source en une invocation (`current_page_to_source`, `app_diagnose`)
- Sécurisation des chemins fichiers (accès limité au repo cible)
- Transport stdio, compatible multi-client MCP

**OUT :**
- Support git (prévu plus tard)
- Déploiement distant / accès réseau externe
- Support stacks non-JS/TS (prévu plus tard : Python, Go, etc.)
- Interface graphique propre au serveur

## Contraintes

- Langage : TypeScript strict
- Runtime : Node.js
- Navigateur : Playwright
- Protocole : SDK MCP officiel, transport stdio
- Architecture modulaire (pas de monolithe dans `server/index.ts`)
- Sécurisation obligatoire des chemins repo (pas de path traversal)
- Pas de tests automatisés dans le MVP

## Succès (MVP)

Un agent peut :
1. Partir d'une URL ouverte dans le navigateur
2. Récupérer les logs console + les logs runtime associés
3. Obtenir une liste de fichiers source candidats à modifier

**Le tout en une seule invocation MCP.**

## Architecture cible

```
server/
  index.ts                  # entrée légère, enregistrement des tools
  services/
    browserSession.ts       # Playwright : session, navigation, screenshots
    repoIndexer.ts          # indexation AST TypeScript, symboles, routes
    runtimeBridge.ts        # process locaux, logs runtime
    diagnosticBridge.ts     # [NOUVEAU] agrégation browser + runtime + source
  tools/
    browserTools.ts         # tools MCP navigateur
    coreTools.ts            # tools MCP repo de base (read, write, search)
    repoTools.ts            # tools MCP repo enrichis
    repoGraphTools.ts       # tools MCP graphe de code (symboles, routes, composants)
    runtimeTools.ts         # tools MCP runtime
    diagnosticTools.ts      # [NOUVEAU] tools MCP pont source/runtime/browser
  utils/
    mcpResponses.ts         # helpers réponses MCP
    repoFs.ts               # accès fichiers sécurisé
```

## Tools MCP existants

**Repo / fichiers :** `health_check`, `repo_list_files`, `repo_read_file`, `repo_write_file`, `repo_search_text`

**Runtime :** `dev_run_command`, `runtime_start_process`, `runtime_list_processes`, `runtime_read_logs`, `runtime_stop_process`

**Navigateur :** `browser_open`, `browser_execute_js`, `browser_screenshot`, `browser_console_logs`, `browser_close`

**Graphe repo :** `repo_index_build`, `repo_find_symbols`, `repo_symbol_insight`, `repo_file_imports`, `repo_find_routes`, `repo_route_insight`, `repo_route_to_source`, `repo_find_component_usages`, `repo_component_insight`, `repo_find_ui_handlers`, `repo_find_imports`, `repo_find_related_files`, `repo_file_insight`

## Nouveaux tools MCP (axe 2)

- `current_page_info` — URL, titre, HTML simplifié, éléments interactifs, logs console récents
- `current_page_to_source` — URL courante → route détectée → fichiers source candidats
- `app_diagnose` — vue consolidée : page ouverte + erreurs console + logs runtime + route + source candidates
- `runtime_errors` — filtrage des logs runtime par niveau (error/warning)

## Roadmap

**Phase 1 — Base (done) :** repo, browser, runtime en modules séparés

**Phase 2 — Pont runtime/browser/source (en cours) :**
- `diagnosticBridge.ts` service d'agrégation
- `diagnosticTools.ts` tools MCP
- Enrichissement `browserSession` (HTML simplifié, éléments interactifs)
- Enrichissement `runtimeBridge` (filtre erreurs/warnings, association process→contexte)

**Phase 3 — (plus tard) :**
- Support git (historique, blame, diff)
- Support stacks non-JS/TS
- Indexation plus fine (références croisées, call graph)
