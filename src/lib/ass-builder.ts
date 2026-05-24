/**
 * Shared ASS subtitle file builder — runs on both client (JASSUB preview)
 * and server (FFmpeg export pipeline).
 *
 * This single source of truth means preview and export use identical styling.
 * Any change here affects both simultaneously.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubtitleStyleConfig {
    /** Base style preset (determines visual concept + smart defaults) */
    preset: string;
    fontFamily: string;
    /** Font size multiplier on top of preset baseline (0.5 – 2.0) */
    fontSizeScale: number;
    positionV: "top" | "middle" | "bottom";
    positionH: "left" | "center" | "right";
    /** Text fill color "#RRGGBB" */
    primaryColor: string;
    /** Outline / stroke color "#RRGGBB" */
    outlineColor: string;
    /** Background / box color "#RRGGBB" */
    backgroundColor: string;
    /** Background opacity 0 (transparent) – 100 (opaque) */
    backgroundOpacity: number;
    /** Outline stroke thickness 0–8 */
    outlineSize: number;
    /** Drop-shadow distance 0–10 */
    shadowSize: number;
    /** ASS letter-spacing / Spacing field 0–10 */
    letterSpacing: number;
    bold: boolean;
    italic: boolean;
    /** Entrance animation baked into ASS override tags */
    animation: "none" | "fade" | "pop" | "slide-up" | "karaoke";
}

// ── Preset defaults ──────────────────────────────────────────────────────────

const PRESET_DEFAULTS: Record<string, Partial<SubtitleStyleConfig>> = {
    classic: {
        primaryColor: "#FFFFFF", outlineColor: "#000000",
        backgroundColor: "#000000", backgroundOpacity: 60,
        outlineSize: 0, shadowSize: 0,
        bold: false, italic: false, letterSpacing: 0, fontSizeScale: 1.0,
    },
    tiktok: {
        primaryColor: "#FACC15", outlineColor: "#000000",
        backgroundColor: "#000000", backgroundOpacity: 0,
        outlineSize: 4, shadowSize: 0,
        bold: true, italic: false, letterSpacing: 1, fontSizeScale: 1.2,
    },
    box: {
        primaryColor: "#000000", outlineColor: "#000000",
        backgroundColor: "#FFFFFF", backgroundOpacity: 100,
        outlineSize: 0, shadowSize: 0,
        bold: true, italic: false, letterSpacing: 0, fontSizeScale: 1.0,
    },
    cinematic: {
        primaryColor: "#FFFFFF", outlineColor: "#000000",
        backgroundColor: "#000000", backgroundOpacity: 0,
        outlineSize: 0, shadowSize: 6,
        bold: false, italic: true, letterSpacing: 4, fontSizeScale: 0.9,
    },
    outline: {
        primaryColor: "#FFFFFF", outlineColor: "#000000",
        backgroundColor: "#000000", backgroundOpacity: 0,
        outlineSize: 3, shadowSize: 1,
        bold: true, italic: false, letterSpacing: 0, fontSizeScale: 1.05,
    },
    "bold-center": {
        primaryColor: "#FFFFFF", outlineColor: "#000000",
        backgroundColor: "#000000", backgroundOpacity: 0,
        outlineSize: 4, shadowSize: 0,
        bold: true, italic: false, letterSpacing: 0, fontSizeScale: 1.6,
    },
};

export function getPresetDefaults(preset: string): Partial<SubtitleStyleConfig> {
    return PRESET_DEFAULTS[preset] ?? PRESET_DEFAULTS.classic;
}

export function createDefaultStyleConfig(preset = "classic"): SubtitleStyleConfig {
    const d = getPresetDefaults(preset);
    return {
        preset,
        fontFamily: "Roboto",
        fontSizeScale: d.fontSizeScale ?? 1.0,
        positionV: "bottom",
        positionH: "center",
        primaryColor: d.primaryColor ?? "#FFFFFF",
        outlineColor: d.outlineColor ?? "#000000",
        backgroundColor: d.backgroundColor ?? "#000000",
        backgroundOpacity: d.backgroundOpacity ?? 0,
        outlineSize: d.outlineSize ?? 2,
        shadowSize: d.shadowSize ?? 0,
        letterSpacing: d.letterSpacing ?? 0,
        bold: d.bold ?? false,
        italic: d.italic ?? false,
        animation: "none",
    };
}

// ── Color utilities ──────────────────────────────────────────────────────────

/** "#RRGGBB" + opacity 0–100 → ASS "&HAABBGGRR" */
export function hexToAss(hex: string, opacity = 100): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const alpha = Math.round((1 - Math.max(0, Math.min(100, opacity)) / 100) * 255);
    const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
    return `&H${h(alpha)}${h(b)}${h(g)}${h(r)}`;
}

/** ASS "&HAABBGGRR" → hex "#RRGGBB" (discards alpha) */
export function assToHex(assColor: string): string {
    const m = assColor.match(/&H[0-9A-Fa-f]{2}([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})/i);
    if (!m) return "#FFFFFF";
    const [, bb, gg, rr] = m;
    return `#${rr}${gg}${bb}`.toUpperCase();
}

// ── Time ─────────────────────────────────────────────────────────────────────

/** "HH:MM:SS,mmm" → "H:MM:SS.cc" (centiseconds) */
export function srtTimeToAss(srtTime: string): string {
    const [hms = "", msStr = "0"] = srtTime.trim().split(",");
    const [hh = "0", mm = "00", ss = "00"] = hms.split(":");
    // Use Math.floor (not Math.round) so 999ms → 99cs, not 100cs (overflow)
    const cs = Math.min(99, Math.floor(parseInt(msStr) / 10));
    return `${parseInt(hh)}:${mm}:${ss}.${String(cs).padStart(2, "0")}`;
}

