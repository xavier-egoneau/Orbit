// Types partagés entre tous les plugins et RepoIndexer.

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
  kind: string;
  filePath: string;
  line: number;
};

export type FileAnalysisContext = {
  rootDir: string;
  absolutePath: string;
  filePath: string;
  content: string;
};

export type FileAnalysisResult = {
  language: string;
  imports: ImportReference[];
  symbols: RepoSymbol[];
  componentUsages: ComponentUsage[];
  uiHandlers: UiHandlerReference[];
  routes: RouteReference[];
};

export interface LanguagePlugin {
  readonly name: string;
  supports(filePath: string): boolean;
  analyzeFile(context: FileAnalysisContext): Promise<FileAnalysisResult>;
}
