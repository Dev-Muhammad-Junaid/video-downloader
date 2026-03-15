"use client";

import React, { useState, useRef, useEffect } from "react";
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
    Check,
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

type Video = {
    id: string;
    title: string;
    duration: number | null;
    sourcePlatform: string | null;
    localPath: string;
    fileSize: number | null;
    mediaType?: string | null;
    originalUrl?: string | null;
    createdAt: string;
    labels?: { id: string; name: string; color: string | null }[];
    cloudKey?: string | null;
    cloudUrl?: string | null;
    cloudUploadedAt?: string | null;
    thumbnailPath?: string | null;
    // WID-307: Transcription fields
    transcriptStatus?: string | null;
    transcriptText?: string | null;
    transcriptPath?: string | null;
};

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
}: MediaPlayerModalProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState("");
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        setCurrentIndex(initialIndex);
    }, [initialIndex]);

    const video = videos[currentIndex];
    if (!video) return null;

    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < videos.length - 1;

    const handlePrev = () => {
        if (hasPrev) setCurrentIndex(currentIndex - 1);
    };

    const handleNext = () => {
        if (hasNext) setCurrentIndex(currentIndex + 1);
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
        if (editTitle.trim() && editTitle !== video.title) {
            onTitleUpdate?.(video.id, editTitle.trim());
        }
        setIsEditingTitle(false);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
    };

    const handleOpenFolder = async (filePath: string) => {
        await fetch("/api/library/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reveal", filePath }),
        });
    };

    const formatSize = (bytes: number | null) => {
        if (!bytes) return "-";
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatDuration = (seconds: number | null) => {
        if (!seconds) return null;
        const m = Math.floor(seconds / 60);
        const s = Math.round(seconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-[95vw] sm:max-w-[1200px] md:w-[1200px] max-h-[90vh] p-0 gap-0 overflow-hidden bg-background"
                onKeyDown={handleKeyDown}
            >
                <DialogTitle className="sr-only">{video.title}</DialogTitle>
                <div className="flex flex-col lg:flex-row h-[85vh] min-h-0">
                    {/* Left: Media Player */}
                    <div className="flex-1 bg-black flex items-center justify-center relative min-h-[300px] lg:min-h-0 overflow-hidden">
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

                        {/* Counter */}
                        <div className="absolute top-3 right-3 z-10 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                            {currentIndex + 1} / {videos.length}
                        </div>

                        {/* Media */}
                        {video.mediaType === "image" ? (
                            <img
                                src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                                alt={video.title}
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                key={video.id}
                                src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                                controls
                                autoPlay
                                className="w-full h-full object-contain outline-none"
                            />
                        )}
                    </div>

                    {/* Right: Metadata Panel */}
                    <div className="w-full lg:w-[340px] border-l border-border flex flex-col overflow-y-auto">
                        {/* Title */}
                        <div className="p-4 border-b border-border">
                            {isEditingTitle ? (
                                <div className="flex gap-1.5">
                                    <Input
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="h-8 text-sm"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") saveTitle();
                                            if (e.key === "Escape") setIsEditingTitle(false);
                                        }}
                                    />
                                    <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={saveTitle}>
                                        <Check className="w-4 h-4 text-emerald-500" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={() => setIsEditingTitle(false)}>
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-start gap-2">
                                    <h3 className="font-semibold text-sm flex-1 leading-snug break-words">{video.title}</h3>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0 opacity-50 hover:opacity-100" onClick={startEditTitle}>
                                        <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
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
                                    {video.mediaType === "image" ? "Image" : "Video"}
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
                                    className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
                                >
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{video.originalUrl}</span>
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
                                        className="h-9 text-xs text-orange-500 hover:text-orange-500"
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
