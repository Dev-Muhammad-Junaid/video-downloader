import fs from "fs";
import { appDataPath } from "@/lib/app-paths";

const SETTINGS_FILE = appDataPath(".server_settings.json");

interface ServerSettings {
    download_destination?: string;
    r2_credentials?: {
        s3Endpoint: string;
        s3Bucket: string;
        s3Region: string;
        s3AccessKey: string;
        s3SecretKey: string;
        storageLimit?: number; // in GB, default 10
    };
    openaiApiKey?: string;
    groqApiKey?: string;
    transcriptionProvider?: "openai" | "groq";
    whisperLanguage?: string;
    watchFolder?: string;
    /** Browser to read cookies from for yt-dlp (--cookies-from-browser), e.g.
     *  "chrome" | "safari" | "firefox" | "edge" | "brave". Empty = disabled.
     *  Needed for sites like YouTube that now require an authenticated session. */
    ytCookiesBrowser?: string;
}

export function getServerSettings(): ServerSettings {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
        }
    } catch (e) {
        console.error("Failed to read server settings:", e);
    }
    return {};
}

/** yt-dlp args for reading cookies from the configured browser, or [] if off.
 *  Prepend to every yt-dlp invocation (download + metadata/format probes). */
export function getYtdlpCookieArgs(): string[] {
    const browser = getServerSettings().ytCookiesBrowser?.trim();
    return browser ? ["--cookies-from-browser", browser] : [];
}

export function updateServerSetting<K extends keyof ServerSettings>(key: K, value: ServerSettings[K]) {
    const settings = getServerSettings();
    settings[key] = value;
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
    } catch (e) {
        console.error("Failed to save server settings:", e);
    }
}