// ── Alignment ────────────────────────────────────────────────────────────────

/** (vertical, horizontal) → ASS numpad alignment 1–9 */
export function positionToAlignment(v: string, h: string): number {
    const row = ({ bottom: 0, middle: 3, top: 6 } as Record<string, number>)[v] ?? 0;
    const col = ({ left: 1, center: 2, right: 3 } as Record<string, number>)[h] ?? 2;
    return row + col;
}

// ── Animation tags ───────────────────────────────────────────────────────────

/** Returns the ASS override tag to prepend to each Dialogue text for entrance animations */
function makeAnimTag(
    animation: SubtitleStyleConfig["animation"],
    alignment: number,
    vDim: { width: number; height: number },
    marginV: number,
): string {
    if (animation === "none" || animation === "karaoke") return "";

    if (animation === "fade") return "{\\fad(300,300)}";

    if (animation === "pop") {
        // Scale 0→105%→100% with slight overshoot; anchor at the alignment point
        return "{\\fscx0\\fscy0\\t(0,180,1,\\fscx105\\fscy105)\\t(180,270,1,\\fscx100\\fscy100)}";
    }

    if (animation === "slide-up") {
        const col = (alignment - 1) % 3; // 0=left 1=center 2=right
        const row = Math.floor((alignment - 1) / 3); // 0=bottom 1=middle 2=top
        const x = col === 0 ? 10 : col === 1 ? Math.round(vDim.width / 2) : vDim.width - 10;
        const y = row === 0 ? vDim.height - marginV : row === 1 ? Math.round(vDim.height / 2) : marginV;
        const dy = Math.round(45 * vDim.height / 720);
        return `{\\pos(${x},${y})\\move(${x},${y + dy},${x},${y},0,300)\\fad(250,0)}`;
    }

    return "";
}

// ── Main builder ─────────────────────────────────────────────────────────────

/** Base font sizes (at scale=1.0) per preset, tuned for a 720p PlayRes canvas */
const BASE_FONT_SIZES: Record<string, number> = {
    classic: 36, tiktok: 52, box: 36,
    cinematic: 32, outline: 38, "bold-center": 58,
};

/**
 * Build a complete, self-contained ASS subtitle file.
 * Both the JASSUB browser preview and the FFmpeg burn-in pipeline call this
 * function with the same arguments, guaranteeing identical output.
 *
 * @param srtContent  SRT text (already word-expanded for karaoke if needed)
 * @param config      Full style + animation options
 * @param vDim        Native video dimensions (default 1280×720)
 */
export function buildAssFile(
    srtContent: string,
    config: SubtitleStyleConfig,
    vDim: { width: number; height: number } = { width: 1280, height: 720 },
): string {
    const {
        preset, fontFamily, fontSizeScale,
        positionV, positionH,
        primaryColor, outlineColor, backgroundColor, backgroundOpacity,
        outlineSize, shadowSize, letterSpacing,
        bold, italic, animation,
    } = config;

    const alignment = positionToAlignment(positionV, positionH);
    const scale = vDim.height / 720;
    const marginV = positionV === "middle"
        ? Math.round(8 * scale)
        : Math.round(45 * scale);

    const base = BASE_FONT_SIZES[preset] ?? 36;
    const fontSize = Math.round(base * fontSizeScale * scale);

    // Box styles use BorderStyle=3 (opaque box fill via BackColour)
    // All other styles use BorderStyle=1 (outline + shadow model)
    const isBoxStyle = preset === "classic" || preset === "box";
    const borderStyle = isBoxStyle ? 3 : 1;

    const primaryAss = hexToAss(primaryColor, 100);
    const outlineAss = hexToAss(outlineColor, 100);
    const backAss = hexToAss(backgroundColor, isBoxStyle ? backgroundOpacity : 100);

    // Box style: no visible outline / shadow — they'd conflict with the filled box
    const effectiveOutline = isBoxStyle ? 0 : outlineSize;
    const effectiveShadow = isBoxStyle ? 0 : shadowSize;

    const assBold = bold ? -1 : 0;
    const assItalic = italic ? -1 : 0;

    // ASS Style line (V4+):
    // Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,
    // Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle,
    // BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
    const styleRow = [
        "Default", fontFamily, fontSize,
        primaryAss, "&H000000FF", outlineAss, backAss,
        assBold, assItalic, 0, 0,
        100, 100, letterSpacing, 0,
        borderStyle, effectiveOutline, effectiveShadow,
        alignment, 10, 10, marginV, 1,
    ].join(",");

    // Animation override tag (same for every cue in this render)
    const animTag = makeAnimTag(animation, alignment, vDim, marginV);

    // Parse SRT → ASS Dialogue events
    const dialogues: string[] = [];
    for (const block of srtContent.trim().split(/\n\s*\n/)) {
        const lines = block.split("\n").filter(l => l.trim());
        if (lines.length < 2) continue;
        const ti = lines.findIndex(l => l.includes("-->"));
        if (ti === -1) continue;
        const parts = lines[ti].split(" --> ");
        if (parts.length !== 2) continue;
        const start = srtTimeToAss(parts[0]);
        const end   = srtTimeToAss(parts[1]);
        const text  = lines.slice(ti + 1).join("\\N").replace(/\{/g, "\\{");
        dialogues.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${animTag}${text}`);
    }

    return [
        "[Script Info]",
        "ScriptType: v4.00+",
        "Collisions: Normal",
        `PlayResX: ${vDim.width}`,
        `PlayResY: ${vDim.height}`,
        "Timer: 100.0000",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        `Style: ${styleRow}`,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        ...dialogues,
    ].join("\n");
}
