import { spawn, ChildProcess } from 'child_process';
import { logger } from '@ks-agent/shared';

export interface ShellRunOptions {
  cwd: string;
  command: string;
  timeoutMs: number;
  maxOutputBytes: number;
  env?: Record<string, string>;
  onOutput?: (chunk: string, stream: 'stdout' | 'stderr') => void;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
  truncated: boolean;
}

const DEFAULT_MAX_OUTPUT = 200_000;

export class ShellRunner {
  private proc: ChildProcess | null = null;
  private cancelled = false;
  private timedOut = false;

  async run(opts: ShellRunOptions): Promise<ShellResult> {
    const start = Date.now();
    return new Promise((resolve) => {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let truncated = false;

      const useShell = true;
      const proc = spawn(opts.command, {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env ?? {}) } as any,
        shell: useShell,
      });
      this.proc = proc;

      const timer = setTimeout(() => {
        this.timedOut = true;
        try {
          proc.kill('SIGTERM');
        } catch (_e) {
          // ignore
        }
        setTimeout(() => {
          if (!proc.killed) {
            try {
              proc.kill('SIGKILL');
            } catch (_e) {}
          }
        }, 1500);
      }, opts.timeoutMs);

      proc.stdout?.on('data', (chunk: Buffer) => {
        if (stdoutBytes < opts.maxOutputBytes) {
          stdoutChunks.push(chunk);
          stdoutBytes += chunk.length;
          if (stdoutBytes >= opts.maxOutputBytes) {
            truncated = true;
          }
        }
        opts.onOutput?.(chunk.toString('utf8'), 'stdout');
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        if (stderrBytes < opts.maxOutputBytes) {
          stderrChunks.push(chunk);
          stderrBytes += chunk.length;
          if (stderrBytes >= opts.maxOutputBytes) {
            truncated = true;
          }
        }
        opts.onOutput?.(chunk.toString('utf8'), 'stderr');
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8') + `\nspawn error: ${err.message}`,
          exitCode: null,
          signal: null,
          timedOut: this.timedOut,
          cancelled: this.cancelled,
          durationMs: Date.now() - start,
          truncated,
        });
      });

      proc.on('exit', (code, signal) => {
        clearTimeout(timer);
        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        resolve({
          stdout,
          stderr,
          exitCode: code,
          signal,
          timedOut: this.timedOut,
          cancelled: this.cancelled,
          durationMs: Date.now() - start,
          truncated,
        });
      });
    });
  }

  cancel() {
    this.cancelled = true;
    if (this.proc) {
      try {
        this.proc.kill('SIGTERM');
      } catch (e) {
        logger.warn('Failed to kill shell process', { error: (e as Error).message });
      }
    }
  }
}

export function truncate(text: string, max: number = DEFAULT_MAX_OUTPUT): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... [truncated ${text.length - max} chars]`;
}

export const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+-rf?\s+\//,
  /\bdd\s+if=/,
  /\bmkfs(\.\w+)?\b/,
  /:\(\)\s*\{.*:\|:.*\}/,  // fork bomb
  /\bchmod\s+-R\s+777\b/,
  /\bchown\s+-R\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bhalt\b/,
  /\bpoweroff\b/,
  />\s*\/dev\/sd[a-z]/,
  /curl\s+[^|]*\|\s*(sh|bash)/,
  /wget\s+[^|]*\|\s*(sh|bash)/,
  /\bnc\s+-e\b/,
  /\bsudo\b/,
];

export function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some((re) => re.test(command));
}
