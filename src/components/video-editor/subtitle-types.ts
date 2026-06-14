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
    /** Standard subtitle — white text in a translucent rounded black box. */
    { id: "classic",     name: "Classic",   desc: "White text, soft black box",       icon: "📺" },
    /** Real TikTok look — yellow rounded box behind the active spoken word. */
    { id: "tiktok",      name: "TikTok",    desc: "Yellow box on spoken word",        icon: "🎯" },
    /** Black text on a solid white block with a drop shadow. */
    { id: "box",         name: "Modern Box", desc: "Black text on white block",       icon: "⬜" },
    /** Delicate light italic, wide tracking, soft cinematic shadow. */
    { id: "cinematic",   name: "Cinematic", desc: "Light italic, soft shadow",        icon: "🎬" },
    /** Bold white text with a clean black stroke — universal hero caption. */
    { id: "outline",     name: "Outline",   desc: "Bold white, black stroke",         icon: "✏️" },
    /** Huge centred uppercase hero text with stroke + glow. */
    { id: "bold-center", name: "Bold Center", desc: "Huge centred hero text",         icon: "💥" },
    /**
     * Sentence-level reveal with optional Spotlight / Cascade modifiers.
     * Default: each word turns yellow as it's spoken. Toggle "Fade inactive"
     * for Spotlight-style dim, "Word entrance" for Cascade-style pop-in.
     */
    { id: "reveal",      name: "Reveal",    desc: "Word-by-word highlight",           icon: "💡" },
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

// ── Advanced per-word ASS expanders ──────────────────────────────────────────
//
// These build a `Subtitle[]` whose `.text` already contains ASS override tags
// (`{\k20}`, `{\fscx80\\t(...)}`, etc.). Those tags survive `subtitlesToSrt`
// round-tripping and `buildAssFile` injects them straight into the Dialogue
// text — so the same expanded form drives both the JASSUB preview and the
// FFmpeg burn pipeline.

/** Internal: "#RRGGBB" → ASS "&H00BBGGRR" (opaque). Kept local to avoid
 *  a hard import dependency from subtitle-types.ts onto ass-builder.ts. */
function rgbToAssBgr(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
    return `&H00${h(b)}${h(g)}${h(r)}&`;
}

/** Per-word scale variance for cascade entrance — deterministic so a given
 *  word always lays out the same way (95 / 100 / 105 / 110 %). */
function cascadeWordScale(word: string, idx: number): number {
    const seed = (word.length * 7 + idx * 13) % 4;
    return 95 + seed * 5;
}

/**
 * One Dialogue per cue with `\k` (instant) or `\kf` (smooth-fill) karaoke
 * tags between words. The active word transitions from SecondaryColour to
 * PrimaryColour as it's spoken; libass handles the rest.
 *
 * Used by the Reveal preset when `revealWordEntrance` is false:
 *   - tag="k":  sharp color shift — each word snaps to PrimaryColour as
 *               its tick passes (cumulative buildup across the line).
 *   - tag="kf": smooth fill — paired with a faded SecondaryColour (set by
 *               buildAssFile when revealFadeInactive=true), this gives a
 *               Spotlight-style "dim → bright as spoken" effect.
 */
export function expandKaraokeInline(
    subtitles: Subtitle[],
    tag: "k" | "kf" = "k",
): Subtitle[] {
    return subtitles.map((sub) => {
        const words = sub.text.split(/\s+/).filter(Boolean);
        if (words.length <= 1) return sub;

        const durationCs = Math.max(
            words.length,
            Math.round((parseSrtTime(sub.end) - parseSrtTime(sub.start)) * 100),
        );
        // Distribute centiseconds across words; integer arithmetic so the
        // sum stays a clean count (no fractional dropout on a sentence end).
        const perWord = Math.floor(durationCs / words.length);
        const remainder = durationCs - perWord * words.length;

        const text = words
            .map((w, i) => {
                const cs = perWord + (i < remainder ? 1 : 0);
                return `{\\${tag}${cs}}${w}`;
            })
            .join(" ");

        return { ...sub, text };
    });
}

