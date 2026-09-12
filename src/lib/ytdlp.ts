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

/**
 * Turn yt-dlp's raw stderr into a message a user can actually act on, instead
 * of a bare "Process exited with code 1". The single most common cause by far
 * is YouTube's bot-check, which is fixed by turning on cookies in Settings —
 * detect it specifically so we can point directly at that fix rather than
 * making the user guess (and hunt through Settings themselves, as happened
 * before this existed).
 */
export function describeYtdlpError(stderr: string): string {
    const text = stderr || "";

    if (/sign in to confirm you.?re not a bot/i.test(text) || /cookies/i.test(text) && /sign in/i.test(text)) {
        return "This site is asking for a signed-in session (YouTube's bot-check). Go to Settings → Downloader Cookies and pick a browser you're logged into, then retry.";
    }
    if (/video unavailable/i.test(text)) {
        return "This video is unavailable — it may be private, deleted, or region-restricted.";
    }
    if (/private video/i.test(text)) {
        return "This is a private video and can't be downloaded.";
    }
    if (/(members-only|join this channel)/i.test(text)) {
        return "This video is members-only content and can't be downloaded without an authenticated, subscribed session.";
    }
    if (/unsupported url/i.test(text)) {
        return "This URL isn't from a supported site.";
    }

    // Fall back to yt-dlp's own last "ERROR: ..." line — still far more useful
    // than a bare exit code, even when it's not one of the cases above.
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const lastError = [...lines].reverse().find((l) => /^ERROR:/i.test(l.trim()));
    if (lastError) {
        return lastError.trim().replace(/^ERROR:\s*/i, "");
    }

    return "";
}

/**
 * Whether a URL names one specific video, even if it also carries a playlist.
 *
 * Pasting a video link that happens to include `?list=...` used to start a
 * PLAYLIST download. YouTube adds a list parameter to almost every link it
 * generates, and auto-generated Mix/Radio lists (`list=RD...`) are effectively
 * endless — one such link expanded to 552 entries. yt-dlp then worked through
 * all of them, writing every one to the single output path the job expected,
 * so the download appeared to hang and never produced the video the user asked
 * for.
 *
 * A link to a video means "download this video". A link to a playlist
 * (`/playlist?list=...`, with no video id) still means the playlist.
 */
export function urlTargetsSingleVideo(rawUrl: string): boolean {
    try {
        const url = new URL(rawUrl);
        const host = url.hostname.replace(/^www\./, "");

        // The user explicitly picked one entry out of a playlist — that path
        // handles its own item selection and must not be overridden.
        if (url.searchParams.get("snapdown_playlist_item")) return false;

        if (host === "youtu.be") return url.pathname.replace(/^\//, "").length > 0;

        if (host.endsWith("youtube.com")) {
            // /playlist?list=... is a playlist proper.
            if (url.pathname.startsWith("/playlist")) return false;
            if (url.searchParams.get("v")) return true;
            // /shorts/<id>, /live/<id>, /embed/<id>
            return /^\/(shorts|live|embed)\/[^/]+/.test(url.pathname);
        }

        return false;
    } catch {
        return false;
    }
}

/** `--no-playlist` when the URL names one video, so a stray `list=` parameter
 *  can't turn a single download into hundreds. */
export function playlistScopeArgs(rawUrl: string): string[] {
    return urlTargetsSingleVideo(rawUrl) ? ["--no-playlist"] : [];
}
