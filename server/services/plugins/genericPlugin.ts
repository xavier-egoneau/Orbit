import path from "node:path";
import type {
  LanguagePlugin,
  FileAnalysisContext,
  FileAnalysisResult,
  RepoSymbol,
  ImportReference,
  SymbolKind,
} from "./languagePlugin.js";

const SUPPORTED_EXTENSIONS = new Set([".go", ".rb", ".rs", ".java", ".kt", ".php"]);

// Go patterns
const GO_FUNC_RE = /^func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const GO_TYPE_STRUCT_RE = /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+struct\b/;
const GO_IMPORT_SINGLE_RE = /^\s*import\s+"([^"]+)"/;
const GO_IMPORT_BLOCK_RE = /^\s*"([^"]+)"/;

// Ruby patterns
const RUBY_DEF_RE = /^def\s+([A-Za-z_][A-Za-z0-9_?!]*)/;
const RUBY_CLASS_RE = /^class\s+([A-Za-z_][A-Za-z0-9_]*)/;
const RUBY_REQUIRE_RE = /^require(?:_relative)?\s+['"]([^'"]+)['"]/;

// Rust patterns
const RUST_FN_RE = /^(?:pub\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const RUST_STRUCT_RE = /^(?:pub\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)/;
const RUST_ENUM_RE = /^(?:pub\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)/;
const RUST_USE_RE = /^use\s+([\w:]+)/;

// Java/Kotlin patterns
const JAVA_CLASS_RE = /^(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/;
const JAVA_VOID_FN_RE = /(?:public|private|protected|static)\s+(?:static\s+)?(?:\w+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const KOTLIN_FUN_RE = /^(?:(?:public|private|protected|internal|override)\s+)?fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const JAVA_IMPORT_RE = /^import\s+([\w.]+);/;

// PHP patterns
const PHP_FUNC_RE = /^(?:public\s+|private\s+|protected\s+|static\s+)*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const PHP_CLASS_RE = /^(?:abstract\s+|final\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/;
const PHP_USE_RE = /^use\s+([\w\\]+);/;

function detectLanguage(ext: string): string {
  switch (ext) {
    case ".go": return "go";
    case ".rb": return "ruby";
    case ".rs": return "rust";
    case ".java": return "java";
    case ".kt": return "kotlin";
    case ".php": return "php";
    default: return "unknown";
  }
}

function analyzeGo(
  lines: string[],
  filePath: string,
  symbols: RepoSymbol[],
  imports: ImportReference[],
): void {
  let inImportBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Import block detection
    if (/^import\s*\(/.test(trimmed)) {
      inImportBlock = true;
      continue;
    }
    if (inImportBlock) {
      if (trimmed === ")") {
        inImportBlock = false;
        continue;
      }
      const blockMatch = GO_IMPORT_BLOCK_RE.exec(trimmed);
      if (blockMatch) {
        imports.push({ source: blockMatch[1], specifiers: [], isTypeOnly: false, line: lineNum });
      }
      continue;
    }

    // Single import
    const singleImportMatch = GO_IMPORT_SINGLE_RE.exec(trimmed);
    if (singleImportMatch) {
      imports.push({ source: singleImportMatch[1], specifiers: [], isTypeOnly: false, line: lineNum });
      continue;
    }

    // func
    const funcMatch = GO_FUNC_RE.exec(trimmed);
    if (funcMatch) {
      const name = funcMatch[1];
      symbols.push({
        name,
        kind: "function",
        filePath,
        line: lineNum,
        exported: /^[A-Z]/.test(name),
      });
      continue;
    }

    // type ... struct
    const structMatch = GO_TYPE_STRUCT_RE.exec(trimmed);
    if (structMatch) {
      const name = structMatch[1];
      symbols.push({
        name,
        kind: "class",
        filePath,
        line: lineNum,
        exported: /^[A-Z]/.test(name),
      });
    }
  }
}

function analyzeRuby(
  lines: string[],
  filePath: string,
  symbols: RepoSymbol[],
  imports: ImportReference[],
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    const requireMatch = RUBY_REQUIRE_RE.exec(trimmed);
    if (requireMatch) {
      imports.push({ source: requireMatch[1], specifiers: [], isTypeOnly: false, line: lineNum });
      continue;
    }

    const defMatch = RUBY_DEF_RE.exec(trimmed);
    if (defMatch) {
      symbols.push({
        name: defMatch[1],
        kind: "function",
        filePath,
        line: lineNum,
        exported: true,
      });
      continue;
    }

    const classMatch = RUBY_CLASS_RE.exec(trimmed);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: "class",
        filePath,
        line: lineNum,
        exported: true,
      });
    }
  }
}

