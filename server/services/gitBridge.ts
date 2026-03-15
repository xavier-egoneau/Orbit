import { exec as execCallback } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execCallback);

export type GitStatusEntry = {
  staged: string;
  unstaged: string;
  filePath: string;
};

export type GitCommit = {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
};

export type GitBlameLine = {
  lineNumber: number;
  hash: string;
  author: string;
  date: string;
  content: string;
};

export class GitBridgeService {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  async status(): Promise<{ branch: string; entries: GitStatusEntry[] }> {
    const [branchOut, statusOut] = await Promise.all([
      this.git("rev-parse --abbrev-ref HEAD"),
      this.git("status --porcelain"),
    ]);

    const branch = branchOut.stdout.trim() || "HEAD";
    const entries: GitStatusEntry[] = statusOut.stdout
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => ({
        staged: line[0] ?? " ",
        unstaged: line[1] ?? " ",
        filePath: line.slice(3).trim(),
      }));

    return { branch, entries };
  }

  async log(limit = 20): Promise<GitCommit[]> {
    const format = "%H%x00%h%x00%an%x00%ai%x00%s";
    const { stdout } = await this.git(`log --max-count=${limit} --format=${format}`);

    return stdout
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [hash = "", shortHash = "", author = "", date = "", ...rest] = line.split("\x00");
        return { hash, shortHash, author, date, message: rest.join("\x00") };
      });
  }

  async diff(filePath?: string, staged = false): Promise<string> {
    const stagedFlag = staged ? "--staged" : "";
    const target = filePath ? `-- ${this.sanitizePath(filePath)}` : "";
    const { stdout } = await this.git(`diff ${stagedFlag} ${target}`.trim());
    return stdout;
  }

  async blame(filePath: string): Promise<GitBlameLine[]> {
    const safePath = this.sanitizePath(filePath);
    const { stdout } = await this.git(`blame --line-porcelain -- ${safePath}`);

    const lines: GitBlameLine[] = [];
    const blocks = stdout.split(/^([0-9a-f]{40})/m).filter(Boolean);

    let lineNumber = 1;
    let i = 0;
    while (i < blocks.length) {
      const hashLine = blocks[i]?.trim() ?? "";
      const body = blocks[i + 1] ?? "";
      i += 2;

      if (!/^[0-9a-f]{40}$/.test(hashLine)) {
        continue;
      }

      const authorMatch = body.match(/^author (.+)$/m);
      const dateMatch = body.match(/^author-time (\d+)$/m);
      const contentMatch = body.match(/^\t(.*)$/m);

      const date = dateMatch
        ? new Date(parseInt(dateMatch[1] ?? "0", 10) * 1000).toISOString().slice(0, 10)
        : "";

      lines.push({
        lineNumber: lineNumber++,
        hash: hashLine,
        author: authorMatch?.[1] ?? "",
        date,
        content: contentMatch?.[1] ?? "",
      });
    }

    return lines;
  }

  isGitRepo(): Promise<boolean> {
    return this.git("rev-parse --git-dir")
      .then(() => true)
      .catch(() => false);
  }

  private async git(command: string): Promise<{ stdout: string; stderr: string }> {
    return exec(`git ${command}`, { cwd: this.rootDir });
  }

  private sanitizePath(filePath: string): string {
    const resolved = path.resolve(this.rootDir, filePath);
    const relative = path.relative(this.rootDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Accès refusé hors du repo: ${filePath}`);
    }
    return relative;
  }
}
