import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitBridgeService } from "../services/gitBridge.js";
import { json } from "../utils/mcpResponses.js";

type RegisterGitToolsOptions = {
  gitBridge: GitBridgeService;
};

export function registerGitTools(server: McpServer, options: RegisterGitToolsOptions) {
  server.registerTool(
    "git_status",
    {
      title: "Git status",
      description: "Retourne la branche courante et les fichiers modifiés (staged / unstaged).",
      inputSchema: {},
    },
    async () => {
      const isRepo = await options.gitBridge.isGitRepo();
      if (!isRepo) {
        throw new Error("Le répertoire racine n'est pas un dépôt git.");
      }
      return json(await options.gitBridge.status());
    }
  );

  server.registerTool(
    "git_log",
    {
      title: "Git log",
      description: "Retourne les derniers commits du dépôt.",
      inputSchema: {
        limit: z.number().int().positive().max(100).optional().default(20),
      },
    },
    async ({ limit }) => {
      const isRepo = await options.gitBridge.isGitRepo();
      if (!isRepo) {
        throw new Error("Le répertoire racine n'est pas un dépôt git.");
      }
      const commits = await options.gitBridge.log(limit);
      return json({ count: commits.length, commits });
    }
  );

  server.registerTool(
    "git_diff",
    {
      title: "Git diff",
      description: "Retourne le diff courant (unstaged par défaut). Peut cibler un fichier spécifique ou le staged.",
      inputSchema: {
        filePath: z.string().optional(),
        staged: z.boolean().optional().default(false),
      },
    },
    async ({ filePath, staged }) => {
      const isRepo = await options.gitBridge.isGitRepo();
      if (!isRepo) {
        throw new Error("Le répertoire racine n'est pas un dépôt git.");
      }
      const diff = await options.gitBridge.diff(filePath, staged);
      return json({ filePath: filePath ?? null, staged, diff });
    }
  );

  server.registerTool(
    "git_blame",
    {
      title: "Git blame",
      description: "Retourne l'historique ligne par ligne d'un fichier (auteur, date, hash, contenu).",
      inputSchema: {
        filePath: z.string().min(1),
      },
    },
    async ({ filePath }) => {
      const isRepo = await options.gitBridge.isGitRepo();
      if (!isRepo) {
        throw new Error("Le répertoire racine n'est pas un dépôt git.");
      }
      const lines = await options.gitBridge.blame(filePath);
      return json({ filePath, lineCount: lines.length, lines });
    }
  );
}
