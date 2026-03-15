import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RepoIndexer } from "../services/repoIndexer.js";
import { json } from "../utils/mcpResponses.js";

type RegisterRepoGraphToolsOptions = {
  repoIndexer: RepoIndexer;
};

export function registerRepoGraphTools(server: McpServer, options: RegisterRepoGraphToolsOptions) {
  server.registerTool(
    "repo_index_build",
    {
      title: "Build repo index",
      description: "Construit ou reconstruit explicitement l'index structurel du repo. L'index est aussi auto-construit au premier appel de n'importe quel tool d'analyse — ce tool est utile pour forcer un refresh apres des modifications de fichiers.",
      inputSchema: {},
    },
    async () => {
      const index = await options.repoIndexer.buildIndex();

      return json({
        rootDir: index.rootDir,
        createdAt: index.createdAt,
        filesIndexed: index.files.length,
        symbols: index.symbols.length,
        routes: index.routes.length,
        componentUsages: index.componentUsages.length,
        uiHandlers: index.uiHandlers.length,
      });
    }
  );

  server.registerTool(
    "repo_find_symbols",
    {
      title: "Find repo symbols",
      description: "Recherche des symboles connus dans l'index du repo.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ query, limit }) => {
      const matches = await options.repoIndexer.findSymbols(query);
      const output = typeof limit === "number" ? matches.slice(0, limit) : matches;

      return json({
        query,
        count: output.length,
        symbols: output,
      });
    }
  );

  server.registerTool(
    "repo_symbol_insight",
    {
      title: "Repo symbol insight",
      description: "Retourne une vue agregee autour d'un symbole: definitions, imports et fichiers lies.",
      inputSchema: {
        symbolName: z.string().min(1),
      },
    },
    async ({ symbolName }) => {
      return json(await options.repoIndexer.getSymbolInsight(symbolName));
    }
  );

  server.registerTool(
    "repo_file_imports",
    {
      title: "Repo file imports",
      description: "Retourne les imports detectes pour un fichier du repo.",
      inputSchema: {
        filePath: z.string().min(1),
      },
    },
    async ({ filePath }) => {
      const imports = await options.repoIndexer.getFileImports(filePath);

      return json({
        filePath,
        count: imports.length,
        imports,
      });
    }
  );

  server.registerTool(
    "repo_find_routes",
    {
      title: "Find repo routes",
      description: "Retourne les routes detectees dans le repo.",
      inputSchema: {
        query: z.string().optional(),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ query, limit }) => {
      const matches = await options.repoIndexer.findRoutes(query);
      const output = typeof limit === "number" ? matches.slice(0, limit) : matches;

      return json({
        query: query ?? null,
        count: output.length,
        routes: output,
      });
    }
  );

  server.registerTool(
    "repo_route_insight",
    {
      title: "Repo route insight",
      description: "Retourne les fichiers, composants et handlers associes a une route.",
      inputSchema: {
        route: z.string().min(1),
      },
    },
    async ({ route }) => {
      const insight = await options.repoIndexer.getRouteInsight(route);

      if (!insight) {
        throw new Error(`Route introuvable dans l'index: ${route}`);
      }

      return json(insight);
    }
  );

  server.registerTool(
    "repo_route_to_source",
    {
      title: "Repo route to source",
      description: "Retourne les meilleurs fichiers source candidats pour une route donnee.",
      inputSchema: {
        route: z.string().min(1),
      },
    },
    async ({ route }) => {
      const insight = await options.repoIndexer.getRouteSourceInsight(route);

      if (!insight) {
        throw new Error(`Route introuvable dans l'index: ${route}`);
      }

      return json(insight);
    }
  );

  server.registerTool(
    "repo_find_component_usages",
    {
      title: "Find component usages",
      description: "Recherche les usages JSX d'un composant dans le repo.",
      inputSchema: {
        componentName: z.string().min(1),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ componentName, limit }) => {
      const matches = await options.repoIndexer.findComponentUsages(componentName);
      const output = typeof limit === "number" ? matches.slice(0, limit) : matches;

      return json({
        componentName,
        count: output.length,
        usages: output,
      });
    }
  );

  server.registerTool(
    "repo_component_insight",
    {
      title: "Repo component insight",
      description: "Retourne une vue agregee autour d'un composant: definitions, usages et imports.",
      inputSchema: {
        componentName: z.string().min(1),
      },
    },
    async ({ componentName }) => {
      return json(await options.repoIndexer.getComponentInsight(componentName));
    }
  );

  server.registerTool(
    "repo_find_ui_handlers",
    {
      title: "Find UI handlers",
      description: "Recherche les handlers UI detectes dans les fichiers JSX/TSX.",
      inputSchema: {
        query: z.string().optional(),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ query, limit }) => {
      const matches = await options.repoIndexer.findUiHandlers(query);
      const output = typeof limit === "number" ? matches.slice(0, limit) : matches;

      return json({
        query: query ?? null,
        count: output.length,
        handlers: output,
      });
    }
  );

  server.registerTool(
    "repo_find_imports",
    {
      title: "Find imports",
      description: "Recherche les fichiers qui importent un module ou chemin donne.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ query, limit }) => {
      const matches = await options.repoIndexer.findFilesImportingModule(query);
      const output = typeof limit === "number" ? matches.slice(0, limit) : matches;

      return json({
        query,
        count: output.length,
        files: output,
      });
    }
  );

  server.registerTool(
    "repo_find_related_files",
    {
      title: "Find related files",
      description: "Retourne les fichiers relies a un symbole, composant ou handler connu.",
      inputSchema: {
        symbolName: z.string().min(1),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async ({ symbolName, limit }) => {
      const matches = await options.repoIndexer.findFilesUsingSymbol(symbolName);
      const output = typeof limit === "number" ? matches.slice(0, limit) : matches;

      return json({
        symbolName,
        count: output.length,
        files: output,
      });
    }
  );

  server.registerTool(
    "repo_file_insight",
    {
      title: "Repo file insight",
      description: "Retourne l'analyse structurelle d'un fichier indexable du repo.",
      inputSchema: {
        filePath: z.string().min(1),
      },
    },
    async ({ filePath }) => {
      const insight = await options.repoIndexer.getFileInsight(filePath);

      if (!insight) {
        throw new Error(`Fichier non indexe ou introuvable dans l'index: ${filePath}`);
      }

      return json(insight);
    }
  );
}
