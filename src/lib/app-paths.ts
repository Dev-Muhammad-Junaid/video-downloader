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

/**
 * Default location for downloaded media.
 *
 * It used to be `<cwd>/downloads`, which inside the packaged app resolves to
 * `SnapDown.app/Contents/Resources/standalone/downloads` — INSIDE THE APP
 * BUNDLE. Replacing the app during an update deletes the bundle and every
 * media file in it, and the pointer file recording a custom destination lived
 * there too, so the app also forgot where the user had moved their library.
 *
 * Media belongs somewhere the user owns and an update cannot touch. ~/Movies
 * is the macOS convention and is visible in Finder, unlike Application
 * Support.
 *
 * Dev keeps using the project directory, which is not destroyed by anything.
 */
export function getDefaultMediaDir(): string {
    const userDataDir = process.env.SNAPDOWN_USER_DATA_DIR?.trim();
    if (!userDataDir) return path.join(process.cwd(), "downloads");

    const home = process.env.HOME?.trim();
    return home ? path.join(home, "Movies", "SnapDown") : path.join(userDataDir, "downloads");
}

/** Whether the given path sits inside the running app bundle, i.e. somewhere
 *  the next update will delete. */
export function isInsideAppBundle(target: string): boolean {
    const marker = ".app/Contents/";
    return path.resolve(target).includes(marker);
}
