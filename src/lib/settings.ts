import fs from "fs";
import { appDataPath } from "@/lib/app-paths";
import { isKeychainAvailable, readSecret, writeSecret, deleteSecret } from "@/lib/secrets";

const SETTINGS_FILE = appDataPath(".server_settings.json");

/** Owner read/write only. Even with secrets moved to the Keychain, this file
 *  should never be world-readable the way a default 0644 leaves it. */
const SECRET_FILE_MODE = 0o600;

interface R2Credentials {
    s3Endpoint: string;
    s3Bucket: string;
    s3Region: string;
    s3AccessKey: string;
    s3SecretKey: string;
    storageLimit?: number; // in GB, default 10
}

interface ServerSettings {
    download_destination?: string;
    r2_credentials?: R2Credentials;
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

/**
 * Settings that must never sit in the plaintext file.
 *
 * `r2_credentials` is stored whole rather than field by field: the endpoint
 * embeds the Cloudflare account id, and keeping the object together means a
 * future field is protected automatically instead of by remembering to add it
 * here.
 */
const SECRET_KEYS = ["openaiApiKey", "groqApiKey", "r2_credentials"] as const;
type SecretKey = (typeof SECRET_KEYS)[number];

const isSecretKey = (key: string): key is SecretKey =>
    (SECRET_KEYS as readonly string[]).includes(key);

/**
 * Environment overrides, checked ahead of both the Keychain and the file.
 *
 * These let a secret stay out of any persistent store entirely — export them
 * from a shell profile or pipe them in from a password manager. An
 * env-provided value is never written back, otherwise saving anything in
 * Settings would copy it into storage and defeat the point.
 */
const ENV_KEYS = {
    openaiApiKey: "SNAPDOWN_OPENAI_API_KEY",
    groqApiKey: "SNAPDOWN_GROQ_API_KEY",
} as const;

const ENV_R2_KEYS = {
    s3Endpoint: "SNAPDOWN_R2_ENDPOINT",
    s3Bucket: "SNAPDOWN_R2_BUCKET",
    s3Region: "SNAPDOWN_R2_REGION",
    s3AccessKey: "SNAPDOWN_R2_ACCESS_KEY",
    s3SecretKey: "SNAPDOWN_R2_SECRET_KEY",
} as const;

const env = (name: string): string | undefined => {
    const v = process.env[name]?.trim();
    return v ? v : undefined;
};

function isEnvProvided(key: keyof ServerSettings): boolean {
    if (key in ENV_KEYS) return env(ENV_KEYS[key as keyof typeof ENV_KEYS]) !== undefined;
    if (key === "r2_credentials") return Object.values(ENV_R2_KEYS).some((n) => env(n) !== undefined);
    return false;
}

/**
 * Reading a secret shells out to `/usr/bin/security`, which costs a few
 * milliseconds. getServerSettings() runs on many requests, so the resolved
 * secrets are cached in-process and invalidated explicitly on write.
 */
let secretCache: Partial<Record<SecretKey, string>> | null = null;
const invalidateSecretCache = () => { secretCache = null; };

function loadSecrets(): Partial<Record<SecretKey, string>> {
    if (secretCache) return secretCache;
    const loaded: Partial<Record<SecretKey, string>> = {};
    for (const key of SECRET_KEYS) {
        const value = readSecret(key);
        if (value !== undefined) loaded[key] = value;
    }
    secretCache = loaded;
    return loaded;
}

/** Read the raw file with no Keychain or env overlay. */
function readSettingsFile(): ServerSettings {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
        }
    } catch (e) {
        console.error("Failed to read server settings:", e);
    }
    return {};
}

function writeSettingsFile(settings: ServerSettings): void {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), {
            encoding: "utf-8",
            mode: SECRET_FILE_MODE,
        });
        // writeFileSync's `mode` only applies when it creates the file, so an
        // existing world-readable file keeps its old permissions without this.
        fs.chmodSync(SETTINGS_FILE, SECRET_FILE_MODE);
    } catch (e) {
        console.error("Failed to save server settings:", e);
    }
}

