// ── Subtitle Data Model & Utilities ──
// Shared types, parsing, and style definitions for the subtitle editor

export interface Subtitle {
    id: number;
    start: string; // SRT format: "HH:MM:SS,mmm"
    end: string;
    text: string;
    confidence: number; // 0.0–1.0, used for review queue
}

export interface StylePreset {
    id: string;
    name: string;
    desc: string;
    icon: string; // emoji
}

export const STYLE_PRESETS: StylePreset[] = [
    // ── Core ─────────────────────────────────────────────────────────────────
    { id: "classic",     name: "Classic",   desc: "Standard bottom text",            icon: "📺" },
    { id: "tiktok",      name: "TikTok",    desc: "Yellow word-by-word",             icon: "🎯" },
    { id: "box",         name: "Box",       desc: "Black text on white block",       icon: "◻️" },
    { id: "cinematic",   name: "Cinematic", desc: "Wide-set italic, soft shadow",    icon: "🎬" },
    { id: "outline",     name: "Outline",   desc: "Bold white, black stroke",        icon: "✏️" },
    { id: "bold-center", name: "Mega",      desc: "Huge centered hero text",         icon: "💥" },

    // ── Viral / Instagram-Reels ──────────────────────────────────────────────
    /** Cyan glow on magenta halo — synth-wave / aesthetic reel look. */
    { id: "neon",        name: "Neon",      desc: "Electric cyan with pink glow",    icon: "💫" },
    /** Massive gold-yellow on thick black stroke — viral explainer style. */
    { id: "punch",       name: "Punch",     desc: "Big bold yellow with stroke",     icon: "⚡" },
    /** Minimal documentary — small refined caption with hairline shadow. */
    { id: "whisper",     name: "Whisper",   desc: "Minimal documentary caption",     icon: "🪶" },
    /** Per-word yellow block w/ karaoke timing — Submagic-style. */
    { id: "highlight",   name: "Highlight", desc: "Yellow word block, karaoke",      icon: "🟨" },
];

// ── SRT Time Parsing ──

/** Parse SRT time string "HH:MM:SS,mmm" to seconds */
export function parseSrtTime(timeStr: string): number {
    if (!timeStr) return 0;
    const [h, m, s_ms] = timeStr.split(":");
    if (!s_ms) return 0;
    const [s, ms] = s_ms.split(",");
    return (
        parseInt(h) * 3600 +
        parseInt(m) * 60 +
        parseInt(s) +
        parseInt(ms || "0") / 1000
    );
}

