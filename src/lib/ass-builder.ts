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
    /**
     * Entrance / playback animation baked into ASS override tags.
     *
     * Simple entrances (fade / pop / slide-up) wrap the full cue.
     *
     * Advanced modes drive a per-cue text expansion in `subtitle-types.ts`:
     *   - `karaoke`    — one word at a time (one Dialogue per word).
     *   - `reveal`     — sentence-level reveal. Behaviour is further shaped
     *                    by `revealFadeInactive` and `revealWordEntrance`
     *                    (see below), so a single mode covers what used to
     *                    be three separate presets.
     *   - `tiktok-box` — real TikTok look. Full sentence rendered, plus a
     *                    yellow rectangle overlay on the currently-spoken
     *                    word, positioned via approximate font metrics.
     */
    animation: "none" | "fade" | "pop" | "slide-up" | "karaoke" | "reveal" | "tiktok-box";

    /**
     * Reveal modifier — when true, inactive words are dimmed (alpha) so the
     * active word visually "pops" out. Old Spotlight preset behaviour.
     */
    revealFadeInactive?: boolean;
    /**
     * Reveal modifier — when true, each new word arrives with a blur +
     * scale + fade entrance. Old Cascade preset behaviour. Independent of
     * `revealFadeInactive` so any combination is possible.
     */
    revealWordEntrance?: boolean;

    /** Force the rendered caption text to UPPERCASE (TikTok / Bold Center). */
    uppercase?: boolean;
    /**
     * Inline `\blur` radius applied to the whole cue. Softens the outline /
     * shadow into a glow — used by Cinematic (soft drop shadow) and Bold
     * Center (halo). 0 = off.
     */
    blur?: number;
}

// ── Preset defaults ──────────────────────────────────────────────────────────

/**
 * Presets that render as an opaque background block (BorderStyle=3) instead of
 * the outline+shadow model (BorderStyle=1). For these, `outlineSize` becomes
 * the box *padding* and `shadowSize` its drop shadow. Single source of truth.
 */
export const BOX_STYLE_PRESETS = new Set(["classic", "box"]);

/**
 * The seven built-in presets, faithfully recreating the Nutlope/ai-subtitles
 * caption looks (classic, tiktok, box, cinematic, outline, bold-center) plus
 * our own word-level Reveal. Each is a distinct *concept*, not just a tweak of
 * the shared sliders — colours, border model, animation and casing differ.
 */
const PRESET_DEFAULTS: Record<string, Partial<SubtitleStyleConfig>> = {
    // ── Classic — white text in a translucent rounded black box ──
    //    BorderStyle=3: outlineSize=box padding, backgroundOpacity=box alpha.
    classic: {
        primaryColor: "#FFFFFF", outlineColor: "#000000",
        backgroundColor: "#000000", backgroundOpacity: 75,
        outlineSize: 6, shadowSize: 0,
        bold: false, italic: false, letterSpacing: 0, fontSizeScale: 0.95,
    },

    // ── TikTok — full sentence in white; the spoken word gets a yellow
    //    rounded box with black text (drawn rectangle, see expandTikTokBox).
    //    PrimaryColour = the highlight box colour so it stays recolourable.
    //    Uppercase + bold for the iconic TikTok caption weight.
    tiktok: {
        primaryColor: "#FACC15", outlineColor: "#000000",
        backgroundColor: "#000000", backgroundOpacity: 0,
        outlineSize: 3, shadowSize: 0,
        bold: true, italic: false, letterSpacing: 0, fontSizeScale: 1.15,
        uppercase: true,
    },

    // ── Box (Modern Box) — black text on a solid white block + drop shadow ──
    box: {
        primaryColor: "#111111", outlineColor: "#000000",
        backgroundColor: "#FFFFFF", backgroundOpacity: 100,
        outlineSize: 6, shadowSize: 2,
        bold: true, italic: false, letterSpacing: 0, fontSizeScale: 0.95,
    },

    // ── Cinematic — delicate light italic, wide tracking, soft drop shadow.
    //    blur turns the hard ASS shadow into the double-soft-shadow look.
    cinematic: {
        primaryColor: "#FFFFFF", outlineColor: "#000000",
        backgroundColor: "#000000", backgroundOpacity: 0,
        outlineSize: 0, shadowSize: 4,
        bold: false, italic: true, letterSpacing: 4, fontSizeScale: 0.9,
        blur: 3,
    },

    // ── Outline — bold white with a clean black stroke; universal hero look ──
    outline: {
        primaryColor: "#FFFFFF", outlineColor: "#000000",
        backgroundColor: "#000000", backgroundOpacity: 0,
        outlineSize: 3.5, shadowSize: 1.5,
        bold: true, italic: false, letterSpacing: 0, fontSizeScale: 1.1,
    },

    // ── Bold Center — huge centred uppercase hero text with stroke + glow.
    //    Sits in the middle of the frame; blur gives the soft halo.
    "bold-center": {
        primaryColor: "#FFFFFF", outlineColor: "#000000",
        backgroundColor: "#000000", backgroundOpacity: 0,
        outlineSize: 4, shadowSize: 0,
        bold: true, italic: false, letterSpacing: 0, fontSizeScale: 1.5,
        uppercase: true, blur: 2,
    },

    // ── Reveal — full sentence; each word turns to PrimaryColour as spoken.
    //    SecondaryColour is set automatically from revealFadeInactive.
    //    Modifier flags add Spotlight (fade) / Cascade (entrance) flavours.
    reveal: {
        primaryColor: "#FACC15", outlineColor: "#000000",
        backgroundColor: "#000000", backgroundOpacity: 0,
        outlineSize: 3, shadowSize: 0,
        bold: true, italic: false, letterSpacing: 0.5, fontSizeScale: 1.1,
        revealFadeInactive: false,
        revealWordEntrance: false,
    },
};

