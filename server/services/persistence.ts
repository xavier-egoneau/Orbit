import fs from "node:fs/promises";
import path from "node:path";
import type { RepoIndex } from "./repoIndexer.js";

const CACHE_DIR = ".orbit";
const CACHE_FILE = "index-cache.json";

export class PersistenceService {
  private readonly cacheFilePath: string;

  constructor(rootDir: string) {
    this.cacheFilePath = path.join(rootDir, CACHE_DIR, CACHE_FILE);
  }

  async saveIndex(index: RepoIndex): Promise<void> {
    await fs.mkdir(path.dirname(this.cacheFilePath), { recursive: true });
    await fs.writeFile(this.cacheFilePath, JSON.stringify(index), "utf8");
  }

  async loadIndex(): Promise<RepoIndex | null> {
    try {
      const raw = await fs.readFile(this.cacheFilePath, "utf8");
      return JSON.parse(raw) as RepoIndex;
    } catch {
      return null;
    }
  }

  async clearCache(): Promise<void> {
    try {
      await fs.unlink(this.cacheFilePath);
    } catch {
      // Pas de cache à supprimer.
    }
  }

  getCacheFilePath(): string {
    return this.cacheFilePath;
  }
}
