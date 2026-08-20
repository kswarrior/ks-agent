export declare function generateId(prefix?: string): string;
export declare function sanitizePath(path: string, projectRoot: string): string;
export declare function isDangerousCommand(command: string): boolean;
export declare function formatDuration(ms: number): string;
export declare function truncate(str: string, maxLength: number): string;
export declare function parseJsonSafe<T>(str: string, fallback: T): T;
export declare function sleep(ms: number): Promise<void>;
export declare function retry<T>(fn: () => Promise<T>, retries: number, delay?: number): Promise<T>;
export declare function deepClone<T>(obj: T): T;
export declare function omit<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>;
export declare function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>;
//# sourceMappingURL=utils.d.ts.map