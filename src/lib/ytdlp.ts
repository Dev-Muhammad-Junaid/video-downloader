import fs from "fs";

let cachedYtdlpPath: string | null = null;

/**
 * Resolve the yt-dlp binary without depending on $PATH.
 *
 * `spawn("yt-dlp", ...)` only works when the *invoking process's* PATH
 * includes wherever yt-dlp lives. That's true in a terminal (shell profiles
 * export Homebrew's /opt/homebrew/bin), but a macOS app launched from
 * Finder/Dock gets a minimal login-shell PATH that usually does NOT include
 * Homebrew — so a packaged Electron build would silently fail every download
 * despite yt-dlp being installed. Check common install locations first, same
 * pattern as getFfmpegPath().
 */
export function getYtdlpPath(): string {
    if (cachedYtdlpPath) return cachedYtdlpPath;

    const override = process.env.APP_YTDLP_PATH?.trim();
    if (override) {
        cachedYtdlpPath = override;
        return cachedYtdlpPath;
    }

    const candidates = [
        "/opt/homebrew/bin/yt-dlp", // Homebrew, Apple Silicon
        "/usr/local/bin/yt-dlp",    // Homebrew, Intel
        "/usr/bin/yt-dlp",
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            cachedYtdlpPath = candidate;
            return cachedYtdlpPath;
        }
    }

    // Last fallback: rely on $PATH (dev / terminal-launched contexts).
    cachedYtdlpPath = "yt-dlp";
    return cachedYtdlpPath;
}
