import fs from "fs";
import path from "path";

const SETTINGS_FILE = path.join(process.cwd(), ".server_settings.json");

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
    whisperLanguage?: string;
    watchFolder?: string;
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

export function updateServerSetting<K extends keyof ServerSettings>(key: K, value: ServerSettings[K]) {
    const settings = getServerSettings();
    settings[key] = value;
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
    } catch (e) {
        console.error("Failed to save server settings:", e);
    }
}
