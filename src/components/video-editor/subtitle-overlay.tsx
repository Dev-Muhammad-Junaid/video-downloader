"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
    Subtitle,
    SubtitlePosition,
    DEFAULT_POSITION,
    findActiveSubtitle,
    getHighlightedWordIndex,
} from "./subtitle-types";

interface SubtitleOverlayProps {
    subtitles: Subtitle[];
    currentTime: number;
    stylePreset: string;
    fontFamily?: string;
    position?: SubtitlePosition;
    highlightColor?: string; // hex, e.g. "#FACC15"
    /** When set, shows this text as a preview regardless of subtitles/time */
    previewText?: string;
}

function getPositionClasses(position: SubtitlePosition): string {
    const vMap: Record<string, string> = {
        top: "top-6",
        middle: "top-1/2 -translate-y-1/2",
        bottom: "bottom-6",
    };
    const hMap: Record<string, string> = {
        left: "justify-start",
        center: "justify-center",
        right: "justify-end",
    };
    return `absolute left-0 right-0 flex px-8 ${vMap[position.vertical]} ${hMap[position.horizontal]}`;
}

export function SubtitleOverlay({
    subtitles,
    currentTime,
    stylePreset,
    fontFamily = "Arial",
    position = DEFAULT_POSITION,
    highlightColor = "#FACC15",
    previewText,
}: SubtitleOverlayProps) {
    const currentSubtitle = previewText
        ? null
        : findActiveSubtitle(subtitles, currentTime);
    const displayText = previewText || currentSubtitle?.text || "";

    if (!displayText) return null;

    const posClasses = getPositionClasses(position);

    switch (stylePreset) {
        case "classic":
            // Semi-transparent black box — matches ASS BorderStyle=3 BackColour=&H99000000
            return (
                <div className={cn(posClasses, "z-10 pointer-events-none")}>
                    <div className="px-4 py-2 text-center max-w-[90%]" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                        <span
                            className="text-white font-normal text-base lg:text-xl leading-snug"
                            style={{ fontFamily }}
                        >
                            {displayText}
                        </span>
                    </div>
                </div>
            );

        case "tiktok": {
            // Export: one word at a time in highlight color with black outline.
            // Preview: show full line with current word highlighted so the user
            // can see the flow — closest CSS equivalent to the per-word burn.
            const words = displayText.split(/\s+/);
            const highlightIdx = currentSubtitle
                ? getHighlightedWordIndex(currentSubtitle, currentTime)
                : 0;
            const isLight = highlightColor === "#FFFFFF" || highlightColor === "#FACC15" || highlightColor === "#F97316";
            const highlightTextColor = isLight ? "#000000" : "#FFFFFF";
            return (
                <div className={cn(posClasses, "z-10 pointer-events-none")}>
                    <div className="text-center max-w-[85%] flex flex-wrap justify-center gap-x-2 gap-y-1">
                        {words.map((word, i) => (
                            <span
                                key={i}
                                className="font-extrabold text-xl lg:text-3xl leading-tight transition-all duration-100"
                                style={{
                                    fontFamily,
                                    color: i === highlightIdx ? highlightTextColor : highlightColor,
                                    WebkitTextStroke: i === highlightIdx ? "0" : "2px black",
                                    paintOrder: "stroke fill",
                                    textShadow: i === highlightIdx
                                        ? `0 0 0 transparent`
                                        : "0 2px 6px rgba(0,0,0,0.9)",
                                    backgroundColor: i === highlightIdx ? highlightColor : "transparent",
                                    padding: i === highlightIdx ? "1px 6px" : undefined,
                                    borderRadius: i === highlightIdx ? "4px" : undefined,
                                    transform: i === highlightIdx ? "scale(1.08)" : "scale(1)",
                                    display: "inline-block",
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
            // Solid white box with black text — matches ASS BorderStyle=3 BackColour=&H00FFFFFF
            return (
                <div className={cn(posClasses, "z-10 pointer-events-none")}>
                    <div className="bg-white px-5 py-2 text-center max-w-[90%]">
                        <span className="text-black font-bold text-base lg:text-xl leading-snug" style={{ fontFamily }}>
                            {displayText}
                        </span>
                    </div>
                </div>
            );

        case "cinematic":
            // Italic, wide tracking, deep shadow — matches ASS Shadow=4, Italic=-1, Spacing=3
            return (
                <div className={cn(posClasses, "z-10 pointer-events-none")}>
                    <div className="text-center max-w-[90%]">
                        <span
                            className="text-white font-light text-base lg:text-xl italic leading-relaxed"
                            style={{
                                fontFamily,
                                letterSpacing: "0.12em",
                                textShadow: "3px 3px 0 rgba(0,0,0,0.9), 5px 5px 8px rgba(0,0,0,0.7)",
                            }}
                        >
                            {displayText}
                        </span>
                    </div>
                </div>
            );

        case "outline":
            // Bold white, hard black stroke — matches ASS Outline=3, Shadow=1
            return (
                <div className={cn(posClasses, "z-10 pointer-events-none")}>
                    <div className="text-center max-w-[90%]">
                        <span
                            className="text-white font-bold text-base lg:text-xl leading-snug"
                            style={{
                                fontFamily,
                                WebkitTextStroke: "2px black",
                                paintOrder: "stroke fill",
                                textShadow: "1px 1px 3px rgba(0,0,0,0.6)",
                            }}
                        >
                            {displayText}
                        </span>
                    </div>
                </div>
            );

        case "bold-center":
            // Extra large bold, semi-transparent thick outline — matches ASS Outline=4, BackColour=&H80000000
            return (
                <div className={cn(posClasses, "z-10 pointer-events-none")}>
                    <div className="text-center max-w-[80%]">
                        <span
                            className="text-white font-black text-2xl lg:text-4xl uppercase leading-none tracking-tight"
                            style={{
                                fontFamily,
                                WebkitTextStroke: "3px rgba(0,0,0,0.7)",
                                paintOrder: "stroke fill",
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
