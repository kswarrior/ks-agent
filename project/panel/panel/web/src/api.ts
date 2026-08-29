import { ServerStatus, ConsoleOutput, FileEntry, ConsoleCommand } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8080";

export async function getStatus(): Promise<ServerStatus> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error("Failed to get status");
  return res.json();
}

export async function getConsoleOutput(): Promise<ConsoleOutput> {
  const res = await fetch(`${API_BASE}/api/console`);
  if (!res.ok) throw new Error("Failed to get console output");
  return res.json();
}

export async function sendConsoleCommand(command: string): Promise<ConsoleOutput> {
  const res = await fetch(`${API_BASE}/api/console/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  if (!res.ok) throw new Error("Failed to send command");
  return res.json();
}

export async function listFiles(): Promise<FileEntry[]> {
  const res = await fetch(`${API_BASE}/api/files`);
  if (!res.ok) throw new Error("Failed to list files");
  return res.json();
}

export async function readFile(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/files/${path}`);
  if (!res.ok) throw new Error(`Failed to read ${path}`);
  return res.text();
}

export async function writeFile(path: string, content: string): Promise<{saved: string; length: number}> {
  const res = await fetch(`${API_BASE}/api/files/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Failed to write ${path}`);
  return res.json();
}