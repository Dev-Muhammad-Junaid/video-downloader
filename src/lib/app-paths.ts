import path from "path";

/**
 * Where per-user, writable app state (settings file, SQLite DB) lives.
 *
 * In dev/`next start` this is the project directory (unchanged behaviour).
 * Inside the packaged Electron app there is no writable project directory —
 * the Electron main process sets SNAPDOWN_USER_DATA_DIR to
 * `app.getPath("userData")` (e.g. ~/Library/Application Support/SnapDown)
 * before spawning the Next server, and this is the single place that env
 * var is read.
 */
export function getAppDataDir(): string {
    return process.env.SNAPDOWN_USER_DATA_DIR?.trim() || process.cwd();
}

export function appDataPath(...segments: string[]): string {
    return path.join(getAppDataDir(), ...segments);
}
