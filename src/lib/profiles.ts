import { prisma } from "./prisma";

export type PresetProfile = {
    name: string;
    sitePattern: string;
    maxResolution: string;
    preferredFormat: string;
    preferredImageFormat: string;
    resolutionMode: string; // "flexible" | "strict" | "minimum"
    priority: number;
    requireManualFormat: boolean;
    autoCloudSync: boolean;
    isActive: boolean;
};

// 6 curated presets. `priority: -1` marks the built-in default (fallback).
// These are seeded once on first run and whenever the user chooses "Reset to defaults".
// Users can freely edit or delete any of them after seeding.
export const PRESET_PROFILES: PresetProfile[] = [
    {
        name: "Best Quality",
        sitePattern: "*",
        maxResolution: "best",
        preferredFormat: "mp4",
        priority: -1,
        preferredImageFormat: "original",
        resolutionMode: "flexible",
        requireManualFormat: false,
        autoCloudSync: false,
        isActive: true,
    },
    {
        name: "Balanced 1080p",
        sitePattern: "*",
        maxResolution: "1080",
        preferredFormat: "mp4",
        priority: 0,
        preferredImageFormat: "original",
        resolutionMode: "flexible",
        requireManualFormat: false,
        autoCloudSync: false,
        isActive: true,
    },
    {
        name: "Data Saver 720p",
        sitePattern: "*",
        maxResolution: "720",
        preferredFormat: "mp4",
        priority: 0,
        preferredImageFormat: "original",
        resolutionMode: "flexible",
        requireManualFormat: false,
        autoCloudSync: false,
        isActive: true,
    },
    {
        name: "Lowest Quality 480p",
        sitePattern: "*",
        maxResolution: "480",
        preferredFormat: "mp4",
        priority: 0,
        preferredImageFormat: "original",
        resolutionMode: "flexible",
        requireManualFormat: false,
        autoCloudSync: false,
        isActive: true,
    },
    {
        name: "HD Minimum 1080p",
        sitePattern: "*",
        maxResolution: "1080",
        preferredFormat: "mp4",
        priority: 0,
        preferredImageFormat: "original",
        resolutionMode: "minimum",
        requireManualFormat: false,
        autoCloudSync: false,
        isActive: true,
    },
    {
        name: "Audio Only (MP3)",
        sitePattern: "*",
        maxResolution: "best",
        preferredFormat: "mp3",
        priority: 0,
        preferredImageFormat: "original",
        resolutionMode: "flexible",
        requireManualFormat: false,
        autoCloudSync: false,
        isActive: true,
    },
    {
        name: "Manual Select",
        sitePattern: "*",
        maxResolution: "best",
        preferredFormat: "mp4",
        priority: 0,
        preferredImageFormat: "original",
        resolutionMode: "flexible",
        requireManualFormat: true,
        autoCloudSync: false,
        isActive: true,
    },
];

export async function ensureDefaultProfile() {
    const count = await prisma.downloadProfile.count();
    if (count > 0) return;
    await prisma.downloadProfile.createMany({ data: PRESET_PROFILES });
}

// Idempotent upsert: re-add any missing presets (by name) without touching
// profiles the user renamed or created themselves. If a preset was deleted,
// this will bring it back. Returns the list of profiles added.
export async function resetToDefaultProfiles(): Promise<string[]> {
    const added: string[] = [];
    for (const preset of PRESET_PROFILES) {
        const existing = await prisma.downloadProfile.findUnique({ where: { name: preset.name } });
        if (!existing) {
            await prisma.downloadProfile.create({ data: preset });
            added.push(preset.name);
        }
    }
    return added;
}

export async function getMatchingProfile(url: string) {
    const profiles = await prisma.downloadProfile.findMany({
        where: { isActive: true },
        orderBy: { priority: "desc" },
    });

    for (const profile of profiles) {
        if (!profile.sitePattern || profile.sitePattern === "*") continue;

        try {
            const regex = new RegExp(profile.sitePattern.replace(/\*/g, ".*"), "i");
            if (regex.test(url)) return profile;
        } catch {
            if (url.includes(profile.sitePattern)) return profile;
        }
    }

    return profiles.find((p) => p.sitePattern === "*" || p.priority === -1);
}

/**
 * Returns a yt-dlp height filter string for the given resolution and mode.
 * mode: "flexible" → height<=X, "strict" → height=X, "minimum" → height>=X
 */
export function getResolutionConstraint(res: string | null, mode: string = "flexible") {
    if (!res || res === "best") return "";
    const height = res.replace(/[^0-9]/g, "");
    if (!height) return "";
    if (mode === "strict") return `[height=${height}]`;
    if (mode === "minimum") return `[height>=${height}]`;
    return `[height<=${height}]`; // flexible (default)
}

export function getYtDlpFormat(
    profile: {
        maxResolution: string | null;
        preferredFormat: string | null;
        strictResolution?: boolean | null;
        resolutionMode?: string | null;
    },
    formatId?: string
) {
    // Explicit audio-only requests
    if (formatId === "audio" || profile.preferredFormat === "mp3") {
        return { args: ["-x", "--audio-format", "mp3", "--audio-quality", "0"], isAudio: true };
    }
    if (profile.preferredFormat === "m4a") {
        return { args: ["-x", "--audio-format", "m4a", "--audio-quality", "0"], isAudio: true };
    }

    // Specific platform-provided format ID — use it directly with audio fallback
    if (formatId && formatId !== "best") {
        return {
            args: ["-f", `${formatId}+bestaudio/best`, "--merge-output-format", "mp4"],
            isAudio: false,
        };
    }

    // Derive effective resolution mode (backward compat: strictResolution → "strict")
    const mode = profile.resolutionMode || (profile.strictResolution ? "strict" : "flexible");
    const resConstraint = getResolutionConstraint(profile.maxResolution, mode);

    // A "ceiling" only exists for flexible and strict modes — minimum mode has a floor,
    // not a ceiling, so we can freely fall back to best when the floor can't be met.
    const hasResCeiling = resConstraint !== "" && mode !== "minimum";

    const format = profile.preferredFormat || "mp4";
    const extFilter = format === "best" ? "" : `[ext=${format}]`;
    // For mp4 video, prefer m4a audio so ffmpeg can do a fast stream copy
    const audioExtFilter = extFilter === "[ext=mp4]" ? "[ext=m4a]" : "";

    // Build a yt-dlp format cascade. CRITICAL: when the profile sets a resolution
    // ceiling (flexible/strict), we MUST NOT append an unconditional `/best` fallback —
    // otherwise yt-dlp silently escalates quality when the ceiling can't be met.
    // For "minimum" mode there's no ceiling so `/best` fallback is safe and desired.
    const cascade = [
        `bestvideo${resConstraint}${extFilter}+bestaudio${audioExtFilter}`,
        `best${resConstraint}${extFilter}`,
        `best${resConstraint}`,
    ];
    // Only add the unconditional /best fallback when there IS a resolution constraint
    // (minimum mode). If resConstraint is empty the cascade already ends with plain "best".
    if (!hasResCeiling && resConstraint !== "") {
        cascade.push("best");
    }

    return {
        args: ["-f", cascade.join("/"), "--merge-output-format", format === "best" ? "mp4" : format],
        isAudio: false,
    };
}
