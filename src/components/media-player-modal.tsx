"use client";

import React, { useState, useRef, useEffect } from "react";
import { formatSize, formatDuration } from "@/lib/format";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    ChevronLeft,
    ChevronRight,
    Copy,
    FolderOpen,
    Cloud,
    CloudOff,
    Trash2,
    ExternalLink,
    Pencil,
    X,
    Calendar,
    HardDrive,
    Clock,
    Tag,
    Mic,
    Loader2,
    FileText,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { WaveformPlayer } from "./audio-player";
import type { Video } from "@/types/media";

interface MediaPlayerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    videos: Video[];
    initialIndex: number;
    onDelete?: (videoId: string, title: string) => void;
    onCloudUpload?: (video: Video) => void;
    onCloudRemove?: (video: Video) => void;
    onTitleUpdate?: (videoId: string, newTitle: string) => void;
    onTranscribe?: (video: Video) => void;
    onRefreshLibrary?: () => void;
    /** Hand off to the page-level editor: the page closes the player and opens
     *  the right editor, so only one full-screen overlay is mounted at a time
     *  (avoids the nested scroll-lock that froze the page). */
    onEdit?: (video: Video) => void;
}

export function MediaPlayerModal({
    open,
    onOpenChange,
    videos,
    initialIndex,
    onDelete,
    onCloudUpload,
    onCloudRemove,
    onTitleUpdate,
    onTranscribe,
    onRefreshLibrary,
    onEdit,
}: MediaPlayerModalProps) {
    // Track by ID so library refreshes (which shift array indices) don't swap the displayed item
    const [currentId, setCurrentId] = useState<string>(videos[initialIndex]?.id ?? "");
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState("");

    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        setCurrentId(videos[initialIndex]?.id ?? "");
    }, [initialIndex, videos]);

    const currentIndex = videos.findIndex(v => v.id === currentId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const video = videos[safeIndex];
    if (!video) return null;

    const hasPrev = safeIndex > 0;
    const hasNext = safeIndex < videos.length - 1;

    const handlePrev = () => {
        if (hasPrev) setCurrentId(videos[safeIndex - 1].id);
    };

    const handleNext = () => {
        if (hasNext) setCurrentId(videos[safeIndex + 1].id);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isEditingTitle) return;
        if (e.key === "ArrowLeft" && hasPrev) handlePrev();
        if (e.key === "ArrowRight" && hasNext) handleNext();
        if (e.key === "Escape") onOpenChange(false);
    };

    const startEditTitle = () => {
        setEditTitle(video.title);
        setIsEditingTitle(true);
    };

    const saveTitle = () => {
        const trimmed = editTitle.trim();
        if (trimmed && trimmed !== video.title) {
            onTitleUpdate?.(video.id, trimmed);
        }
        setIsEditingTitle(false);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
    };

    const handleOpenFolder = async (targetPath: string) => {
        try {
            const res = await fetch("/api/library/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "open", targetPath }),
            });
            if (!res.ok) throw new Error("Failed to open folder");
        } catch {
            toast.error("Could not open folder");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="w-[95vw] max-w-[1200px] sm:max-w-[1200px] max-h-[90vh] p-0 gap-0 overflow-hidden bg-background"
                onKeyDown={handleKeyDown}
            >
                <DialogTitle className="sr-only">{video.title}</DialogTitle>
                <div className="flex flex-col lg:flex-row h-[85vh] min-h-0 w-full min-w-0">
                    {/* Left: Media Player */}
                    <div className="flex-1 bg-black flex items-center justify-center relative min-h-[300px] lg:min-h-0 overflow-hidden min-w-0">
                        {/* Navigation Arrows */}
                        {hasPrev && (
                            <button
                                onClick={handlePrev}
                                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white transition-all"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </button>
                        )}
                        {hasNext && (
                            <button
                                onClick={handleNext}
                                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white transition-all"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </button>
                        )}

                        {/* Counter — top-left so it never collides with the dialog close button */}
                        <div className="absolute top-3 left-3 z-10 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                            {currentIndex + 1} / {videos.length}
                        </div>

                        {/* Media */}
                        {video.mediaType === "image" ? (
                            <img
                                src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                                alt={video.title}
                                className="w-full h-full object-contain"
                            />
                        ) : video.mediaType === "audio" ? (
                            <WaveformPlayer
                                key={video.id}
                                variant="full"
                                src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                                seed={video.id}
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                key={video.id}
                                src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                                controls
                                className="w-full h-full object-contain outline-none"
                            />
                        )}
                    </div>

                    {/* Right: Metadata Panel */}
                    <div className="w-full lg:w-[340px] border-t lg:border-t-0 lg:border-l border-border flex flex-col overflow-y-auto min-h-0 min-w-0 flex-1 lg:flex-none lg:shrink-0">
                        {/* Title */}
                        <div className="p-4 border-b border-border">
                            {isEditingTitle ? (
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="h-8 text-sm flex-1"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") saveTitle();
                                            if (e.key === "Escape") setIsEditingTitle(false);
                                        }}
                                        onBlur={saveTitle}
                                    />
                                </div>
                            ) : (
                                <h3
                                    className="font-semibold text-sm leading-snug break-words cursor-text select-none rounded px-1 -mx-1 hover:bg-muted/50 transition-colors"
                                    onDoubleClick={startEditTitle}
                                    title="Double-click to rename"
                                >
                                    {video.title}
                                </h3>
                            )}
                        </div>

                        {/* Metadata */}
                        <div className="p-4 space-y-3 border-b border-border">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="w-4 h-4 flex-shrink-0" />
                                <span>{new Date(video.createdAt).toLocaleDateString()} {new Date(video.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            {video.sourcePlatform && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Tag className="w-4 h-4 flex-shrink-0" />
                                    <span className="capitalize">{video.sourcePlatform}</span>
                                </div>
                            )}
                            {video.fileSize && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <HardDrive className="w-4 h-4 flex-shrink-0" />
                                    <span>{formatSize(video.fileSize)}</span>
                                </div>
                            )}
                            {video.duration && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Clock className="w-4 h-4 flex-shrink-0" />
                                    <span>{formatDuration(video.duration)}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Badge variant="secondary" className="text-[10px]">
                                    {video.mediaType === "image" ? "Image" : video.mediaType === "audio" ? "Audio" : "Video"}
                                </Badge>
                                {video.cloudKey && (
                                    <Badge variant="secondary" className="text-[10px] text-emerald-500">
                                        <Cloud className="w-3 h-3 mr-1" /> Cloud Synced
                                    </Badge>
                                )}
                            </div>
                        </div>

                        {/* Labels */}
                        {video.labels && video.labels.length > 0 && (
                            <div className="p-4 border-b border-border">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Labels</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {video.labels.map(label => (
                                        <Badge key={label.id} variant="secondary" className="text-[10px]">
                                            {label.name}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Source URL */}
                        {video.originalUrl && (
                            <div className="p-4 border-b border-border">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Source</p>
                                <a
                                    href={video.originalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline flex items-center gap-1 min-w-0"
                                >
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate min-w-0">{video.originalUrl}</span>
                                </a>
                            </div>
                        )}

                        {/* Transcription (WID-307) */}
                        {video.mediaType !== "image" && (
                            <div className="p-4 border-b border-border bg-muted/20">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                        <Mic className="w-3.5 h-3.5 text-violet-500" />
                                        AI Transcription
                                    </p>
                                    {video.transcriptStatus && (
                                        <Badge 
                                            variant={video.transcriptStatus === "completed" ? "default" : video.transcriptStatus === "error" ? "destructive" : "secondary"}
                                            className="text-[9px] px-1.5 py-0 capitalize"
                                        >
                                            {video.transcriptStatus}
                                        </Badge>
                                    )}
                                </div>
                                
                                {video.transcriptStatus === "completed" && video.transcriptText ? (
                                    <div className="mt-2 relative group">
                                        <div className="text-[11px] leading-relaxed text-muted-foreground bg-background p-2 rounded border border-border/50 max-h-[150px] overflow-y-auto whitespace-pre-wrap font-sans italic selection:bg-violet-500/20">
                                            {video.transcriptText}
                                        </div>
                                        <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="h-6 w-6 absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80"
                                            onClick={() => copyToClipboard(video.transcriptText!)}
                                        >
                                            <Copy className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ) : video.transcriptStatus === "processing" ? (
                                    <div className="flex items-center gap-2 py-4 justify-center">
                                        <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                                        <span className="text-xs text-muted-foreground">Transcribing...</span>
                                    </div>
                                ) : video.transcriptStatus === "error" ? (
                                    <div className="p-3 bg-destructive/5 rounded border border-destructive/20 text-[10px] text-destructive flex items-center gap-2">
                                        <X className="w-3 h-3 flex-shrink-0" />
                                        Transcription failed. Try again.
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-muted-foreground italic py-1">No transcript available for this video yet.</p>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="p-4 mt-auto space-y-2">
                            {video.mediaType !== "image" && (!video.transcriptStatus || video.transcriptStatus === "error" || video.transcriptStatus === "processing") && (
                                <Button
                                    variant="outline"
                                    className="w-full h-9 text-xs border-violet-500/30 hover:bg-violet-500/5 text-violet-600 dark:text-violet-400"
                                    onClick={() => onTranscribe?.(video)}
                                    disabled={video.transcriptStatus === "processing"}
                                >
                                    {video.transcriptStatus === "processing" ? (
                                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                    ) : (
                                        <Mic className="w-3.5 h-3.5 mr-1.5" />
                                    )}
                                    {video.transcriptStatus === "processing" ? "Transcribing..." : "Transcribe Video"}
                                </Button>
                            )}

                            {video.mediaType === "image" ? (
                                <Button
                                    variant="outline"
                                    className="w-full h-9 text-xs"
                                    onClick={() => onEdit?.(video)}
                                >
                                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Image
                                </Button>
                            ) : video.mediaType === "audio" ? (
                                <Button
                                    variant="outline"
                                    className="w-full h-9 text-xs"
                                    onClick={() => onEdit?.(video)}
                                >
                                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Audio
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        variant="outline"
                                        className="w-full h-9 text-xs"
                                        onClick={() => onEdit?.(video)}
                                    >
                                        <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Video
                                    </Button>
                                    {video.localPath && !video.localPath.toLowerCase().endsWith(".mp4") && (
                                        <Button
                                            variant="outline"
                                            className="w-full h-9 text-xs"
                                            onClick={async () => {
                                                const toastId = toast.loading("Converting to MP4...");
                                                try {
                                                    await api.post("/api/library/edit", { videoId: video.id, action: "convert-mp4", params: {} });
                                                    toast.success("Converted to MP4!", { id: toastId });
                                                    onRefreshLibrary?.();
                                                } catch (err: any) {
                                                    toast.error(err.message, { id: toastId });
                                                }
                                            }}
                                        >
                                            <FileText className="w-3.5 h-3.5 mr-1.5" /> Convert to MP4
                                        </Button>
                                    )}
                                </>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 text-xs"
                                    onClick={() => copyToClipboard(video.localPath)}
                                >
                                    <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Path
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 text-xs"
                                    onClick={() => handleOpenFolder(video.localPath)}
                                >
                                    <FolderOpen className="w-3.5 h-3.5 mr-1.5" /> Open Folder
                                </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {video.cloudKey ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 text-xs text-destructive hover:text-destructive"
                                        onClick={() => onCloudRemove?.(video)}
                                    >
                                        <CloudOff className="w-3.5 h-3.5 mr-1.5" /> Remove Cloud
                                    </Button>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 text-xs"
                                        onClick={() => onCloudUpload?.(video)}
                                    >
                                        <Cloud className="w-3.5 h-3.5 mr-1.5" /> Upload Cloud
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 text-xs text-destructive hover:text-destructive"
                                    onClick={() => {
                                        onDelete?.(video.id, video.title);
                                        onOpenChange(false);
                                    }}
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>

        </Dialog>
    );
}
