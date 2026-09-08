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
import { Trash2, Tags, Music, X } from "lucide-react";
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
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ToolbarActions } from "@/components/app-toolbar";
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
    // Selection is no longer a mode you enter — it's just whether anything is
    // selected. ⌘-click / shift-click / the card's checkbox start it, Escape
    // ends it. Nothing to toggle, so there's no Select button.
    //
    // It's split into "items picked individually" plus "the current shift
    // sweep", and the visible selection is the union of the two. Storing one
    // flat set instead meant a re-sweep had to retract exactly the ids the
    // previous sweep added, and any drift in that bookkeeping showed up as a
    // range that could grow but never shrink.
    const [baseIds, setBaseIds] = useState<Set<string>>(new Set());
    const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
    const [shiftTargetIndex, setShiftTargetIndex] = useState<number | null>(null);

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
        attachLabel, detachLabel, createAndAttachLabel, deleteLabel,
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
        // Bookmarklet / browser-extension handoff: opens "/?url=<link>". Queue
        // it once on mount, then strip the param so a refresh doesn't re-add it.
        /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
        const incomingUrl = new URLSearchParams(window.location.search).get("url");
        if (incomingUrl) {
            handleAddLinks(incomingUrl);
            window.history.replaceState({}, "", window.location.pathname);
        }
        /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
    }, []);

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

    // Date buckets, in render order. Extracted so range selection and the grid
    // agree on what "the next item" means: with Group by Date on and a size
    // sort active, same-day items aren't contiguous in displayedVideos, so a
    // shift-sweep computed over that array selected items other than the ones
    // between the two the user clicked.
    const dateGroups = useMemo(() => {
        const acc = new Map<string, Video[]>();
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        for (const video of displayedVideos) {
            const date = new Date(video.createdAt);
            let bucket = date.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
            if (date.toDateString() === today.toDateString()) bucket = "Today";
            else if (date.toDateString() === yesterday.toDateString()) bucket = "Yesterday";

            const existing = acc.get(bucket);
            if (existing) existing.push(video);
            else acc.set(bucket, [video]);
        }
        return Array.from(acc.entries());
    }, [displayedVideos]);

    /** The order items actually appear on screen — what a range should follow. */
    const orderedVideos = useMemo(
        () => (groupByDate ? dateGroups.flatMap(([, vids]) => vids) : displayedVideos),
        [groupByDate, dateGroups, displayedVideos]
    );

    // Ids covered by the live shift sweep, recomputed from the anchor and the
    // current target rather than remembered.
    const shiftRangeIds = useMemo(() => {
        if (anchorIndex === null || shiftTargetIndex === null) return [];
        const start = Math.min(anchorIndex, shiftTargetIndex);
        const end = Math.max(anchorIndex, shiftTargetIndex);
        return orderedVideos.slice(start, end + 1).map(v => v.id);
    }, [anchorIndex, shiftTargetIndex, orderedVideos]);

    const selectedIds = useMemo(
        () => new Set<string>([...baseIds, ...shiftRangeIds]),
        [baseIds, shiftRangeIds]
    );

    const toggleSelection = useCallback((videoId: string, e?: React.MouseEvent) => {
        const currentIndex = orderedVideos.findIndex(v => v.id === videoId);

        // Shift sweeps from the anchor. Re-sweeping just moves the target, so
        // the range contracts as readily as it grows, and anything picked out
        // individually beforehand survives because it lives in baseIds.
        if (e?.shiftKey && anchorIndex !== null && currentIndex !== -1) {
            setShiftTargetIndex(currentIndex);
            return;
        }

        // A discrete pick ends the sweep: fold whatever it covered into the
        // base, then toggle this item and make it the new anchor.
        setBaseIds(prev => {
            const next = new Set([...prev, ...shiftRangeIds]);
            if (next.has(videoId)) next.delete(videoId);
            else next.add(videoId);
            return next;
        });
        setShiftTargetIndex(null);
        if (currentIndex !== -1) setAnchorIndex(currentIndex);
    }, [orderedVideos, anchorIndex, shiftRangeIds]);

    // ⌘A / Esc, the two shortcuts people already expect from Finder. Ignored
    // while typing so ⌘A still means "select this text" in the search box.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const el = document.activeElement;
            const typing = el instanceof HTMLElement &&
                (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !typing) {
                e.preventDefault();
                setBaseIds(new Set(displayedVideos.map(v => v.id)));
                setAnchorIndex(null);
                setShiftTargetIndex(null);
                return;
            }
            if (e.key === "Escape" && !typing) {
                setBaseIds(new Set());
                setAnchorIndex(null);
                setShiftTargetIndex(null);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [displayedVideos]);

    // Select All means what's actually on screen — selecting filtered-out items
    // you can't see would make the count lie.
    const selectAll = useCallback(() => {
        setBaseIds(new Set(displayedVideos.map(v => v.id)));
        setAnchorIndex(null);
        setShiftTargetIndex(null);
    }, [displayedVideos]);

    const deselectAll = useCallback(() => {
        setBaseIds(new Set());
        setAnchorIndex(null);
        setShiftTargetIndex(null);
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
            deleteLabel={deleteLabel}
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
        <div className="mx-auto w-full max-w-[1600px] space-y-7 px-6 py-5">
            {/* Only surfaces once a selection exists — there's no mode to enter. */}
            {selectedIds.size > 0 && (
                <ToolbarActions>
                    <span className="tabular text-[12px] text-muted-foreground">
                        {selectedIds.size} selected
                    </span>
                    <Button variant="outline" size="sm" onClick={deselectAll}>Done</Button>
                </ToolbarActions>
            )}


            {/* Top Section: Dashboard Split View */}
            <div className="flex flex-col items-start gap-5 lg:flex-row">

                {/* Left Panel: Bulk Input */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring" as const, damping: 22, stiffness: 180, delay: 0.05 }}
                    className="w-full lg:w-[34%] lg:min-w-[300px]"
                >
                <Card className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50 pointer-events-none" />
                    <CardHeader className="relative">
                        <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
                            <DownloadCloud className="size-[17px] text-primary" />
                            Studio Downloader
                            <Tooltip>
                                <TooltipTrigger className="ml-1 cursor-help">
                                    <HelpCircle className="size-[13px] text-muted-foreground/60 transition-colors hover:text-muted-foreground" />
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
                        <CardDescription>
                            Paste links, one per line.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 relative">
                        <Textarea
                            className="min-h-[150px] resize-none rounded-md font-mono text-[12px] leading-relaxed"
                            placeholder="https://x.com/…&#10;https://youtube.com/watch?v=…"
                            value={urlText}
                            onChange={e => setUrlText(e.target.value)}
                        />
                        <Button size="lg" className="w-full" onClick={() => handleAddLinks()} disabled={!urlText.trim()}>
                            Add to Queue
                        </Button>
                    </CardContent>
                </Card>
                </motion.div>

                {/* Right Panel: Active Queue */}
                <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <h2 className="text-[15px] font-semibold">Active Queue</h2>
                            {queue.length > 0 && <span className="tabular rounded-full bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">{queue.length}</span>}
                            {profiles.length > 0 && (
                                <Select value={selectedQueueProfile} onValueChange={(v) => setSelectedQueueProfile(v || "default-auto")}>
                                    <SelectTrigger size="sm" className="ml-1 w-auto min-w-[150px] max-w-[220px]">
                                        <SelectValue>
                                            {(value) => {
                                                if (!value || value === "default-auto") return "Automatic";
                                                const p = profiles.find((pr) => pr.id === value);
                                                return p ? p.name : "Automatic";
                                            }}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {/* "Automatic" = pick the matching profile per link by its site
                                            pattern; otherwise force every link to use one chosen profile. */}
                                        <SelectItem value="default-auto" className="text-xs">Automatic (match each link)</SelectItem>
                                        {profiles.map((profile) => (
                                            <SelectItem key={profile.id} value={profile.id} className="text-xs">
                                                {profile.name}
                                            </SelectItem>
                                        ))}
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
                    <SegmentedControl
                        value={queueFilter}
                        onValueChange={(v) => setQueueFilter(v as typeof queueFilter)}
                        options={[
                            { value: "all", label: "All" },
                            { value: "active", label: "Active" },
                            { value: "failed", label: "Failed" },
                        ]}
                    />

                    <div className="flex-1 min-h-[220px] max-h-[300px] overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                        {filteredQueue.length === 0 ? (
                            <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2.5 rounded-[10px] border border-border bg-card/60 text-muted-foreground">
                                <DownloadCloud className="size-7 opacity-25" strokeWidth={1.5} />
                                <span className="text-[12px]">No queue items for this filter</span>
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
                            <h2 className="text-[15px] font-semibold">Saved Media</h2>
                            <div className="tabular mt-0.5 text-[12px] text-muted-foreground">
                                {displayedVideos.length} {displayedVideos.length === 1 ? 'item' : 'items'}
                                {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
                            </div>
                        </div>
                        {/* Dev-only seed controls */}
                        {process.env.NODE_ENV !== "production" && (
                            <div className="flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-1">
                                <Sparkles className="size-3 text-muted-foreground/60" />
                                <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground/70">Dev</span>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    disabled={seeding}
                                    className="text-muted-foreground hover:text-foreground"
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
                                    {seeding ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                                    Seed Test Data
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    className="text-muted-foreground hover:text-destructive"
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

                    {/* Appears with the first selected item and leaves with the last. */}
                    {selectedIds.size > 0 && (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/6 px-3 py-2">
                            <span className="tabular mr-1 text-[12px] font-medium">
                                {selectedIds.size} selected
                                <span className="ml-1.5 hidden font-normal text-muted-foreground sm:inline">
                                    · ⇧-click for a range · ⌘A all · esc to clear
                                </span>
                            </span>
                            <div className="h-4 w-px bg-border" />
                            <Button variant="ghost" size="xs" onClick={selectAll}>Select All</Button>
                            <Button variant="ghost" size="xs" onClick={deselectAll}>Clear</Button>
                            {selectedIds.size > 0 && (
                                <>
                                    <div className="mx-1 h-5 w-px bg-border" />
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
                                                        {globalLabels.filter(label => videos.some(v => selectedIds.has(v.id) && (v.labels || []).some(l => l.id === label.id))).map(label => (
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

                    <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                        {/* Search field: AppKit's rounded search control, with the
                            Deep Search toggle living inside it as a trailing accessory. */}
                        <div className="relative w-full md:w-72">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[13px] -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder={deepSearchMode ? "Search titles, transcripts, labels…" : "Search"}
                                className={cn(
                                    "h-7 rounded-[13px] pl-[26px] pr-[52px]",
                                    deepSearchMode && "border-primary/50 ring-[3px] ring-primary/15"
                                )}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {deepSearchLoading && (
                                <Loader2 className="absolute right-[56px] top-1/2 size-3.5 -translate-y-1/2 animate-spin text-primary" />
                            )}
                            <Button
                                variant={deepSearchMode ? "default" : "ghost"}
                                size="xs"
                                className="absolute right-[3px] top-1/2 -translate-y-1/2 gap-1 rounded-[11px] px-1.5"
                                onClick={() => {
                                    setDeepSearchMode(m => !m);
                                    if (searchQuery) handleDeepSearch(searchQuery);
                                }}
                                title={deepSearchMode ? "Deep Search is on — transcripts are searched too" : "Enable Deep Search to search inside video transcripts"}
                            >
                                <BrainCircuit />
                                AI
                            </Button>
                        </div>

                        {/* Widened from 130px: "All Platforms" and "Newest First"
                            were both being truncated mid-word at that size. */}
                        <Select value={platformFilter} onValueChange={(val) => setPlatformFilter(val || "all")}>
                            <SelectTrigger className="w-[152px]">
                                <Filter className="mr-1.5 size-[13px] shrink-0 text-muted-foreground" />
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
                            <SelectTrigger className="w-[142px]">
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

                        <SegmentedControl
                            value={mediaTypeFilter}
                            onValueChange={(next) => {
                                setMediaTypeFilter(next as typeof mediaTypeFilter);
                                localStorage.setItem("ui_mediaTypeFilter", next);
                            }}
                            options={[
                                { value: "all", label: "All" },
                                { value: "video", label: <VideoIcon />, title: "Videos only" },
                                { value: "image", label: <ImageIcon />, title: "Images only" },
                                { value: "audio", label: <Music />, title: "Audio only" },
                            ]}
                        />

                        <Button
                            variant={groupByDate ? "secondary" : "outline"}
                            onClick={() => { setGroupByDate(!groupByDate); localStorage.setItem("ui_groupByDate", String(!groupByDate)); }}
                        >
                            Group by Date
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
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-2.5 rounded-[10px] border border-border bg-card/50 text-muted-foreground">
                        <DownloadCloud className="size-8 opacity-20" strokeWidth={1.5} />
                        <p className="text-[13px]">Library is empty — add some links above.</p>
                    </div>
                ) : displayedVideos.length === 0 ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-2.5 rounded-[10px] border border-border bg-card/50 text-muted-foreground">
                        <Search className="size-8 opacity-20" strokeWidth={1.5} />
                        <p className="text-[13px]">No matching videos found</p>
                    </div>
                ) : (
                    <>
                        {!groupByDate ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {displayedVideos.map(renderVideoCard)}
                            </div>
                        ) : (
                            <div className="space-y-10">
                                {dateGroups.map(([dateObj, groupVids]) => (
                                    <div key={dateObj} className="space-y-4">
                                        <h3 className="sticky top-0 z-20 mb-4 border-b border-border/40 bg-background/80 py-2 pb-2 text-[15px] font-semibold backdrop-blur">
                                            {dateObj}
                                        </h3>
                                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                onEdit={(video) => {
                    // Close the player first so only one full-screen overlay is
                    // mounted (no nested scroll-lock); closing the editor then
                    // returns straight to the library.
                    setPlayerOpen(false);
                    if (video.mediaType === "image") setEditingImageId(video.id);
                    else if (video.mediaType === "audio") setEditingAudioForEditor(video.id);
                    else setEditingVideoForEditor(video.id);
                }}
            />
        </div>
    );
}
