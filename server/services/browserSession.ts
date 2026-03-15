import {
  chromium,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from "playwright";

type BrowserSessionState = {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  consoleLogs: string[];
  navigationHistory: string[];
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

export class BrowserSessionService {
  private readonly maxConsoleLogs: number;
  private readonly state: BrowserSessionState = {
    browser: null,
    context: null,
    page: null,
    consoleLogs: [],
    navigationHistory: [],
  };

  constructor(options?: { maxConsoleLogs?: number }) {
    this.maxConsoleLogs = options?.maxConsoleLogs ?? 200;
  }

  isReady(): boolean {
    return Boolean(this.state.page);
  }

  getNavigationHistory(): string[] {
    return [...this.state.navigationHistory];
  }

  async open(url: string, waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit" = "load") {
    const page = await this.ensurePage();

    if (this.state.page) {
      const currentUrl = this.state.page.url();
      if (currentUrl && currentUrl !== "about:blank") {
        this.state.navigationHistory.push(currentUrl);
        if (this.state.navigationHistory.length > 10) {
          this.state.navigationHistory.shift();
        }
      }
    }

    await page.goto(url, {
      waitUntil,
      timeout: 30_000,
    });

    return {
      url: page.url(),
      title: await page.title(),
    };
  }

  async executeJs(expression: string) {
    const page = await this.ensurePage();
    const result = await page.evaluate((expr: string) => {
      // Risque : eval() exécute du code arbitraire dans le contexte de la page.
      // Usage limité à un navigateur local contrôlé — ne jamais exposer à une entrée non fiable.
      // eslint-disable-next-line no-eval
      return eval(expr);
    }, expression);

    return {
      expression,
      result,
    };
  }

  async screenshot(outputPath: string, fullPage = true) {
    const page = await this.ensurePage();
    await page.screenshot({
      path: outputPath,
      fullPage,
    });

    return {
      outputPath,
      currentUrl: page.url(),
    };
  }

  async getPageState(): Promise<PageState | null> {
    if (!this.state.page) {
      return null;
    }

    const page = this.state.page;
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
      recentConsoleLogs: [...this.state.consoleLogs].slice(-20),
    };
  }

  readConsoleLogs(limit?: number, clearAfterRead?: boolean) {
    const logs =
      typeof limit === "number"
        ? this.state.consoleLogs.slice(-limit)
        : [...this.state.consoleLogs];

    if (clearAfterRead) {
      this.state.consoleLogs.length = 0;
    }

    return {
      count: logs.length,
      logs,
    };
  }

  async close() {
    if (this.state.page) {
      await this.state.page.close().catch(() => undefined);
    }

    if (this.state.context) {
      await this.state.context.close().catch(() => undefined);
    }

    if (this.state.browser) {
      await this.state.browser.close().catch(() => undefined);
    }

    this.state.page = null;
    this.state.context = null;
    this.state.browser = null;
    this.state.consoleLogs = [];
    this.state.navigationHistory = [];
  }

  private async ensurePage(): Promise<Page> {
    if (!this.state.browser) {
      this.state.browser = await chromium.launch({
        headless: true,
      });
    }

    if (!this.state.context) {
      this.state.context = await this.state.browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
    }

    if (!this.state.page) {
      this.state.page = await this.state.context.newPage();
      this.attachPageListeners(this.state.page);
    }

    return this.state.page;
  }

  private attachPageListeners(page: Page) {
    page.on("console", (message: ConsoleMessage) => {
      this.pushConsoleLog(`[${message.type()}] ${message.text()}`);
    });

    page.on("pageerror", (error: Error) => {
      this.pushConsoleLog(`[pageerror] ${error.message}`);
    });
  }

  private pushConsoleLog(entry: string) {
    this.state.consoleLogs.push(entry);

    if (this.state.consoleLogs.length > this.maxConsoleLogs) {
      this.state.consoleLogs.shift();
    }
  }
}