/**
 * One-time move of any secrets still sitting in the plaintext file into the
 * Keychain, scrubbing them from the file afterwards.
 *
 * Only removes a value from the file once the Keychain write has been
 * confirmed, so a failure leaves the existing setup working rather than
 * losing the user's keys.
 */
let migrationAttempted = false;
function migrateFileSecretsToKeychain(): void {
    if (migrationAttempted || !isKeychainAvailable()) return;
    migrationAttempted = true;

    const fileSettings = readSettingsFile();
    const moved: string[] = [];

    for (const key of SECRET_KEYS) {
        const value = fileSettings[key];
        if (value === undefined || value === null || value === "") continue;

        const serialised = typeof value === "string" ? value : JSON.stringify(value);
        if (writeSecret(key, serialised)) {
            delete fileSettings[key];
            moved.push(key);
        }
    }

    if (moved.length > 0) {
        writeSettingsFile(fileSettings);
        invalidateSecretCache();
        console.log(`[Settings] Moved ${moved.join(", ")} from the settings file into the Keychain`);
    }
}

export function getServerSettings(): ServerSettings {
    migrateFileSecretsToKeychain();

    // Least trusted first: file, then Keychain, then environment.
    const settings = readSettingsFile();

    const secrets = loadSecrets();
    for (const key of SECRET_KEYS) {
        const raw = secrets[key];
        if (raw === undefined) continue;
        if (key === "r2_credentials") {
            try {
                settings.r2_credentials = JSON.parse(raw) as R2Credentials;
            } catch {
                console.error("[Settings] Stored R2 credentials are corrupt — ignoring them");
            }
        } else {
            settings[key] = raw;
        }
    }

    for (const [field, envName] of Object.entries(ENV_KEYS)) {
        const value = env(envName);
        if (value) settings[field as keyof typeof ENV_KEYS] = value;
    }

    // R2 is an object, so overlay field by field: someone may want the endpoint
    // and bucket stored but inject only the secret key from the environment.
    const r2Overrides = Object.entries(ENV_R2_KEYS)
        .map(([field, envName]) => [field, env(envName)] as const)
        .filter(([, value]) => value !== undefined);

    if (r2Overrides.length > 0) {
        settings.r2_credentials = {
            s3Endpoint: "", s3Bucket: "", s3Region: "auto", s3AccessKey: "", s3SecretKey: "",
            ...settings.r2_credentials,
            ...Object.fromEntries(r2Overrides),
        } as R2Credentials;
    }

    return settings;
}

/** yt-dlp args for reading cookies from the configured browser, or [] if off.
 *  Prepend to every yt-dlp invocation (download + metadata/format probes). */
export function getYtdlpCookieArgs(): string[] {
    const browser = getServerSettings().ytCookiesBrowser?.trim();
    return browser ? ["--cookies-from-browser", browser] : [];
}

export function updateServerSetting<K extends keyof ServerSettings>(key: K, value: ServerSettings[K]) {
    if (isEnvProvided(key)) {
        // Persisting would write the environment's secret into storage, which
        // is exactly what the env override exists to avoid.
        console.warn(`[Settings] "${key}" comes from the environment — not persisting it`);
        return;
    }

    if (isSecretKey(key) && isKeychainAvailable()) {
        const isEmpty = value === undefined || value === null || value === "";
        if (isEmpty) {
            deleteSecret(key);
        } else if (!writeSecret(key, typeof value === "string" ? value : JSON.stringify(value))) {
            console.error(`[Settings] Keychain write failed for "${key}" — not falling back to the plaintext file`);
            return;
        }
        invalidateSecretCache();

        // Make sure no stale plaintext copy survives in the file.
        const settings = readSettingsFile();
        if (key in settings) {
            delete settings[key];
            writeSettingsFile(settings);
        }
        return;
    }

    const settings = readSettingsFile();
    settings[key] = value;
    writeSettingsFile(settings);
}
