"use client";

/**
 * SubtitleStylePanel — floating, draggable subtitle style panel.
 *
 * Renders as `position: absolute` inside the full-viewport modal so it is never
 * clipped by overflow:hidden siblings and avoids the `position:fixed` +
 * CSS-transform stacking-context bug (parent modal has Framer Motion transforms
 * during its entrance animation).
 *
 * Drag is restricted to the drag-handle row at the top.  On release the panel
 * springs to the nearest viewport corner (top-left, top-right, bottom-left,
 * bottom-right) so it never ends up stranded in the middle of the screen.
 *
 * Preset switching deliberately preserves the user's chosen colors, font,
 * position, and size — only structural visual properties (outline, shadow,
 * bold/italic, letter-spacing, font-size-scale) are updated.
 */

import React, { useRef, useCallback, useEffect } from "react";
import {
    motion,
    useMotionValue,
    animate,
    useDragControls,
} from "framer-motion";
import { GripVertical, Bold, Italic } from "lucide-react";
import { cn } from "@/lib/utils";
import { STYLE_PRESETS } from "./subtitle-types";
import { BOX_STYLE_PRESETS, getPresetDefaults } from "@/lib/ass-builder";
import type { SubtitleStyleConfig } from "@/lib/ass-builder";

// ── Constants ─────────────────────────────────────────────────────────────────

const PANEL_W  = 272;
const MARGIN   = 16;
const HDR_H    = 52; // approximate modal header height

// ── Static data ───────────────────────────────────────────────────────────────

export const FONT_OPTIONS = [
    { id: "Roboto",     label: "Roboto"     },
    { id: "Anton",      label: "Anton"      },
    { id: "Lora",       label: "Lora"       },
    { id: "Oswald",     label: "Oswald"     },
    { id: "Space Mono", label: "Mono"       },
    { id: "Nunito",     label: "Nunito"     },
];

const TEXT_COLORS = [
    "#FFFFFF", "#FACC15", "#000000", "#EF4444",
    "#22C55E", "#3B82F6", "#F97316", "#EC4899",
];

const ANIMATIONS: Array<{ id: SubtitleStyleConfig["animation"]; icon: string; label: string }> = [
    { id: "none",     icon: "—",  label: "None"    },
    { id: "fade",     icon: "✨", label: "Fade"    },
    { id: "pop",      icon: "💥", label: "Pop"     },
    { id: "slide-up", icon: "↑",  label: "Slide"   },
    { id: "karaoke",  icon: "🎤", label: "Karaoke" },
];

const POSITION_GRID: Array<{
    v: SubtitleStyleConfig["positionV"];
    h: SubtitleStyleConfig["positionH"];
    label: string;
}> = [
    { v: "top",    h: "left",   label: "Top left"      },
    { v: "top",    h: "center", label: "Top center"    },
    { v: "top",    h: "right",  label: "Top right"     },
    { v: "middle", h: "left",   label: "Middle left"   },
    { v: "middle", h: "center", label: "Middle center" },
    { v: "middle", h: "right",  label: "Middle right"  },
    { v: "bottom", h: "left",   label: "Bottom left"   },
    { v: "bottom", h: "center", label: "Bottom center" },
    { v: "bottom", h: "right",  label: "Bottom right"  },
];

/**
 * Default entrance animation per preset — applied on preset click and
 * overridable by the Animation section.
 */
/**
 * Default animation per preset. Each preset binds to the right expander
 * downstream in `expandForAnimation`.
 */
const PRESET_DEFAULT_ANIMATION: Record<string, SubtitleStyleConfig["animation"]> = {
    classic: "none",
    outline: "none",
    tiktok:  "tiktok-box",
    reveal:  "reveal",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Small uppercase section heading — matches the tone of the Cues toolbar. */
function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {children}
        </p>
    );
}

/** Section wrapper — consistent padding + bottom border (last:border-b-0). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="px-3 py-2.5 border-b border-border/40 last:border-b-0">
            <SectionHeader>{title}</SectionHeader>
            {children}
        </section>
    );
}

/** Labelled slider row — 11px label, primary-accented track, monospaced value. */
function SliderRow({
    label, value, min, max, step = 1, onChange, decimals = 0,
}: {
    label: string; value: number; min: number; max: number;
    step?: number; onChange: (v: number) => void; decimals?: number;
}) {
    return (
        <div className="flex items-center gap-2 py-0.5">
            <span className="text-[10px] text-muted-foreground w-[68px] shrink-0">{label}</span>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="flex-1 h-1 accent-primary cursor-pointer"
            />
            <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
                {value.toFixed(decimals)}
            </span>
        </div>
    );
}

