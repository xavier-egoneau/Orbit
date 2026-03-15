# TidewaveLike MCP Server

Serveur MCP TypeScript permettant à un agent IA de travailler sur une application locale comme un développeur autonome.

L'agent peut ouvrir l'application dans un navigateur, observer son comportement réel, lire les logs, retrouver les fichiers source concernés, modifier le code, relancer et vérifier le résultat — le tout via des tools MCP.

## Prérequis

- Node.js 18+
- npm

## Installation

```bash
npm install
npx playwright install chromium
```

## Lancement

```bash
# Développement (TypeScript direct)
npm run dev

# Production (après build)
npm run build
npm run start
```

Par défaut, le serveur pointe sur le répertoire courant comme racine du repo. Pour changer :

```bash
MCP_ROOT_DIR=/chemin/vers/mon-projet npm run dev
```

## Configuration client MCP

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "tidewave-like": {
      "command": "node",
      "args": ["/chemin/vers/tidewaveLike/dist/index.js"],
      "env": {
        "MCP_ROOT_DIR": "/chemin/vers/mon-projet"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add tidewave-like -- node /chemin/vers/tidewaveLike/dist/index.js
```

---

## Tools MCP

### Utilitaires

| Tool | Description |
|------|-------------|
| `health_check` | État du serveur, du navigateur et du runtime |

---

### Repo — fichiers

| Tool | Paramètres | Description |
|------|------------|-------------|
| `repo_list_files` | `pattern?` | Liste les fichiers du repo |
| `repo_read_file` | `filePath` | Lit un fichier source |
| `repo_write_file` | `filePath`, `content` | Écrit dans un fichier source |
| `repo_search_text` | `query`, `filePattern?` | Recherche du texte dans le repo |

---

### Repo — analyse de code

| Tool | Paramètres | Description |
|------|------------|-------------|
| `repo_index_build` | — | Indexe le repo (AST TypeScript) |
| `repo_find_symbols` | `name?`, `kind?` | Recherche des symboles (fonctions, classes, etc.) |
| `repo_symbol_insight` | `name`, `filePath?` | Détails sur un symbole |
| `repo_file_imports` | `filePath` | Imports d'un fichier |
| `repo_find_imports` | `source` | Qui importe un module donné |
| `repo_find_related_files` | `filePath` | Fichiers liés par imports |
| `repo_file_insight` | `filePath` | Vue complète d'un fichier (symboles, imports, routes, composants) |
| `repo_find_routes` | — | Toutes les routes détectées |
| `repo_route_insight` | `route` | Détails sur une route |
| `repo_route_to_source` | `route` | Route → fichiers source candidats |
| `repo_find_component_usages` | `componentName` | Où un composant est utilisé |
| `repo_component_insight` | `componentName` | Détails sur un composant JSX |
| `repo_find_ui_handlers` | `filePath?` | Handlers d'événements UI détectés |

> `repo_index_build` doit être appelé une fois avant d'utiliser les tools d'analyse.

---

### Runtime — processus

| Tool | Paramètres | Description |
|------|------------|-------------|
| `dev_run_command` | `command`, `cwd?` | Exécute une commande shell (bloquant) |
| `runtime_start_process` | `command`, `cwd?` | Lance un process long (dev server, tests...) |
| `runtime_list_processes` | — | Liste les process suivis |
| `runtime_read_logs` | `processId`, `limit?`, `clearAfterRead?` | Logs d'un process |
| `runtime_stop_process` | `processId`, `signal?` | Arrête un process |
| `runtime_errors` | `filter?` (`errors`\|`warnings`), `limit?` | Erreurs/warnings récents tous process confondus |

---

### Navigateur

| Tool | Paramètres | Description |
|------|------------|-------------|
| `browser_open` | `url`, `waitUntil?` | Ouvre une URL dans Chromium |
| `browser_execute_js` | `expression` | Exécute du JavaScript dans la page |
| `browser_screenshot` | `outputPath`, `fullPage?` | Capture d'écran |
| `browser_console_logs` | `limit?`, `clearAfterRead?` | Logs console du navigateur |
| `browser_close` | — | Ferme la session navigateur |

> **Sécurité** : `browser_execute_js` utilise `eval()` dans la page. Réservé à un navigateur local contrôlé — ne pas exposer à des entrées non fiables (ex: contenu de la page elle-même).

---

### Diagnostic — pont browser/runtime/source

Ces tools sont le cœur de la boucle agent : partir d'un comportement observé et remonter vers le code source.

| Tool | Paramètres | Description |
|------|------------|-------------|
| `browser_page_state` | — | État complet de la page : URL, titre, texte visible, éléments interactifs, logs console récents |
| `current_page_to_source` | — | URL courante → route détectée → fichiers source candidats |
| `app_diagnose` | `consoleLogLimit?` | Vue consolidée : page + erreurs console + erreurs runtime + route + source candidates |

### Workflow typique pour déboguer un comportement

```
1. browser_open          → ouvrir l'app
2. app_diagnose          → vue complète de l'état actuel
3. current_page_to_source → fichiers source à inspecter
4. repo_read_file        → lire le fichier concerné
5. repo_write_file       → appliquer le correctif
6. dev_run_command       → relancer le build si nécessaire
7. browser_open          → recharger et vérifier
```

---

## Architecture

```
server/
  index.ts                    # entrée — enregistrement des services et tools
  services/
    browserSession.ts         # session Playwright (navigation, DOM, logs)
    repoIndexer.ts            # indexation AST TypeScript
    runtimeBridge.ts          # process locaux et logs
    diagnostics.ts            # agrégation browser + runtime + source
  tools/
    coreTools.ts              # health_check
    repoTools.ts              # repo filesystem
    repoGraphTools.ts         # analyse de code
    runtimeTools.ts           # runtime process
    browserTools.ts           # navigateur
    diagnosticsTools.ts       # pont source/runtime/browser
  utils/
    mcpResponses.ts           # helpers réponses MCP
    repoFs.ts                 # accès fichiers sécurisé (anti path traversal)
```

## Sécurité

Tous les accès fichiers et commandes sont limités au répertoire défini par `MCP_ROOT_DIR`. Toute tentative d'accès hors de ce répertoire est rejetée.
