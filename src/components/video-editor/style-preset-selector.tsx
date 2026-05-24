"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { STYLE_PRESETS } from "./subtitle-types";
import {
    SubtitleStyleConfig,
    getPresetDefaults,
} from "@/lib/ass-builder";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

// ── Fonts ──────────────────────────────────────────────────────────────────────
// Each font is served from /fonts/*.ttf so JASSUB can render them in the preview.
// The `id` must match the key in subtitle-renderer.tsx availableFonts (case-insensitive).
export const FONT_OPTIONS = [
    { id: "Roboto",     label: "Roboto",  sample: "Aa" },
    { id: "Anton",      label: "Anton",   sample: "Aa" },
    { id: "Lora",       label: "Lora",    sample: "Aa" },
    { id: "Oswald",     label: "Oswald",  sample: "Aa" },
    { id: "Space Mono", label: "Mono",    sample: "Aa" },
    { id: "Nunito",     label: "Nunito",  sample: "Aa" },
];

// ── Text color swatches ────────────────────────────────────────────────────────
const TEXT_COLORS = [
    { hex: "#FFFFFF", label: "White" },
    { hex: "#FACC15", label: "Yellow" },
    { hex: "#000000", label: "Black" },
    { hex: "#EF4444", label: "Red" },
    { hex: "#22C55E", label: "Green" },
    { hex: "#3B82F6", label: "Blue" },
    { hex: "#F97316", label: "Orange" },
    { hex: "#EC4899", label: "Pink" },
];

// ── Position grid ─────────────────────────────────────────────────────────────
const POSITION_GRID: Array<{
    vertical: SubtitleStyleConfig["positionV"];
    horizontal: SubtitleStyleConfig["positionH"];
    label: string;
}> = [
    { vertical: "top",    horizontal: "left",   label: "Top left" },
    { vertical: "top",    horizontal: "center", label: "Top center" },
    { vertical: "top",    horizontal: "right",  label: "Top right" },
    { vertical: "middle", horizontal: "left",   label: "Middle left" },
    { vertical: "middle", horizontal: "center", label: "Middle center" },
    { vertical: "middle", horizontal: "right",  label: "Middle right" },
    { vertical: "bottom", horizontal: "left",   label: "Bottom left" },
    { vertical: "bottom", horizontal: "center", label: "Bottom center" },
    { vertical: "bottom", horizontal: "right",  label: "Bottom right" },
];

// ── Animation options ──────────────────────────────────────────────────────────
const ANIMATIONS: Array<{
    id: SubtitleStyleConfig["animation"];
    label: string;
    icon: string;
}> = [
    { id: "none",     label: "None",    icon: "—" },
    { id: "fade",     label: "Fade",    icon: "✨" },
    { id: "pop",      label: "Pop",     icon: "💥" },
    { id: "slide-up", label: "Slide",   icon: "↑" },
    { id: "karaoke",  label: "Karaoke", icon: "🎤" },
];

// ── Default animation per preset ───────────────────────────────────────────────
const PRESET_DEFAULT_ANIMATION: Record<string, SubtitleStyleConfig["animation"]> = {
    tiktok:    "karaoke",
    cinematic: "fade",
};

// ── Slider helper ─────────────────────────────────────────────────────────────
interface SliderRowProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number) => void;
    decimals?: number;
}