/** Compact color picker row — swatch + hex code + hidden native input. */
function ColorRow({
    label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex items-center gap-2 py-0.5">
            <span className="text-[10px] text-muted-foreground w-[68px] shrink-0">{label}</span>
            <label className="flex-1 flex items-center gap-2 cursor-pointer rounded-md border border-border bg-muted/40 hover:bg-muted px-1.5 py-0.5 transition-colors">
                <span
                    className="w-3.5 h-3.5 rounded-sm border border-border shrink-0"
                    style={{ backgroundColor: value }}
                />
                <span className="text-[10px] text-foreground font-mono tabular-nums flex-1">
                    {value.toUpperCase()}
                </span>
                <input
                    type="color"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="absolute w-0 h-0 opacity-0"
                />
            </label>
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SubtitleStylePanelProps {
    config: SubtitleStyleConfig;
    onChange: (updates: Partial<SubtitleStyleConfig>) => void;
    /** When true, renders as a plain scrollable div instead of a floating overlay */
    embedded?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SubtitleStylePanel({ config, onChange, embedded = false }: SubtitleStylePanelProps) {
    // Motion values / drag — only used in floating mode
    const mx = useMotionValue(0);
    const my = useMotionValue(0);
    const panelRef = useRef<HTMLDivElement>(null);
    const dragControls = useDragControls();

    useEffect(() => {
        if (embedded || typeof window === "undefined") return;
        mx.set(window.innerWidth  - PANEL_W - MARGIN);
        my.set(window.innerHeight - 420    - MARGIN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [embedded]);

    const handleDragEnd = useCallback(() => {
        if (embedded) return;
        const el = panelRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const snapX = cx < vw / 2 ? MARGIN : vw - PANEL_W - MARGIN;
        const snapY = cy < vh / 2
            ? HDR_H + MARGIN
            : vh - rect.height - MARGIN - 80;

        animate(mx, snapX, { type: "spring", stiffness: 320, damping: 32 });
        animate(my, snapY, { type: "spring", stiffness: 320, damping: 32 });
    }, [embedded, mx, my]);

    useEffect(() => {
        if (embedded) return;
        const onResize = () => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const el = panelRef.current;
            const h = el?.offsetHeight ?? 380;
            mx.set(Math.min(mx.get(), vw - PANEL_W - MARGIN));
            my.set(Math.min(my.get(), vh - h - MARGIN));
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [embedded, mx, my]);

    /**
     * Clicking a preset applies its full visual identity — colours, stroke,
     * spacing, etc. Position and font are preserved so the user keeps the
     * layout / typography they intentionally chose.
     */
    const handlePresetClick = (presetId: string) => {
        const defaults = getPresetDefaults(presetId);
        onChange({
            preset: presetId,
            animation: PRESET_DEFAULT_ANIMATION[presetId] ?? "none",
            ...defaults,
        });
    };

    const isBoxStyle = BOX_STYLE_PRESETS.has(config.preset);

    // ── Shared panel body (used in both embedded and floating modes) ─────────
    const panelBody = (
        <div className="overflow-y-auto flex-1 min-h-0">

            {/* ── Presets ── */}
            <Section title="Preset">
                <div className="grid grid-cols-3 gap-1">
                    {STYLE_PRESETS.map(p => {
                        const active = config.preset === p.id;
                        return (
                            <button
                                key={p.id}
                                onClick={() => handlePresetClick(p.id)}
                                className={cn(
                                    "flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-md border text-[10px] font-medium transition-all",
                                    active
                                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <span className="text-sm leading-none">{p.icon}</span>
                                <span className="truncate w-full text-center">{p.name}</span>
                            </button>
                        );
                    })}
                </div>
            </Section>

            {/* ── Font (grid with previews) ── */}
            <Section title="Font">
                <div className="grid grid-cols-3 gap-1">
                    {FONT_OPTIONS.map(f => {
                        const active = config.fontFamily === f.id;
                        return (
                            <button
                                key={f.id}
                                onClick={() => onChange({ fontFamily: f.id })}
                                title={f.id}
                                className={cn(
                                    "flex flex-col items-center justify-center gap-0 px-1 py-1.5 rounded-md border transition-all min-h-[42px]",
                                    active
                                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                        : "border-border bg-muted/40 text-foreground hover:bg-muted"
                                )}
                            >
                                <span
                                    style={{ fontFamily: f.id }}
                                    className="text-[15px] leading-tight font-medium"
                                >
                                    Aa
                                </span>
                                <span
                                    style={{ fontFamily: f.id }}
                                    className={cn(
                                        "text-[9px] truncate w-full text-center leading-tight",
                                        active ? "text-primary-foreground/80" : "text-muted-foreground",
                                    )}
                                >
                                    {f.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </Section>

            {/* ── Reveal Options (only when Reveal preset is active) ── */}
            {config.preset === "reveal" && (
                <Section title="Reveal Options">
                    <div className="flex flex-col gap-1">
                        <button
                            onClick={() => onChange({ revealFadeInactive: !config.revealFadeInactive })}
                            className={cn(
                                "flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all",
                                config.revealFadeInactive
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "border-border bg-muted/40 text-foreground hover:bg-muted"
                            )}
                        >
                            <span className="flex items-center gap-1.5">
                                <span className="leading-none">🔦</span>
                                Fade inactive words
                            </span>
                            <span className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded",
                                config.revealFadeInactive ? "bg-primary-foreground/20" : "bg-muted",
                            )}>
                                {config.revealFadeInactive ? "ON" : "OFF"}
                            </span>
                        </button>
                        <button
                            onClick={() => onChange({ revealWordEntrance: !config.revealWordEntrance })}
                            className={cn(
                                "flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all",
                                config.revealWordEntrance
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "border-border bg-muted/40 text-foreground hover:bg-muted"
                            )}
                        >
                            <span className="flex items-center gap-1.5">
                                <span className="leading-none">🌊</span>
                                Word-by-word entrance
                            </span>
                            <span className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded",
                                config.revealWordEntrance ? "bg-primary-foreground/20" : "bg-muted",
                            )}>
                                {config.revealWordEntrance ? "ON" : "OFF"}
                            </span>
                        </button>
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5 leading-snug">
                            Combine both for a spotlight that follows the speaker.
                        </p>
                    </div>
                </Section>
            )}

            {/* ── Animation ── */}
            <Section title="Animation">
                <div className="grid grid-cols-5 gap-1">
                    {ANIMATIONS.map(a => {
                        const active = config.animation === a.id;
                        return (
                            <button
                                key={a.id}
                                onClick={() => onChange({ animation: a.id })}
                                title={a.label}
                                className={cn(
                                    "flex flex-col items-center gap-0.5 py-1.5 rounded-md border text-[9px] font-medium transition-all",
                                    active
                                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <span className="leading-none text-sm">{a.icon}</span>
                                <span className="truncate w-full text-center">{a.label}</span>
                            </button>
                        );
                    })}
                </div>
            </Section>

            {/* ── Position (3×3 grid) + Style (B / I) ── */}
            <Section title="Position & Style">
                <div className="flex items-start gap-3">
                    <div className="grid grid-cols-3 gap-0.5 shrink-0">
                        {POSITION_GRID.map(cell => {
                            const active = config.positionV === cell.v && config.positionH === cell.h;
                            return (
                                <button
                                    key={`${cell.v}-${cell.h}`}
                                    onClick={() => onChange({ positionV: cell.v, positionH: cell.h })}
                                    title={cell.label}
                                    className={cn(
                                        "w-6 h-6 rounded border transition-all flex items-center justify-center",
                                        active
                                            ? "bg-primary border-primary shadow-sm"
                                            : "border-border bg-muted/40 hover:bg-muted"
                                    )}
                                >
                                    <div className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        active ? "bg-primary-foreground" : "bg-muted-foreground/50"
                                    )} />
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                        <button
                            onClick={() => onChange({ bold: !config.bold })}
                            className={cn(
                                "flex items-center justify-center gap-1 py-1.5 rounded-md border text-[10px] font-bold transition-all",
                                config.bold
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <Bold className="w-3 h-3" /> Bold
                        </button>
                        <button
                            onClick={() => onChange({ italic: !config.italic })}
                            className={cn(
                                "flex items-center justify-center gap-1 py-1.5 rounded-md border text-[10px] font-medium italic transition-all",
                                config.italic
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <Italic className="w-3 h-3" /> Italic
                        </button>
                    </div>
                </div>
            </Section>

            {/* ── Text colour ── */}
            <Section title="Text Color">
                <div className="flex items-center gap-1.5 flex-wrap">
                    {TEXT_COLORS.map(hex => {
                        const active = config.primaryColor.toUpperCase() === hex.toUpperCase();
                        return (
                            <button
                                key={hex}
                                onClick={() => onChange({ primaryColor: hex })}
                                title={hex}
                                className={cn(
                                    "w-6 h-6 rounded-full border-2 transition-all hover:scale-110 shrink-0",
                                    hex === "#000000" && "ring-1 ring-border",
                                    active ? "border-primary scale-110 shadow-sm" : "border-transparent",
                                )}
                                style={{ backgroundColor: hex }}
                            />
                        );
                    })}
                    <label
                        title="Custom colour"
                        className="relative w-6 h-6 rounded-full border-2 border-dashed border-border cursor-pointer flex items-center justify-center hover:border-foreground/60 transition-all overflow-hidden shrink-0"
                    >
                        <input
                            type="color"
                            value={config.primaryColor}
                            onChange={e => onChange({ primaryColor: e.target.value })}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                        />
                        <span className="text-[10px] text-muted-foreground pointer-events-none">+</span>
                    </label>
                </div>
            </Section>

            {/* ── Sizing ── */}
            <Section title="Sizing">
                <SliderRow
                    label="Size"
                    value={config.fontSizeScale} min={0.5} max={2.0} step={0.05}
                    onChange={v => onChange({ fontSizeScale: v })} decimals={2}
                />
                <SliderRow
                    label="Spacing"
                    value={config.letterSpacing} min={0} max={10} step={0.5}
                    onChange={v => onChange({ letterSpacing: v })} decimals={1}
                />
            </Section>

            {/* ── Outline & shadow (hidden for box styles) ── */}
            {!isBoxStyle && (
                <Section title="Outline & Shadow">
                    <SliderRow
                        label="Outline"
                        value={config.outlineSize} min={0} max={8} step={0.5}
                        onChange={v => onChange({ outlineSize: v })} decimals={1}
                    />
                    <SliderRow
                        label="Shadow"
                        value={config.shadowSize} min={0} max={10} step={0.5}
                        onChange={v => onChange({ shadowSize: v })} decimals={1}
                    />
                    <ColorRow
                        label="Color"
                        value={config.outlineColor}
                        onChange={v => onChange({ outlineColor: v })}
                    />
                </Section>
            )}

            {/* ── Background (only for box styles) ── */}
            {isBoxStyle && (
                <Section title="Background">
                    <SliderRow
                        label="Opacity"
                        value={config.backgroundOpacity} min={0} max={100} step={5}
                        onChange={v => onChange({ backgroundOpacity: v })}
                    />
                    <ColorRow
                        label="Color"
                        value={config.backgroundColor}
                        onChange={v => onChange({ backgroundColor: v })}
                    />
                </Section>
            )}
        </div>
    );

    // ── Embedded mode: plain scrollable panel (used in sidebar) ──────────────
    if (embedded) {
        return (
            <div className="flex flex-col h-full overflow-hidden">
                {panelBody}
            </div>
        );
    }

    // ── Floating mode: draggable overlay ─────────────────────────────────────
    return (
        <motion.div
            ref={panelRef}
            style={{
                position: "absolute",
                left: 0,
                top:  0,
                x: mx,
                y: my,
                width: PANEL_W,
                maxHeight: "calc(100vh - 140px)",
                zIndex: 200,
                pointerEvents: "auto",
            }}
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0.05}
            dragConstraints={{
                left:   0,
                top:    HDR_H,
                right:  typeof window !== "undefined" ? window.innerWidth  - PANEL_W  - 4 : 980,
                bottom: typeof window !== "undefined" ? window.innerHeight - 120       : 660,
            }}
            onDragEnd={handleDragEnd}
            className="bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl shadow-black/20 overflow-hidden flex flex-col"
        >
            {/* Drag handle */}
            <div
                onPointerDown={e => dragControls.start(e)}
                className="flex items-center gap-2 px-2.5 py-2 bg-muted/50 border-b border-border/60 cursor-grab active:cursor-grabbing select-none touch-none shrink-0"
            >
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex-1">
                    Subtitle Style
                </span>
            </div>
            {panelBody}
        </motion.div>
    );
}