/**
 * Cascade-style Reveal: N progressive snapshot Dialogues per cue, each
 * snapshot showing words 0..i with the newest word arriving via a blur +
 * scale + fade entrance. Per-word scale variance gives the line a
 * hand-keyed rhythm.
 *
 *   - fadeInactive=false: older words sit at full opacity once they've
 *                         appeared (CapCut "typing-on" look).
 *   - fadeInactive=true:  older words dim back to ~35% opacity once a
 *                         new word arrives — the spotlight follows the
 *                         speaker word by word.
 */
export function expandRevealCascade(
    subtitles: Subtitle[],
    fadeInactive: boolean,
): Subtitle[] {
    const out: Subtitle[] = [];
    let nextId = 1;

    for (const sub of subtitles) {
        const words = sub.text.split(/\s+/).filter(Boolean);
        const startSec = parseSrtTime(sub.start);
        const endSec = parseSrtTime(sub.end);

        if (words.length <= 1) {
            out.push({ ...sub, id: nextId++ });
            continue;
        }

        const totalMs = Math.max(words.length * 60, (endSec - startSec) * 1000);
        const perWordMs = totalMs / words.length;
        // Cap entrance to 70% of the per-word slot so the next snapshot
        // doesn't cut it off; 80 ms floor keeps it feeling snappy.
        const entranceMs = Math.max(80, Math.min(220, Math.round(perWordMs * 0.7)));
        // 35% visible ≈ alpha 0xA6. Used to dim older words when fadeInactive.
        const dimAlpha = "A6";

        for (let i = 0; i < words.length; i++) {
            const snapStart = startSec + (i * perWordMs) / 1000;
            const snapEnd = i === words.length - 1
                ? endSec
                : startSec + ((i + 1) * perWordMs) / 1000;

            const segments: string[] = [];
            for (let k = 0; k <= i; k++) {
                const s = cascadeWordScale(words[k], k);
                if (k === i) {
                    // Newest word — entrance: blur, sub-100% scale, transparent,
                    // all animating to the resting state over `entranceMs`.
                    const s0 = Math.round(s * 0.75);
                    segments.push(
                        `{\\fscx${s0}\\fscy${s0}\\blur5\\alpha&HFF&` +
                        `\\t(0,${entranceMs},\\fscx${s}\\fscy${s}\\blur0\\alpha&H00&)}` +
                        words[k]
                    );
                } else {
                    // Older word — settled. Dim if fadeInactive, else full opacity.
                    const a = fadeInactive ? dimAlpha : "00";
                    segments.push(`{\\fscx${s}\\fscy${s}\\alpha&H${a}&}${words[k]}`);
                }
            }

            out.push({
                id: nextId++,
                start: formatSrtTime(snapStart),
                end: formatSrtTime(snapEnd),
                text: segments.join(" "),
                confidence: sub.confidence,
            });
        }
    }
    return out;
}

// ── TikTok per-word box overlay ──────────────────────────────────────────────
//
// Fallback width factors used only when Canvas `measureText` is unavailable
// (server-side burn path, SSR). When running in a browser we measure the
// actual rendered text instead — the Google Fonts <link> in app/layout.tsx
// registers every preset font with `document.fonts` early in app boot, so
// Canvas hits the same glyph metrics libass uses and the per-word \pos
// math lines up with the rendered base sentence.
const FONT_WIDTH_FACTORS: Record<string, number> = {
    "Roboto":     0.50,
    "Anton":      0.40,
    "Lora":       0.50,
    "Oswald":     0.42,
    "Space Mono": 0.60,
    "Nunito":     0.55,
};
const SPACE_WIDTH_FACTOR_FALLBACK = 0.32;
/** Sentence is constrained to this fraction of the video width — anything
 *  longer wraps onto additional lines. 0.85 ≈ 7.5% margin on each side,
 *  which is roughly what TikTok itself uses. */
const MAX_LINE_RATIO = 0.85;
/** Per-line vertical spacing as a multiple of font size. Tuned for Anton's
 *  tight metric; close enough on the other sans-serifs we ship. */
const LINE_HEIGHT_FACTOR = 1.20;