function SliderRow({ label, value, min, max, step = 1, onChange, decimals = 0 }: SliderRowProps) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-24 shrink-0">{label}</span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="flex-1 h-1 accent-primary cursor-pointer"
            />
            <span className="text-[10px] text-muted-foreground font-mono w-7 text-right">
                {value.toFixed(decimals)}
            </span>
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface StylePresetSelectorProps {
    config: SubtitleStyleConfig;
    onChange: (updates: Partial<SubtitleStyleConfig>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function StylePresetSelector({ config, onChange }: StylePresetSelectorProps) {
    const [showAdvanced, setShowAdvanced] = useState(false);

    const handlePresetClick = (presetId: string) => {
        const defaults = getPresetDefaults(presetId);
        onChange({
            preset: presetId,
            ...defaults,
            animation: PRESET_DEFAULT_ANIMATION[presetId] ?? "none",
        });
    };

    const isBoxStyle = config.preset === "classic" || config.preset === "box";

    return (
        <div className="border-t border-border bg-card/80 backdrop-blur-sm">

            {/* ── Row 1: Style Presets ── */}
            <div className="px-3 pt-2.5 pb-1.5">
                <div className="flex gap-1.5 flex-wrap">
                    {STYLE_PRESETS.map((preset) => (
                        <motion.button
                            key={preset.id}
                            onClick={() => handlePresetClick(preset.id)}
                            whileTap={{ scale: 0.94 }}
                            transition={{ type: "spring", stiffness: 400, damping: 17 }}
                            className={cn(
                                "flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors duration-150 relative",
                                config.preset === preset.id
                                    ? "border-primary/50 bg-primary/10 text-foreground ring-1 ring-primary/20"
                                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                            )}
                        >
                            <span>{preset.icon}</span>
                            <span>{preset.name}</span>
                            {config.preset === preset.id && (
                                <motion.span
                                    layoutId="preset-dot"
                                    className="ml-0.5 w-1.5 h-1.5 rounded-full bg-primary inline-block"
                                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                />
                            )}
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* ── Row 2: Animation + Font ── */}
            <div className="px-3 pb-1.5 flex gap-4 flex-wrap items-start border-t border-border/40 pt-1.5">
                {/* Animation */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium mr-0.5 shrink-0">Anim</span>
                    {ANIMATIONS.map((anim) => (
                        <button
                            key={anim.id}
                            onClick={() => onChange({ animation: anim.id })}
                            title={anim.label}
                            className={cn(
                                "flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium transition-all duration-150",
                                config.animation === anim.id
                                    ? "bg-primary/15 border-primary/40 text-foreground ring-1 ring-primary/20"
                                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <span className="text-xs leading-none">{anim.icon}</span>
                            {anim.label}
                        </button>
                    ))}
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Bold / Italic quick-access */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onChange({ bold: !config.bold })}
                        title="Bold"
                        className={cn(
                            "w-7 h-7 rounded-md border text-sm font-bold transition-all flex items-center justify-center",
                            config.bold
                                ? "bg-primary/15 border-primary/40 text-foreground"
                                : "border-border text-muted-foreground hover:bg-muted"
                        )}
                    >B</button>
                    <button
                        onClick={() => onChange({ italic: !config.italic })}
                        title="Italic"
                        className={cn(
                            "w-7 h-7 rounded-md border text-sm italic font-medium transition-all flex items-center justify-center",
                            config.italic
                                ? "bg-primary/15 border-primary/40 text-foreground"
                                : "border-border text-muted-foreground hover:bg-muted"
                        )}
                    >I</button>
                </div>
            </div>

            {/* ── Row 3: Color + Position + Font ── */}
            <div className="px-3 pb-1.5 flex gap-4 flex-wrap items-center border-t border-border/40 pt-1.5">
                {/* Text Color */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium shrink-0">Color</span>
                    <div className="flex gap-1 items-center">
                        {TEXT_COLORS.map((color) => {
                            const isActive = config.primaryColor.toUpperCase() === color.hex.toUpperCase();
                            return (
                                <button
                                    key={color.hex}
                                    onClick={() => onChange({ primaryColor: color.hex })}
                                    title={color.label}
                                    className={cn(
                                        "w-5 h-5 rounded-full border-2 transition-all duration-150 hover:scale-110 shrink-0",
                                        color.hex === "#000000" && "ring-1 ring-border/60",
                                        isActive
                                            ? "border-foreground scale-110 ring-2 ring-foreground/20"
                                            : "border-transparent hover:border-foreground/30"
                                    )}
                                    style={{ backgroundColor: color.hex }}
                                />
                            );
                        })}
                        <label
                            title="Custom color"
                            className="w-5 h-5 rounded-full border-2 border-dashed border-border hover:border-foreground/50 cursor-pointer flex items-center justify-center transition-all duration-150 overflow-hidden shrink-0"
                        >
                            <input
                                type="color"
                                value={config.primaryColor}
                                onChange={(e) => onChange({ primaryColor: e.target.value })}
                                className="opacity-0 absolute w-0 h-0"
                            />
                            <span className="text-[7px] text-muted-foreground">+</span>
                        </label>
                    </div>
                </div>

                {/* Position 3×3 */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium shrink-0">Pos</span>
                    <div className="grid grid-cols-3 gap-0.5">
                        {POSITION_GRID.map((cell) => {
                            const isActive =
                                config.positionV === cell.vertical &&
                                config.positionH === cell.horizontal;
                            return (
                                <button
                                    key={`${cell.vertical}-${cell.horizontal}`}
                                    onClick={() => onChange({ positionV: cell.vertical, positionH: cell.horizontal })}
                                    title={cell.label}
                                    className={cn(
                                        "w-5 h-5 rounded border transition-all duration-150 flex items-center justify-center",
                                        isActive
                                            ? "bg-primary border-primary/60 ring-1 ring-primary/30"
                                            : "border-border bg-muted/50 hover:bg-muted"
                                    )}
                                >
                                    <div className={cn("w-1 h-1 rounded-full", isActive ? "bg-primary-foreground" : "bg-muted-foreground/50")} />
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Font Family */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium shrink-0">Font</span>
                    <div className="flex gap-1 flex-wrap">
                        {FONT_OPTIONS.map((font) => (
                            <button
                                key={font.id}
                                onClick={() => onChange({ fontFamily: font.id })}
                                title={font.id}
                                className={cn(
                                    "px-2 py-0.5 rounded-md border text-[10px] font-medium transition-all duration-150",
                                    config.fontFamily === font.id
                                        ? "bg-primary/15 border-primary/40 text-foreground ring-1 ring-primary/20"
                                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                                style={{ fontFamily: font.id }}
                            >
                                {font.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Advanced toggle ── */}
            <div className="px-3 pb-1 border-t border-border/40 pt-1">
                <button
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center gap-1 text-[9px] font-medium text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
                >
                    {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Advanced
                </button>
            </div>

            {/* ── Advanced Panel ── */}
            <AnimatePresence initial={false}>
                {showAdvanced && (
                    <motion.div
                        key="advanced"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 pt-1 space-y-2">
                            <SliderRow
                                label="Font Size"
                                value={config.fontSizeScale}
                                min={0.5} max={2.0} step={0.05}
                                onChange={(v) => onChange({ fontSizeScale: v })}
                                decimals={2}
                            />
                            {!isBoxStyle && (
                                <SliderRow
                                    label="Outline Size"
                                    value={config.outlineSize}
                                    min={0} max={8} step={0.5}
                                    onChange={(v) => onChange({ outlineSize: v })}
                                    decimals={1}
                                />
                            )}
                            {!isBoxStyle && (
                                <SliderRow
                                    label="Shadow Size"
                                    value={config.shadowSize}
                                    min={0} max={10} step={0.5}
                                    onChange={(v) => onChange({ shadowSize: v })}
                                    decimals={1}
                                />
                            )}
                            {isBoxStyle && (
                                <SliderRow
                                    label="BG Opacity"
                                    value={config.backgroundOpacity}
                                    min={0} max={100} step={5}
                                    onChange={(v) => onChange({ backgroundOpacity: v })}
                                />
                            )}
                            <SliderRow
                                label="Letter Spacing"
                                value={config.letterSpacing}
                                min={0} max={10} step={0.5}
                                onChange={(v) => onChange({ letterSpacing: v })}
                                decimals={1}
                            />
                            {!isBoxStyle && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground w-24 shrink-0">Outline Color</span>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <span className="w-5 h-5 rounded-full border border-border shadow-sm" style={{ backgroundColor: config.outlineColor }} />
                                        <span className="text-[10px] text-muted-foreground font-mono">{config.outlineColor}</span>
                                        <input type="color" value={config.outlineColor} onChange={(e) => onChange({ outlineColor: e.target.value })} className="w-0 h-0 opacity-0 absolute" />
                                    </label>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground w-24 shrink-0">BG Color</span>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <span className="w-5 h-5 rounded-full border border-border shadow-sm" style={{ backgroundColor: config.backgroundColor }} />
                                    <span className="text-[10px] text-muted-foreground font-mono">{config.backgroundColor}</span>
                                    <input type="color" value={config.backgroundColor} onChange={(e) => onChange({ backgroundColor: e.target.value })} className="w-0 h-0 opacity-0 absolute" />
                                </label>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
