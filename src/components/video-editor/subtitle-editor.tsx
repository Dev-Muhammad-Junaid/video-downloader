"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
    Search,
    Copy,
    Check,
    ArrowLeftRight,
    Clock,
    ListTodo,
    AlertTriangle,
    X,
    Download,
    Upload,
    Undo2,
    Redo2,
    FileText,
    Info,
} from "lucide-react";
import {
    Subtitle,
    parseSrtTime,
    formatSrtTime,
    displayTime,
    shiftTime,
    subtitlesToSrt,
    subtitlesToVtt,
    parseSrt,
    parseVtt,
    findActiveSubtitle,
    findNearestSubtitle,
} from "./subtitle-types";
import { motion, AnimatePresence } from "framer-motion";

interface SubtitleEditorProps {
    subtitles: Subtitle[];
    onSubtitlesChange: (subtitles: Subtitle[]) => void;
    currentTime: number;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    onSeek: (time: number) => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
}

export function SubtitleEditor({
    subtitles,
    onSubtitlesChange,
    currentTime,
    videoRef,
    onSeek,
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
}: SubtitleEditorProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [showReviewQueue, setShowReviewQueue] = useState(false);
    const [showFindReplace, setShowFindReplace] = useState(false);
    const [findText, setFindText] = useState("");
    const [replaceText, setReplaceText] = useState("");
    const [showTimingOffset, setShowTimingOffset] = useState(false);
    const [timingOffsetMs, setTimingOffsetMs] = useState(0);
    const [copied, setCopied] = useState(false);
    const [activeId, setActiveId] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Stats
    const totalWords = subtitles.reduce(
        (acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length,
        0
    );
    const totalDurationSec =
        subtitles.length > 0
            ? parseSrtTime(subtitles[subtitles.length - 1].end) -
              parseSrtTime(subtitles[0].start)
            : 0;
    const statsMins = Math.floor(totalDurationSec / 60);
    const statsSecs = Math.floor(totalDurationSec % 60);
    const needsReviewCount = subtitles.filter((s) => s.confidence < 0.8).length;

    // Filter subtitles
    const filteredSubtitles = subtitles.filter((s) => {
        if (showReviewQueue && s.confidence >= 0.8) return false;
        if (searchQuery && !s.text.toLowerCase().includes(searchQuery.toLowerCase()))
            return false;
        return true;
    });

    // Find match count
    const findMatchCount = findText
        ? subtitles.reduce((count, s) => {
              const regex = new RegExp(
                  findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                  "gi"
              );
              return count + (s.text.match(regex)?.length ?? 0);
          }, 0)
        : 0;

    // Track active subtitle from video playback
    useEffect(() => {
        const active = findActiveSubtitle(filteredSubtitles, currentTime);
        if (active) {
            if (active.id !== activeId) {
                setActiveId(active.id);
                document.getElementById(`sub-${active.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        } else {
            const nearest = findNearestSubtitle(filteredSubtitles, currentTime);
            if (nearest && nearest.id !== activeId) {
                setActiveId(nearest.id);
                document.getElementById(`sub-${nearest.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }
    }, [currentTime, filteredSubtitles, activeId]);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;

            if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
                e.preventDefault();
                onUndo?.();
                return;
            }
            if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
                e.preventDefault();
                onRedo?.();
                return;
            }

            switch (e.key) {
                case "ArrowUp": {
                    e.preventDefault();
                    const idx = filteredSubtitles.findIndex((s) => s.id === activeId);
                    if (idx > 0) {
                        const prev = filteredSubtitles[idx - 1];
                        setActiveId(prev.id);
                        onSeek(parseSrtTime(prev.start));
                        document.getElementById(`sub-${prev.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                    break;
                }
                case "ArrowDown": {
                    e.preventDefault();
                    const idx = filteredSubtitles.findIndex((s) => s.id === activeId);
                    if (idx < filteredSubtitles.length - 1) {
                        const next = filteredSubtitles[idx + 1];
                        setActiveId(next.id);
                        onSeek(parseSrtTime(next.start));
                        document.getElementById(`sub-${next.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                    break;
                }
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [activeId, filteredSubtitles, onSeek, onUndo, onRedo]);

    const handleTimeChange = useCallback(
        (id: number, field: "start" | "end", value: string) => {
            const parts = value.split(":");
            if (parts.length !== 2) return;
            const m = parseInt(parts[0]) || 0;
            const s = parseInt(parts[1]) || 0;
            const updated = subtitles.map((sub) =>
                sub.id === id ? { ...sub, [field]: formatSrtTime(m * 60 + s) } : sub
            );
            onSubtitlesChange(updated);
        },
        [subtitles, onSubtitlesChange]
    );

    const handleExportSrt = useCallback(() => {
        const srt = subtitlesToSrt(subtitles);
        const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "subtitles.srt";
        a.click();
        URL.revokeObjectURL(url);
    }, [subtitles]);

    const handleExportVtt = useCallback(() => {
        const vtt = subtitlesToVtt(subtitles);
        const blob = new Blob([vtt], { type: "text/vtt;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "subtitles.vtt";
        a.click();
        URL.revokeObjectURL(url);
    }, [subtitles]);

    const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result as string;
            if (!content) return;
            const parsed = file.name.endsWith(".vtt") || content.trimStart().startsWith("WEBVTT")
                ? parseVtt(content)
                : parseSrt(content);
            if (parsed.length > 0) onSubtitlesChange(parsed);
        };
        reader.readAsText(file);
        // Reset so the same file can be re-imported
        e.target.value = "";
    }, [onSubtitlesChange]);

    const handleTextChange = useCallback(
        (id: number, newText: string) => {
            const updated = subtitles.map((s) =>
                s.id === id ? { ...s, text: newText } : s
            );
            onSubtitlesChange(updated);
        },
        [subtitles, onSubtitlesChange]
    );

    const handleCopyTranscript = async () => {
        const text = filteredSubtitles.map((s) => s.text).join("\n");
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReplaceAll = () => {
        if (!findText || findMatchCount === 0) return;
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "gi");
        const updated = subtitles.map((s) => ({
            ...s,
            text: s.text.replace(regex, replaceText),
        }));
        onSubtitlesChange(updated);
        setFindText("");
        setReplaceText("");
    };

    const shiftAllTimings = (deltaMs: number) => {
        const updated = subtitles.map((s) => ({
            ...s,
            start: shiftTime(s.start, deltaMs),
            end: shiftTime(s.end, deltaMs),
        }));
        onSubtitlesChange(updated);
        setTimingOffsetMs((prev) => prev + deltaMs);
    };

    return (
        <div className="flex flex-col h-full bg-background border-l border-border">
            {/* Toolbar */}
            <div className="border-b border-border bg-card/90 backdrop-blur-sm shrink-0">
                <div className="h-12 flex items-center justify-between px-3 gap-2">
                    <div className="flex items-center gap-1">
                        {/* Review queue — icon-only with count badge */}
                        <button
                            onClick={() => setShowReviewQueue(!showReviewQueue)}
                            title={`Review queue${needsReviewCount > 0 ? ` (${needsReviewCount})` : ""}`}
                            className={cn(
                                "relative p-1.5 rounded-md transition-colors",
                                showReviewQueue
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                            )}
                        >
                            <ListTodo className="w-3.5 h-3.5" />
                            {needsReviewCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] px-1 rounded-full min-w-[14px] text-center leading-[14px] font-medium pointer-events-none">
                                    {needsReviewCount}
                                </span>
                            )}
                        </button>

                        {/* Transcript stats — tooltip on hover (native title) */}
                        <button
                            type="button"
                            title={`${subtitles.length} subtitles · ${totalWords} words · ${statsMins}m ${String(statsSecs).padStart(2, "0")}s`}
                            aria-label="Transcript info"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                            <Info className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="flex items-center gap-0.5">
                        {/* Undo */}
                        <button
                            onClick={onUndo}
                            disabled={!canUndo}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Undo (⌘Z)"
                        >
                            <Undo2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Redo */}
                        <button
                            onClick={onRedo}
                            disabled={!canRedo}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Redo (⌘Y)"
                        >
                            <Redo2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="w-px h-4 bg-border mx-0.5" />

                        {/* Timing offset */}
                        <button
                            onClick={() => setShowTimingOffset(!showTimingOffset)}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                showTimingOffset
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                            title="Timing offset"
                        >
                            <Clock className="w-3.5 h-3.5" />
                        </button>

                        {/* Find & Replace */}
                        <button
                            onClick={() => setShowFindReplace(!showFindReplace)}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                showFindReplace
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                            title="Find & Replace"
                        >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                        </button>

                        {/* Copy transcript */}
                        <button
                            onClick={handleCopyTranscript}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Copy transcript"
                        >
                            {copied ? (
                                <Check className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                                <Copy className="w-3.5 h-3.5" />
                            )}
                        </button>

                        {/* Import SRT / VTT */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Import SRT or VTT file"
                        >
                            <Upload className="w-3.5 h-3.5" />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".srt,.vtt"
                            className="hidden"
                            onChange={handleImportFile}
                        />

                        {/* Export SRT */}
                        <button
                            onClick={handleExportSrt}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Export as .srt"
                        >
                            <Download className="w-3.5 h-3.5" />
                        </button>

                        {/* Export VTT */}
                        <button
                            onClick={handleExportVtt}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Export as .vtt"
                        >
                            <FileText className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Search bar */}
                <div className="px-3 pb-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search subtitles..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-muted/50 border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Timing Offset Panel */}
                <AnimatePresence>
                    {showTimingOffset && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-border"
                        >
                            <div className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                    Shift All:
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-background border border-border text-foreground">
                                    Current: {timingOffsetMs > 0 ? `+${timingOffsetMs}` : timingOffsetMs}ms
                                </span>
                                {[-1000, -500, -100, 100, 500, 1000].map((ms) => (
                                    <button
                                        key={ms}
                                        onClick={() => shiftAllTimings(ms)}
                                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted/60 border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                    >
                                        {ms > 0 ? `+${ms}` : ms}ms
                                    </button>
                                ))}
                                <button
                                    onClick={() => { if (timingOffsetMs !== 0) shiftAllTimings(-timingOffsetMs); }}
                                    disabled={timingOffsetMs === 0}
                                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 border border-primary/20 text-primary hover:bg-primary/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Reset
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Find & Replace Panel */}
                <AnimatePresence>
                    {showFindReplace && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-border"
                        >
                            <div className="px-3 py-2.5 space-y-2">
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="text"
                                        placeholder="Find..."
                                        value={findText}
                                        onChange={(e) => setFindText(e.target.value)}
                                        className="flex-1 px-2.5 py-1 bg-muted/50 border border-border rounded text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-all"
                                    />
                                    {findText && (
                                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                            {findMatchCount} found
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="text"
                                        placeholder="Replace with..."
                                        value={replaceText}
                                        onChange={(e) => setReplaceText(e.target.value)}
                                        className="flex-1 px-2.5 py-1 bg-muted/50 border border-border rounded text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-all"
                                    />
                                    <button
                                        onClick={handleReplaceAll}
                                        disabled={!findText || findMatchCount === 0}
                                        className="px-3 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                                    >
                                        Replace All
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Subtitle List */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto overscroll-contain subtitle-scroll"
            >
                {filteredSubtitles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                            <ListTodo className="w-6 h-6 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm text-muted-foreground font-medium">
                            {searchQuery
                                ? "No subtitles match your search"
                                : showReviewQueue
                                  ? "No subtitles need review"
                                  : "No subtitles available"}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                            {!searchQuery && !showReviewQueue
                                ? "Transcribe the video first to generate subtitles"
                                : ""}
                        </p>
                    </div>
                ) : (
                    <div className="p-2 space-y-1">
                        {filteredSubtitles.map((subtitle) => {
                            const isActive = subtitle.id === activeId;
                            const isLowConfidence = subtitle.confidence < 0.8;

                            return (
                                <div
                                    key={subtitle.id}
                                    id={`sub-${subtitle.id}`}
                                    onClick={() => {
                                        setActiveId(subtitle.id);
                                        onSeek(parseSrtTime(subtitle.start));
                                    }}
                                    className={cn(
                                        "group rounded-lg p-2.5 cursor-pointer transition-all duration-200 border",
                                        isActive
                                            ? "bg-muted border-border shadow-sm"
                                            : "bg-transparent border-transparent hover:bg-muted/50 hover:border-border/60"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground tabular-nums">
                                            <input
                                                type="text"
                                                value={displayTime(subtitle.start)}
                                                onChange={(e) => handleTimeChange(subtitle.id, "start", e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-10 bg-transparent text-center outline-none border-b border-transparent hover:border-border focus:border-primary rounded-none transition-colors"
                                                title="Edit start time (M:SS)"
                                            />
                                            <span>→</span>
                                            <input
                                                type="text"
                                                value={displayTime(subtitle.end)}
                                                onChange={(e) => handleTimeChange(subtitle.id, "end", e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-10 bg-transparent text-center outline-none border-b border-transparent hover:border-border focus:border-primary rounded-none transition-colors"
                                                title="Edit end time (M:SS)"
                                            />
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {isLowConfidence && (
                                                <span className="flex items-center gap-0.5 text-amber-400/80" title="Low confidence — review recommended">
                                                    <AlertTriangle className="w-3 h-3" />
                                                </span>
                                            )}
                                            <span className="text-[9px] text-muted-foreground/60 font-mono">
                                                #{subtitle.id}
                                            </span>
                                        </div>
                                    </div>

                                    <textarea
                                        value={subtitle.text}
                                        onChange={(e) => handleTextChange(subtitle.id, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        rows={Math.max(1, Math.ceil(subtitle.text.length / 45))}
                                        className={cn(
                                            "w-full bg-transparent text-xs leading-relaxed text-foreground/90 resize-none outline-none rounded px-1.5 py-1 -mx-1.5 transition-all",
                                            isActive
                                                ? "bg-muted/40 focus:bg-muted/60"
                                                : "hover:bg-muted/30 focus:bg-muted/40"
                                        )}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Keyboard shortcut hints */}
            <div className="px-3 py-2 text-[9px] text-muted-foreground text-center border-t border-border flex items-center justify-center gap-2 shrink-0 bg-muted/40">
                <span>
                    <kbd className="bg-muted px-1 py-0.5 rounded font-mono text-[8px] border border-border/60">↑↓</kbd>{" "}
                    Nav
                </span>
                <span>
                    <kbd className="bg-muted px-1 py-0.5 rounded font-mono text-[8px] border border-border/60">Space</kbd>{" "}
                    Play
                </span>
                <span>
                    <kbd className="bg-muted px-1 py-0.5 rounded font-mono text-[8px] border border-border/60">J</kbd>{" "}
                    -5s
                </span>
                <span>
                    <kbd className="bg-muted px-1 py-0.5 rounded font-mono text-[8px] border border-border/60">L</kbd>{" "}
                    +5s
                </span>
                <span>
                    <kbd className="bg-muted px-1 py-0.5 rounded font-mono text-[8px] border border-border/60">⌘Z</kbd>{" "}
                    Undo
                </span>
            </div>
        </div>
    );
}
