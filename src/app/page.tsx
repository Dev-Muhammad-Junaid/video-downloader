"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Pause, RotateCcw, Cloud, DownloadCloud, Loader2, Video as VideoIcon, Image as ImageIcon, Search, Filter, HelpCircle, XCircle, BrainCircuit, Sparkles, Ban } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command";
import { toast } from "sonner";
import { Trash2, Tags, CheckSquare, Music, X } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { MediaPlayerModal } from "@/components/media-player-modal";
import { ImageEditorModal } from "@/components/image-editor/image-editor-modal";
import { VideoEditorModal } from "@/components/video-editor/video-editor-modal";
import { AudioEditorModal } from "@/components/audio-editor/audio-editor-modal";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import type { Video } from "@/types/media";
import { VideoCard } from "@/components/library/video-card";
import { QueueRow } from "@/components/library/queue-row";
import { useLibrary } from "@/hooks/use-library";
import { useDownloadQueue } from "@/hooks/use-download-queue";

export default function LibraryPage() {
    // Filter & Sort State
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"newest" | "oldest" | "size-desc" | "size-asc">("newest");
    const [platformFilter, setPlatformFilter] = useState("all");
    // Keep SSR and first client render identical; hydrate localStorage prefs after mount.
    const [groupByDate, setGroupByDate] = useState(true);
    const [mediaTypeFilter, setMediaTypeFilter] = useState<"all" | "video" | "image" | "audio">("all");

    // Editor state
    const [editingImageId, setEditingImageId] = useState<string | null>(null);
    const [editingVideoForEditor, setEditingVideoForEditor] = useState<string | null>(null);
    const [editingAudioForEditor, setEditingAudioForEditor] = useState<string | null>(null);

    // Media Player Modal State
    const [playerOpen, setPlayerOpen] = useState(false);
    const [playerIndex, setPlayerIndex] = useState(0);

    // Deep Search State (WID-308)
    const [deepSearchMode, setDeepSearchMode] = useState(false);
    const [deepSearchResults, setDeepSearchResults] = useState<Video[] | null>(null);
    const [deepSearchLoading, setDeepSearchLoading] = useState(false);

    // Bulk Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectionMode, setSelectionMode] = useState(false);
    const lastSelectedIndex = React.useRef<number | null>(null);

    // Dev seed state (only meaningful in development)
    const [seeding, setSeeding] = useState(false);

    // Library data + mutations (videos, labels, transcribe, delete, cloud, ...)
    const {
        videos, setVideos, loading,
        globalLabels, newLabelName, setNewLabelName,
        transcribingIds, providerLabel,
        deleteTarget, setDeleteTarget, openDeleteDialog, performDelete,
        fetchLibrary,
        handleTranscribe, handleOpenFolder, copyToClipboard,
        handleCloudUpload, handleCloudRemove,
        attachLabel, detachLabel, createAndAttachLabel,
    } = useLibrary();

    // Download/export queue (state, profile matching, SSE + polling progress)
    const {
        urlText, setUrlText,
        queue, setQueue,
        profiles,
        selectedQueueProfile, setSelectedQueueProfile,
        queueFilter, setQueueFilter,
        retryingQueueIds,
        filteredQueue,
        fetchQueue,
        handleAddLinks,
        startDownloadJob,
        retryExportJob,
    } = useDownloadQueue({ refreshLibrary: fetchLibrary });

    useEffect(() => {
        // Hydrate persisted UI prefs once after mount (kept out of SSR to avoid
        // hydration mismatch). Intentional post-mount setState.
        /* eslint-disable react-hooks/set-state-in-effect */
        const savedGroupByDate = localStorage.getItem("ui_groupByDate");
        if (savedGroupByDate !== null) {
            setGroupByDate(savedGroupByDate === "true");
        }

        const savedMediaType = localStorage.getItem("ui_mediaTypeFilter");
        if (savedMediaType === "all" || savedMediaType === "video" || savedMediaType === "image" || savedMediaType === "audio") {
            setMediaTypeFilter(savedMediaType);
        }
        /* eslint-enable react-hooks/set-state-in-effect */
    }, []);

    // Stop any inline card playback when a preview (media player) or editor opens,
    // so audio/video from a card doesn't keep playing behind the modal.
    useEffect(() => {
        if (playerOpen || editingImageId || editingVideoForEditor || editingAudioForEditor) {
            document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((m) => {
                try { m.pause(); } catch { /* ignore */ }
            });
        }
    }, [playerOpen, editingImageId, editingVideoForEditor, editingAudioForEditor]);

    // WID-308: Deep Search handler
    const handleDeepSearch = useCallback(async (query: string) => {
        if (!query.trim()) {
            setDeepSearchResults(null);
            return;
        }
        setDeepSearchLoading(true);
        try {
            const mode = deepSearchMode ? "deep" : "quick";
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&mode=${mode}&platform=${platformFilter}&type=${mediaTypeFilter}`);
            if (!res.ok) throw new Error("Search failed");
            const data = await res.json();
            setDeepSearchResults(data.results);
        } catch (e) {
            console.error("Deep search error:", e);
            setDeepSearchResults(null);
        } finally {
            setDeepSearchLoading(false);
        }
    }, [deepSearchMode, platformFilter, mediaTypeFilter]);

    // Debounce search
    useEffect(() => {
        if (!searchQuery.trim() || !deepSearchMode) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setDeepSearchResults(null);
            return;
        }
        const timeout = setTimeout(() => handleDeepSearch(searchQuery), 350);
        return () => clearTimeout(timeout);
    }, [searchQuery, deepSearchMode, handleDeepSearch]);

    // Compute derived filtered + sorted list
    const displayedVideos = useMemo(() => {
        let result = deepSearchResults !== null ? [...deepSearchResults] : [...videos];

        // Apply local filtering only if we are not utilizing server-side results
        if (deepSearchResults === null) {
            // Filter by platform
            if (platformFilter !== "all") {
                result = result.filter(v =>
                    (v.sourcePlatform || "Unknown").toLowerCase() === platformFilter.toLowerCase()
                );
            }

            // Filter by media type
            if (mediaTypeFilter !== "all") {
                result = result.filter(v => (v.mediaType || "video") === mediaTypeFilter);
            }

            // Search query (title and labels in quick mode)
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                result = result.filter(v =>
                    v.title.toLowerCase().includes(q) ||
                    v.labels?.some(l => l.name.toLowerCase().includes(q))
                );
            }
        }

        // Apply Sort globally to all lists
        result.sort((a, b) => {
            if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            if (sortBy === "size-desc") return (b.fileSize || 0) - (a.fileSize || 0);
            if (sortBy === "size-asc") return (a.fileSize || 0) - (b.fileSize || 0);
            return 0;
        });

        return result;
    }, [videos, searchQuery, sortBy, platformFilter, mediaTypeFilter, deepSearchResults]);

    const toggleSelection = useCallback((videoId: string, e?: React.MouseEvent) => {
        const currentIndex = displayedVideos.findIndex(v => v.id === videoId);

        if (e?.shiftKey && lastSelectedIndex.current !== null && currentIndex !== -1) {
            const start = Math.min(lastSelectedIndex.current, currentIndex);
            const end = Math.max(lastSelectedIndex.current, currentIndex);
            setSelectedIds(prev => {
                const next = new Set(prev);
                for (let i = start; i <= end; i++) {
                    next.add(displayedVideos[i].id);
                }
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(videoId)) next.delete(videoId);
                else next.add(videoId);
                return next;
            });
        }

        if (currentIndex !== -1) lastSelectedIndex.current = currentIndex;
    }, [displayedVideos]);

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(videos.map(v => v.id)));
    }, [videos]);

    const deselectAll = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    // Get unique platforms for filter
    const platforms = useMemo(() => {
        const set = new Set(videos.map(v => v.sourcePlatform || "Unknown"));
        return Array.from(set).sort();
    }, [videos]);

    const renderVideoCard = (video: Video) => (
        <VideoCard
            key={video.id}
            video={video}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            displayedVideos={displayedVideos}
            newLabelName={newLabelName}
            globalLabels={globalLabels}
            transcribingIds={transcribingIds}
            providerLabel={providerLabel}
            setPlayerIndex={setPlayerIndex}
            setPlayerOpen={setPlayerOpen}
            toggleSelection={toggleSelection}
            attachLabel={attachLabel}
            detachLabel={detachLabel}
            createAndAttachLabel={createAndAttachLabel}
            setNewLabelName={setNewLabelName}
            handleCloudUpload={handleCloudUpload}
            handleCloudRemove={handleCloudRemove}
            handleTranscribe={handleTranscribe}
            copyToClipboard={copyToClipboard}
            handleOpenFolder={handleOpenFolder}
            setEditingImageId={setEditingImageId}
            setEditingAudioForEditor={setEditingAudioForEditor}
            setEditingVideoForEditor={setEditingVideoForEditor}
            openDeleteDialog={openDeleteDialog}
        />
    );

    return (
        <div className="p-8 w-full space-y-10 max-w-[1600px] mx-auto min-h-full">

            {/* Top Section: Dashboard Split View */}
            <div className="flex flex-col xl:flex-row gap-8 items-stretch pt-2">

                {/* Left Panel: Bulk Input */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring" as const, damping: 22, stiffness: 180, delay: 0.05 }}
                    className="w-full xl:w-1/3"
                >
                <Card className="overflow-hidden relative h-full">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50 pointer-events-none" />
                    <CardHeader className="relative">
                        <CardTitle className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                            <DownloadCloud className="w-6 h-6 text-primary" />
                            Studio Downloader
                            <Tooltip>
                                <TooltipTrigger className="ml-1 cursor-help">
                                    <HelpCircle className="w-4 h-4 text-muted-foreground/60 hover:text-muted-foreground transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-[280px] p-3 text-left leading-relaxed">
                                    <p className="font-semibold mb-1">Supported Features</p>
                                    <ul className="space-y-0.5 text-[11px] opacity-90 list-disc pl-3">
                                        <li>Videos from X/Twitter, YouTube, Instagram, TikTok, Reddit &amp; more</li>
                                        <li>Images from tweets &amp; social posts</li>
                                        <li>Bulk download — one URL per line</li>
                                        <li>Auto-labeling by content category</li>
                                        <li>Duplicate detection</li>
                                    </ul>
                                </TooltipContent>
                            </Tooltip>
                        </CardTitle>
                        <CardDescription className="text-sm">
                            Paste links, one per line.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 relative">
                        <Textarea
                            className="min-h-[160px] resize-none font-mono text-xs bg-background/50 border-primary/20 focus-visible:ring-primary/50 transition-all rounded-xl shadow-inner"
                            placeholder="https://x.com/user/status/123...&#10;https://youtube.com/watch?v=..."
                            value={urlText}
                            onChange={e => setUrlText(e.target.value)}
                        />
                        <Button className="w-full rounded-xl h-12 shadow-md hover:shadow-lg transition-all" onClick={handleAddLinks} disabled={!urlText.trim()}>
                            Add to Queue
                        </Button>
                    </CardContent>
                </Card>
                </motion.div>

                {/* Right Panel: Active Queue */}
                <div className="w-full xl:w-2/3 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <h2 className="text-xl font-bold tracking-tight text-foreground/90">
                                Active Queue
                            </h2>
                            {queue.length > 0 && <span className="text-xs font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded-full">{queue.length}</span>}
                            {profiles.length > 0 && (
                                <Select value={selectedQueueProfile} onValueChange={(v) => setSelectedQueueProfile(v || "default-auto")}>
                                    <SelectTrigger size="sm" className="ml-1 max-w-[220px] text-xs">
                                        <SelectValue>
                                            {(value) => {
                                                if (!value || value === "default-auto") return "Auto (match by URL)";
                                                const p = profiles.find((pr) => pr.id === value);
                                                if (!p) return "Auto (match by URL)";
                                                const tags: string[] = [];
                                                if (p.priority === -1) tags.push("default");
                                                if (p.requireManualFormat) tags.push("manual");
                                                if (p.extractAudio) tags.push("audio");
                                                const mode = p.resolutionMode || (p.strictResolution ? "strict" : "flexible");
                                                if (mode === "strict") tags.push("strict");
                                                if (mode === "minimum") tags.push("min");
                                                return `${p.name}${tags.length ? ` · ${tags.join(", ")}` : ""}`;
                                            }}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="default-auto" className="text-xs">Auto (match by URL)</SelectItem>
                                        {profiles.map((profile) => {
                                            const tags: string[] = [];
                                            if (profile.priority === -1) tags.push("default");
                                            if (profile.requireManualFormat) tags.push("manual");
                                            if (profile.extractAudio) tags.push("audio");
                                            const mode = profile.resolutionMode || (profile.strictResolution ? "strict" : "flexible");
                                            if (mode === "strict") tags.push("strict");
                                            if (mode === "minimum") tags.push("min");
                                            return (
                                                <SelectItem key={profile.id} value={profile.id} className="text-xs">
                                                    {profile.name}{tags.length ? ` · ${tags.join(", ")}` : ""}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                        {queue.length > 0 && (
                            <div className="flex items-center gap-1">
                                {queue.some(q => q.status === "pending") && (
                                    <Tooltip>
                                        <TooltipTrigger
                                            className={cn(buttonVariants({ variant: "default", size: "icon" }), "h-7 w-7")}
                                            onClick={() => {
                                                const pending = queue.filter(q => q.status === "pending");
                                                pending.forEach(item => startDownloadJob(item.id));
                                                toast.info(`Starting ${pending.length} downloads...`);
                                            }}
                                        >
                                            <DownloadCloud className="w-3.5 h-3.5" />
                                        </TooltipTrigger>
                                        <TooltipContent>Download All ({queue.filter(q => q.status === "pending").length})</TooltipContent>
                                    </Tooltip>
                                )}
                                {queue.some(q => q.status === "downloading" && q.jobId) && (
                                    <Tooltip>
                                        <TooltipTrigger
                                            className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-7 w-7")}
                                            onClick={async () => {
                                                const active = queue.filter(q => q.status === "downloading" && q.jobId);
                                                for (const item of active) {
                                                    await fetch(`/api/download/${item.jobId}`, {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ action: "pause" }),
                                                    });
                                                }
                                                setQueue(prev => prev.map(q => active.find(a => a.id === q.id) ? { ...q, status: "paused" as const } : q));
                                                toast.info(`Paused ${active.length} downloads`);
                                            }}
                                        >
                                            <Pause className="w-3.5 h-3.5" />
                                        </TooltipTrigger>
                                        <TooltipContent>Pause All</TooltipContent>
                                    </Tooltip>
                                )}
                                {queue.some(q => q.status === "paused" && q.jobId) && (
                                    <Tooltip>
                                        <TooltipTrigger
                                            className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-7 w-7")}
                                            onClick={async () => {
                                                const paused = queue.filter(q => q.status === "paused" && q.jobId);
                                                for (const item of paused) {
                                                    await fetch(`/api/download/${item.jobId}`, {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ action: "resume" }),
                                                    });
                                                }
                                                setQueue(prev => prev.map(q => paused.find(a => a.id === q.id) ? { ...q, status: "downloading" as const } : q));
                                                toast.info(`Resumed ${paused.length} downloads`);
                                            }}
                                        >
                                            <Play className="w-3.5 h-3.5" />
                                        </TooltipTrigger>
                                        <TooltipContent>Resume All</TooltipContent>
                                    </Tooltip>
                                )}
                                {queue.some(q => q.status === "error" || q.status === "cancelled") && (
                                    <Tooltip>
                                        <TooltipTrigger
                                            className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-7 w-7")}
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch("/api/download/queue", {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ action: "retryFailed" }),
                                                    });
                                                    const data = await res.json();
                                                    if (!res.ok) throw new Error(data.error || "Retry failed");
                                                    toast.success(`Retried ${data.retried || 0} jobs`);
                                                    fetchQueue();
                                                } catch (error: any) {
                                                    toast.error(error.message || "Failed to retry");
                                                }
                                            }}
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                        </TooltipTrigger>
                                        <TooltipContent>Retry Failed</TooltipContent>
                                    </Tooltip>
                                )}
                                {queue.some(q => (q.status === "downloading" || q.status === "paused") && q.jobId) && (
                                    <Tooltip>
                                        <TooltipTrigger
                                            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 text-destructive hover:text-destructive")}
                                            onClick={async () => {
                                                const active = queue.filter(q => (q.status === "downloading" || q.status === "paused") && q.jobId);
                                                for (const item of active) {
                                                    await fetch(`/api/download/${item.jobId}`, {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ action: "cancel" }),
                                                    });
                                                }
                                                setQueue(prev => prev.map(q => active.find(a => a.id === q.id) ? { ...q, status: "cancelled" as const, errorText: "Cancelled by user" } : q));
                                                toast.info(`Cancelled ${active.length} downloads`);
                                            }}
                                        >
                                            <Ban className="w-3.5 h-3.5" />
                                        </TooltipTrigger>
                                        <TooltipContent>Cancel All</TooltipContent>
                                    </Tooltip>
                                )}
                                <div className="w-px h-5 bg-border/40 mx-0.5" />
                                <Tooltip>
                                    <TooltipTrigger
                                        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 text-muted-foreground hover:text-destructive")}
                                        onClick={async () => {
                                            try {
                                                await fetch("/api/download/queue?mode=all", { method: "DELETE" });
                                                setQueue([]);
                                                toast.success("Queue cleared");
                                            } catch {
                                                toast.error("Failed to clear queue");
                                            }
                                        }}
                                    >
                                        <XCircle className="w-3.5 h-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent>Clear Queue</TooltipContent>
                                </Tooltip>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center border border-border/50 rounded-lg overflow-hidden w-fit">
                        <Button
                            variant={queueFilter === "all" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8 rounded-none text-xs px-3"
                            onClick={() => setQueueFilter("all")}
                        >
                            All
                        </Button>
                        <Button
                            variant={queueFilter === "active" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8 rounded-none text-xs px-3"
                            onClick={() => setQueueFilter("active")}
                        >
                            Active
                        </Button>
                        <Button
                            variant={queueFilter === "failed" ? "secondary" : "ghost"}
                            size="sm"
                            className="h-8 rounded-none text-xs px-3"
                            onClick={() => setQueueFilter("failed")}
                        >
                            Failed
                        </Button>
                    </div>

                    <div className="flex-1 min-h-[220px] max-h-[300px] overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                        {filteredQueue.length === 0 ? (
                            <div className="h-full min-h-[220px] flex flex-col gap-3 items-center justify-center text-muted-foreground border-2 border-dashed border-muted rounded-2xl bg-muted/10">
                                <DownloadCloud className="w-10 h-10 opacity-20" />
                                <span className="text-sm opacity-60">No queue items for this filter</span>
                            </div>
                        ) : (
                            filteredQueue.map(item => (
                                <QueueRow
                                    key={item.id}
                                    item={item}
                                    videos={videos}
                                    displayedVideos={displayedVideos}
                                    retryingQueueIds={retryingQueueIds}
                                    setPlayerIndex={setPlayerIndex}
                                    setPlayerOpen={setPlayerOpen}
                                    setQueue={setQueue}
                                    startDownloadJob={startDownloadJob}
                                    retryExportJob={retryExportJob}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div className="h-px bg-border/50 w-full" />

            {/* Bottom Section: Media Library */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring" as const, damping: 22, stiffness: 160, delay: 0.2 }}
                className="space-y-6 pt-4"
            >
                <div className="flex flex-col gap-3 px-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">Saved Media</h2>
                            <div className="text-sm text-muted-foreground mt-0.5">
                                {displayedVideos.length} {displayedVideos.length === 1 ? 'item' : 'items'}
                                {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
                            </div>
                        </div>
                        {/* Dev-only seed controls */}
                        {process.env.NODE_ENV !== "production" && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5">
                                <Sparkles className="w-3 h-3 text-amber-500/70" />
                                <span className="text-[10px] text-amber-600/70 font-medium">Dev</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={seeding}
                                    className="h-6 text-[11px] px-2 text-amber-700 hover:bg-amber-500/10"
                                    onClick={async () => {
                                        setSeeding(true);
                                        const toastId = toast.loading("Seeding test images…");
                                        try {
                                            const res = await fetch("/api/dev/seed", { method: "POST" });
                                            const data = await res.json();
                                            const seeded = data.results?.filter((r: any) => r.status === "seeded").length ?? 0;
                                            const skipped = data.results?.filter((r: any) => r.status === "skipped").length ?? 0;
                                            toast.success(`Seeded ${seeded} images${skipped ? `, ${skipped} already present` : ""}`, { id: toastId });
                                            fetchLibrary();
                                            if (data.testUrls?.length) {
                                                setUrlText((prev) => {
                                                    const existing = new Set(prev.split("\n").map((u: string) => u.trim()).filter(Boolean));
                                                    const newUrls = data.testUrls.filter((u: string) => !existing.has(u));
                                                    return [...Array.from(existing), ...newUrls].join("\n");
                                                });
                                            }
                                        } catch (err: any) {
                                            toast.error(err.message || "Seed failed", { id: toastId });
                                        } finally {
                                            setSeeding(false);
                                        }
                                    }}
                                >
                                    {seeding ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                    Seed Test Data
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[11px] px-2 text-red-500/70 hover:bg-red-500/10"
                                    onClick={async () => {
                                        const res = await fetch("/api/dev/seed", { method: "DELETE" });
                                        const data = await res.json();
                                        toast.success(`Removed ${data.removed} seed items`);
                                        fetchLibrary();
                                    }}
                                >
                                    Clear Seed
                                </Button>
                            </div>
                        )}
                    </div>

                    {selectionMode && (
                        <div className="flex flex-wrap items-center gap-2 py-2 px-3 rounded-lg bg-primary/5 border border-primary/15">
                            <span className="text-xs text-muted-foreground mr-1">
                                {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Tap items to select"}
                                <span className="hidden sm:inline ml-1 opacity-60">· Hold Shift for range</span>
                            </span>
                            <div className="w-px h-4 bg-border/50" />
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>All</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll}>Clear</Button>
                            {selectedIds.size > 0 && (
                                <>
                                    <div className="w-px h-5 bg-border/50 mx-1" />
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="h-7 text-xs gap-1.5"
                                        onClick={async () => {
                                            if (!confirm(`Delete ${selectedIds.size} selected items? This cannot be undone.`)) return;
                                            const toastId = toast.loading(`Deleting ${selectedIds.size} items...`);
                                            try {
                                                const res = await fetch("/api/library/bulk", {
                                                    method: "DELETE",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ ids: Array.from(selectedIds) }),
                                                });
                                                if (res.ok) {
                                                    const data = await res.json();
                                                    toast.success(`Deleted ${data.deleted} items`, { id: toastId });
                                                    setVideos(prev => prev.filter(v => !selectedIds.has(v.id)));
                                                    deselectAll();
                                                } else {
                                                    toast.error("Bulk delete failed", { id: toastId });
                                                }
                                            } catch { toast.error("Bulk delete error", { id: toastId }); }
                                        }}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.size})
                                    </Button>
                                    <Popover>
                                        <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 text-xs gap-1.5")}>
                                            <Tags className="w-3.5 h-3.5" /> Label ({selectedIds.size})
                                        </PopoverTrigger>
                                        <PopoverContent className="w-52 p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Pick a label…" className="h-8 text-xs" />
                                                <CommandList>
                                                    <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">No labels found.</CommandEmpty>
                                                    <CommandGroup heading="Attach label">
                                                        {globalLabels.map(label => (
                                                            <CommandItem
                                                                key={label.id}
                                                                className="text-xs py-1.5"
                                                                onSelect={async () => {
                                                                    const toastId = toast.loading(`Applying "${label.name}" to ${selectedIds.size} items…`);
                                                                    try {
                                                                        const res = await fetch("/api/library/bulk", {
                                                                            method: "POST",
                                                                            headers: { "Content-Type": "application/json" },
                                                                            body: JSON.stringify({ ids: Array.from(selectedIds), action: "attachLabel", labelId: label.id }),
                                                                        });
                                                                        if (res.ok) {
                                                                            const data = await res.json();
                                                                            toast.success(`Label applied to ${data.updated} items`, { id: toastId });
                                                                            fetchLibrary();
                                                                        } else {
                                                                            toast.error("Bulk label failed", { id: toastId });
                                                                        }
                                                                    } catch { toast.error("Bulk label error", { id: toastId }); }
                                                                }}
                                                            >
                                                                <Tags className="mr-2 h-3 w-3 opacity-50" />
                                                                {label.name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                    <CommandGroup heading="Remove label">
                                                        {globalLabels.map(label => (
                                                            <CommandItem
                                                                key={`rm-${label.id}`}
                                                                className="text-xs py-1.5 text-destructive"
                                                                onSelect={async () => {
                                                                    const toastId = toast.loading(`Removing "${label.name}" from ${selectedIds.size} items…`);
                                                                    try {
                                                                        const res = await fetch("/api/library/bulk", {
                                                                            method: "POST",
                                                                            headers: { "Content-Type": "application/json" },
                                                                            body: JSON.stringify({ ids: Array.from(selectedIds), action: "detachLabel", labelId: label.id }),
                                                                        });
                                                                        if (res.ok) {
                                                                            const data = await res.json();
                                                                            toast.success(`Label removed from ${data.updated} items`, { id: toastId });
                                                                            fetchLibrary();
                                                                        } else {
                                                                            toast.error("Bulk unlabel failed", { id: toastId });
                                                                        }
                                                                    } catch { toast.error("Bulk unlabel error", { id: toastId }); }
                                                                }}
                                                            >
                                                                <X className="mr-2 h-3 w-3" />
                                                                {label.name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs gap-1.5"
                                        onClick={async () => {
                                            const toastId = toast.loading(`Uploading ${selectedIds.size} items to cloud...`);
                                            try {
                                                const res = await fetch("/api/sync/bulk", {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ ids: Array.from(selectedIds) }),
                                                });
                                                const data = await res.json();
                                                if (res.ok) {
                                                    const uploaded = data.uploaded || 0;
                                                    const errCount = data.errors?.length || 0;
                                                    if (errCount > 0) {
                                                        toast.warning(`Uploaded ${uploaded}, failed ${errCount}: ${data.errors[0]?.error}`, { id: toastId, duration: 6000 });
                                                    } else if (uploaded === 0) {
                                                        toast.info("No new items to upload (already synced or missing credentials)", { id: toastId, duration: 5000 });
                                                    } else {
                                                        toast.success(`Uploaded ${uploaded} items to cloud`, { id: toastId });
                                                    }
                                                    fetchLibrary();
                                                    deselectAll();
                                                } else {
                                                    toast.error(`Cloud upload failed: ${data.error || "Unknown error"}${data.details ? ` — ${data.details}` : ""}`, { id: toastId, duration: 6000 });
                                                }
                                            } catch (err: any) { toast.error(`Cloud upload error: ${err.message}`, { id: toastId }); }
                                        }}
                                    >
                                        <Cloud className="w-3.5 h-3.5" /> Cloud Upload
                                    </Button>
                                </>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full md:w-auto">
                            {/* Deep Search Toggle (WID-308) */}
                            <div className="relative flex-1 md:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder={deepSearchMode ? "Deep search — titles, transcripts, labels..." : "Search videos..."}
                                    className={`pl-9 pr-24 bg-background/50 h-9 rounded-lg transition-all ${deepSearchMode ? "border-primary/40 ring-1 ring-primary/20" : ""}`}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                                {deepSearchLoading && (
                                    <Loader2 className="absolute right-[88px] top-2.5 h-4 w-4 text-primary animate-spin" />
                                )}
                                <Button
                                    variant={deepSearchMode ? "default" : "ghost"}
                                    size="sm"
                                    className={`absolute right-1 top-1 h-7 text-[11px] px-2 gap-1 rounded-md ${deepSearchMode
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-primary"
                                        }`}
                                    onClick={() => {
                                        setDeepSearchMode(m => !m);
                                        if (searchQuery) handleDeepSearch(searchQuery);
                                    }}
                                    title={deepSearchMode ? "Deep Search is ON — searching transcripts too" : "Enable Deep Search to search inside video transcripts"}
                                >
                                    <BrainCircuit className="w-3 h-3" />
                                    {deepSearchMode ? "AI" : "AI"}
                                </Button>
                            </div>
                        </div>

                        <Select value={platformFilter} onValueChange={(val) => setPlatformFilter(val || "all")}>
                            <SelectTrigger className="w-[130px] h-9 bg-background/50 rounded-lg">
                                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="Platform">
                                    {(value) => (!value || value === "all" ? "All Platforms" : String(value))}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Platforms</SelectItem>
                                {platforms.map(p => (
                                    <SelectItem key={p} value={p}>{p}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={sortBy} onValueChange={(val) => setSortBy(val as any || "newest")}>
                            <SelectTrigger className="w-[130px] h-9 bg-background/50 rounded-lg">
                                <SelectValue placeholder="Sort By">
                                    {(value) => ({
                                        newest: "Newest First",
                                        oldest: "Oldest First",
                                        "size-desc": "Largest Size",
                                        "size-asc": "Smallest Size",
                                    }[String(value)] ?? "Newest First")}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="newest">Newest First</SelectItem>
                                <SelectItem value="oldest">Oldest First</SelectItem>
                                <SelectItem value="size-desc">Largest Size</SelectItem>
                                <SelectItem value="size-asc">Smallest Size</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Media Type Toggle */}
                        <div className="flex items-center border border-border/50 rounded-lg overflow-hidden bg-background/50">
                            <Button
                                variant={mediaTypeFilter === "all" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-9 rounded-none border-none text-xs px-3"
                                onClick={() => { const next = "all"; setMediaTypeFilter(next); localStorage.setItem("ui_mediaTypeFilter", next); }}
                            >
                                All
                            </Button>
                            <Button
                                variant={mediaTypeFilter === "video" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-9 rounded-none border-none px-3"
                                onClick={() => { const next = "video"; setMediaTypeFilter(next); localStorage.setItem("ui_mediaTypeFilter", next); }}
                                title="Videos only"
                            >
                                <VideoIcon className="w-4 h-4" />
                            </Button>
                            <Button
                                variant={mediaTypeFilter === "image" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-9 rounded-none border-none px-3"
                                onClick={() => { const next = "image"; setMediaTypeFilter(next); localStorage.setItem("ui_mediaTypeFilter", next); }}
                                title="Images only"
                            >
                                <ImageIcon className="w-4 h-4" />
                            </Button>
                            <Button
                                variant={mediaTypeFilter === "audio" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-9 rounded-none border-none px-3"
                                onClick={() => { const next = "audio"; setMediaTypeFilter(next); localStorage.setItem("ui_mediaTypeFilter", next); }}
                                title="Audio only"
                            >
                                <Music className="w-4 h-4" />
                            </Button>
                        </div>

                        <Button
                            variant={groupByDate ? "secondary" : "ghost"}
                            className="h-9 bg-background/50 border border-border/50 rounded-lg text-foreground/80 hover:bg-background/80"
                            onClick={() => { setGroupByDate(!groupByDate); localStorage.setItem("ui_groupByDate", String(!groupByDate)); }}
                        >
                            Group by Date
                        </Button>

                        <div className="w-px h-5 bg-border/40 hidden md:block" />
                        <Button
                            variant={selectionMode ? "secondary" : "outline"}
                            size="sm"
                            className="h-9 text-xs gap-1.5"
                            onClick={() => { setSelectionMode(!selectionMode); if (selectionMode) deselectAll(); }}
                        >
                            <CheckSquare className="w-3.5 h-3.5" />
                            {selectionMode ? "Done" : "Select"}
                        </Button>
                    </div>
                </div>

                {loading || deepSearchLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 min-h-[400px]">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="flex flex-col rounded-xl border border-border/40 bg-card/50 overflow-hidden">
                                <Skeleton className="h-[180px] w-full bg-muted/15" />
                                <div className="p-3 space-y-2">
                                    <Skeleton className="h-4 w-4/5 bg-muted/15" />
                                    <Skeleton className="h-3.5 w-1/2 bg-muted/15" />
                                    <div className="flex gap-1.5 pt-1">
                                        <Skeleton className="h-4 w-12 rounded-full bg-muted/15" />
                                        <Skeleton className="h-4 w-16 rounded-full bg-muted/15" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : videos.length === 0 ? (
                    <div className="min-h-[400px] flex items-center justify-center text-muted-foreground border border-dashed rounded-2xl bg-muted/10">
                        Library is empty — add some links above.
                    </div>
                ) : displayedVideos.length === 0 ? (
                    <div className="min-h-[400px] flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-2xl bg-muted/10 gap-2">
                        <Search className="w-8 h-8 opacity-20" />
                        <div>No matching videos found</div>
                    </div>
                ) : (
                    <>
                        {!groupByDate ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {displayedVideos.map(renderVideoCard)}
                            </div>
                        ) : (
                            <div className="space-y-10">
                                {Object.entries(
                                    displayedVideos.reduce((acc, video) => {
                                        const date = new Date(video.createdAt);
                                        const today = new Date();
                                        const yesterday = new Date(today);
                                        yesterday.setDate(yesterday.getDate() - 1);

                                        let dateBucket = date.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                                        if (date.toDateString() === today.toDateString()) dateBucket = "Today";
                                        else if (date.toDateString() === yesterday.toDateString()) dateBucket = "Yesterday";

                                        if (!acc[dateBucket]) acc[dateBucket] = [];
                                        acc[dateBucket].push(video);
                                        return acc;
                                    }, {} as Record<string, Video[]>)
                                ).map(([dateObj, groupVids]) => (
                                    <div key={dateObj} className="space-y-4">
                                        <h3 className="text-xl font-bold tracking-tight text-foreground/90 border-b border-border/40 pb-2 mb-4 sticky top-0 bg-background/80 backdrop-blur z-20 py-2">
                                            {dateObj}
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                            {groupVids.map(renderVideoCard)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </motion.div>

            {/* Media Player Modal */}
            <Dialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null);
                }}
            >
                <DialogContent showCloseButton className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete video?</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to completely delete{" "}
                            <span className="font-medium text-foreground">&quot;{deleteTarget?.title}&quot;</span>? This
                            will remove the file from your computer. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={() => void performDelete()}>
                            Delete
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {editingImageId && (() => {
                const img = videos.find(v => v.id === editingImageId);
                return img ? (
                    <ImageEditorModal
                        image={img}
                        onClose={() => setEditingImageId(null)}
                        onRefreshLibrary={fetchLibrary}
                    />
                ) : null;
            })()}

            {editingVideoForEditor && (() => {
                const vid = videos.find(v => v.id === editingVideoForEditor);
                return vid ? (
                    <VideoEditorModal
                        video={vid}
                        onClose={() => setEditingVideoForEditor(null)}
                        onRefreshLibrary={fetchLibrary}
                    />
                ) : null;
            })()}

            {editingAudioForEditor && (() => {
                const aud = videos.find(v => v.id === editingAudioForEditor);
                return aud ? (
                    <AudioEditorModal
                        audio={aud}
                        onClose={() => setEditingAudioForEditor(null)}
                        onRefreshLibrary={fetchLibrary}
                    />
                ) : null;
            })()}

            <MediaPlayerModal
                open={playerOpen}
                onOpenChange={setPlayerOpen}
                videos={displayedVideos}
                initialIndex={playerIndex}
                onDelete={openDeleteDialog}
                onCloudUpload={handleCloudUpload}
                onCloudRemove={handleCloudRemove}
                onRefreshLibrary={fetchLibrary}
                onTitleUpdate={async (videoId, newTitle) => {
                    try {
                        const res = await fetch(`/api/library/${videoId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ title: newTitle }),
                        });
                        if (res.ok) {
                            setVideos(prev =>
                                prev.map(v => v.id === videoId ? { ...v, title: newTitle } : v)
                            );
                            toast.success("Title updated");
                        } else {
                            const data = await res.json();
                            toast.error(data.error || "Failed to update title");
                        }
                    } catch {
                        toast.error("Failed to update title");
                    }
                }}
                onTranscribe={(video) => handleTranscribe(video.id)}
            />
        </div>
    );
}
