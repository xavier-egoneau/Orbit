import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { json } from "../utils/mcpResponses.js";

type RegisterCoreToolsOptions = {
  rootDir: string;
  getBrowserReady: () => boolean;
  getRuntimeProcessCount: () => number;
};

export function registerCoreTools(server: McpServer, options: RegisterCoreToolsOptions) {
  server.registerTool(
    "health_check",
    {
      title: "Health check",
      description: "Retourne l'etat du serveur MCP et le repertoire racine analyse.",
      inputSchema: {},
    },
    async () => {
      return json({
        ok: true,
        rootDir: options.rootDir,
        browserReady: options.getBrowserReady(),
        runtimeProcesses: options.getRuntimeProcessCount(),
        timestamp: new Date().toISOString(),
      });
    }
  );
}
