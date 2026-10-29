import { spawn } from 'node:child_process'
import { config } from './config.js'

export function outputTail(output: string, lines = 12, maxChars = 2000): string {
  const tail = output
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .slice(-lines)
    .join('\n')
  return tail.length > maxChars ? tail.slice(-maxChars) : tail
}

export function runInstallCommand(command: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash')
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command]
    const child = spawn(shell, args, {
      cwd: process.cwd(),
      env: process.env,
      detached: process.platform !== 'win32'
    })
    let output = ''
    let settled = false
    let timedOut = false
    const append = (chunk: Buffer | string) => {
      output += chunk.toString()
      if (output.length > 64_000) output = output.slice(-64_000)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)

    const killTree = () => {
      try {
        if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch {
        // already exited
      }
    }

    const timer = setTimeout(() => {
      timedOut = true
      killTree()
    }, config.shellTimeoutMs)

    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        ok,
        output: timedOut
          ? `${output}\nInstall timed out after ${config.shellTimeoutMs}ms`.trim()
          : output
      })
    }

    child.on('error', (error) => {
      output += `${output ? '\n' : ''}${error.message}`
      finish(false)
    })
    child.on('close', (code) => finish(!timedOut && code === 0))
  })
}
