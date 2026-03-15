import { type PageState, BrowserSessionService } from "./browserSession.js";
import { type GlobalLogEntry, RuntimeBridgeService } from "./runtimeBridge.js";
import { RepoIndexer, type RouteSourceCandidate } from "./repoIndexer.js";

export type SourceCandidate = {
  filePath: string;
  reason: RouteSourceCandidate["reason"];
  score: number;
};

export type PageToSourceResult = {
  url: string;
  routePath: string;
  sourceInsight: {
    route: { route: string; kind: string; filePath: string; line: number };
    primarySources: SourceCandidate[];
    components: Array<{ componentName: string; filePath: string; line: number }>;
  } | null;
};

export type DiagnosticReport = {
  timestamp: string;
  indexStatus: { built: boolean; filesIndexed: number };
  page: PageState | null;
  consoleErrors: string[];
  runtimeErrors: GlobalLogEntry[];
  detectedRoute: string | null;
  sourceCandidates: SourceCandidate[] | null;
};

export class DiagnosticsService {
  constructor(
    private readonly browserSession: BrowserSessionService,
    private readonly runtimeBridge: RuntimeBridgeService,
    private readonly repoIndexer: RepoIndexer
  ) {}

  async getPageState(): Promise<PageState | null> {
    return this.browserSession.getPageState();
  }

  async currentPageToSource(): Promise<PageToSourceResult | null> {
    const pageState = await this.browserSession.getPageState();
    if (!pageState) {
      return null;
    }

    let routePath: string;
    try {
      routePath = new URL(pageState.url).pathname;
    } catch {
      routePath = pageState.url;
    }

    const insight = await this.repoIndexer.getRouteSourceInsight(routePath);

    return {
      url: pageState.url,
      routePath,
      sourceInsight: insight
        ? {
            route: insight.route,
            primarySources: insight.primarySources.map((c) => ({
              filePath: c.filePath,
              reason: c.reason,
              score: c.score,
            })),
            components: insight.components,
          }
        : null,
    };
  }

  async diagnose(options?: { consoleLogLimit?: number }): Promise<DiagnosticReport> {
    const consoleLogLimit = options?.consoleLogLimit ?? 20;
    const pageState = await this.browserSession.getPageState();

    const consoleErrors = (pageState?.recentConsoleLogs ?? []).filter(
      (log) => log.startsWith("[error]") || log.startsWith("[pageerror]")
    );

    const runtimeErrors = this.runtimeBridge.getGlobalRecentLogs(50, "errors");

    let detectedRoute: string | null = null;
    let sourceCandidates: SourceCandidate[] | null = null;

    if (pageState) {
      try {
        detectedRoute = new URL(pageState.url).pathname;
        const insight = await this.repoIndexer.getRouteSourceInsight(detectedRoute);
        if (insight) {
          sourceCandidates = insight.primarySources.map((c) => ({
            filePath: c.filePath,
            reason: c.reason,
            score: c.score,
          }));
        }
      } catch {
        // URL invalide ou route introuvable dans l'index.
      }
    }

    const clampedPage: PageState | null = pageState
      ? {
          ...pageState,
          recentConsoleLogs: pageState.recentConsoleLogs.slice(-consoleLogLimit),
        }
      : null;

    const lastIndex = this.repoIndexer.getLastIndex();
    const indexStatus = lastIndex
      ? { built: true, filesIndexed: lastIndex.files.length }
      : { built: false, filesIndexed: 0 };

    return {
      timestamp: new Date().toISOString(),
      indexStatus,
      page: clampedPage,
      consoleErrors,
      runtimeErrors,
      detectedRoute,
      sourceCandidates,
    };
  }
}
