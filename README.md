# Orbit MCP Server

Serveur MCP TypeScript permettant à un agent IA de travailler sur une application locale comme un développeur autonome.

L'agent peut ouvrir l'application dans un navigateur, observer son comportement réel, lire les logs, retrouver les fichiers source concernés, modifier le code, relancer et vérifier le résultat — le tout via des tools MCP.

## Installation dans un projet

### 1. Copier le dossier serveur

```bash
cp -r mcp-server/ /mon-projet/mcp-server
cd /mon-projet/mcp-server
npm install
npx playwright install chromium
npm run build
```

### 2. Déclarer le serveur MCP

Copie `.mcp.json.example` à la racine de ton projet :

```bash
cp /mon-projet/mcp-server/.mcp.json.example /mon-projet/.mcp.json
```

**Claude Code** détecte automatiquement `.mcp.json` à la racine et expose les tools dans la session. Contenu :

```json
{
  "mcpServers": {
    "orbit": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "MCP_ROOT_DIR": "."
      }
    }
  }
}
```

**Claude Desktop** — ajoute dans `~/Library/Application Support/Claude/claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "orbit": {
      "command": "node",
      "args": ["/mon-projet/mcp-server/dist/index.js"],
      "env": {
        "MCP_ROOT_DIR": "/mon-projet"
      }
    }
  }
}
```

---

## Scripts

```bash
npm run dev       # développement (TypeScript direct, sans build)
npm run build     # compile vers dist/
npm run typecheck # vérifie les types sans compiler
npm run start     # lance dist/index.js (après build)
```

---

## Langages supportés

L'indexeur analyse automatiquement les fichiers selon leur extension :

| Langage | Extensions | Symboles | Imports | Routes |
|---------|------------|----------|---------|--------|
| TypeScript / JavaScript | `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` | ✓ (AST) | ✓ | ✓ Next.js, React Router |
| Python | `.py` | ✓ (regex) | ✓ | ✓ FastAPI, Flask |
| Go, Ruby, Rust, Java, Kotlin, PHP | `.go` `.rb` `.rs` `.java` `.kt` `.php` | ✓ (regex) | ✓ | — |

---

## Cache de l'index

L'index est sauvegardé dans `.orbit/index-cache.json` à la racine du projet analysé. Il est rechargé automatiquement au démarrage du serveur — pas besoin de reconstruire à chaque redémarrage.

Ajoute `.orbit/` à ton `.gitignore`.

Pour forcer un rebuild complet : appelle le tool `repo_index_build`.

---

## Tools MCP

### Utilitaires

| Tool | Description |
|------|-------------|
| `health_check` | État du serveur, du navigateur et du runtime |

### Repo — fichiers

| Tool | Paramètres | Description |
|------|------------|-------------|
| `repo_list_files` | `pattern?` | Liste les fichiers du repo |
| `repo_read_file` | `filePath` | Lit un fichier source |
| `repo_write_file` | `filePath`, `content` | Écrit dans un fichier source |
| `repo_search_text` | `query`, `filePattern?` | Recherche du texte dans le repo |

### Repo — analyse de code

> L'index est auto-construit au premier appel. `repo_index_build` sert à forcer un refresh après des modifications.

| Tool | Paramètres | Description |
|------|------------|-------------|
| `repo_index_build` | — | Reconstruit l'index (toutes les stacks) |
| `repo_find_symbols` | `query`, `limit?` | Recherche des symboles (fonctions, classes, etc.) |
| `repo_symbol_insight` | `symbolName` | Détails sur un symbole |
| `repo_file_imports` | `filePath` | Imports d'un fichier |
| `repo_find_imports` | `query` | Qui importe un module donné |
| `repo_find_related_files` | `symbolName` | Fichiers liés par imports |
| `repo_file_insight` | `filePath` | Vue complète d'un fichier |
| `repo_find_routes` | `query?` | Toutes les routes détectées |
| `repo_route_insight` | `route` | Détails sur une route |
| `repo_route_to_source` | `route` | Route → fichiers source candidats |
| `repo_find_component_usages` | `componentName` | Où un composant est utilisé (JSX) |
| `repo_component_insight` | `componentName` | Détails sur un composant JSX |
| `repo_find_ui_handlers` | `query?` | Handlers d'événements UI (JSX) |

### Git

