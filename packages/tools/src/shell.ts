import { exec, spawn } from 'child_process';
import { ShellResult } from '@ks-agent/types';
import { isDangerousCommand } from '@ks-agent/shared';
import { EventEmitter } from 'events';

export interface ShellToolConfig {
  cwd: string;
  timeout?: number;
  outputLimit?: number;
  cancelSignal?: AbortSignal;
}

export class ShellTool {
  private config: ShellToolConfig;
  events: EventEmitter = new EventEmitter();

  constructor(config: ShellToolConfig) {
    this.config = config;
  }

  async execute(command: string): Promise<ShellResult> {
    const startTime = Date.now();
    const timeout = this.config.timeout || 120000;
    const outputLimit = this.config.outputLimit || 50000;

    if (isDangerousCommand(command)) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'Command blocked: potentially dangerous command detected.',
        duration: 0,
        command
      };
    }

    return new Promise<ShellResult>((resolve) => {
      const child = exec(command, {
        cwd: this.config.cwd,
        timeout,
        maxBuffer: outputLimit * 4,
        env: { ...process.env, PATH: process.env.PATH }
      }, (error, stdout, stderr) => {
        const duration = Date.now() - startTime;
        
        let exitCode = 0;
        if (error) {
          exitCode = typeof (error as any).code === 'number' ? (error as any).code : 1;
          if (stdout.length > outputLimit) stdout = stdout.substring(0, outputLimit) + '\n... (output truncated)';
          if (stderr.length > outputLimit) stderr = stderr.substring(0, outputLimit) + '\n... (output truncated)';
        }

        if (this.config.cancelSignal?.aborted) {
          exitCode = 2;
          stderr = 'Command cancelled';
        }

        const result: ShellResult = {
          exitCode,
          stdout: stdout.substring(0, outputLimit),
          stderr: stderr.substring(0, outputLimit),
          duration,
          command
        };

        this.events.emit('result', result);
        resolve(result);
      });

      this.config.cancelSignal?.addEventListener('abort', () => {
        // Kill child process on abort
        if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            try { process.kill(child.pid, 'SIGKILL'); } catch {}
          }
        }
      });
    });
  }

  async executeStreaming(command: string, onChunk: (type: 'stdout' | 'stderr', data: string) => void): Promise<ShellResult> {
    const startTime = Date.now();
    const timeout = this.config.timeout || 120000;
    const outputLimit = this.config.outputLimit || 50000;

    if (isDangerousCommand(command)) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: 'Command blocked: potentially dangerous command detected.',
        duration: 0,
        command
      };
    }

    return new Promise<ShellResult>((resolve) => {
      const child = spawn(command, {
        cwd: this.config.cwd,
        shell: true,
        env: { ...process.env, PATH: process.env.PATH },
        detached: true
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        if (child.pid) {
          try { process.kill(-child.pid, 'SIGKILL'); } catch {
            try { process.kill(child.pid, 'SIGKILL'); } catch {}
          }
        }
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        onChunk('stdout', text);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        onChunk('stderr', text);
      });

      this.config.cancelSignal?.addEventListener('abort', () => {
        killed = true;
        clearTimeout(timer);
        if (child.pid) {
          try { process.kill(-child.pid, 'SIGKILL'); } catch {
            try { process.kill(child.pid, 'SIGKILL'); } catch {}
          }
        }
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;

        const result: ShellResult = {
          exitCode: killed ? 2 : (code ?? 1),
          stdout: stdout.substring(0, outputLimit),
          stderr: stderr.substring(0, outputLimit),
          duration,
          command
        };

        this.events.emit('result', result);
        resolve(result);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: 1,
          stdout: '',
          stderr: `Failed to spawn command: ${err.message}`,
          duration: Date.now() - startTime,
          command
        });
      });
    });
  }
}

export { isDangerousCommand };