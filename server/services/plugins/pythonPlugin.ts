import type {
  LanguagePlugin,
  FileAnalysisContext,
  FileAnalysisResult,
  RepoSymbol,
  ImportReference,
  RouteReference,
} from "./languagePlugin.js";

const CLASS_RE = /^(class\s+(\w+)\s*(?:\([^)]*\))?\s*:)/;
const FUNC_RE = /^(def\s+(\w+)\s*\()/;
const IMPORT_RE = /^import\s+(\w+)(?:\s+as\s+(\w+))?/;
const FROM_IMPORT_RE = /^from\s+(\S+)\s+import\s+(.+)/;
const ROUTE_DECORATOR_RE = /^@(\w+)\.(get|post|put|patch|delete|options|route)\s*\(\s*["']([^"']+)["']/;

export class PythonPlugin implements LanguagePlugin {
  readonly name = "python";

  supports(filePath: string): boolean {
    return filePath.endsWith(".py");
  }

  async analyzeFile(ctx: FileAnalysisContext): Promise<FileAnalysisResult> {
    const lines = ctx.content.split("\n");

    const symbols: RepoSymbol[] = [];
    const imports: ImportReference[] = [];
    const routes: RouteReference[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const trimmed = line.trimEnd();
      const isTopLevel = trimmed.length > 0 && trimmed[0] !== " " && trimmed[0] !== "\t";

      // Route decorators
      const routeMatch = trimmed.match(ROUTE_DECORATOR_RE);
      if (routeMatch) {
        const method = routeMatch[2];
        const routePath = routeMatch[3];
        routes.push({
          route: routePath,
          kind: method === "route" ? "flask" : "fastapi",
          filePath: ctx.filePath,
          line: lineNumber,
        });
        continue;
      }

      // Classes
      const classMatch = trimmed.match(CLASS_RE);
      if (classMatch) {
        symbols.push({
          name: classMatch[2],
          kind: "class",
          filePath: ctx.filePath,
          line: lineNumber,
          exported: isTopLevel,
        });
        continue;
      }

      // Functions
      const funcMatch = trimmed.match(FUNC_RE);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[2],
          kind: "function",
          filePath: ctx.filePath,
          line: lineNumber,
          exported: isTopLevel,
        });
        continue;
      }

      // import x [as y]
      const importMatch = trimmed.match(IMPORT_RE);
      if (importMatch) {
        const source = importMatch[1];
        const alias = importMatch[2];
        imports.push({
          source,
          specifiers: alias ? [alias] : [],
          isTypeOnly: false,
          line: lineNumber,
        });
        continue;
      }

      // from x import a, b
      const fromMatch = trimmed.match(FROM_IMPORT_RE);
      if (fromMatch) {
        const source = fromMatch[1];
        const specifiers = fromMatch[2]
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        imports.push({
          source,
          specifiers,
          isTypeOnly: false,
          line: lineNumber,
        });
        continue;
      }
    }

    return {
      language: "python",
      imports,
      symbols,
      componentUsages: [],
      uiHandlers: [],
      routes,
    };
  }
}