export function getPresetDefaults(preset: string): Partial<SubtitleStyleConfig> {
    return PRESET_DEFAULTS[preset] ?? PRESET_DEFAULTS.classic;
}

export function createDefaultStyleConfig(preset = "classic"): SubtitleStyleConfig {
    const d = getPresetDefaults(preset);
    return {
        preset,
        // A preset may pin its own fontFamily when the look depends on it;
        // otherwise fall back to the neutral Roboto default.
        fontFamily: d.fontFamily ?? "Roboto",
        fontSizeScale: d.fontSizeScale ?? 1.0,
        // Bold Center is a centre-of-frame hero; everything else sits bottom.
        positionV: preset === "bold-center" ? "middle" : "bottom",
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
        animation: PRESET_BASE_ANIMATION[preset] ?? "none",
        revealFadeInactive: d.revealFadeInactive ?? false,
        revealWordEntrance: d.revealWordEntrance ?? false,
        uppercase: d.uppercase ?? false,
        blur: d.blur ?? 0,
    };
}

/**
 * The animation a preset is locked to by default. Kept here (next to the
 * defaults) so server-side `resolveStyleConfig` and the client share one
 * source of truth — the burn picks the same animation the preview did even
 * if the client only sent a partial config.
 */
export const PRESET_BASE_ANIMATION: Record<string, SubtitleStyleConfig["animation"]> = {
    classic:       "none",
    tiktok:        "tiktok-box",
    box:           "none",
    cinematic:     "none",
    outline:       "none",
    "bold-center": "none",
    reveal:        "reveal",
};

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
    // `karaoke` / `reveal` / `tiktok-box` bake their own entrance / layering
    // logic into the per-cue expanded text, so no extra wrapper animation
    // tag is needed at the cue level.
    if (animation === "none" || animation === "karaoke" ||
        animation === "reveal" || animation === "tiktok-box") return "";

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
    classic:       36,
    tiktok:        50,
    box:           36,
    cinematic:     34,
    outline:       42,
    "bold-center": 60,
    reveal:        48,
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
    const isBoxStyle = BOX_STYLE_PRESETS.has(preset);
    const borderStyle = isBoxStyle ? 3 : 1;

    const primaryAss = hexToAss(primaryColor, 100);
    const outlineAss = hexToAss(outlineColor, 100);
    const backAss = hexToAss(backgroundColor, isBoxStyle ? backgroundOpacity : 100);

    // SecondaryColour governs the un-highlighted state of `\k` / `\kf`
    // karaoke segments. For the Reveal preset it's the colour each word
    // starts at before its karaoke tick promotes it to PrimaryColour:
    //   - default:           white (sharp color shift to PrimaryColour)
    //   - revealFadeInactive: faded primary (smooth alpha brightening)
    // For tiktok-box the base sentence is rendered via inline overrides and
    // the Default-style secondary is never sampled; we leave it as-is.
    let secondaryAss = "&H000000FF";
    if (animation === "reveal") {
        secondaryAss = config.revealFadeInactive
            ? hexToAss(primaryColor, 35)
            : hexToAss("#FFFFFF", 100);
    }

    // For BorderStyle=3 (box) Outline is the box padding and Shadow its drop
    // shadow; for BorderStyle=1 they're the text stroke + shadow. Either way
    // the configured values apply directly — no special-case zeroing.
    const effectiveOutline = outlineSize;
    const effectiveShadow = shadowSize;

    const assBold = bold ? -1 : 0;
    const assItalic = italic ? -1 : 0;

    // ASS Style line (V4+):
    // Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,
    // Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle,
    // BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
    const styleRow = [
        "Default", fontFamily, fontSize,
        primaryAss, secondaryAss, outlineAss, backAss,
        assBold, assItalic, 0, 0,
        100, 100, letterSpacing, 0,
        borderStyle, effectiveOutline, effectiveShadow,
        alignment, 10, 10, marginV, 1,
    ].join(",");

    // Animation override tag (same for every cue in this render)
    const animTag = makeAnimTag(animation, alignment, vDim, marginV);

    // Optional cue-wide blur (soft shadow / glow). Scaled to the render so it
    // looks the same at any resolution. Skipped for the per-word effect modes,
    // whose expanded text manages its own blur tags.
    const blurAmount = config.blur ?? 0;
    const blurTag =
        blurAmount > 0 && animation !== "tiktok-box" && animation !== "reveal"
            ? `{\\blur${(blurAmount * scale).toFixed(1)}}`
            : "";

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
        // Preserve embedded ASS override tags ({\k20}, {\pos(...)}, ...) while
        // still escaping literal `{` characters that the user may have typed.
        // A real ASS tag always starts with `{\`, so the negative-lookahead
        // for `\\` skips genuine overrides and only escapes stray braces.
        const text  = lines.slice(ti + 1).join("\\N").replace(/\{(?!\\)/g, "\\{");
        dialogues.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${animTag}${blurTag}${text}`);
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
