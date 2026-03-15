import fs from "node:fs/promises";
import path from "node:path";
import type { PersistenceService } from "./persistence.js";
import type {
  ComponentUsage,
  ImportReference,
  LanguagePlugin,
  RepoSymbol,
  RouteReference,
  UiHandlerReference,
} from "./plugins/languagePlugin.js";

export type {
  ComponentUsage,
  ImportReference,
  RepoSymbol,
  RouteReference,
  SymbolKind,
  UiHandlerReference,
} from "./plugins/languagePlugin.js";

const DEFAULT_EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".orbit",
]);

export type IndexedFile = {
  filePath: string;
  absolutePath: string;
  language: string;
  imports: ImportReference[];
  symbols: RepoSymbol[];
  componentUsages: ComponentUsage[];
  uiHandlers: UiHandlerReference[];
  routes: RouteReference[];
};

export type RouteInsight = {
  route: RouteReference;
  routeFiles: IndexedFile[];
  componentsUsed: ComponentUsage[];
  uiHandlers: UiHandlerReference[];
};

export type RouteSourceCandidate = {
  filePath: string;
  reason: "route-definition" | "component-definition" | "component-importer";
  score: number;
  symbols: RepoSymbol[];
  imports: ImportReference[];
  uiHandlers: UiHandlerReference[];
};

export type RouteSourceInsight = {
  route: RouteReference;
  primarySources: RouteSourceCandidate[];
  components: ComponentUsage[];
};

export type ComponentInsight = {
  componentName: string;
  definitions: RepoSymbol[];
  definitionFiles: IndexedFile[];
  usages: ComponentUsage[];
  importingFiles: Array<{ filePath: string; imports: ImportReference[] }>;
  relatedFiles: IndexedFile[];
  uiHandlersNearDefinitions: UiHandlerReference[];
};

export type SymbolInsight = {
  symbolName: string;
  definitions: RepoSymbol[];
  definitionFiles: IndexedFile[];
  importingFiles: Array<{ filePath: string; imports: ImportReference[] }>;
  relatedFiles: IndexedFile[];
  uiHandlers: UiHandlerReference[];
  componentUsages: ComponentUsage[];
};

export type RepoIndex = {
  rootDir: string;
  createdAt: string;
  files: IndexedFile[];
  symbols: RepoSymbol[];
  routes: RouteReference[];
  componentUsages: ComponentUsage[];
  uiHandlers: UiHandlerReference[];
};

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

