import fs from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BrowserSessionService } from "../services/browserSession.js";
import { json, ok } from "../utils/mcpResponses.js";
import { normalizeSafePath } from "../utils/repoFs.js";

type RegisterBrowserToolsOptions = {
  rootDir: string;
  browserSession: BrowserSessionService;
  maxConsoleLogs: number;
};

export function registerBrowserTools(server: McpServer, options: RegisterBrowserToolsOptions) {
  server.registerTool(
    "browser_open",
    {
      title: "Browser open",
      description: "Ouvre une URL dans le navigateur headless de l'agent.",
      inputSchema: {
        url: z.string().url(),
        waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional(),
      },
    },
    async ({ url, waitUntil }) => {
      return json(await options.browserSession.open(url, waitUntil));
    }
  );

  server.registerTool(
    "browser_execute_js",
    {
      title: "Browser execute JS",
      description: "Execute du JavaScript dans la page courante.",
      inputSchema: {
        expression: z.string().min(1),
      },
    },
    async ({ expression }) => {
      return json(await options.browserSession.executeJs(expression));
    }
  );

  server.registerTool(
    "browser_screenshot",
    {
      title: "Browser screenshot",
      description: "Prend un screenshot de la page courante.",
      inputSchema: {
        outputPath: z.string().min(1),
        fullPage: z.boolean().optional(),
      },
    },
    async ({ outputPath, fullPage }) => {
      const absolutePath = normalizeSafePath(options.rootDir, outputPath);

      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      const result = await options.browserSession.screenshot(absolutePath, fullPage ?? true);

      return json({
        outputPath: outputPath.replace(/\\/g, "/"),
        absolutePath,
        currentUrl: result.currentUrl,
      });
    }
  );

  server.registerTool(
    "browser_console_logs",
    {
      title: "Browser console logs",
      description: "Retourne les derniers logs console du navigateur.",
      inputSchema: {
        limit: z.number().int().positive().max(options.maxConsoleLogs).optional(),
        clearAfterRead: z.boolean().optional(),
      },
    },
    async ({ limit, clearAfterRead }) => {
      return json(options.browserSession.readConsoleLogs(limit, clearAfterRead));
    }
  );

  server.registerTool(
    "browser_close",
    {
      title: "Browser close",
      description: "Ferme la session navigateur active.",
      inputSchema: {},
    },
    async () => {
      await options.browserSession.close();
      return ok("Session navigateur fermee.");
    }
  );
}
