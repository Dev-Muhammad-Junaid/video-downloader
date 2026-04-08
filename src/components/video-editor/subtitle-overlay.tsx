"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
    Subtitle,
    findActiveSubtitle,
    getHighlightedWordIndex,
} from "./subtitle-types";

interface SubtitleOverlayProps {
    subtitles: Subtitle[];
    currentTime: number;
    stylePreset: string;
    fontFamily?: string;
    /** When set, shows this text as a preview regardless of subtitles/time */
    previewText?: string;
}

export function SubtitleOverlay({
    subtitles,
    currentTime,
    stylePreset,
    fontFamily = "Arial",
    previewText,
}: SubtitleOverlayProps) {
    // Use preview text if provided, otherwise find the active subtitle
    const currentSubtitle = previewText
        ? null
        : findActiveSubtitle(subtitles, currentTime);
    const displayText = previewText || currentSubtitle?.text || "";

    if (!displayText) return null;

    switch (stylePreset) {
        case "classic":
            return (
                <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10 px-8 pointer-events-none">
                    <div className="bg-black/80 px-5 py-2.5 rounded-md text-center max-w-[90%] backdrop-blur-sm">
                        <span
                            className="text-white font-normal text-sm lg:text-base leading-snug tracking-wide"
                            style={{ fontFamily }}
                        >
                            {displayText}
                        </span>
                    </div>
                </div>
            );

        case "tiktok": {
            const words = displayText.split(/\s+/);
            const highlightIdx = currentSubtitle
                ? getHighlightedWordIndex(currentSubtitle, currentTime)
                : 1;
            return (
                <div className="absolute bottom-1/3 left-0 right-0 flex justify-center z-10 px-6 pointer-events-none">
                    <div className="text-center max-w-[85%] flex flex-wrap justify-center gap-x-2 gap-y-1">
                        {words.map((word, i) => (
                            <span
                                key={i}
                                className={cn(
                                    "font-extrabold text-lg lg:text-2xl uppercase leading-tight transition-all duration-150",
                                    i === highlightIdx
                                        ? "text-black bg-[#FACC15] px-1.5 py-0.5 rounded-md scale-110"
                                        : "text-white"
                                )}
                                style={{
                                    fontFamily,
                                    textShadow: i !== highlightIdx ? "0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6)" : "none",
                                    letterSpacing: "0.04em",
                                    transition: "transform 0.15s ease, background 0.15s ease",
                                }}
                            >
                                {word}
                            </span>
                        ))}
                    </div>
                </div>
            );
        }

        case "box":
            return (
                <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10 px-8 pointer-events-none">
                    <div className="bg-white px-5 py-2.5 text-center shadow-lg max-w-[90%] rounded-sm">
                        <span className="text-black font-semibold text-sm lg:text-base leading-snug tracking-wide" style={{ fontFamily }}>
                            {displayText}
                        </span>
                    </div>
                </div>
            );

        case "cinematic":
            return (
                <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10 px-8 pointer-events-none">
                    <div className="text-center max-w-[90%]">
                        <span
                            className="text-white/90 font-light text-sm lg:text-lg tracking-widest italic leading-relaxed"
                            style={{
                                fontFamily,
                                textShadow: "0 2px 12px rgba(0,0,0,0.8), 0 0 30px rgba(0,0,0,0.5)",
                                letterSpacing: "0.1em",
                            }}
                        >
                            {displayText}
                        </span>
                    </div>
                </div>
            );

        case "outline":
            return (
                <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10 px-8 pointer-events-none">
                    <div className="text-center max-w-[90%]">
                        <span
                            className="text-white font-bold text-sm lg:text-base leading-snug tracking-wide"
                            style={{
                                fontFamily,
                                WebkitTextStroke: "1.5px black",
                                paintOrder: "stroke fill",
                                textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                            }}
                        >
                            {displayText}
                        </span>
                    </div>
                </div>
            );

        case "bold-center":
            return (
                <div className="absolute inset-0 flex items-center justify-center z-10 px-6 pointer-events-none">
                    <div className="text-center max-w-[80%]">
                        <span
                            className="text-white font-black text-xl lg:text-3xl uppercase leading-none tracking-tight"
                            style={{
                                fontFamily,
                                WebkitTextStroke: "2px rgba(0,0,0,0.6)",
                                paintOrder: "stroke fill",
                                textShadow: "0 0 20px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.8)",
                            }}
                        >
                            {displayText}
                        </span>
                    </div>
                </div>
            );

        default:
            return null;
    }
}
