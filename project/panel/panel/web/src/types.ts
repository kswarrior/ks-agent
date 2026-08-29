export interface ServerStatus {
  online: boolean;
  players: number;
  max: number;
  motd: string;
}

export interface ConsoleOutput {
  output: string;
  lastUpdated: string;
}

export interface FileEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
  modified: string;
}

export interface ConsoleCommand {
  command: string;
}