/** Lazily-allocated 2D context, reused across calls to avoid re-creating
 *  a Canvas element on every word. SSR / non-browser → returns null. */
let _measureCtx: CanvasRenderingContext2D | null | undefined;
function getMeasureCtx(): CanvasRenderingContext2D | null {
    if (_measureCtx !== undefined) return _measureCtx;
    if (typeof document === "undefined") return (_measureCtx = null);
    try {
        _measureCtx = document.createElement("canvas").getContext("2d");
    } catch {
        _measureCtx = null;
    }
    return _measureCtx;
}

function estimateWordWidth(word: string, fontFamily: string, fontSize: number): number {
    const ctx = getMeasureCtx();
    if (ctx) {
        // 700 weight matches the TikTok preset's `bold: true`. Quotes around
        // the family allow names containing spaces ("Space Mono").
        ctx.font = `700 ${fontSize}px "${fontFamily}", sans-serif`;
        const w = ctx.measureText(word).width;
        if (w > 0) return w;
    }
    const factor = FONT_WIDTH_FACTORS[fontFamily] ?? 0.50;
    return word.length * fontSize * factor;
}

function estimateSpaceWidth(fontFamily: string, fontSize: number): number {
    const ctx = getMeasureCtx();
    if (ctx) {
        ctx.font = `700 ${fontSize}px "${fontFamily}", sans-serif`;
        const w = ctx.measureText(" ").width;
        if (w > 0) return w;
    }
    return fontSize * SPACE_WIDTH_FACTOR_FALLBACK;
}

interface LaidOutLine {
    /** Words in this line, in order. */
    words: string[];
    /** Estimated pixel width per word. */
    widths: number[];
    /** Index in the original sentence of this line's first word — used to
     *  preserve per-word karaoke timing across the line break. */
    startIdx: number;
    /** Total pixel width of the line (sum of word widths + interword spaces). */
    totalWidth: number;
}

/** Greedy word-wrap: pack words into lines, breaking as soon as the next
 *  word would push the line past `maxLineWidth`. */
function layoutLines(
    words: string[],
    widths: number[],
    maxLineWidth: number,
    spaceW: number,
): LaidOutLine[] {
    const out: LaidOutLine[] = [];
    let cur: LaidOutLine = { words: [], widths: [], startIdx: 0, totalWidth: 0 };

    for (let i = 0; i < words.length; i++) {
        const wW = widths[i];
        const space = cur.words.length > 0 ? spaceW : 0;
        if (cur.words.length > 0 && cur.totalWidth + space + wW > maxLineWidth) {
            out.push(cur);
            cur = { words: [], widths: [], startIdx: i, totalWidth: 0 };
        }
        cur.words.push(words[i]);
        cur.widths.push(wW);
        cur.totalWidth += space + wW;
    }
    if (cur.words.length > 0) out.push(cur);
    return out;
}

/**
 * Build an ASS vector-drawing path for a rounded rectangle centred on the
 * origin (so `\an5\pos(cx,cy)` drops it exactly on a point). Half-width `hw`,
 * half-height `hh`, corner radius `r`. Coordinates are integers in PlayRes
 * pixel space; `\p1` (scale 1) renders them 1:1.
 */
function roundedRectPath(hw: number, hh: number, r: number): string {
    r = Math.max(0, Math.min(r, hw, hh));
    const k = 0.5523;            // cubic-bezier circle approximation
    const o = r * (1 - k);       // control-point inset from the corner
    const R = (n: number) => Math.round(n);
    const L = -hw, Rt = hw, T = -hh, B = hh;
    return [
        `m ${R(L + r)} ${R(T)}`,
        `l ${R(Rt - r)} ${R(T)}`,
        `b ${R(Rt - o)} ${R(T)} ${R(Rt)} ${R(T + o)} ${R(Rt)} ${R(T + r)}`,
        `l ${R(Rt)} ${R(B - r)}`,
        `b ${R(Rt)} ${R(B - o)} ${R(Rt - o)} ${R(B)} ${R(Rt - r)} ${R(B)}`,
        `l ${R(L + r)} ${R(B)}`,
        `b ${R(L + o)} ${R(B)} ${R(L)} ${R(B - o)} ${R(L)} ${R(B - r)}`,
        `l ${R(L)} ${R(T + r)}`,
        `b ${R(L)} ${R(T + o)} ${R(L + o)} ${R(T)} ${R(L + r)} ${R(T)}`,
    ].join(" ");
}

