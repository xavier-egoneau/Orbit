import {
  chromium,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from "playwright";

type Tab = {
  id: string;
  page: Page;
  consoleLogs: string[];
  navigationHistory: string[];
};

type BrowserSessionState = {
  browser: Browser | null;
  context: BrowserContext | null;
  tabs: Map<string, Tab>;
  activeTabId: string | null;
};

export type PageInteractiveElement = {
  tag: string;
  text: string;
  type: string | null;
  href: string | null;
};

export type PageState = {
  url: string;
  title: string;
  visibleText: string;
  interactiveElements: PageInteractiveElement[];
  recentConsoleLogs: string[];
};

export type TabSnapshot = {
  id: string;
  url: string;
  title: string;
  active: boolean;
};

export class BrowserSessionService {
  private readonly maxConsoleLogs: number;
  private nextTabId = 1;
  private readonly state: BrowserSessionState = {
    browser: null,
    context: null,
    tabs: new Map(),
    activeTabId: null,
  };

  constructor(options?: { maxConsoleLogs?: number }) {
    this.maxConsoleLogs = options?.maxConsoleLogs ?? 200;
  }

  isReady(): boolean {
    return this.state.activeTabId !== null;
  }

  // ── Tab management ────────────────────────────────────────────────────────

  async newTab(url?: string, waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit" = "load"): Promise<TabSnapshot> {
    const context = await this.ensureContext();
    const page = await context.newPage();
    const id = `tab_${this.nextTabId++}`;
    const tab: Tab = { id, page, consoleLogs: [], navigationHistory: [] };

    this.attachPageListeners(tab);
    this.state.tabs.set(id, tab);
    this.state.activeTabId = id;

    if (url) {
      await page.goto(url, { waitUntil, timeout: 30_000 });
    }

    return this.toTabSnapshot(tab);
  }

  async switchTab(tabId: string): Promise<TabSnapshot> {
    const tab = this.state.tabs.get(tabId);
    if (!tab) {
      throw new Error(`Onglet introuvable: ${tabId}`);
    }
    this.state.activeTabId = tabId;
    return this.toTabSnapshot(tab);
  }

  async listTabs(): Promise<TabSnapshot[]> {
    const snapshots: TabSnapshot[] = [];
    for (const tab of this.state.tabs.values()) {
      snapshots.push(await this.toTabSnapshotAsync(tab));
    }
    return snapshots;
  }

  async closeTab(tabId?: string): Promise<void> {
    const id = tabId ?? this.state.activeTabId;
    if (!id) {
      throw new Error("Aucun onglet ouvert.");
    }
    const tab = this.state.tabs.get(id);
    if (!tab) {
      throw new Error(`Onglet introuvable: ${id}`);
    }

    await tab.page.close().catch(() => undefined);
    this.state.tabs.delete(id);

    if (this.state.activeTabId === id) {
      const remaining = [...this.state.tabs.keys()];
      this.state.activeTabId = remaining[remaining.length - 1] ?? null;
    }
  }

  // ── Active tab operations ─────────────────────────────────────────────────

  getNavigationHistory(): string[] {
    const tab = this.activeTab();
    return tab ? [...tab.navigationHistory] : [];
  }

  async open(url: string, waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit" = "load") {
    let tab = this.activeTab();

    if (!tab) {
      await this.newTab();
      tab = this.activeTab()!;
    }

    const currentUrl = tab.page.url();
    if (currentUrl && currentUrl !== "about:blank") {
      tab.navigationHistory.push(currentUrl);
      if (tab.navigationHistory.length > 10) {
        tab.navigationHistory.shift();
      }
    }

    await tab.page.goto(url, { waitUntil, timeout: 30_000 });

    return {
      tabId: tab.id,
      url: tab.page.url(),
      title: await tab.page.title(),
    };
  }

  async executeJs(expression: string) {
    const page = await this.ensureActivePage();
    const result = await page.evaluate((expr: string) => {
      // Risque : eval() exécute du code arbitraire dans le contexte de la page.
      // Usage limité à un navigateur local contrôlé — ne jamais exposer à une entrée non fiable.
      // eslint-disable-next-line no-eval
      return eval(expr);
    }, expression);

    return { expression, result };
  }

  async screenshot(outputPath: string, fullPage = true) {
    const page = await this.ensureActivePage();
    await page.screenshot({ path: outputPath, fullPage });
    return { outputPath, currentUrl: page.url() };
  }

  async getPageState(): Promise<PageState | null> {
    const tab = this.activeTab();
    if (!tab) {
      return null;
    }

    const page = tab.page;
    const url = page.url();
    const title = await page.title().catch(() => "");

    let visibleText = "";
    let interactiveElements: PageInteractiveElement[] = [];

    try {
      const domData = await page.evaluate(() => {
        const bodyText = (document.body?.innerText ?? "").trim().slice(0, 3000);
        const selectors = 'button, a[href], input, select, textarea, [role="button"], [role="link"]';
        const interactives = Array.from(document.querySelectorAll(selectors))
          .slice(0, 50)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent ?? "").trim().slice(0, 100),
            type: (el as HTMLInputElement).type || null,
            href: (el as HTMLAnchorElement).href || null,
          }));
        return { bodyText, interactives };
      });
      visibleText = domData.bodyText;
      interactiveElements = domData.interactives;
    } catch {
      // Page en cours de navigation ou contexte non disponible.
    }

    return {
      url,
      title,
      visibleText,
      interactiveElements,
      recentConsoleLogs: [...tab.consoleLogs].slice(-20),
    };
  }

  readConsoleLogs(limit?: number, clearAfterRead?: boolean) {
    const tab = this.activeTab();
    const logs = tab
      ? typeof limit === "number"
        ? tab.consoleLogs.slice(-limit)
        : [...tab.consoleLogs]
      : [];

    if (clearAfterRead && tab) {
      tab.consoleLogs.length = 0;
    }

    return { count: logs.length, logs };
  }

  async close() {
    for (const tab of this.state.tabs.values()) {
      await tab.page.close().catch(() => undefined);
    }
    this.state.tabs.clear();
    this.state.activeTabId = null;

    if (this.state.context) {
      await this.state.context.close().catch(() => undefined);
      this.state.context = null;
    }

    if (this.state.browser) {
      await this.state.browser.close().catch(() => undefined);
      this.state.browser = null;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private activeTab(): Tab | null {
    if (!this.state.activeTabId) return null;
    return this.state.tabs.get(this.state.activeTabId) ?? null;
  }

  private async ensureActivePage(): Promise<Page> {
    const tab = this.activeTab();
    if (tab) return tab.page;
    await this.newTab();
    return this.activeTab()!.page;
  }

  private async ensureContext(): Promise<BrowserContext> {
    if (!this.state.browser) {
      this.state.browser = await chromium.launch({ headless: true });
    }
    if (!this.state.context) {
      this.state.context = await this.state.browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
    }
    return this.state.context;
  }

  private attachPageListeners(tab: Tab) {
    tab.page.on("console", (message: ConsoleMessage) => {
      this.pushConsoleLog(tab, `[${message.type()}] ${message.text()}`);
    });
    tab.page.on("pageerror", (error: Error) => {
      this.pushConsoleLog(tab, `[pageerror] ${error.message}`);
    });
  }

  private pushConsoleLog(tab: Tab, entry: string) {
    tab.consoleLogs.push(entry);
    if (tab.consoleLogs.length > this.maxConsoleLogs) {
      tab.consoleLogs.shift();
    }
  }

  private toTabSnapshot(tab: Tab): TabSnapshot {
    return {
      id: tab.id,
      url: tab.page.url(),
      title: "",
      active: tab.id === this.state.activeTabId,
    };
  }

  private async toTabSnapshotAsync(tab: Tab): Promise<TabSnapshot> {
    return {
      id: tab.id,
      url: tab.page.url(),
      title: await tab.page.title().catch(() => ""),
      active: tab.id === this.state.activeTabId,
    };
  }
}
