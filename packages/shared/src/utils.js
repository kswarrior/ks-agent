"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateId = generateId;
exports.sanitizePath = sanitizePath;
exports.isDangerousCommand = isDangerousCommand;
exports.formatDuration = formatDuration;
exports.truncate = truncate;
exports.parseJsonSafe = parseJsonSafe;
exports.sleep = sleep;
exports.retry = retry;
exports.deepClone = deepClone;
exports.omit = omit;
exports.pick = pick;
function generateId(prefix = '') {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).substring(2, 9)}`;
}
function sanitizePath(path, projectRoot) {
    const resolved = require('path').resolve(projectRoot, path);
    const normalizedRoot = require('path').resolve(projectRoot);
    if (!resolved.startsWith(normalizedRoot)) {
        throw new Error(`Path traversal attempt detected: ${path}`);
    }
    return resolved;
}
function isDangerousCommand(command) {
    const dangerousPatterns = [
        /^rm\s+-rf\s+\//,
        /^rm\s+-rf\s+\*\*/,
        /^sudo\s+/,
        /^chmod\s+777/,
        /^chown\s+root/,
        />\s*\/dev\/(null|zero|random)/,
        /^\s*:\s*\(\s*\)\s*\{\s*:\|\:&\s*\}\s*;\s*/, // fork bomb
        /^dd\s+if=/,
        /^mkfs/,
        /^fdisk/,
        /^shutdown/,
        /^reboot/,
        /^halt/,
        /^poweroff/
    ];
    return dangerousPatterns.some(pattern => pattern.test(command.trim()));
}
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60000)
        return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}
function truncate(str, maxLength) {
    if (str.length <= maxLength)
        return str;
    return str.substring(0, maxLength - 3) + '...';
}
function parseJsonSafe(str, fallback) {
    try {
        return JSON.parse(str);
    }
    catch {
        return fallback;
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function retry(fn, retries, delay = 1000) {
    return fn().catch(err => {
        if (retries <= 0)
            throw err;
        return sleep(delay).then(() => retry(fn, retries - 1, delay * 2));
    });
}
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
function omit(obj, keys) {
    const result = { ...obj };
    keys.forEach(key => delete result[key]);
    return result;
}
function pick(obj, keys) {
    const result = {};
    keys.forEach(key => {
        if (key in obj)
            result[key] = obj[key];
    });
    return result;
}
//# sourceMappingURL=utils.js.map