/**
 * Real TikTok caption look — full sentence in white with the currently-spoken
 * word sitting on a solid rounded highlight box (black text on colour).
 *
 * Per cue we emit:
 *   1. A "base" event: the wrapped sentence in white with a black stroke,
 *      joined by `\N` and `\q2` so libass honours our wrap points.
 *   2. For each word, during its active window, two stacked events:
 *        a. a filled rounded rectangle (vector drawing) in the box colour;
 *        b. the word again in black, on top of that box.
 *      All three layers share `\an5\pos(cx,cy)` so the box and black word
 *      land exactly over the white word underneath. Same-layer events render
 *      in file order, so base → box → black word composites correctly.
 *
 * Word x/y come from Canvas-measured widths (browser) baked into the SRT, so
 * the preview and the burn consume the *identical* positions — 1:1 by
 * construction. A real drawn rectangle (not a thick `\bord` halo) gives the
 * clean pill TikTok uses, with consistent height regardless of glyph shape.
 *
 * @param boxHex      "#RRGGBB" of the highlight box
 * @param fontFamily  Drives both the rendered font and the width estimate
 * @param fontSize    Already in the target video's pixel space
 * @param vDim        Target video dimensions for `\pos` math
 * @param positionV   bottom / middle / top — picks the y origin
 */
export function expandTikTokBox(
    subtitles: Subtitle[],
    boxHex: string,
    fontFamily: string,
    fontSize: number,
    vDim: { width: number; height: number },
    positionV: "top" | "middle" | "bottom",
): Subtitle[] {
    const out: Subtitle[] = [];
    let nextId = 1;

    const boxAss = rgbToAssBgr(boxHex);
    const spaceW = estimateSpaceWidth(fontFamily, fontSize);
    const maxLineWidth = vDim.width * MAX_LINE_RATIO;
    const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
    // Must match buildAssFile's marginV (which scales 45/8 by height/720) so the
    // per-word boxes sit on the same baseline as the style-positioned base text.
    const marginV = (positionV === "middle" ? 8 : 45) * (vDim.height / 720);

    // Box geometry, all derived from the rendered font size.
    const padX = fontSize * 0.22;        // horizontal breathing room
    const boxHalfH = fontSize * 0.62;    // half the pill height
    const cornerR = fontSize * 0.18;     // rounded corner radius
    const baseStroke = Math.max(2, Math.round(fontSize * 0.06));

    for (const sub of subtitles) {
        const words = sub.text.split(/\s+/).filter(Boolean);
        if (words.length === 0) continue;

        const widths = words.map((w) => estimateWordWidth(w, fontFamily, fontSize));
        const lines = layoutLines(words, widths, maxLineWidth, spaceW);
        const numLines = lines.length;

        // 1) Base sentence with our explicit wrap. `\q2` = no libass auto-wrap.
        const baseText = lines.map((l) => l.words.join(" ")).join("\\N");
        out.push({
            id: nextId++,
            start: sub.start,
            end:   sub.end,
            text:
                `{\\q2\\an${positionV === "top" ? 8 : positionV === "middle" ? 5 : 2}` +
                `\\1c&HFFFFFF&\\3c&H000000&\\bord${baseStroke}\\shad0\\b1}${baseText}`,
            confidence: sub.confidence,
        });

        // 2) Per-word highlight box + black word, timed to each word.
        const startSec = parseSrtTime(sub.start);
        const perWordSec = (parseSrtTime(sub.end) - startSec) / words.length;

        for (let li = 0; li < numLines; li++) {
            const line = lines[li];

            // Y centre of this wrapped line, mirroring how the base text stacks.
            const lineY = (() => {
                const halfFont = fontSize / 2;
                if (positionV === "top") {
                    return marginV + li * lineHeight + halfFont;
                }
                if (positionV === "middle") {
                    const blockTop = vDim.height / 2 - (numLines * lineHeight) / 2;
                    return blockTop + li * lineHeight + halfFont;
                }
                return vDim.height - marginV - (numLines - 1 - li) * lineHeight - halfFont;
            })();

            let cursorX = vDim.width / 2 - line.totalWidth / 2;
            for (let wi = 0; wi < line.words.length; wi++) {
                const w = line.widths[wi];
                const centerX = Math.round(cursorX + w / 2);
                const cy = Math.round(lineY);
                cursorX += w + spaceW;

                const globalIdx = line.startIdx + wi;
                const wStart = startSec + globalIdx * perWordSec;
                const wEnd   = startSec + (globalIdx + 1) * perWordSec;
                const startStr = formatSrtTime(wStart);
                const endStr   = formatSrtTime(wEnd);

                // a. Filled rounded rectangle behind the word.
                const path = roundedRectPath(w / 2 + padX, boxHalfH, cornerR);
                out.push({
                    id: nextId++,
                    start: startStr,
                    end:   endStr,
                    text:
                        `{\\an5\\pos(${centerX},${cy})\\1c${boxAss}\\bord0\\shad0\\p1}` +
                        `${path}{\\p0}`,
                    confidence: sub.confidence,
                });

                // b. The word again in black, on top of the box.
                out.push({
                    id: nextId++,
                    start: startStr,
                    end:   endStr,
                    text:
                        `{\\an5\\pos(${centerX},${cy})\\1c&H000000&\\bord0\\shad0\\b1}` +
                        line.words[wi],
                    confidence: sub.confidence,
                });
            }
        }
    }
    return out;
}


