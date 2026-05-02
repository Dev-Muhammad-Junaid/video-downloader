"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { STYLE_PRESETS } from "./subtitle-types";
import { motion, AnimatePresence } from "framer-motion";
import { Type } from "lucide-react";

// Fonts that render reliably both in the browser preview and in FFmpeg's subtitles filter
export const FONT_OPTIONS = [
    { id: "Arial",           label: "Arial",       sample: "Aa" },
    { id: "Impact",          label: "Impact",      sample: "Aa" },
    { id: "Georgia",         label: "Georgia",     sample: "Aa" },
    { id: "Verdana",         label: "Verdana",     sample: "Aa" },
    { id: "Trebuchet MS",    label: "Trebuchet",   sample: "Aa" },
    { id: "Courier New",     label: "Courier",     sample: "Aa" },
    { id: "Times New Roman", label: "Times",       sample: "Aa" },
    { id: "Helvetica",       label: "Helvetica",   sample: "Aa" },
];

interface StylePresetSelectorProps {
    activePreset: string;
    onSelect: (presetId: string) => void;
    fontFamily: string;
    onFontChange: (font: string) => void;
}

export function StylePresetSelector({
    activePreset,
    onSelect,
    fontFamily,
    onFontChange,
}: StylePresetSelectorProps) {
    return (
        <div className="border-t border-border bg-card/80 backdrop-blur-sm">
            {/* ── Style Presets ── */}
            <div className="px-4 pt-4 pb-3">
                <h3 className="font-medium text-muted-foreground text-[10px] mb-3 uppercase tracking-wider">
                    Subtitle Style
                </h3>
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                    {STYLE_PRESETS.map((preset) => (
                        <motion.button
                            key={preset.id}
                            onClick={() => onSelect(preset.id)}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.96 }}
                            transition={{ type: "spring", stiffness: 400, damping: 17 }}
                            className={cn(
                                "p-3 text-left rounded-xl border transition-colors duration-200 relative overflow-hidden",
                                activePreset === preset.id
                                    ? "border-primary/50 bg-primary/10 ring-1 ring-primary/20"
                                    : "border-border hover:border-border/80 hover:bg-muted/60"
                            )}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-xs text-foreground">
                                    {preset.icon} {preset.name}
                                </span>
                                <AnimatePresence>
                                    {activePreset === preset.id && (
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            exit={{ scale: 0 }}
                                            transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                            className="w-2 h-2 rounded-full bg-primary"
                                        />
                                    )}
                                </AnimatePresence>
                            </div>
                            <span className="text-[10px] text-muted-foreground line-clamp-1">{preset.desc}</span>
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* ── Font Picker ── */}
            <div className="px-4 pb-4 border-t border-border/60 pt-3">
                <div className="flex items-center gap-2 mb-2.5">
                    <Type className="w-3 h-3 text-muted-foreground" />
                    <h3 className="font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
                        Font Family
                    </h3>
                    <span className="text-[10px] text-muted-foreground/70 ml-1">— affects burned output</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {FONT_OPTIONS.map((font) => (
                        <button
                            key={font.id}
                            onClick={() => onFontChange(font.id)}
                            className="relative"
                        >
                            {fontFamily === font.id && (
                                <motion.div
                                    layoutId="font-pill"
                                    className="absolute inset-0 bg-primary/15 rounded-lg border border-primary/35"
                                    transition={{ type: "spring", stiffness: 380, damping: 28 }}
                                />
                            )}
                            <div className={cn(
                                "relative z-10 flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg border transition-colors duration-150",
                                fontFamily === font.id
                                    ? "border-transparent text-foreground"
                                    : "border-border text-muted-foreground hover:text-foreground hover:border-border"
                            )}>
                                <span
                                    className="text-base font-semibold leading-none"
                                    style={{ fontFamily: font.id }}
                                >
                                    {font.sample}
                                </span>
                                <span className="text-[9px] font-medium tracking-wide">{font.label}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
