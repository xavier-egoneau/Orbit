import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RuntimeBridgeService } from "../services/runtimeBridge.js";
import { json } from "../utils/mcpResponses.js";

type RegisterRuntimeToolsOptions = {
  runtimeBridge: RuntimeBridgeService;
  maxRuntimeLogEntries: number;
};

export function registerRuntimeTools(server: McpServer, options: RegisterRuntimeToolsOptions) {
  server.registerTool(
    "dev_run_command",
    {
      title: "Run command",
      description: "Execute une commande shell dans le repo ou un sous-dossier du repo.",
      inputSchema: {
        command: z.string().min(1),
        cwd: z.string().optional(),
        timeoutMs: z.number().int().positive().max(300_000).optional(),
      },
    },
    async ({ command, cwd, timeoutMs }) => {
      return json(await options.runtimeBridge.runCommand(command, cwd, timeoutMs));
    }
  );

  server.registerTool(
    "runtime_start_process",
    {
      title: "Start runtime process",
      description: "Lance un processus long dans le repo et conserve ses logs.",
      inputSchema: {
        command: z.string().min(1),
        cwd: z.string().optional(),
      },
    },
    async ({ command, cwd }) => {
      return json(options.runtimeBridge.startProcess(command, cwd));
    }
  );

  server.registerTool(
    "runtime_list_processes",
    {
      title: "List runtime processes",
      description: "Liste les processus suivis par le runtime bridge.",
      inputSchema: {},
    },
    async () => {
      const processes = options.runtimeBridge.listProcesses();

      return json({
        count: processes.length,
        processes,
      });
    }
  );

  server.registerTool(
    "runtime_read_logs",
    {
      title: "Read runtime logs",
      description: "Retourne les logs stdout/stderr captures pour un processus suivi.",
      inputSchema: {
        processId: z.string().min(1),
        limit: z.number().int().positive().max(options.maxRuntimeLogEntries).optional(),
        clearAfterRead: z.boolean().optional(),
      },
    },
    async ({ processId, limit, clearAfterRead }) => {
      const result = options.runtimeBridge.readLogs(processId, limit, clearAfterRead);
      const warning = result.process.status === "exited"
        ? `Le processus s'est terminé (code: ${result.process.exitCode ?? "null"}) — les logs peuvent être incomplets.`
        : null;
      return json({ ...result, warning });
    }
  );

  server.registerTool(
    "runtime_stop_process",
    {
      title: "Stop runtime process",
      description: "Demande l'arret d'un processus suivi.",
      inputSchema: {
        processId: z.string().min(1),
        signal: z.enum(["SIGTERM", "SIGINT", "SIGKILL"]).optional(),
      },
    },
    async ({ processId, signal }) => {
      return json(options.runtimeBridge.stopProcess(processId, signal));
    }
  );

  server.registerTool(
    "runtime_errors",
    {
      title: "Runtime errors",
      description:
        "Retourne les logs d'erreurs ou d'avertissements recents captures par le runtime bridge, tous processus confondus.",
      inputSchema: {
        filter: z.enum(["errors", "warnings"]).optional().default("errors"),
        limit: z.number().int().positive().max(options.maxRuntimeLogEntries).optional(),
      },
    },
    async ({ filter, limit }) => {
      return json(options.runtimeBridge.getGlobalRecentLogs(limit, filter));
    }
  );
}
