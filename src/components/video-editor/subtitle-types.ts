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
    /** Standard subtitle — white text in a translucent dark box. */
    { id: "classic", name: "Classic", desc: "Standard bottom text",                icon: "📺" },
    /** Real TikTok look — yellow rectangle behind the active word as it's spoken. */
    { id: "tiktok",  name: "TikTok",  desc: "Yellow box under spoken word",        icon: "🎯" },
    /** Bold white text with black stroke — universal hero caption. */
    { id: "outline", name: "Outline", desc: "Bold white, black stroke",            icon: "✏️" },
    /**
     * Sentence-level reveal with optional Spotlight / Cascade modifiers.
     * Default: each word turns yellow as it's spoken. Toggle "Fade inactive"
     * for Spotlight-style dim, "Word entrance" for Cascade-style pop-in.
     */
    { id: "reveal",  name: "Reveal",  desc: "Sentence with active word effects",   icon: "💡" },
    /** y2k pop look — white text with cyan/yellow/pink tiered shadow trail. */
    { id: "vibes",   name: "Vibes",   desc: "Stacked pop colour shadow",           icon: "🌈" },
    /** Premium extruded 3D — bright pink front with depth tiers behind. */
    { id: "3d",      name: "3D",      desc: "Extruded depth, pink premium",        icon: "💎" },
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
// Approximate character widths per font (in units of font size). Tuned by
// eye against the fonts we ship; tight enough on bold sans-serifs (Anton
// looks ~95% right at any size), looser on proportional serifs. The TikTok
// preset's font defaults to Anton so the overlays line up cleanly.
const FONT_WIDTH_FACTORS: Record<string, number> = {
    "Roboto":     0.50,
    "Anton":      0.40,  // condensed display sans
    "Lora":       0.50,
    "Oswald":     0.42,
    "Space Mono": 0.60,  // monospace
    "Nunito":     0.55,
};
const SPACE_WIDTH_FACTOR = 0.32;
/** Sentence is constrained to this fraction of the video width — anything
 *  longer wraps onto additional lines. 0.85 ≈ 7.5% margin on each side,
 *  which is roughly what TikTok itself uses. */
const MAX_LINE_RATIO = 0.85;
/** Per-line vertical spacing as a multiple of font size. */
const LINE_HEIGHT_FACTOR = 1.30;

function estimateWordWidth(word: string, fontFamily: string, fontSize: number): number {
    const factor = FONT_WIDTH_FACTORS[fontFamily] ?? 0.50;
    return word.length * fontSize * factor;
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
 * Real TikTok caption look — "active word box" variant.
 *
 * Each cue emits two kinds of Dialogue events:
 *   1. A "base" event: the wrapped sentence in white with a thin black
 *      stroke, joined by `\N` so libass uses our wrap points.
 *   2. One overlay event per word: a black-text-on-yellow-rectangle pill
 *      positioned over that word, timed for when the word is "active".
 *
 * Line wrapping is computed in JS from per-font width factors so we can
 * place the per-word overlays at the same x/y libass renders the base
 * text at. `\q2` on the base disables libass's own wrapping, locking it
 * to ours. ~5% drift is possible on proportional fonts; Anton (default
 * for this preset) is tight enough that the boxes visibly hug the words.
 *
 * @param boxHex      "#RRGGBB" of the highlight pill
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
    const spaceW = fontSize * SPACE_WIDTH_FACTOR;
    const maxLineWidth = vDim.width * MAX_LINE_RATIO;
    const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
    // Match the margin used by buildAssFile / positionToAlignment.
    const marginV = positionV === "middle" ? 8 : 45;

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
            text:  `{\\q2\\1c&HFFFFFF&\\3c&H000000&\\bord3\\shad0\\b1}${baseText}`,
            confidence: sub.confidence,
        });

        // 2) Per-word overlays — y depends on which wrapped line the word
        //    landed in, x on its position within that line.
        const startSec = parseSrtTime(sub.start);
        const perWordSec = (parseSrtTime(sub.end) - startSec) / words.length;

        for (let li = 0; li < numLines; li++) {
            const line = lines[li];

            // Y center of this line. For bottom alignment the *last* line sits
            // at the bottom margin; earlier lines stack above. For top, line 0
            // sits at the top margin. For middle, the block is centred.
            const lineY = (() => {
                const halfFont = fontSize / 2;
                if (positionV === "top") {
                    return marginV + li * lineHeight + halfFont;
                }
                if (positionV === "middle") {
                    const blockTop = vDim.height / 2 - (numLines * lineHeight) / 2;
                    return blockTop + li * lineHeight + halfFont;
                }
                // bottom
                return vDim.height - marginV - (numLines - 1 - li) * lineHeight - halfFont;
            })();

            let cursorX = vDim.width / 2 - line.totalWidth / 2;
            for (let wi = 0; wi < line.words.length; wi++) {
                const w = line.widths[wi];
                const centerX = cursorX + w / 2;
                cursorX += w + spaceW;

                const globalIdx = line.startIdx + wi;
                const wStart = startSec + globalIdx * perWordSec;
                const wEnd   = startSec + (globalIdx + 1) * perWordSec;

                out.push({
                    id: nextId++,
                    start: formatSrtTime(wStart),
                    end:   formatSrtTime(wEnd),
                    text:
                        `{\\an5\\pos(${Math.round(centerX)},${Math.round(lineY)})` +
                        `\\1c&H000000&\\3c${boxAss}\\bord12\\shad0\\b1}` +
                        line.words[wi],
                    confidence: sub.confidence,
                });
            }
        }
    }
    return out;
}