/** Format seconds to SRT time string "HH:MM:SS,mmm" */
export function formatSrtTime(seconds: number): string {
    const totalMs = Math.round(Math.max(0, seconds) * 1000);
    const ms = totalMs % 1000;
    const totalSecs = Math.floor(totalMs / 1000);
    const secs = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mins = totalMins % 60;
    const hours = Math.floor(totalMins / 60);

    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/** Display-friendly time "MM:SS" from SRT time string */
export function displayTime(srtTime: string): string {
    const secs = parseSrtTime(srtTime);
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

/** Shift an SRT time string by deltaMs milliseconds */
export function shiftTime(timeStr: string, deltaMs: number): string {
    const seconds = parseSrtTime(timeStr) + deltaMs / 1000;
    return formatSrtTime(Math.max(0, seconds));
}

// ── SRT / VTT Content Parsing ──

/** Parse SRT content string into Subtitle array */
export function parseSrt(srtContent: string): Subtitle[] {
    if (!srtContent?.trim()) return [];
    const blocks = srtContent.trim().split(/\n\s*\n/);
    return blocks
        .map((block, blockIdx) => {
            const lines = block.split("\n").filter((l) => l.trim());
            if (lines.length < 2) return null;
            const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
            if (timeLineIdx === -1) return null;
            const timeParts = lines[timeLineIdx].split(" --> ");
            if (timeParts.length !== 2) return null;
            const id = timeLineIdx > 0 ? (parseInt(lines[0]) || blockIdx + 1) : blockIdx + 1;
            const text = lines.slice(timeLineIdx + 1).join("\n");
            const confidence = 1.0;
            return {
                id,
                start: timeParts[0].trim(),
                end: timeParts[1].trim(),
                text,
                confidence,
            };
        })
        .filter(Boolean) as Subtitle[];
}

/** Parse VTT content into Subtitle array (converts VTT timestamps to SRT format internally) */
export function parseVtt(vttContent: string): Subtitle[] {
    if (!vttContent?.trim()) return [];
    // Strip WEBVTT header
    const body = vttContent.replace(/^WEBVTT\s*\n*/, "").trim();
    const blocks = body.split(/\n\s*\n/);
    return blocks
        .map((block, idx) => {
            const lines = block.split("\n").filter((l) => l.trim());
            // Find the timestamp line
            const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
            if (timeLineIdx === -1) return null;
            const timeParts = lines[timeLineIdx].split(" --> ");
            if (timeParts.length !== 2) return null;
            // Convert VTT dots to SRT commas
            const start = timeParts[0].trim().replace(".", ",");
            const end = timeParts[1].trim().replace(".", ",");
            const text = lines.slice(timeLineIdx + 1).join("\n");
            const confidence = 1.0;
            return { id: idx + 1, start, end, text, confidence };
        })
        .filter(Boolean) as Subtitle[];
}

/** Convert Subtitle array back to SRT string */
export function subtitlesToSrt(subtitles: Subtitle[]): string {
    return subtitles
        .map((s) => `${s.id}\n${s.start} --> ${s.end}\n${s.text}\n`)
        .join("\n");
}

/** Clip subtitles to a time range and shift timestamps so trimStart becomes 0 */
export function clipAndShiftSubtitles(
    subtitles: Subtitle[],
    trimStartSec: number,
    trimEndSec: number
): Subtitle[] {
    const result: Subtitle[] = [];
    let newId = 1;
    for (const sub of subtitles) {
        const start = parseSrtTime(sub.start);
        const end = parseSrtTime(sub.end);
        if (end <= trimStartSec || start >= trimEndSec) continue;
        const clampedStart = Math.max(start, trimStartSec) - trimStartSec;
        const clampedEnd = Math.min(end, trimEndSec) - trimStartSec;
        result.push({
            id: newId++,
            start: formatSrtTime(clampedStart),
            end: formatSrtTime(clampedEnd),
            text: sub.text,
            confidence: sub.confidence,
        });
    }
    return result;
}

/** Get highlighted word index for TikTok-style word-by-word animation */
export function getHighlightedWordIndex(
    subtitle: Subtitle,
    currentTime: number
): number {
    const start = parseSrtTime(subtitle.start);
    const end = parseSrtTime(subtitle.end);
    const dur = end - start;
    if (dur <= 0) return 0;
    const progress = (currentTime - start) / dur;
    const words = subtitle.text.split(/\s+/);
    return Math.min(Math.floor(progress * words.length), words.length - 1);
}

/** Find the active subtitle at a given time */
export function findActiveSubtitle(
    subtitles: Subtitle[],
    currentTime: number
): Subtitle | null {
    return (
        subtitles.find((s) => {
            const start = parseSrtTime(s.start);
            const end = parseSrtTime(s.end);
            return currentTime >= start && currentTime <= end;
        }) || null
    );
}

/** Find the nearest subtitle to the current time (for scroll tracking between gaps) */
export function findNearestSubtitle(
    subtitles: Subtitle[],
    currentTime: number
): Subtitle | null {
    if (subtitles.length === 0) return null;
    let closest = subtitles[0];
    let closestDist = Infinity;
    for (const s of subtitles) {
        const start = parseSrtTime(s.start);
        const end = parseSrtTime(s.end);
        const mid = (start + end) / 2;
        const dist = Math.abs(currentTime - mid);
        if (dist < closestDist) {
            closestDist = dist;
            closest = s;
        }
    }
    return closest;
}

// ── Position & Color ──

export type SubtitleVertical = "top" | "middle" | "bottom";
export type SubtitleHorizontal = "left" | "center" | "right";

export interface SubtitlePosition {
    vertical: SubtitleVertical;
    horizontal: SubtitleHorizontal;
}

export const DEFAULT_POSITION: SubtitlePosition = { vertical: "bottom", horizontal: "center" };

export interface SubtitleColorOption {
    id: string;
    label: string;
    hex: string;      // CSS hex color
    assAbgr: string;  // ASS ABGR format &HAABBGGRR
}

export const HIGHLIGHT_COLORS: SubtitleColorOption[] = [
    { id: "yellow",  label: "Yellow",  hex: "#FACC15", assAbgr: "&H0015CCFA" },
    { id: "white",   label: "White",   hex: "#FFFFFF", assAbgr: "&H00FFFFFF" },
    { id: "green",   label: "Green",   hex: "#22C55E", assAbgr: "&H005EC522" },
    { id: "cyan",    label: "Cyan",    hex: "#06B6D4", assAbgr: "&H00D4B606" },
    { id: "red",     label: "Red",     hex: "#EF4444", assAbgr: "&H004444EF" },
    { id: "orange",  label: "Orange",  hex: "#F97316", assAbgr: "&H001673F9" },
    { id: "pink",    label: "Pink",    hex: "#EC4899", assAbgr: "&H009948EC" },
];

/** Map (vertical, horizontal) to ASS alignment integer (1–9) */
export function positionToAssAlignment(position: SubtitlePosition): number {
    const rowOffset = { bottom: 0, middle: 3, top: 6 }[position.vertical];
    const col = { left: 1, center: 2, right: 3 }[position.horizontal];
    return rowOffset + col;
}

// ── VTT Export ──

/** Convert Subtitle array to WebVTT string */
export function subtitlesToVtt(subtitles: Subtitle[]): string {
    const body = subtitles
        .map((s, i) => {
            const start = s.start.replace(",", ".");
            const end = s.end.replace(",", ".");
            return `${i + 1}\n${start} --> ${end}\n${s.text}\n`;
        })
        .join("\n");
    return `WEBVTT\n\n${body}`;
}

// ── TikTok Word-by-Word Expansion ──

/**
 * Expand each subtitle cue into per-word cues for TikTok-style export.
 * Each word gets an equal share of the cue's duration.
 */
export function expandTikTokSubtitles(subtitles: Subtitle[]): Subtitle[] {
    const expanded: Subtitle[] = [];
    let newId = 1;
    for (const sub of subtitles) {
        const startSec = parseSrtTime(sub.start);
        const endSec = parseSrtTime(sub.end);
        const words = sub.text.split(/\s+/).filter(Boolean);
        if (words.length === 0) continue;
        const durPerWord = (endSec - startSec) / words.length;
        for (let i = 0; i < words.length; i++) {
            expanded.push({
                id: newId++,
                start: formatSrtTime(startSec + i * durPerWord),
                end: formatSrtTime(startSec + (i + 1) * durPerWord),
                text: words[i],
                confidence: sub.confidence,
            });
        }
    }
    return expanded;
}

// ── Supported Transcription Languages ──

export const TRANSCRIPTION_LANGUAGES = [
    { code: "",   label: "Auto Detect" },
    { code: "en", label: "English" },
    { code: "es", label: "Spanish" },
    { code: "fr", label: "French" },
    { code: "de", label: "German" },
    { code: "it", label: "Italian" },
    { code: "pt", label: "Portuguese" },
    { code: "ja", label: "Japanese" },
    { code: "ko", label: "Korean" },
    { code: "zh", label: "Chinese" },
    { code: "ar", label: "Arabic" },
    { code: "ru", label: "Russian" },
    { code: "nl", label: "Dutch" },
    { code: "pl", label: "Polish" },
    { code: "tr", label: "Turkish" },
    { code: "vi", label: "Vietnamese" },
    { code: "hi", label: "Hindi" },
    { code: "id", label: "Indonesian" },
    { code: "th", label: "Thai" },
    { code: "uk", label: "Ukrainian" },
];
