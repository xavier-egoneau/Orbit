import { exec as execCallback, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execCallback);

export type RuntimeLogEntry = {
  source: "stdout" | "stderr" | "system";
  text: string;
  timestamp: string;
};

export type GlobalLogEntry = RuntimeLogEntry & {
  processId: string;
  command: string;
};

export type RuntimeProcessStatus = "running" | "exited";

export type RuntimeProcessSnapshot = {
  id: string;
  command: string;
  cwd: string;
  status: RuntimeProcessStatus;
  startedAt: string;
  exitedAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

type RuntimeProcessRecord = RuntimeProcessSnapshot & {
  child: ChildProcessWithoutNullStreams;
  logs: RuntimeLogEntry[];
};

type RuntimeBridgeOptions = {
  maxOutputChars?: number;
  maxLogEntries?: number;
};

export class RuntimeBridgeService {
  private readonly rootDir: string;
  private readonly maxOutputChars: number;
  private readonly maxLogEntries: number;
  private readonly processes = new Map<string, RuntimeProcessRecord>();
  private nextId = 1;

  constructor(rootDir: string, options?: RuntimeBridgeOptions) {
    this.rootDir = path.resolve(rootDir);
    this.maxOutputChars = options?.maxOutputChars ?? 20_000;
    this.maxLogEntries = options?.maxLogEntries ?? 500;
  }

  async runCommand(command: string, cwd?: string, timeoutMs?: number) {
    const effectiveCwd = this.resolveCwd(cwd);
    const isWindows = process.platform === "win32";
    const shellCommand = isWindows ? `cmd /c ${command}` : command;

    const { stdout, stderr } = await exec(shellCommand, {
      cwd: effectiveCwd,
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs ?? 60_000,
    });

    return {
      command,
      cwd: effectiveCwd,
      stdout: stdout.slice(0, this.maxOutputChars),
      stderr: stderr.slice(0, this.maxOutputChars),
    };
  }

  startProcess(command: string, cwd?: string): RuntimeProcessSnapshot {
    const effectiveCwd = this.resolveCwd(cwd);
    const id = `proc_${this.nextId++}`;
    const child = spawn(command, {
      cwd: effectiveCwd,
      shell: true,
      env: process.env,
      stdio: "pipe",
    });

    const record: RuntimeProcessRecord = {
      id,
      command,
      cwd: effectiveCwd,
      status: "running",
      startedAt: new Date().toISOString(),
      exitedAt: null,
      exitCode: null,
      signal: null,
      child,
      logs: [],
    };

    this.processes.set(id, record);
    this.pushLog(record, "system", `Process started: ${command}`);

    child.stdout.on("data", (chunk: Buffer) => {
      this.pushChunk(record, "stdout", chunk.toString("utf8"));
    });

    child.stderr.on("data", (chunk: Buffer) => {
      this.pushChunk(record, "stderr", chunk.toString("utf8"));
    });

    child.on("close", (code, signal) => {
      record.status = "exited";
      record.exitCode = code;
      record.signal = signal;
      record.exitedAt = new Date().toISOString();
      this.pushLog(
        record,
        "system",
        `Process exited with code ${code ?? "null"}${signal ? ` and signal ${signal}` : ""}`
      );
    });

    child.on("error", (error) => {
      this.pushLog(record, "system", `Process error: ${error.message}`);
    });

    return this.toSnapshot(record);
  }

  listProcesses(): RuntimeProcessSnapshot[] {
    return Array.from(this.processes.values())
      .map((record) => this.toSnapshot(record))
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  }

  getProcess(processId: string): RuntimeProcessSnapshot | null {
    const record = this.processes.get(processId);
    return record ? this.toSnapshot(record) : null;
  }

  readLogs(processId: string, limit?: number, clearAfterRead?: boolean) {
    const record = this.processes.get(processId);
    if (!record) {
      throw new Error(`Processus introuvable: ${processId}`);
    }

    const logs =
      typeof limit === "number"
        ? record.logs.slice(-limit)
        : [...record.logs];

    if (clearAfterRead) {
      record.logs.length = 0;
    }

    return {
      process: this.toSnapshot(record),
      count: logs.length,
      logs,
    };
  }

  getGlobalRecentLogs(
    limit = 50,
    filter?: "errors" | "warnings"
  ): GlobalLogEntry[] {
    const allLogs: GlobalLogEntry[] = [];

    for (const [id, record] of this.processes) {
      for (const log of record.logs) {
        allLogs.push({ ...log, processId: id, command: record.command });
      }
    }

    allLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    let result = allLogs;
    if (filter === "errors") {
      result = allLogs.filter(
        (log) =>
          log.source === "stderr" || /error|exception|fail/i.test(log.text)
      );
    } else if (filter === "warnings") {
      result = allLogs.filter((log) => /warn|warning/i.test(log.text));
    }

    return result.slice(-limit);
  }

  stopProcess(processId: string, signal: NodeJS.Signals = "SIGTERM"): RuntimeProcessSnapshot {
    const record = this.processes.get(processId);
    if (!record) {
      throw new Error(`Processus introuvable: ${processId}`);
    }

    if (record.status === "running") {
      record.child.kill(signal);
      this.pushLog(record, "system", `Stop requested with signal ${signal}`);
    }

    return this.toSnapshot(record);
  }

  private resolveCwd(cwd?: string): string {
    const resolved = cwd ? path.resolve(this.rootDir, cwd) : this.rootDir;
    const relative = path.relative(this.rootDir, resolved);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Acces refuse hors du repo: ${cwd}`);
    }

    return resolved;
  }

  private pushChunk(record: RuntimeProcessRecord, source: "stdout" | "stderr", chunk: string) {
    const lines = chunk.split(/\r?\n/).filter((line) => line.trim().length > 0);

    for (const line of lines) {
      this.pushLog(record, source, line);
    }
  }

  private pushLog(record: RuntimeProcessRecord, source: RuntimeLogEntry["source"], text: string) {
    record.logs.push({
      source,
      text: text.slice(0, this.maxOutputChars),
      timestamp: new Date().toISOString(),
    });

    if (record.logs.length > this.maxLogEntries) {
      record.logs.shift();
    }
  }

  private toSnapshot(record: RuntimeProcessRecord): RuntimeProcessSnapshot {
    return {
      id: record.id,
      command: record.command,
      cwd: record.cwd,
      status: record.status,
      startedAt: record.startedAt,
      exitedAt: record.exitedAt,
      exitCode: record.exitCode,
      signal: record.signal,
    };
  }
}
