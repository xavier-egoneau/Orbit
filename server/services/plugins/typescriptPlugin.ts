import path from "node:path";
import ts from "typescript";
import type {
  ComponentUsage,
  FileAnalysisContext,
  FileAnalysisResult,
  ImportReference,
  LanguagePlugin,
  RepoSymbol,
  RouteReference,
  SymbolKind,
  UiHandlerReference,
} from "./languagePlugin.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

function getScriptKind(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath)) {
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

function getLanguageLabel(filePath: string): string {
  const kind = getScriptKind(filePath);
  if (kind === ts.ScriptKind.TS || kind === ts.ScriptKind.TSX) return "typescript";
  if (kind === ts.ScriptKind.JS || kind === ts.ScriptKind.JSX) return "javascript";
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
    const first = node.declarationList.declarations[0];
    if (first && ts.isIdentifier(first.name)) return first.name.text;
  }
  return null;
}

function getSymbolKind(node: ts.Node): SymbolKind | null {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "typeAlias";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isVariableStatement(node)) return "variable";
  return null;
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function getImportSpecifiers(node: ts.ImportDeclaration): string[] {
  const clause = node.importClause;
  if (!clause) return [];
  const specifiers: string[] = [];
  if (clause.name) specifiers.push(clause.name.text);
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      specifiers.push(`* as ${clause.namedBindings.name.text}`);
    } else if (ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        specifiers.push(el.name.text);
      }
    }
  }
  return specifiers;
}

function normalizeRepoPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function deriveFilesystemRoute(rootDir: string, absolutePath: string, filePath: string): RouteReference[] {
  const normalized = normalizeRepoPath(path.relative(rootDir, absolutePath));
  const routes: RouteReference[] = [];

  const appIndexMatch = normalized.match(/^app\/page\.(tsx|ts|jsx|js)$/);
  const appMatch = normalized.match(/^app\/(.+)\/page\.(tsx|ts|jsx|js)$/);
  const pagesMatch = normalized.match(/^pages\/(.+)\.(tsx|ts|jsx|js)$/);

  if (appIndexMatch) {
    routes.push({ route: "/", kind: "filesystem", filePath, line: 1 });
  }

  if (appMatch) {
    routes.push({
      route: `/${appMatch[1].replace(/\/index$/i, "").replace(/\[(.+?)\]/g, ":$1")}`.replace(/\/+/g, "/"),
      kind: "filesystem",
      filePath,
      line: 1,
    });
  }

  if (pagesMatch) {
    const fragment = pagesMatch[1]
      .replace(/\/index$/i, "")
      .replace(/^index$/i, "")
      .replace(/\[(.+?)\]/g, ":$1");
    routes.push({ route: fragment ? `/${fragment}` : "/", kind: "filesystem", filePath, line: 1 });
  }

  return routes;
}

function analyzeTs(ctx: FileAnalysisContext): FileAnalysisResult {
  const { rootDir, absolutePath, filePath, content } = ctx;
  const sourceFile = ts.createSourceFile(absolutePath, content, ts.ScriptTarget.Latest, true, getScriptKind(absolutePath));

  const imports: ImportReference[] = [];
  const symbols: RepoSymbol[] = [];
  const componentUsages: ComponentUsage[] = [];
  const uiHandlers: UiHandlerReference[] = [];
  const routes = deriveFilesystemRoute(rootDir, absolutePath, filePath);

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
        componentUsages.push({ componentName: tagName, filePath, line: getLineNumber(sourceFile, node.getStart(sourceFile)) });
      }

      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || !attr.initializer) continue;
        const eventName = attr.name.getText(sourceFile);
        if (!/^on[A-Z]/.test(eventName)) continue;

        let handlerName = "inline";
        if (
          ts.isJsxExpression(attr.initializer) &&
          attr.initializer.expression &&
          ts.isIdentifier(attr.initializer.expression)
        ) {
          handlerName = attr.initializer.expression.text;
        }
        uiHandlers.push({ eventName, handlerName, filePath, line: getLineNumber(sourceFile, attr.getStart(sourceFile)) });
      }
    }

    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "path" && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) {
        routes.push({ route: node.initializer.text, kind: "react-router", filePath, line: getLineNumber(sourceFile, node.getStart(sourceFile)) });
      }
      if (ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isStringLiteral(node.initializer.expression)) {
        routes.push({ route: node.initializer.expression.text, kind: "react-router", filePath, line: getLineNumber(sourceFile, node.getStart(sourceFile)) });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    language: getLanguageLabel(absolutePath),
    imports,
    symbols,
    componentUsages,
    uiHandlers,
    routes,
  };
}

export class TypeScriptPlugin implements LanguagePlugin {
  readonly name = "typescript";

  supports(filePath: string): boolean {
    return SUPPORTED_EXTENSIONS.has(path.extname(filePath));
  }

  async analyzeFile(ctx: FileAnalysisContext): Promise<FileAnalysisResult> {
    return analyzeTs(ctx);
  }
}
