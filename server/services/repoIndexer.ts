import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { PersistenceService } from "./persistence.js";

const DEFAULT_EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
]);

const INDEXABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "typeAlias"
  | "enum"
  | "variable";

export type RepoSymbol = {
  name: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  exported: boolean;
};

export type ImportReference = {
  source: string;
  specifiers: string[];
  isTypeOnly: boolean;
  line: number;
};

export type ComponentUsage = {
  componentName: string;
  filePath: string;
  line: number;
};

export type UiHandlerReference = {
  eventName: string;
  handlerName: string;
  filePath: string;
  line: number;
};

export type RouteReference = {
  route: string;
  kind: "filesystem" | "react-router";
  filePath: string;
  line: number;
};

export type IndexedFile = {
  filePath: string;
  absolutePath: string;
  language: "typescript" | "javascript" | "unknown";
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
  importingFiles: Array<{
    filePath: string;
    imports: ImportReference[];
  }>;
  relatedFiles: IndexedFile[];
  uiHandlersNearDefinitions: UiHandlerReference[];
};

export type SymbolInsight = {
  symbolName: string;
  definitions: RepoSymbol[];
  definitionFiles: IndexedFile[];
  importingFiles: Array<{
    filePath: string;
    imports: ImportReference[];
  }>;
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

function isIndexableFile(filePath: string): boolean {
  return INDEXABLE_EXTENSIONS.has(path.extname(filePath));
}

function getScriptKind(filePath: string): ts.ScriptKind {
  const extension = path.extname(filePath);

  switch (extension) {
    case ".ts":
      return ts.ScriptKind.TS;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.Unknown;
  }
}

function getLanguage(filePath: string): IndexedFile["language"] {
  const scriptKind = getScriptKind(filePath);

  if (scriptKind === ts.ScriptKind.TS || scriptKind === ts.ScriptKind.TSX) {
    return "typescript";
  }

  if (
    scriptKind === ts.ScriptKind.JS ||
    scriptKind === ts.ScriptKind.JSX
  ) {
    return "javascript";
  }

  return "unknown";
}

function getLineNumber(sourceFile: ts.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function getNodeName(node: ts.Node): string | null {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name?.getText() ?? null;
  }

  if (ts.isVariableStatement(node)) {
    const firstDeclaration = node.declarationList.declarations[0];
    if (firstDeclaration && ts.isIdentifier(firstDeclaration.name)) {
      return firstDeclaration.name.text;
    }
  }

  return null;
}

function getSymbolKind(node: ts.Node): SymbolKind | null {
  if (ts.isFunctionDeclaration(node)) {
    return "function";
  }

  if (ts.isClassDeclaration(node)) {
    return "class";
  }

  if (ts.isInterfaceDeclaration(node)) {
    return "interface";
  }

  if (ts.isTypeAliasDeclaration(node)) {
    return "typeAlias";
  }

  if (ts.isEnumDeclaration(node)) {
    return "enum";
  }

  if (ts.isVariableStatement(node)) {
    return "variable";
  }

  return null;
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function getImportSpecifiers(node: ts.ImportDeclaration): string[] {
  const clause = node.importClause;

  if (!clause) {
    return [];
  }

  const specifiers: string[] = [];

  if (clause.name) {
    specifiers.push(clause.name.text);
  }

  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      specifiers.push(`* as ${clause.namedBindings.name.text}`);
    }

    if (ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        specifiers.push(element.name.text);
      }
    }
  }

  return specifiers;
}

function deriveFilesystemRoute(rootDir: string, filePath: string): RouteReference[] {
  const normalizedPath = normalizeRepoPath(path.relative(rootDir, filePath));
  const routes: RouteReference[] = [];

  const appMatch = normalizedPath.match(/^app\/(.+)\/page\.(tsx|ts|jsx|js)$/);
  const appIndexMatch = normalizedPath.match(/^app\/page\.(tsx|ts|jsx|js)$/);
  const pagesMatch = normalizedPath.match(/^pages\/(.+)\.(tsx|ts|jsx|js)$/);

  if (appIndexMatch) {
    routes.push({
      route: "/",
      kind: "filesystem",
      filePath: normalizedPath,
      line: 1,
    });
  }

  if (appMatch) {
    routes.push({
      route: `/${appMatch[1].replace(/\/index$/i, "").replace(/\[(.+?)\]/g, ":$1")}`.replace(
        /\/+/g,
        "/"
      ),
      kind: "filesystem",
      filePath: normalizedPath,
      line: 1,
    });
  }

  if (pagesMatch) {
    const routeFragment = pagesMatch[1]
      .replace(/\/index$/i, "")
      .replace(/^index$/i, "")
      .replace(/\[(.+?)\]/g, ":$1");

    routes.push({
      route: routeFragment ? `/${routeFragment}` : "/",
      kind: "filesystem",
      filePath: normalizedPath,
      line: 1,
    });
  }

  return routes;
}