/**
 * Dispatch helper: given the chosen animation mode + the config + target
 * video dimensions, return the correctly pre-expanded `Subtitle[]` so the
 * next stage (`subtitlesToSrt → buildAssFile`) doesn't have to know about
 * per-cue effects. Both the JASSUB preview pipeline and the FFmpeg burn
 * pipeline call this so preview and export stay byte-identical.
 */
export function expandForAnimation(
    subtitles: Subtitle[],
    config: {
        animation: string;
        preset?: string;
        revealFadeInactive?: boolean;
        revealWordEntrance?: boolean;
        uppercase?: boolean;
        primaryColor?: string;
        outlineColor?: string;
        outlineSize?: number;
        fontFamily?: string;
        fontSizeScale?: number;
        positionV?: "top" | "middle" | "bottom";
        positionH?: "left" | "center" | "right";
    },
    vDim: { width: number; height: number } = { width: 1280, height: 720 },
): Subtitle[] {
    // Casing transform first, so every downstream expander (and the plain
    // pass-through) works on the already-cased text — and both preview and
    // burn, which both call this, stay identical.
    const src = config.uppercase
        ? subtitles.map((s) => ({ ...s, text: s.text.toUpperCase() }))
        : subtitles;

    switch (config.animation) {
        case "karaoke":
            return expandTikTokSubtitles(src);

        case "reveal": {
            const wordEntrance = config.revealWordEntrance ?? false;
            const fadeInactive = config.revealFadeInactive ?? false;
            return wordEntrance
                ? expandRevealCascade(src, fadeInactive)
                : expandKaraokeInline(src, fadeInactive ? "kf" : "k");
        }

        case "tiktok-box": {
            const boxHex = config.primaryColor ?? "#FACC15";
            // Word-position math needs the rendered font size in target-video
            // pixels. 50 is BASE_FONT_SIZES.tiktok, kept literal so this file
            // stays free of an ass-builder import.
            const tiktokBase = 50;
            const scale = vDim.height / 720;
            const fontSize = Math.round(
                tiktokBase * (config.fontSizeScale ?? 1.15) * scale
            );
            return expandTikTokBox(
                src,
                boxHex,
                config.fontFamily ?? "Roboto",
                fontSize,
                vDim,
                config.positionV ?? "bottom",
            );
        }

        default:
            return src;
    }
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