function analyzeRust(
  lines: string[],
  filePath: string,
  symbols: RepoSymbol[],
  imports: ImportReference[],
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    const useMatch = RUST_USE_RE.exec(trimmed);
    if (useMatch) {
      imports.push({ source: useMatch[1], specifiers: [], isTypeOnly: false, line: lineNum });
      continue;
    }

    const fnMatch = RUST_FN_RE.exec(trimmed);
    if (fnMatch) {
      symbols.push({
        name: fnMatch[1],
        kind: "function",
        filePath,
        line: lineNum,
        exported: /^pub\s+/.test(trimmed),
      });
      continue;
    }

    const structMatch = RUST_STRUCT_RE.exec(trimmed);
    if (structMatch) {
      symbols.push({
        name: structMatch[1],
        kind: "class",
        filePath,
        line: lineNum,
        exported: /^pub\s+/.test(trimmed),
      });
      continue;
    }

    const enumMatch = RUST_ENUM_RE.exec(trimmed);
    if (enumMatch) {
      symbols.push({
        name: enumMatch[1],
        kind: "enum" as SymbolKind,
        filePath,
        line: lineNum,
        exported: /^pub\s+/.test(trimmed),
      });
    }
  }
}

function analyzeJava(
  lines: string[],
  filePath: string,
  symbols: RepoSymbol[],
  imports: ImportReference[],
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    const importMatch = JAVA_IMPORT_RE.exec(trimmed);
    if (importMatch) {
      imports.push({ source: importMatch[1], specifiers: [], isTypeOnly: false, line: lineNum });
      continue;
    }

    const classMatch = JAVA_CLASS_RE.exec(trimmed);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: "class",
        filePath,
        line: lineNum,
        exported: true,
      });
      continue;
    }

    const methodMatch = JAVA_VOID_FN_RE.exec(trimmed);
    if (methodMatch) {
      symbols.push({
        name: methodMatch[1],
        kind: "function",
        filePath,
        line: lineNum,
        exported: true,
      });
    }
  }
}

function analyzeKotlin(
  lines: string[],
  filePath: string,
  symbols: RepoSymbol[],
  imports: ImportReference[],
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Kotlin uses same import syntax as Java
    const importMatch = JAVA_IMPORT_RE.exec(trimmed);
    if (importMatch) {
      imports.push({ source: importMatch[1], specifiers: [], isTypeOnly: false, line: lineNum });
      continue;
    }

    const classMatch = JAVA_CLASS_RE.exec(trimmed);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: "class",
        filePath,
        line: lineNum,
        exported: true,
      });
      continue;
    }

    const funMatch = KOTLIN_FUN_RE.exec(trimmed);
    if (funMatch) {
      symbols.push({
        name: funMatch[1],
        kind: "function",
        filePath,
        line: lineNum,
        exported: true,
      });
    }
  }
}

function analyzePhp(
  lines: string[],
  filePath: string,
  symbols: RepoSymbol[],
  imports: ImportReference[],
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    const useMatch = PHP_USE_RE.exec(trimmed);
    if (useMatch) {
      imports.push({ source: useMatch[1], specifiers: [], isTypeOnly: false, line: lineNum });
      continue;
    }

    const classMatch = PHP_CLASS_RE.exec(trimmed);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: "class",
        filePath,
        line: lineNum,
        exported: true,
      });
      continue;
    }

    const funcMatch = PHP_FUNC_RE.exec(trimmed);
    if (funcMatch) {
      symbols.push({
        name: funcMatch[1],
        kind: "function",
        filePath,
        line: lineNum,
        exported: true,
      });
    }
  }
}

export class GenericPlugin implements LanguagePlugin {
  readonly name = "generic";

  supports(filePath: string): boolean {
    return SUPPORTED_EXTENSIONS.has(path.extname(filePath));
  }

  async analyzeFile(ctx: FileAnalysisContext): Promise<FileAnalysisResult> {
    const ext = path.extname(ctx.filePath);
    const language = detectLanguage(ext);
    const lines = ctx.content.split("\n");
    const symbols: RepoSymbol[] = [];
    const imports: ImportReference[] = [];

    switch (ext) {
      case ".go":
        analyzeGo(lines, ctx.filePath, symbols, imports);
        break;
      case ".rb":
        analyzeRuby(lines, ctx.filePath, symbols, imports);
        break;
      case ".rs":
        analyzeRust(lines, ctx.filePath, symbols, imports);
        break;
      case ".java":
        analyzeJava(lines, ctx.filePath, symbols, imports);
        break;
      case ".kt":
        analyzeKotlin(lines, ctx.filePath, symbols, imports);
        break;
      case ".php":
        analyzePhp(lines, ctx.filePath, symbols, imports);
        break;
    }

    return {
      language,
      imports,
      symbols,
      componentUsages: [],
      uiHandlers: [],
      routes: [],
    };
  }
}
