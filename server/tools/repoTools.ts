import fs from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { json, ok } from "../utils/mcpResponses.js";
import { escapeRegExp, normalizeSafePath, pathExists, walkFiles } from "../utils/repoFs.js";

type RegisterRepoToolsOptions = {
  rootDir: string;
  maxFileSizeBytes: number;
};

export function registerRepoTools(server: McpServer, options: RegisterRepoToolsOptions) {
  server.registerTool(
    "repo_list_files",
    {
      title: "List repo files",
      description: "Liste les fichiers du depot en ignorant les dossiers volumineux et generes.",
      inputSchema: {
        limit: z.number().int().positive().max(10_000).optional(),
      },
    },
    async ({ limit }) => {
      const files = await walkFiles(options.rootDir);
      const output = typeof limit === "number" ? files.slice(0, limit) : files;

      return json({
        rootDir: options.rootDir,
        total: files.length,
        returned: output.length,
        files: output,
      });
    }
  );

  server.registerTool(
    "repo_read_file",
    {
      title: "Read file",
      description: "Lit un fichier texte du depot.",
      inputSchema: {
        filePath: z.string().min(1),
      },
    },
    async ({ filePath }) => {
      const absolutePath = normalizeSafePath(options.rootDir, filePath);

      if (!(await pathExists(absolutePath))) {
        throw new Error(`Fichier introuvable: ${filePath}`);
      }

      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) {
        throw new Error(`Ce chemin n'est pas un fichier: ${filePath}`);
      }

      if (stats.size > options.maxFileSizeBytes) {
        throw new Error(
          `Fichier trop volumineux (${stats.size} octets). Limite: ${options.maxFileSizeBytes}.`
        );
      }

      const content = await fs.readFile(absolutePath, "utf8");

      return json({
        filePath: filePath.replace(/\\/g, "/"),
        size: stats.size,
        content,
      });
    }
  );

  server.registerTool(
    "repo_write_file",
    {
      title: "Write file",
      description: "Ecrit completement un fichier texte dans le depot.",
      inputSchema: {
        filePath: z.string().min(1),
        content: z.string(),
        createDirectories: z.boolean().optional(),
      },
    },
    async ({ filePath, content, createDirectories }) => {
      const absolutePath = normalizeSafePath(options.rootDir, filePath);

      if (createDirectories) {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      }

      await fs.writeFile(absolutePath, content, "utf8");

      return ok(`Fichier ecrit avec succes: ${filePath.replace(/\\/g, "/")}`);
    }
  );

  server.registerTool(
    "repo_search_text",
    {
      title: "Search text",
      description: "Recherche un texte exact ou une regex dans les fichiers du depot.",
      inputSchema: {
        query: z.string().min(1),
        regex: z.boolean().optional(),
        caseSensitive: z.boolean().optional(),
        maxResults: z.number().int().positive().max(500).optional(),
      },
    },
    async ({ query, regex, caseSensitive, maxResults }) => {
      const files = await walkFiles(options.rootDir);
      const flags = caseSensitive ? "g" : "gi";
      const pattern = regex ? query : escapeRegExp(query);
      const re = new RegExp(pattern, flags);
      const results: Array<{
        filePath: string;
        line: number;
        preview: string;
      }> = [];
      const hardLimit = maxResults ?? 100;

      for (const filePath of files) {
        if (results.length >= hardLimit) {
          break;
        }

        const absolutePath = normalizeSafePath(options.rootDir, filePath);

        try {
          const content = await fs.readFile(absolutePath, "utf8");
          const lines = content.split(/\r?\n/);

          for (let index = 0; index < lines.length; index += 1) {
            const lineText = lines[index];
            re.lastIndex = 0;

            if (re.test(lineText)) {
              results.push({
                filePath,
                line: index + 1,
                preview: lineText.trim(),
              });

              if (results.length >= hardLimit) {
                break;
              }
            }
          }
        } catch {
          // Ignore les fichiers non lisibles en UTF-8.
        }
      }

      return json({
        query,
        regex: Boolean(regex),
        caseSensitive: Boolean(caseSensitive),
        count: results.length,
        results,
      });
    }
  );
}
