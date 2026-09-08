"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    Play,
    Pause,
    Ban,
    RotateCcw,
    DownloadCloud,
    AlertCircle,
    Scissors,
    Video as VideoIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { Video, QueueItem } from "@/types/media";

export interface QueueRowProps {
    item: QueueItem;
    videos: Video[];
    displayedVideos: Video[];
    retryingQueueIds: Set<string>;
    setPlayerIndex: (n: number) => void;
    setPlayerOpen: (b: boolean) => void;
    setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>;
    startDownloadJob: (id: string) => void;
    retryExportJob: (item: QueueItem) => void;
}

export function QueueRow({
    item,
    videos,
    displayedVideos,
    retryingQueueIds,
    setPlayerIndex,
    setPlayerOpen,
    setQueue,
    startDownloadJob,
    retryExportJob,
}: QueueRowProps) {
    // Link a finished row back to its library item: exports match by output path
    // (they have no originalUrl); downloads match by source URL.
    const matchedVideo = item.status === 'completed'
        ? videos.find(v =>
            (item.kind === 'export' && !!item.downloadPath && v.localPath === item.downloadPath) ||
            (!!v.originalUrl && v.originalUrl === item.originalUrl))
        : null;
    const isClickable = !!matchedVideo;
    // Fall back to the matched item's thumbnail when the job carries none (exports).
    const thumbSrc = item.thumbnail
        || (matchedVideo?.thumbnailPath ? `/api/thumbnail/${matchedVideo.id}` : undefined)
        || (matchedVideo?.mediaType === "image" ? `/api/media?path=${encodeURIComponent(matchedVideo.localPath)}` : undefined);
    const openInPlayer = () => {
        if (!matchedVideo) return;
        const idx = displayedVideos.findIndex(v => v.id === matchedVideo.id);
        if (idx >= 0) {
            setPlayerIndex(idx);
        } else {
            const fallbackIdx = videos.findIndex(v => v.id === matchedVideo.id);
            setPlayerIndex(fallbackIdx >= 0 ? fallbackIdx : 0);
        }
        setPlayerOpen(true);
    };
    const iconBtnOutline = cn(buttonVariants({ variant: "outline", size: "icon" }), "h-7 w-7 flex-shrink-0");
    const iconBtnDestructive = cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 flex-shrink-0 text-destructive hover:text-destructive");
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    return (
        <div
            key={item.id}
            onClick={isClickable ? openInPlayer : undefined}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={isClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInPlayer(); } } : undefined}
            className={cn(
                "relative flex items-start gap-3 rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-muted/50",
                isClickable && "cursor-pointer hover:border-primary/40 hover:shadow-md"
            )}
        >
            {thumbSrc ? (
                <div className="w-16 h-12 sm:w-20 sm:h-14 rounded-md overflow-hidden flex-shrink-0 relative bg-muted shadow-inner group">
                    <img src={thumbSrc} className="object-cover w-full h-full" alt="thumb" />
                    {isClickable && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-5 h-5 text-white fill-white" />
                        </div>
                    )}
                </div>
            ) : (
                <div className="w-16 h-12 sm:w-20 sm:h-14 rounded-md flex items-center justify-center flex-shrink-0 bg-muted/50 border border-dashed">
                    <VideoIcon className="w-5 h-5 text-muted-foreground/30" />
                </div>
            )}

            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <p className={cn("truncate text-[13px] font-medium", isClickable && "group-hover:text-primary")}>
                    {item.title || item.originalUrl}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <motion.div
                        key={`${item.id}-${item.status}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.18 }}
                    >
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {item.status}
                        </Badge>
                    </motion.div>
                    {item.kind === "export" && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-chart-1/40 text-chart-1 dark:text-chart-1 gap-1">
                            <Scissors className="w-2.5 h-2.5 flex-shrink-0" /> Export
                        </Badge>
                    )}
                    {item.errorText && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-full" title={item.errorText}>
                            {item.errorText}
                        </span>
                    )}
                </div>
                {item.status === "parsing" && (
                    <p className="text-[11px] text-muted-foreground">Parsing metadata…</p>
                )}
                {item.status === "queued" && (
                    <p className="text-[11px] text-muted-foreground">Queued, waiting for worker…</p>
                )}
                {(item.status === "downloading" || item.status === "paused" || item.status === "processing") && (() => {
                    // Downloads briefly sit at "processing" (muxing) with no % → show 100%.
                    // Exports report real ffmpeg progress while "processing", so use it.
                    const indeterminate = item.status === "processing" && item.kind !== "export";
                    const pct = Math.round(item.progress || 0);
                    return (
                    <div className="flex items-center gap-2">
                        <Progress value={indeterminate ? 100 : pct} className="h-1.5 flex-1 bg-muted/80" />
                        <motion.span
                            key={`${item.id}-${item.status}-${pct}`}
                            initial={{ opacity: 0.55, y: 2 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.16 }}
                            className="text-[11px] font-bold text-primary w-10 text-right flex-shrink-0"
                        >
                            {indeterminate ? "100%" : `${pct}%`}
                        </motion.span>
                    </div>
                    );
                })()}
                {item.formats && item.formats.length > 0 && !['queued', 'downloading', 'processing', 'paused', 'completed', 'cancelled'].includes(item.status) && (
                    <div className="flex items-center gap-1.5 w-full" onClick={stop}>
                        {item.needsReview && item.status === "pending" && (
                            <Tooltip>
                                <TooltipTrigger className="flex-shrink-0 text-chart-3 hover:text-chart-3 cursor-help">
                                    <AlertCircle className="w-4 h-4" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[260px]">
                                    {item.reviewReason || "Pick a format manually"}
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <Select
                            value={item.selectedFormat || "auto-best"}
                            onValueChange={(v) => {
                                const val = !v || v === "auto-best" ? "" : v;
                                setQueue(prev => prev.map(q => q.id === item.id ? { ...q, selectedFormat: val, needsReview: false, reviewReason: undefined } : q));
                            }}
                        >
                            <SelectTrigger size="sm" className="flex-1 min-w-0 max-w-[200px] text-[11px]">
                                <SelectValue>
                                    {(value) => {
                                        if (!value || value === "auto-best") return "Best available (auto)";
                                        if (value === "audio") return "🎵 Audio Only (MP3)";
                                        const fmt = item.formats?.find((f) => f.formatId === value);
                                        return fmt ? `${fmt.label}${fmt.filesize ? ` (~${(fmt.filesize / (1024 * 1024)).toFixed(0)}MB)` : ""}` : "Best available (auto)";
                                    }}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto-best" className="text-[11px]">Best available (auto)</SelectItem>
                                <SelectItem value="audio" className="text-[11px]">🎵 Audio Only (MP3)</SelectItem>
                                {item.formats.slice(0, 8).map(fmt => (
                                    <SelectItem key={fmt.formatId} value={fmt.formatId} className="text-[11px]">
                                        {fmt.label}{fmt.filesize ? ` (~${(fmt.filesize / (1024 * 1024)).toFixed(0)}MB)` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0 self-start" onClick={stop}>
                    {item.status === 'pending' && (
                        <Tooltip>
                            <TooltipTrigger
                                className={cn(buttonVariants({ variant: "default", size: "icon" }), "h-7 w-7 flex-shrink-0", retryingQueueIds.has(item.id) && "opacity-50 pointer-events-none")}
                                onClick={() => startDownloadJob(item.id)}
                            >
                                <DownloadCloud className="w-3.5 h-3.5" />
                            </TooltipTrigger>
                            <TooltipContent>Download</TooltipContent>
                        </Tooltip>
                    )}
                    {item.kind === 'export' && item.status === 'processing' && item.jobId && (
                        <>
                            <Tooltip>
                                <TooltipTrigger
                                    className={iconBtnOutline}
                                    onClick={async () => {
                                        await fetch(`/api/download/${item.jobId}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ action: "pause" }),
                                        });
                                        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "paused" } : q));
                                    }}
                                >
                                    <Pause className="w-3.5 h-3.5" />
                                </TooltipTrigger>
                                <TooltipContent>Pause export</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger
                                    className={iconBtnDestructive}
                                    onClick={async () => {
                                        await fetch(`/api/download/${item.jobId}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ action: "cancel" }),
                                        });
                                        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "cancelled", errorText: "Cancelled by user" } : q));
                                    }}
                                >
                                    <Ban className="w-3.5 h-3.5" />
                                </TooltipTrigger>
                                <TooltipContent>Cancel export</TooltipContent>
                            </Tooltip>
                        </>
                    )}
                    {item.status === 'downloading' && item.jobId && (
                        <>
                            <Tooltip>
                                <TooltipTrigger
                                    className={iconBtnOutline}
                                    onClick={async () => {
                                        await fetch(`/api/download/${item.jobId}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ action: "pause" }),
                                        });
                                        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "paused" } : q));
                                    }}
                                >
                                    <Pause className="w-3.5 h-3.5" />
                                </TooltipTrigger>
                                <TooltipContent>Pause</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger
                                    className={iconBtnDestructive}
                                    onClick={async () => {
                                        await fetch(`/api/download/${item.jobId}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ action: "cancel" }),
                                        });
                                        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "cancelled", errorText: "Cancelled by user" } : q));
                                    }}
                                >
                                    <Ban className="w-3.5 h-3.5" />
                                </TooltipTrigger>
                                <TooltipContent>Cancel</TooltipContent>
                            </Tooltip>
                        </>
                    )}
                    {item.status === 'paused' && item.jobId && (
                        <>
                            <Tooltip>
                                <TooltipTrigger
                                    className={cn(buttonVariants({ variant: "default", size: "icon" }), "h-7 w-7 flex-shrink-0")}
                                    onClick={async () => {
                                        await fetch(`/api/download/${item.jobId}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ action: "resume" }),
                                        });
                                        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: q.kind === "export" ? "processing" : "downloading" } : q));
                                    }}
                                >
                                    <Play className="w-3.5 h-3.5" />
                                </TooltipTrigger>
                                <TooltipContent>Resume</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger
                                    className={iconBtnDestructive}
                                    onClick={async () => {
                                        await fetch(`/api/download/${item.jobId}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ action: "cancel" }),
                                        });
                                        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "cancelled", errorText: "Cancelled by user" } : q));
                                    }}
                                >
                                    <Ban className="w-3.5 h-3.5" />
                                </TooltipTrigger>
                                <TooltipContent>Cancel</TooltipContent>
                            </Tooltip>
                        </>
                    )}
                    {/* Retry: downloads re-download; exports replay their stored
                        request (an export with no saved spec can't be retried). */}
                    {(item.status === 'error' || item.status === 'cancelled') && (
                        <Tooltip>
                            <TooltipTrigger
                                className={cn(iconBtnOutline, retryingQueueIds.has(item.id) && "opacity-50 pointer-events-none")}
                                onClick={() => item.kind === 'export' ? retryExportJob(item) : startDownloadJob(item.id)}
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </TooltipTrigger>
                            <TooltipContent>{retryingQueueIds.has(item.id) ? "Retrying…" : "Retry"}</TooltipContent>
                        </Tooltip>
                    )}
            </div>
        </div>
    );
}