function isInsideRoot(rootDir: string, absolutePath: string): boolean {
  const relative = path.relative(rootDir, absolutePath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export class RepoIndexer {
  private readonly rootDir: string;
  private readonly persistence: PersistenceService | null;
  private readonly plugins: LanguagePlugin[] = [];
  private lastIndex: RepoIndex | null = null;

  constructor(rootDir: string, persistence?: PersistenceService) {
    this.rootDir = path.resolve(rootDir);
    this.persistence = persistence ?? null;
  }

  registerPlugin(plugin: LanguagePlugin): this {
    this.plugins.push(plugin);
    return this;
  }

  getRootDir(): string {
    return this.rootDir;
  }

  getLastIndex(): RepoIndex | null {
    return this.lastIndex;
  }

  async loadCachedIndex(): Promise<RepoIndex | null> {
    if (!this.persistence) return null;
    const cached = await this.persistence.loadIndex();
    if (cached) this.lastIndex = cached;
    return cached;
  }

  async buildIndex(): Promise<RepoIndex> {
    const absolutePaths = await this.walkIndexableFiles(this.rootDir);
    const files: IndexedFile[] = [];

    for (const absolutePath of absolutePaths) {
      const indexedFile = await this.indexFile(absolutePath);
      if (indexedFile) files.push(indexedFile);
    }

    const repoIndex: RepoIndex = {
      rootDir: this.rootDir,
      createdAt: new Date().toISOString(),
      files,
      symbols: files.flatMap((f) => f.symbols),
      routes: files.flatMap((f) => f.routes),
      componentUsages: files.flatMap((f) => f.componentUsages),
      uiHandlers: files.flatMap((f) => f.uiHandlers),
    };

    this.lastIndex = repoIndex;
    await this.persistence?.saveIndex(repoIndex);
    return repoIndex;
  }

  async indexFile(inputPath: string): Promise<IndexedFile | null> {
    const absolutePath = path.resolve(this.rootDir, inputPath);
    if (!isInsideRoot(this.rootDir, absolutePath)) return null;

    const plugin = this.plugins.find((p) => p.supports(absolutePath));
    if (!plugin) return null;

    const filePath = normalizeRepoPath(path.relative(this.rootDir, absolutePath));
    const content = await fs.readFile(absolutePath, "utf8");
    const result = await plugin.analyzeFile({ rootDir: this.rootDir, absolutePath, filePath, content });

    return { filePath, absolutePath, ...result };
  }

  async refreshFile(inputPath: string): Promise<IndexedFile | null> {
    const indexedFile = await this.indexFile(inputPath);
    if (!this.lastIndex || !indexedFile) return indexedFile;

    this.lastIndex.files = this.lastIndex.files.filter((f) => f.filePath !== indexedFile.filePath);
    this.lastIndex.files.push(indexedFile);
    this.lastIndex.symbols = this.lastIndex.files.flatMap((f) => f.symbols);
    this.lastIndex.routes = this.lastIndex.files.flatMap((f) => f.routes);
    this.lastIndex.componentUsages = this.lastIndex.files.flatMap((f) => f.componentUsages);
    this.lastIndex.uiHandlers = this.lastIndex.files.flatMap((f) => f.uiHandlers);
    this.lastIndex.createdAt = new Date().toISOString();
    return indexedFile;
  }

  async findSymbols(query: string): Promise<RepoSymbol[]> {
    const index = this.lastIndex ?? (await this.buildIndex());
    const lowered = normalizeQuery(query);
    return index.symbols.filter((s) => s.name.toLowerCase().includes(lowered));
  }

  async findRoutes(query?: string): Promise<RouteReference[]> {
    const index = this.lastIndex ?? (await this.buildIndex());
    if (!query) return index.routes;
    const lowered = normalizeQuery(query);
    return index.routes.filter((r) => r.route.toLowerCase().includes(lowered));
  }

  async findComponentUsages(componentName: string): Promise<ComponentUsage[]> {
    const index = this.lastIndex ?? (await this.buildIndex());
    const normalized = normalizeQuery(componentName);
    return index.componentUsages.filter((u) => u.componentName.toLowerCase() === normalized);
  }

  async findUiHandlers(query?: string): Promise<UiHandlerReference[]> {
    const index = this.lastIndex ?? (await this.buildIndex());
    if (!query) return index.uiHandlers;
    const lowered = normalizeQuery(query);
    return index.uiHandlers.filter(
      (h) => h.handlerName.toLowerCase().includes(lowered) || h.eventName.toLowerCase().includes(lowered)
    );
  }

  async getFileImports(filePath: string): Promise<ImportReference[]> {
    const insight = await this.getFileInsight(filePath);
    return insight?.imports ?? [];
  }

  async findFilesImportingModule(query: string): Promise<Array<{ filePath: string; imports: ImportReference[] }>> {
    const index = this.lastIndex ?? (await this.buildIndex());
    const lowered = normalizeQuery(query);
    return index.files
      .map((f) => ({ filePath: f.filePath, imports: f.imports.filter((i) => i.source.toLowerCase().includes(lowered)) }))
      .filter((e) => e.imports.length > 0);
  }

  async findFilesUsingSymbol(symbolName: string): Promise<IndexedFile[]> {
    const index = this.lastIndex ?? (await this.buildIndex());
    const normalized = normalizeQuery(symbolName);
    return index.files.filter(
      (f) =>
        f.symbols.some((s) => s.name.toLowerCase() === normalized) ||
        f.componentUsages.some((u) => u.componentName.toLowerCase() === normalized) ||
        f.uiHandlers.some((h) => h.handlerName.toLowerCase() === normalized)
    );
  }

  async getComponentInsight(componentName: string): Promise<ComponentInsight> {
    const symbolInsight = await this.getSymbolInsight(componentName);
    const normalized = normalizeQuery(componentName);
    const index = this.lastIndex ?? (await this.buildIndex());
    const usages = index.componentUsages.filter((u) => u.componentName.toLowerCase() === normalized);
    return {
      componentName,
      definitions: symbolInsight.definitions,
      definitionFiles: symbolInsight.definitionFiles,
      usages,
      importingFiles: symbolInsight.importingFiles,
      relatedFiles: symbolInsight.relatedFiles,
      uiHandlersNearDefinitions: symbolInsight.uiHandlers,
    };
  }

  async getSymbolInsight(symbolName: string): Promise<SymbolInsight> {
    const index = this.lastIndex ?? (await this.buildIndex());
    const normalized = normalizeQuery(symbolName);
    const definitions = index.symbols.filter((s) => s.name.toLowerCase() === normalized);
    const definitionFilePaths = new Set(definitions.map((d) => d.filePath));
    const definitionFiles = index.files.filter((f) => definitionFilePaths.has(f.filePath));
    const importingFiles = index.files
      .map((f) => ({ filePath: f.filePath, imports: f.imports.filter((i) => i.specifiers.some((s) => s.toLowerCase() === normalized)) }))
      .filter((e) => e.imports.length > 0);
    const relatedFiles = index.files.filter(
      (f) =>
        definitionFilePaths.has(f.filePath) ||
        importingFiles.some((e) => e.filePath === f.filePath) ||
        f.componentUsages.some((u) => u.componentName.toLowerCase() === normalized) ||
        f.uiHandlers.some((h) => h.handlerName.toLowerCase() === normalized)
    );
    const uiHandlers = relatedFiles.flatMap((f) =>
      f.uiHandlers.filter((h) => h.handlerName.toLowerCase() === normalized || definitionFilePaths.has(f.filePath))
    );
    const componentUsages = relatedFiles.flatMap((f) =>
      f.componentUsages.filter((u) => u.componentName.toLowerCase() === normalized)
    );
    return { symbolName, definitions, definitionFiles, importingFiles, relatedFiles, uiHandlers, componentUsages };
  }

  async getRouteInsight(routeQuery: string): Promise<RouteInsight | null> {
    const index = this.lastIndex ?? (await this.buildIndex());
    const lowered = normalizeQuery(routeQuery);
    const route =
      index.routes.find((r) => r.route.toLowerCase() === lowered) ??
      index.routes.find((r) => r.route.toLowerCase().includes(lowered));
    if (!route) return null;
    const routeFiles = index.files.filter((f) => f.filePath === route.filePath);
    return { route, routeFiles, componentsUsed: routeFiles.flatMap((f) => f.componentUsages), uiHandlers: routeFiles.flatMap((f) => f.uiHandlers) };
  }

  async getRouteSourceInsight(routeQuery: string): Promise<RouteSourceInsight | null> {
    const routeInsight = await this.getRouteInsight(routeQuery);
    if (!routeInsight) return null;

    const candidates = new Map<string, RouteSourceCandidate>();
    const upsert = (file: IndexedFile, reason: RouteSourceCandidate["reason"], score: number) => {
      const existing = candidates.get(file.filePath);
      if (existing) { existing.score = Math.max(existing.score, score); return; }
      candidates.set(file.filePath, { filePath: file.filePath, reason, score, symbols: file.symbols, imports: file.imports, uiHandlers: file.uiHandlers });
    };

    for (const file of routeInsight.routeFiles) upsert(file, "route-definition", 100);
    for (const component of routeInsight.componentsUsed) {
      const insight = await this.getComponentInsight(component.componentName);
      for (const file of insight.definitionFiles) upsert(file, "component-definition", 80);
      for (const file of insight.relatedFiles) { if (!candidates.has(file.filePath)) upsert(file, "component-importer", 50); }
    }

    const primarySources = Array.from(candidates.values()).sort((a, b) => b.score !== a.score ? b.score - a.score : a.filePath.localeCompare(b.filePath));
    return { route: routeInsight.route, primarySources, components: routeInsight.componentsUsed };
  }

  async getFileInsight(filePath: string): Promise<IndexedFile | null> {
    const normalized = normalizeRepoPath(filePath);
    const index = this.lastIndex ?? (await this.buildIndex());
    return index.files.find((f) => f.filePath === normalized) ?? null;
  }

  private async walkIndexableFiles(dir: string, results: string[] = []): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = normalizeRepoPath(path.relative(this.rootDir, absolutePath));
      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDED_DIRS.has(entry.name) || relativePath.startsWith(".")) continue;
        await this.walkIndexableFiles(absolutePath, results);
        continue;
      }
      if (entry.isFile() && this.plugins.some((p) => p.supports(absolutePath))) {
        results.push(absolutePath);
      }
    }
    return results;
  }
}
