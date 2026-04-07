"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { STYLE_PRESETS } from "./subtitle-types";
import { motion, AnimatePresence } from "framer-motion";

interface StylePresetSelectorProps {
    activePreset: string;
    onSelect: (presetId: string) => void;
}

export function StylePresetSelector({
    activePreset,
    onSelect,
}: StylePresetSelectorProps) {
    return (
        <div className="p-4 border-t border-white/10 bg-neutral-900/60 backdrop-blur-sm">
            <h3 className="font-medium text-white/80 text-xs mb-3 uppercase tracking-wider">
                Subtitle Style
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {STYLE_PRESETS.map((preset) => (
                    <motion.button
                        key={preset.id}
                        onClick={() => onSelect(preset.id)}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 400, damping: 17 }}
                        className={cn(
                            "p-3 text-left rounded-xl border transition-all duration-200 relative overflow-hidden",
                            activePreset === preset.id
                                ? "border-white/40 bg-white/10 shadow-sm ring-1 ring-white/20"
                                : "border-white/10 hover:border-white/25 hover:bg-white/5"
                        )}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-xs text-white/90">
                                {preset.icon} {preset.name}
                            </span>
                            <AnimatePresence>
                                {activePreset === preset.id && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 500,
                                            damping: 20,
                                        }}
                                        className="w-2 h-2 rounded-full bg-white"
                                    />
                                )}
                            </AnimatePresence>
                        </div>
                        <span className="text-[10px] text-white/40 line-clamp-1">
                            {preset.desc}
                        </span>
                    </motion.button>
                ))}
            </div>
        </div>
    );
}
