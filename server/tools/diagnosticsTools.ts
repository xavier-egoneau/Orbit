import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DiagnosticsService } from "../services/diagnostics.js";
import { json } from "../utils/mcpResponses.js";

type RegisterDiagnosticsToolsOptions = {
  diagnostics: DiagnosticsService;
};

export function registerDiagnosticsTools(
  server: McpServer,
  options: RegisterDiagnosticsToolsOptions
) {
  server.registerTool(
    "browser_page_state",
    {
      title: "Browser page state",
      description:
        "Retourne l'état complet de la page courante : URL, titre, texte visible, éléments interactifs détectés et derniers logs console.",
      inputSchema: {},
    },
    async () => {
      const state = await options.diagnostics.getPageState();
      if (!state) {
        throw new Error("Aucune page ouverte dans le navigateur.");
      }
      return json(state);
    }
  );

  server.registerTool(
    "current_page_to_source",
    {
      title: "Current page to source",
      description:
        "Résout l'URL courante du navigateur vers les fichiers source candidats du repo. Combine détection de route et analyse du graphe de dépendances.",
      inputSchema: {},
    },
    async () => {
      const result = await options.diagnostics.currentPageToSource();
      if (!result) {
        throw new Error("Aucune page ouverte dans le navigateur.");
      }
      return json(result);
    }
  );

  server.registerTool(
    "app_diagnose",
    {
      title: "App diagnose",
      description:
        "Vue consolidée de l'état de l'application : page courante, erreurs console, erreurs runtime récentes, route détectée et fichiers source candidats. Point d'entrée principal pour déboguer un comportement observé.",
      inputSchema: {
        consoleLogLimit: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ consoleLogLimit }) => {
      const report = await options.diagnostics.diagnose({ consoleLogLimit });
      return json(report);
    }
  );
}