/**
 * TikTok "single box" variant — one Dialogue per cue with a chunky coloured
 * stroke that reads as a single pill behind the whole sentence. No per-word
 * highlighting. Text wraps via the libass default. Cheaper to render than
 * the active-word variant and avoids any width-estimation drift.
 */
export function expandTikTokSingleBox(
    subtitles: Subtitle[],
    boxHex: string,
): Subtitle[] {
    const boxAss = rgbToAssBgr(boxHex);
    // \1c black text on \3c box-coloured stroke, \bord thick enough to fake
    // a rounded rectangle around the line. Bold for that TikTok weight.
    const overrides =
        `{\\1c&H000000&\\3c${boxAss}\\bord14\\shad0\\b1}`;
    return subtitles.map((sub) => ({
        ...sub,
        text: overrides + sub.text,
    }));
}

// ── Stacked-shadow expander (Vibes / 3D presets) ─────────────────────────────
//
// Renders each cue as several overlapping Dialogue events at different `\pos`
// offsets, each painted in a different colour. Read back-to-front:
//
//     [deepest shadow]   <- back layer, biggest offset
//     [mid shadow]
//     [front shadow]
//     [main text]        <- top layer, zero offset
//
// All layers share the same anchor + alignment so multi-line cues wrap
// identically across the stack. The shadow layers turn off their own
// outline / shadow (`\3a&HFF&\4a&HFF&\bord0\shad0`) so only the fill colour
// shows — that's what produces the clean tier of colours behind the text.

/** A single shadow layer used by the stacked-shadow renderer. */
export interface ShadowLayer {
    /** Hex colour `#RRGGBB`. */
    color: string;
    /** Pixel offset right of the main text. */
    dx: number;
    /** Pixel offset down from the main text. */
    dy: number;
}

/**
 * Hardcoded palette per preset. Kept local to keep these self-contained —
 * users still recolour the *main* text via the standard Text Color picker;
 * only the shadow layers come from here.
 */
const STACKED_PALETTES: Record<string, ShadowLayer[]> = {
    // Vibes — y2k pop: cyan / yellow / hot pink trail behind white text.
    vibes: [
        { color: "#FF1493", dx: 14, dy: 14 },  // hot pink (deepest)
        { color: "#FFEB3B", dx: 9,  dy: 9  },  // yellow
        { color: "#00E5FF", dx: 4,  dy: 4  },  // cyan
    ],
    // 3D — premium extruded look: black drop-shadow + four shaded purple
    //      tiers fake an "extruded" depth without needing real perspective.
    "3d": [
        { color: "#000000", dx: 14, dy: 14 },
        { color: "#3D1129", dx: 11, dy: 11 },
        { color: "#6B1F4A", dx: 8,  dy: 8  },
        { color: "#9C2E72", dx: 5,  dy: 5  },
        { color: "#C84296", dx: 2,  dy: 2  },
    ],
};

export function getStackedPalette(preset: string): ShadowLayer[] {
    return STACKED_PALETTES[preset] ?? STACKED_PALETTES.vibes;
}

/** Map our (positionV, positionH) → ASS numpad alignment 1–9. Duplicated
 *  here (not imported) so this module stays free of ass-builder imports. */
function computeAssAnchor(
    positionV: "top" | "middle" | "bottom",
    positionH: "left" | "center" | "right",
): number {
    const row = ({ bottom: 0, middle: 3, top: 6 } as Record<string, number>)[positionV] ?? 0;
    const col = ({ left: 1, center: 2, right: 3 } as Record<string, number>)[positionH] ?? 2;
    return row + col;
}