function createSourceFile(absolutePath: string, content: string): ts.SourceFile {
  return ts.createSourceFile(
    absolutePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(absolutePath)
  );
}

function analyzeSourceFile(rootDir: string, absolutePath: string, sourceFile: ts.SourceFile): IndexedFile {
  const filePath = normalizeRepoPath(path.relative(rootDir, absolutePath));
  const imports: ImportReference[] = [];
  const symbols: RepoSymbol[] = [];
  const componentUsages: ComponentUsage[] = [];
  const uiHandlers: UiHandlerReference[] = [];
  const routes = deriveFilesystemRoute(rootDir, absolutePath);

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({
        source: node.moduleSpecifier.text,
        specifiers: getImportSpecifiers(node),
        isTypeOnly: Boolean(node.importClause?.isTypeOnly),
        line: getLineNumber(sourceFile, node.getStart(sourceFile)),
      });
    }

    const symbolKind = getSymbolKind(node);
    const symbolName = getNodeName(node);
    if (symbolKind && symbolName) {
      symbols.push({
        name: symbolName,
        kind: symbolKind,
        filePath,
        line: getLineNumber(sourceFile, node.getStart(sourceFile)),
        exported: hasExportModifier(node),
      });
    }

    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (/^[A-Z]/.test(tagName)) {
        componentUsages.push({
          componentName: tagName,
          filePath,
          line: getLineNumber(sourceFile, node.getStart(sourceFile)),
        });
      }

      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !attribute.initializer) {
          continue;
        }

        const eventName = attribute.name.getText(sourceFile);
        if (!/^on[A-Z]/.test(eventName)) {
          continue;
        }

        let handlerName = "inline";

        if (
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression &&
          ts.isIdentifier(attribute.initializer.expression)
        ) {
          handlerName = attribute.initializer.expression.text;
        }

        uiHandlers.push({
          eventName,
          handlerName,
          filePath,
          line: getLineNumber(sourceFile, attribute.getStart(sourceFile)),
        });
      }
    }

    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "path" && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) {
        routes.push({
          route: node.initializer.text,
          kind: "react-router",
          filePath,
          line: getLineNumber(sourceFile, node.getStart(sourceFile)),
        });
      }

      if (
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression &&
        ts.isStringLiteral(node.initializer.expression)
      ) {
        routes.push({
          route: node.initializer.expression.text,
          kind: "react-router",
          filePath,
          line: getLineNumber(sourceFile, node.getStart(sourceFile)),
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    filePath,
    absolutePath,
    language: getLanguage(absolutePath),
    imports,
    symbols,
    componentUsages,
    uiHandlers,
    routes,
  };
}

export class RepoIndexer {
  private readonly rootDir: string;
  private readonly persistence: PersistenceService | null;
  private lastIndex: RepoIndex | null = null;

  constructor(rootDir: string, persistence?: PersistenceService) {
    this.rootDir = path.resolve(rootDir);
    this.persistence = persistence ?? null;
  }

  async loadCachedIndex(): Promise<RepoIndex | null> {
    if (!this.persistence) {
      return null;
    }
    const cached = await this.persistence.loadIndex();
    if (cached) {
      this.lastIndex = cached;
    }
    return cached;
  }

  getRootDir(): string {
    return this.rootDir;
  }

  getLastIndex(): RepoIndex | null {
    return this.lastIndex;
  }

  async buildIndex(): Promise<RepoIndex> {
    const absolutePaths = await this.walkIndexableFiles(this.rootDir);
    const files: IndexedFile[] = [];

    for (const absolutePath of absolutePaths) {
      const indexedFile = await this.indexFile(absolutePath);
      if (indexedFile) {
        files.push(indexedFile);
      }
    }

    const repoIndex: RepoIndex = {
      rootDir: this.rootDir,
      createdAt: new Date().toISOString(),
      files,
      symbols: files.flatMap((file) => file.symbols),
      routes: files.flatMap((file) => file.routes),
      componentUsages: files.flatMap((file) => file.componentUsages),
      uiHandlers: files.flatMap((file) => file.uiHandlers),
    };

    this.lastIndex = repoIndex;
    await this.persistence?.saveIndex(repoIndex);
    return repoIndex;
  }

  async indexFile(inputPath: string): Promise<IndexedFile | null> {
    const absolutePath = path.resolve(this.rootDir, inputPath);

    if (!isInsideRoot(this.rootDir, absolutePath) || !isIndexableFile(absolutePath)) {
      return null;
    }

    const content = await fs.readFile(absolutePath, "utf8");
    const sourceFile = createSourceFile(absolutePath, content);
    return analyzeSourceFile(this.rootDir, absolutePath, sourceFile);
  }

  async refreshFile(inputPath: string): Promise<IndexedFile | null> {
    const indexedFile = await this.indexFile(inputPath);
    if (!this.lastIndex || !indexedFile) {
      return indexedFile;
    }

    this.lastIndex.files = this.lastIndex.files.filter((file) => file.filePath !== indexedFile.filePath);
    this.lastIndex.files.push(indexedFile);
    this.lastIndex.symbols = this.lastIndex.files.flatMap((file) => file.symbols);
    this.lastIndex.routes = this.lastIndex.files.flatMap((file) => file.routes);
    this.lastIndex.componentUsages = this.lastIndex.files.flatMap((file) => file.componentUsages);
    this.lastIndex.uiHandlers = this.lastIndex.files.flatMap((file) => file.uiHandlers);
    this.lastIndex.createdAt = new Date().toISOString();

    return indexedFile;
  }

  async findSymbols(query: string): Promise<RepoSymbol[]> {
    const index = this.lastIndex ?? (await this.buildIndex());
    const lowered = normalizeQuery(query);
    return index.symbols.filter((symbol) => symbol.name.toLowerCase().includes(lowered));
  }

  async findRoutes(query?: string): Promise<RouteReference[]> {
    const index = this.lastIndex ?? (await this.buildIndex());
    if (!query) {
      return index.routes;
    }

    const lowered = normalizeQuery(query);
    return index.routes.filter((route) => route.route.toLowerCase().includes(lowered));
  }

  async findComponentUsages(componentName: string): Promise<ComponentUsage[]> {
    const index = this.lastIndex ?? (await this.buildIndex());
    const normalizedName = normalizeQuery(componentName);
    return index.componentUsages.filter((usage) => usage.componentName.toLowerCase() === normalizedName);
  }

  async findUiHandlers(query?: string): Promise<UiHandlerReference[]> {
    const index = this.lastIndex ?? (await this.buildIndex());
    if (!query) {
      return index.uiHandlers;
    }

    const lowered = normalizeQuery(query);
    return index.uiHandlers.filter(
      (handler) =>
        handler.handlerName.toLowerCase().includes(lowered) ||
        handler.eventName.toLowerCase().includes(lowered)
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
      .map((file) => ({
        filePath: file.filePath,
        imports: file.imports.filter((entry) => entry.source.toLowerCase().includes(lowered)),
      }))
      .filter((entry) => entry.imports.length > 0);
  }

  async findFilesUsingSymbol(symbolName: string): Promise<IndexedFile[]> {
    const index = this.lastIndex ?? (await this.buildIndex());
    const normalizedName = normalizeQuery(symbolName);

    return index.files.filter(
      (file) =>
        file.symbols.some((symbol) => symbol.name.toLowerCase() === normalizedName) ||
        file.componentUsages.some((usage) => usage.componentName.toLowerCase() === normalizedName) ||
        file.uiHandlers.some((handler) => handler.handlerName.toLowerCase() === normalizedName)
    );
  }

  async getComponentInsight(componentName: string): Promise<ComponentInsight> {
    const symbolInsight = await this.getSymbolInsight(componentName);
    const normalizedName = normalizeQuery(componentName);
    const index = this.lastIndex ?? (await this.buildIndex());
    const usages = index.componentUsages.filter(
      (usage) => usage.componentName.toLowerCase() === normalizedName
    );

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
    const normalizedName = normalizeQuery(symbolName);
    const definitions = index.symbols.filter(
      (symbol) => symbol.name.toLowerCase() === normalizedName
    );
    const definitionFilePaths = new Set(definitions.map((definition) => definition.filePath));
    const definitionFiles = index.files.filter((file) => definitionFilePaths.has(file.filePath));
    const importingFiles = index.files
      .map((file) => ({
        filePath: file.filePath,
        imports: file.imports.filter((entry) =>
          entry.specifiers.some((specifier) => specifier.toLowerCase() === normalizedName)
        ),
      }))
      .filter((entry) => entry.imports.length > 0);
    const relatedFiles = index.files.filter((file) => {
      if (definitionFilePaths.has(file.filePath)) {
        return true;
      }

      if (importingFiles.some((entry) => entry.filePath === file.filePath)) {
        return true;
      }

      if (
        file.componentUsages.some((usage) => usage.componentName.toLowerCase() === normalizedName)
      ) {
        return true;
      }

      if (
        file.uiHandlers.some((handler) => handler.handlerName.toLowerCase() === normalizedName)
      ) {
        return true;
      }

      return false;
    });
    const uiHandlers = relatedFiles.flatMap((file) =>
      file.uiHandlers.filter(
        (handler) =>
          handler.handlerName.toLowerCase() === normalizedName ||
          definitionFilePaths.has(file.filePath)
      )
    );
    const componentUsages = relatedFiles.flatMap((file) =>
      file.componentUsages.filter((usage) => usage.componentName.toLowerCase() === normalizedName)
    );

    return {
      symbolName,
      definitions,
      definitionFiles,
      importingFiles,
      relatedFiles,
      uiHandlers,
      componentUsages,
    };
  }

  async getRouteInsight(routeQuery: string): Promise<RouteInsight | null> {
    const index = this.lastIndex ?? (await this.buildIndex());
    const lowered = normalizeQuery(routeQuery);
    const route = index.routes.find((entry) => entry.route.toLowerCase() === lowered) ??
      index.routes.find((entry) => entry.route.toLowerCase().includes(lowered));

    if (!route) {
      return null;
    }

    const routeFiles = index.files.filter((file) => file.filePath === route.filePath);
    const componentsUsed = routeFiles.flatMap((file) => file.componentUsages);
    const uiHandlers = routeFiles.flatMap((file) => file.uiHandlers);

    return {
      route,
      routeFiles,
      componentsUsed,
      uiHandlers,
    };
  }

  async getRouteSourceInsight(routeQuery: string): Promise<RouteSourceInsight | null> {
    const routeInsight = await this.getRouteInsight(routeQuery);
    if (!routeInsight) {
      return null;
    }

    const candidates = new Map<string, RouteSourceCandidate>();

    const upsertCandidate = (
      file: IndexedFile,
      reason: RouteSourceCandidate["reason"],
      score: number
    ) => {
      const existing = candidates.get(file.filePath);
      if (existing) {
        existing.score = Math.max(existing.score, score);
        return;
      }

      candidates.set(file.filePath, {
        filePath: file.filePath,
        reason,
        score,
        symbols: file.symbols,
        imports: file.imports,
        uiHandlers: file.uiHandlers,
      });
    };

    for (const file of routeInsight.routeFiles) {
      upsertCandidate(file, "route-definition", 100);
    }

    for (const component of routeInsight.componentsUsed) {
      const componentInsight = await this.getComponentInsight(component.componentName);

      for (const file of componentInsight.definitionFiles) {
        upsertCandidate(file, "component-definition", 80);
      }

      for (const file of componentInsight.relatedFiles) {
        if (!candidates.has(file.filePath)) {
          upsertCandidate(file, "component-importer", 50);
        }
      }
    }

    const primarySources = Array.from(candidates.values()).sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.filePath.localeCompare(right.filePath);
    });

    return {
      route: routeInsight.route,
      primarySources,
      components: routeInsight.componentsUsed,
    };
  }

  async getFileInsight(filePath: string): Promise<IndexedFile | null> {
    const normalizedPath = normalizeRepoPath(filePath);
    const index = this.lastIndex ?? (await this.buildIndex());
    return index.files.find((file) => file.filePath === normalizedPath) ?? null;
  }

  private async walkIndexableFiles(dir: string, results: string[] = []): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = normalizeRepoPath(path.relative(this.rootDir, absolutePath));

      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDED_DIRS.has(entry.name) || relativePath.startsWith(".")) {
          continue;
        }

        await this.walkIndexableFiles(absolutePath, results);
        continue;
      }

      if (entry.isFile() && isIndexableFile(absolutePath)) {
        results.push(absolutePath);
      }
    }

    return results;
  }
}
