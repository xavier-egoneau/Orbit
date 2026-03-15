import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BrowserSessionService } from "./services/browserSession.js";
import { DiagnosticsService } from "./services/diagnostics.js";
import { GitBridgeService } from "./services/gitBridge.js";
import { PersistenceService } from "./services/persistence.js";
import { GenericPlugin } from "./services/plugins/genericPlugin.js";
import { PythonPlugin } from "./services/plugins/pythonPlugin.js";
import { TypeScriptPlugin } from "./services/plugins/typescriptPlugin.js";
import { RepoIndexer } from "./services/repoIndexer.js";
import { RuntimeBridgeService } from "./services/runtimeBridge.js";
import { registerBrowserTools } from "./tools/browserTools.js";
import { registerCoreTools } from "./tools/coreTools.js";
import { registerDiagnosticsTools } from "./tools/diagnosticsTools.js";
import { registerGitTools } from "./tools/gitTools.js";
import { registerRepoGraphTools } from "./tools/repoGraphTools.js";
import { registerRepoTools } from "./tools/repoTools.js";
import { registerRuntimeTools } from "./tools/runtimeTools.js";

const ROOT_DIR = path.resolve(process.env.MCP_ROOT_DIR ?? process.cwd());
const MAX_FILE_SIZE_BYTES = 300_000;
const MAX_COMMAND_OUTPUT_CHARS = 20_000;
const MAX_CONSOLE_LOGS = 200;
const MAX_RUNTIME_LOG_ENTRIES = 500;

const server = new McpServer({
  name: "tidewave-like-mcp",
  version: "0.1.0",
});

const persistence = new PersistenceService(ROOT_DIR);
const repoIndexer = new RepoIndexer(ROOT_DIR, persistence)
  .registerPlugin(new TypeScriptPlugin())
  .registerPlugin(new PythonPlugin())
  .registerPlugin(new GenericPlugin());
const gitBridge = new GitBridgeService(ROOT_DIR);
const browserSession = new BrowserSessionService({
  maxConsoleLogs: MAX_CONSOLE_LOGS,
});
const runtimeBridge = new RuntimeBridgeService(ROOT_DIR, {
  maxOutputChars: MAX_COMMAND_OUTPUT_CHARS,
  maxLogEntries: MAX_RUNTIME_LOG_ENTRIES,
});
const diagnostics = new DiagnosticsService(browserSession, runtimeBridge, repoIndexer);

registerCoreTools(server, {
  rootDir: ROOT_DIR,
  getBrowserReady: () => browserSession.isReady(),
  getRuntimeProcessCount: () => runtimeBridge.listProcesses().length,
});

registerRepoTools(server, {
  rootDir: ROOT_DIR,
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
});

registerRepoGraphTools(server, {
  repoIndexer,
});

registerRuntimeTools(server, {
  runtimeBridge,
  maxRuntimeLogEntries: MAX_RUNTIME_LOG_ENTRIES,
});

registerBrowserTools(server, {
  rootDir: ROOT_DIR,
  browserSession,
  maxConsoleLogs: MAX_CONSOLE_LOGS,
});

registerDiagnosticsTools(server, {
  diagnostics,
});

registerGitTools(server, {
  gitBridge,
});

async function main() {
  await repoIndexer.loadCachedIndex();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal MCP server error:", error);
  process.exit(1);
});