/**
 * Emit a stacked-shadow render of each cue.
 *
 * Each cue produces (layers.length + 1) Dialogue events:
 *   - N shadow layers with `\1c<layer>` and no border/shadow of their own,
 *     placed at `\pos(anchor + dx, anchor + dy)` so they sit behind the main
 *     text by varying offsets.
 *   - 1 main layer at the natural anchor, with `\1c<primary>` and a thin
 *     outline (`\3c<outline>\bord<n>`) for crisp edges over a busy video.
 *
 * Multi-line cues are handled by libass's own line wrapping — every layer
 * shares the same text and style, so they wrap identically (just shifted).
 */
export function expandStackedShadow(
    subtitles: Subtitle[],
    layers: ShadowLayer[],
    primaryHex: string,
    outlineHex: string,
    outlineSize: number,
    vDim: { width: number; height: number },
    positionV: "top" | "middle" | "bottom",
    positionH: "left" | "center" | "right",
): Subtitle[] {
    const out: Subtitle[] = [];
    let nextId = 1;

    const anN = computeAssAnchor(positionV, positionH);
    const marginH = 10;
    const marginV = positionV === "middle" ? 8 : 45;

    const anchorX =
        positionH === "left"  ? marginH :
        positionH === "right" ? vDim.width - marginH :
                                vDim.width / 2;
    const anchorY =
        positionV === "top"    ? marginV :
        positionV === "middle" ? vDim.height / 2 :
                                 vDim.height - marginV;

    const primaryAss = rgbToAssBgr(primaryHex);
    const outlineAss = rgbToAssBgr(outlineHex);
    const bord = Math.max(0, outlineSize);

    for (const sub of subtitles) {
        // Shadow layers — back to front so the closest tier renders last.
        for (let i = layers.length - 1; i >= 0; i--) {
            const l = layers[i];
            const colorAss = rgbToAssBgr(l.color);
            out.push({
                id: nextId++,
                start: sub.start,
                end:   sub.end,
                text:
                    `{\\an${anN}\\pos(${Math.round(anchorX + l.dx)},${Math.round(anchorY + l.dy)})` +
                    `\\1c${colorAss}\\3a&HFF&\\4a&HFF&\\bord0\\shad0\\b1}` +
                    sub.text,
                confidence: sub.confidence,
            });
        }
        // Main (top) layer.
        out.push({
            id: nextId++,
            start: sub.start,
            end:   sub.end,
            text:
                `{\\an${anN}\\pos(${Math.round(anchorX)},${Math.round(anchorY)})` +
                `\\1c${primaryAss}\\3c${outlineAss}\\bord${bord}\\shad0\\b1}` +
                sub.text,
            confidence: sub.confidence,
        });
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
        tiktokStyle?: "active-box" | "single-box";
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
    switch (config.animation) {
        case "karaoke":
            return expandTikTokSubtitles(subtitles);

        case "reveal": {
            const wordEntrance = config.revealWordEntrance ?? false;
            const fadeInactive = config.revealFadeInactive ?? false;
            return wordEntrance
                ? expandRevealCascade(subtitles, fadeInactive)
                : expandKaraokeInline(subtitles, fadeInactive ? "kf" : "k");
        }

        case "tiktok-box": {
            const boxHex = config.primaryColor ?? "#FACC15";
            if ((config.tiktokStyle ?? "active-box") === "single-box") {
                // Single pill behind the whole sentence — no per-word math
                // needed, libass wraps the line itself.
                return expandTikTokSingleBox(subtitles, boxHex);
            }
            // Active-word pill — needs the rendered font size in target-video
            // pixels for the word-position math. 50 is BASE_FONT_SIZES.tiktok,
            // kept literal so this file stays import-free.
            const tiktokBase = 50;
            const scale = vDim.height / 720;
            const fontSize = Math.round(
                tiktokBase * (config.fontSizeScale ?? 1.2) * scale
            );
            return expandTikTokBox(
                subtitles,
                boxHex,
                config.fontFamily ?? "Anton",
                fontSize,
                vDim,
                config.positionV ?? "bottom",
            );
        }

        case "stacked": {
            // Palette is chosen by preset id (Vibes vs 3D etc.). Main text
            // colour follows the user's Text Color swatch; the shadow tiers
            // are baked into the preset for its signature look.
            const palette = getStackedPalette(config.preset ?? "vibes");
            return expandStackedShadow(
                subtitles,
                palette,
                config.primaryColor ?? "#FFFFFF",
                config.outlineColor ?? "#000000",
                config.outlineSize ?? 2,
                vDim,
                config.positionV ?? "bottom",
                config.positionH ?? "center",
            );
        }

        default:
            return subtitles;
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