| Tool | Paramètres | Description |
|------|------------|-------------|
| `git_status` | — | Branche courante + fichiers modifiés |
| `git_log` | `limit?` | Derniers commits |
| `git_diff` | `filePath?`, `staged?` | Diff courant |
| `git_blame` | `filePath` | Historique ligne par ligne |

### Runtime — processus

| Tool | Paramètres | Description |
|------|------------|-------------|
| `dev_run_command` | `command`, `cwd?`, `timeoutMs?` | Exécute une commande shell (bloquant, défaut 60s) |
| `runtime_start_process` | `command`, `cwd?` | Lance un process long |
| `runtime_list_processes` | — | Liste les process suivis |
| `runtime_read_logs` | `processId`, `limit?`, `clearAfterRead?` | Logs d'un process |
| `runtime_stop_process` | `processId`, `signal?` | Arrête un process |
| `runtime_errors` | `filter?` (`errors`\|`warnings`), `limit?` | Erreurs récentes tous process confondus |

### Navigateur

| Tool | Paramètres | Description |
|------|------------|-------------|
| `browser_open` | `url`, `waitUntil?` | Ouvre une URL dans l'onglet actif |
| `browser_execute_js` | `expression` | Exécute du JavaScript dans la page |
| `browser_screenshot` | `outputPath`, `fullPage?` | Capture d'écran |
| `browser_console_logs` | `limit?`, `clearAfterRead?` | Logs console de l'onglet actif |
| `browser_close` | — | Ferme tous les onglets |
| `browser_new_tab` | `url?`, `waitUntil?` | Ouvre un nouvel onglet |
| `browser_list_tabs` | — | Liste les onglets ouverts |
| `browser_switch_tab` | `tabId` | Change l'onglet actif |
| `browser_close_tab` | `tabId?` | Ferme un onglet |

> **Sécurité** : `browser_execute_js` utilise `eval()` dans la page. Réservé à un navigateur local contrôlé — ne pas exposer à des entrées non fiables.

### Diagnostic — pont browser / runtime / source

| Tool | Paramètres | Description |
|------|------------|-------------|
| `browser_page_state` | — | URL, titre, texte visible, éléments interactifs, logs console |
| `current_page_to_source` | — | URL courante → route → fichiers source candidats |
| `app_diagnose` | `consoleLogLimit?` | Vue consolidée : page + erreurs console + erreurs runtime + source |

### Workflow typique

```
1. browser_open           → ouvrir l'app
2. app_diagnose           → vue complète (état index, page, logs, source)
3. current_page_to_source → fichiers source à inspecter
4. repo_read_file         → lire le fichier concerné
5. git_diff               → voir les changements en cours
6. repo_write_file        → appliquer le correctif
7. dev_run_command        → relancer le build si nécessaire
8. browser_open           → recharger et vérifier
```

---

## Architecture

```
mcp-server/
  index.ts                    # entrée — enregistrement des services et tools
  services/
    browserSession.ts         # session Playwright multi-onglets
    repoIndexer.ts            # orchestrateur d'indexation (registre de plugins)
    runtimeBridge.ts          # process locaux et logs
    diagnostics.ts            # agrégation browser + runtime + source
    gitBridge.ts              # wrapper git (status, log, diff, blame)
    persistence.ts            # cache de l'index sur disque (.orbit/)
    plugins/
      languagePlugin.ts       # interface LanguagePlugin + types partagés
      typescriptPlugin.ts     # plugin JS/TS (AST TypeScript compiler)
      pythonPlugin.ts         # plugin Python (regex)
      genericPlugin.ts        # plugin Go, Ruby, Rust, Java, Kotlin, PHP (regex)
  tools/
    coreTools.ts              # health_check
    repoTools.ts              # repo filesystem
    repoGraphTools.ts         # analyse de code
    runtimeTools.ts           # runtime process
    browserTools.ts           # navigateur + gestion onglets
    diagnosticsTools.ts       # pont source/runtime/browser
    gitTools.ts               # git
  utils/
    mcpResponses.ts           # helpers réponses MCP
    repoFs.ts                 # accès fichiers sécurisé (anti path traversal)
  .mcp.json.example           # modèle à copier à la racine du projet cible
```

## Sécurité

Tous les accès fichiers et commandes sont limités au répertoire défini par `MCP_ROOT_DIR`. Toute tentative d'accès hors de ce répertoire est rejetée.
