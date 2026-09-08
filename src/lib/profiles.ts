import { prisma } from "./prisma";

export type PresetProfile = {
    name: string;
    sitePattern: string;
    // Video
    maxResolution: string;
    preferredFormat: string;        // video container: mp4 | mkv | webm | best
    resolutionMode: string;         // flexible | strict | minimum
    // Image
    preferredImageFormat: string;   // original | jpg | png | webp | avif
    // Audio
    audioFormat: string;            // mp3 | m4a | wav
    audioBitrate: string;           // 128k | 192k | 256k | 320k
    extractAudio: boolean;          // force audio extraction even from video sources
    priority: number;
    requireManualFormat: boolean;
    autoCloudSync: boolean;
    isActive: boolean;
};

// Curated presets, each covering video + image + audio in one profile. The app applies
// the section that matches whatever is being downloaded. `priority: -1` marks the default.
// Seeded once on first run and re-addable via "Reset to defaults"; freely editable after.
export const PRESET_PROFILES: PresetProfile[] = [
    {
        name: "Best Available",
        sitePattern: "*",
        maxResolution: "best",
        preferredFormat: "mp4",
        resolutionMode: "flexible",
        preferredImageFormat: "original",
        audioFormat: "mp3",
        audioBitrate: "320k",
        extractAudio: false,
        priority: -1,
        requireManualFormat: false,
        autoCloudSync: false,
        isActive: true,
    },
    {
        name: "Balanced 1080p",
        sitePattern: "*",
        maxResolution: "1080",
        preferredFormat: "mp4",
        resolutionMode: "flexible",
        preferredImageFormat: "original",
        audioFormat: "mp3",
        audioBitrate: "192k",
        extractAudio: false,
        priority: 0,
        requireManualFormat: false,
        autoCloudSync: false,
        isActive: true,
    },
    {
        name: "Data Saver",
        sitePattern: "*",
        maxResolution: "480",
        preferredFormat: "mp4",
        resolutionMode: "flexible",
        preferredImageFormat: "jpg",
        audioFormat: "mp3",
        audioBitrate: "128k",
        extractAudio: false,
        priority: 0,
        requireManualFormat: false,
        autoCloudSync: false,
        isActive: true,
    },
    {
        name: "Audio Only",
        sitePattern: "*",
        maxResolution: "best",
        preferredFormat: "mp4",
        resolutionMode: "flexible",
        preferredImageFormat: "original",
        audioFormat: "mp3",
        audioBitrate: "320k",
        extractAudio: true,
        priority: 0,
        requireManualFormat: false,
        autoCloudSync: false,
        isActive: true,
    },
    {
        name: "Manual Select",
        sitePattern: "*",
        maxResolution: "best",
        preferredFormat: "mp4",
        resolutionMode: "flexible",
        preferredImageFormat: "original",
        audioFormat: "mp3",
        audioBitrate: "192k",
        extractAudio: false,
        priority: 0,
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
    // "<=?" is yt-dlp's optional comparison: a format whose height is unknown
    // still passes, instead of being discarded. Plain "<=" rejects unknown-height
    // formats, and because a ceiling deliberately omits the unconditional /best
    // fallback (see getYtDlpFormat), that made every such source fail outright
    // with "Requested format is not available" — which is exactly what a direct
    // media URL looks like to the generic extractor, and therefore what the
    // browser extension sends when you "Send to SnapDown" a video or link.
    // The ceiling is still enforced wherever the height IS known.
    return `[height<=?${height}]`; // flexible (default)
}

export function getYtDlpFormat(
    profile: {
        maxResolution: string | null;
        preferredFormat: string | null;
        strictResolution?: boolean | null;
        resolutionMode?: string | null;
        audioFormat?: string | null;
        audioBitrate?: string | null;
        extractAudio?: boolean | null;
    },
    formatId?: string,
    mediaType?: string,
) {
    // yt-dlp's --audio-quality takes a target bitrate like "192K" (or 0 for best).
    const audioQuality = profile.audioBitrate
        ? profile.audioBitrate.toUpperCase().replace(/K$/i, "K")
        : "0";
    const audioFmt = (profile.audioFormat || "mp3").toLowerCase();

    // Audio output happens for: an explicit per-item "audio" override, an audio-only
    // profile (extractAudio), or an audio source (e.g. SoundCloud). A legacy profile whose
    // video format is still an audio codec is also treated as audio-only.
    const legacyAudioFormat = ["mp3", "m4a", "wav"].includes((profile.preferredFormat || "").toLowerCase());
    if (formatId === "audio" || profile.extractAudio || mediaType === "audio" || legacyAudioFormat) {
        const fmt = legacyAudioFormat ? (profile.preferredFormat as string).toLowerCase() : audioFmt;
        if (fmt === "wav") {
            // WAV is lossless; audio-quality is irrelevant.
            return { args: ["-x", "--audio-format", "wav"], isAudio: true };
        }
        return { args: ["-x", "--audio-format", fmt === "m4a" ? "m4a" : "mp3", "--audio-quality", audioQuality], isAudio: true };
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
