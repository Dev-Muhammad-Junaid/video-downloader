"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Copy, FolderOpen, Play, Pause, RotateCcw, Cloud, CloudOff, DownloadCloud, Loader2, CheckCircle2, AlertCircle, Video as VideoIcon, Image as ImageIcon, Search, Pencil, Filter, ExternalLink, HelpCircle, XCircle, Maximize2, Mic, BrainCircuit, Sparkles, Ban } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
import { Trash2, Tags, PlusCircle, CheckSquare, Square, Music, X, Scissors } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { MediaPlayerModal } from "@/components/media-player-modal";
import { ImageEditorModal } from "@/components/image-editor/image-editor-modal";
import { VideoEditorModal } from "@/components/video-editor/video-editor-modal";
import { AudioEditorModal } from "@/components/audio-editor/audio-editor-modal";
import { WaveformPlayer } from "@/components/audio-player";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

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
    // WID-308: Search snippet (populated when in deep search mode)
    transcriptSnippet?: string | null;
    matchedIn?: string[];
};

type QueueItem = {
    id: string; // temp id
    originalUrl: string;
    title?: string;
    thumbnail?: string;
    sourcePlatform?: string;
    duration?: number;
    status: 'parsing' | 'pending' | 'queued' | 'downloading' | 'processing' | 'paused' | 'completed' | 'error' | 'cancelled';
    kind?: 'download' | 'export';
    jobId?: string;
    progress?: number;
    errorText?: string;
    mediaType?: string;
    imageUrl?: string;
    formats?: { formatId: string; label: string; ext: string; resolution: string | null; filesize: number | null; note: string }[];
    selectedFormat?: string;
    needsReview?: boolean;
    reviewReason?: string;
    matchedProfileName?: string;
    matchedFormatLabel?: string;
};

type DownloadProfile = {
    id: string;
    name: string;
    sitePattern: string | null;
    maxResolution: string | null;
    preferredFormat: string | null;
    preferredImageFormat: string | null;
    audioFormat?: string | null;
    audioBitrate?: string | null;
    extractAudio?: boolean;
    priority: number;
    isActive: boolean;
    requireManualFormat?: boolean;
    strictResolution?: boolean;
    resolutionMode?: string | null; // "flexible" | "strict" | "minimum"
};

export default function LibraryPage() {
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);

    // Bulk Downloader State
    const [urlText, setUrlText] = useState("");
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [profiles, setProfiles] = useState<DownloadProfile[]>([]);
    const [selectedQueueProfile, setSelectedQueueProfile] = useState<string>("default-auto");
    const [queueFilter, setQueueFilter] = useState<"all" | "active" | "failed">("all");

    // Filter & Sort State
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"newest" | "oldest" | "size-desc" | "size-asc">("newest");
    const [platformFilter, setPlatformFilter] = useState("all");
    // Keep SSR and first client render identical; hydrate localStorage prefs after mount.
    const [groupByDate, setGroupByDate] = useState(true);
    const [mediaTypeFilter, setMediaTypeFilter] = useState<"all" | "video" | "image" | "audio">("all");

    // Renaming state
    const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");

    // Editor state
    const [editingImageId, setEditingImageId] = useState<string | null>(null);
    const [editingVideoForEditor, setEditingVideoForEditor] = useState<string | null>(null);
    const [editingAudioForEditor, setEditingAudioForEditor] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

    // Labels State
    const [globalLabels, setGlobalLabels] = useState<{ id: string; name: string; color: string | null }[]>([]);
    const [newLabelName, setNewLabelName] = useState("");

    // Media Player Modal State
    const [playerOpen, setPlayerOpen] = useState(false);
    const [playerIndex, setPlayerIndex] = useState(0);

    // Deep Search State (WID-308)
    const [deepSearchMode, setDeepSearchMode] = useState(false);
    const [deepSearchResults, setDeepSearchResults] = useState<Video[] | null>(null);
    const [deepSearchLoading, setDeepSearchLoading] = useState(false);
    const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());
    const [transcriptionProvider, setTranscriptionProvider] = useState<"openai" | "groq">("openai");
    const [retryingQueueIds, setRetryingQueueIds] = useState<Set<string>>(new Set());

    // Bulk Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectionMode, setSelectionMode] = useState(false);
    const lastSelectedIndex = React.useRef<number | null>(null);

    // Dev seed state (only meaningful in development)
    const [seeding, setSeeding] = useState(false);

    const pollingRefs = React.useRef<{ [key: string]: NodeJS.Timeout }>({});
    const sseRef = React.useRef<EventSource | null>(null);

    const matchProfileForUrl = useCallback((url: string) => {
        for (const profile of profiles.filter((p) => p.isActive)) {
            if (!profile.sitePattern || profile.sitePattern === "*") continue;
            try {
                const regex = new RegExp(profile.sitePattern.replace(/\*/g, ".*"), "i");
                if (regex.test(url)) return profile;
            } catch {
                if (url.includes(profile.sitePattern)) return profile;
            }
        }
        return profiles.find((p) => p.sitePattern === "*" || p.priority === -1);
    }, [profiles]);

    const pickFormatForProfile = useCallback((item: QueueItem, profile: DownloadProfile) => {
        const formats = item.formats || [];

        // Audio output: an audio-only profile (extractAudio), an audio source, or a legacy
        // audio-format profile. yt-dlp's -x extracts audio from any video.
        const legacyAudio = ["mp3", "m4a", "wav"].includes((profile.preferredFormat || "").toLowerCase());
        if (profile.extractAudio || item.mediaType === "audio" || legacyAudio) {
            if (item.mediaType === "image") {
                return { formatId: undefined, needsReview: true, reviewReason: `"${profile.name}" is audio-only but this link is an image` };
            }
            return { formatId: "audio", needsReview: false, reviewReason: "" };
        }

        // Images don't have "formats" in the traditional sense — a direct URL download works.
        if (item.mediaType === "image") {
            return { formatId: undefined, needsReview: false, reviewReason: "" };
        }

        // Derive effective resolution mode (backward compat: strictResolution bool → "strict")
        const mode = profile.resolutionMode || (profile.strictResolution ? "strict" : "flexible");

        // "best" means: pick the highest-quality available, no ceiling. Always matches.
        const maxResRaw = (profile.maxResolution || "best").toString();
        const isBest = maxResRaw === "best" || maxResRaw === "";
        const maxRes = isBest ? 0 : parseInt(maxResRaw.replace(/[^0-9]/g, ""), 10);
        const preferredExt = (profile.preferredFormat || "mp4").toLowerCase();
        const resOp = mode === "strict" ? "=" : mode === "minimum" ? "≥" : "≤";

        // If no formats were extracted, we can only safely auto-start for the
        // "Best Quality" profile (no ceiling). For resolution-constrained profiles
        // we'd risk silently downloading the wrong quality — force manual review.
        if (formats.length === 0) {
            if (isBest) {
                return { formatId: undefined, needsReview: false, reviewReason: "" };
            }
            return {
                formatId: undefined,
                needsReview: true,
                reviewReason: `Couldn't read available formats for "${profile.name}" — pick one manually`,
            };
        }

        // Resolution predicate. Excludes audio-only formats (resolution = 0/null) from
        // video profiles — they would otherwise silently win the sort as resolution=0
        // passes every numeric comparison.
        const matchesRes = (f: typeof formats[number]) => {
            const resNum = f.resolution ? parseInt(f.resolution.replace(/[^0-9]/g, ""), 10) : 0;
            // Formats with no resolution are audio-only streams; skip them for video profiles.
            if (resNum === 0) return false;
            if (isBest) return true;
            if (!maxRes) return true;
            if (mode === "strict") return resNum === maxRes;
            if (mode === "minimum") return resNum >= maxRes;
            return resNum <= maxRes; // flexible (≤ ceiling)
        };

        // First pass: match by resolution AND preferred ext.
        const exactMatches = formats.filter((f) => {
            const extOk = preferredExt === "best" || !f.ext || f.ext.toLowerCase() === preferredExt;
            return matchesRes(f) && extOk;
        });
        if (exactMatches.length > 0) {
            const sorted = [...exactMatches].sort((a, b) => (parseInt(b.resolution || "0", 10) - parseInt(a.resolution || "0", 10)));
            return { formatId: sorted[0].formatId, needsReview: false, reviewReason: "" };
        }

        // Second pass: match by resolution only (ignore ext preference — server will remux).
        const resOnly = formats.filter(matchesRes);
        if (resOnly.length > 0) {
            const sorted = [...resOnly].sort((a, b) => (parseInt(b.resolution || "0", 10) - parseInt(a.resolution || "0", 10)));
            return { formatId: sorted[0].formatId, needsReview: false, reviewReason: "" };
        }

        // Nothing matches — user must pick manually.
        const videoFormats = formats.filter(f => f.resolution && parseInt(f.resolution.replace(/[^0-9]/g, ""), 10) > 0);
        const maxAvailable = videoFormats.reduce((max, f) => Math.max(max, parseInt(f.resolution?.replace(/[^0-9]/g, "") || "0", 10)), 0);
        const minAvailable = videoFormats.reduce((min, f) => Math.min(min, parseInt(f.resolution?.replace(/[^0-9]/g, "") || "9999", 10)), 9999);
        return {
            formatId: undefined,
            needsReview: true,
            reviewReason: mode === "strict"
                ? `"${profile.name}" needs exactly ${maxResRaw}p but available: ${minAvailable}p–${maxAvailable}p`
                : mode === "minimum"
                    ? `"${profile.name}" wants ≥${maxResRaw}p but best available is ${maxAvailable}p`
                    : `"${profile.name}" wants ≤${maxResRaw}p but lowest available is ${minAvailable}p`,
        };
    }, []);

    const applyQueueProfileToItem = useCallback((item: QueueItem): QueueItem => {
        if (item.status === "downloading" || item.status === "completed" || item.status === "error" || item.status === "cancelled") {
            return item;
        }
        const profile = selectedQueueProfile === "default-auto"
            ? matchProfileForUrl(item.originalUrl)
            : profiles.find((p) => p.id === selectedQueueProfile);
        if (!profile) {
            return { ...item, needsReview: true, reviewReason: "No profile available", matchedProfileName: undefined };
        }
        if (profile.requireManualFormat) {
            return {
                ...item,
                matchedProfileName: profile.name,
                needsReview: !item.selectedFormat,
                reviewReason: !item.selectedFormat ? `"${profile.name}" requires manual format selection` : undefined,
            };
        }
        const picked = pickFormatForProfile(item, profile);
        const effectiveMode = profile.resolutionMode || (profile.strictResolution ? "strict" : "flexible");
        const resOp = effectiveMode === "strict" ? "=" : effectiveMode === "minimum" ? "≥" : "≤";
        const matchedLabel = picked.formatId === "audio"
            ? `Audio (${(profile.audioFormat || (["mp3", "m4a", "wav"].includes((profile.preferredFormat || "").toLowerCase()) ? profile.preferredFormat : "mp3") || "mp3").toUpperCase()})`
            : picked.formatId && item.formats
                ? (item.formats.find(f => f.formatId === picked.formatId)?.label ?? "Auto")
                : profile.maxResolution === "best"
                    ? "Best available"
                    : `${resOp}${profile.maxResolution}p ${(profile.preferredFormat || "mp4").toUpperCase()}`;
        return {
            ...item,
            selectedFormat: picked.formatId ?? item.selectedFormat ?? "",
            needsReview: picked.needsReview,
            reviewReason: picked.reviewReason || undefined,
            matchedProfileName: profile.name,
            matchedFormatLabel: picked.needsReview ? undefined : matchedLabel,
        };
    }, [matchProfileForUrl, pickFormatForProfile, profiles, selectedQueueProfile]);

    useEffect(() => {
        const savedGroupByDate = localStorage.getItem("ui_groupByDate");
        if (savedGroupByDate !== null) {
            setGroupByDate(savedGroupByDate === "true");
        }

        const savedMediaType = localStorage.getItem("ui_mediaTypeFilter");
        if (savedMediaType === "all" || savedMediaType === "video" || savedMediaType === "image" || savedMediaType === "audio") {
            setMediaTypeFilter(savedMediaType);
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            // Fetch watch folder from server settings
            try {
                const watchRes = await fetch("/api/settings/watch");
                if (watchRes.ok) {
                    const { watchFolder } = await watchRes.json();
                    if (watchFolder) {
                        fetch("/api/library/scan", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ folderPath: watchFolder }),
                        }).then(() => fetchLibrary()).catch(console.error);
                    }
                }
            } catch { /* ignore */ }
            fetchLibrary();
            fetchQueue();
            fetchLabels();
            // Resume any interrupted jobs from a previous server session
            fetch("/api/download/queue", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "resumeInterrupted" }),
            }).catch(() => {});
            fetch("/api/profiles")
                .then((r) => r.json())
                .then((data) => {
                    if (Array.isArray(data)) setProfiles(data);
                })
                .catch(() => {});
            fetch("/api/settings/ai")
                .then((r) => r.json())
                .then((data) => {
                    if (data?.provider === "openai" || data?.provider === "groq") {
                        setTranscriptionProvider(data.provider);
                    }
                })
                .catch(() => {});

            // Auto-backfill thumbnails for old videos that don't have one
            fetch("/api/thumbnail/backfill", { method: "POST" })
                .then(r => r.json())
                .then(data => {
                    if (data.generated > 0) {
                        console.log(`Backfilled ${data.generated} thumbnails`);
                        fetchLibrary(); // refresh to show newly generated thumbnails
                    }
                })
                .catch(console.error);
        };
        init();

        // SSE for real-time progress
        setupSSE();

        // Global queue sync for Chrome Extension interactions (less frequent now with SSE)
        const globalPoll = setInterval(fetchQueue, 5000);

        return () => {
            clearInterval(globalPoll);
            Object.values(pollingRefs.current).forEach(clearInterval);
            if (sseRef.current) {
                sseRef.current.close();
                sseRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        setQueue((prev) => prev.map((item) => applyQueueProfileToItem(item)));
    }, [selectedQueueProfile, applyQueueProfileToItem]);

    // Stop any inline card playback when a preview (media player) or editor opens,
    // so audio/video from a card doesn't keep playing behind the modal.
    useEffect(() => {
        if (playerOpen || editingImageId || editingVideoForEditor || editingAudioForEditor) {
            document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((m) => {
                try { m.pause(); } catch { /* ignore */ }
            });
        }
    }, [playerOpen, editingImageId, editingVideoForEditor, editingAudioForEditor]);

    // WID-300: Bookmarklet Auto-Ingestion
    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const urlToParse = searchParams.get('url');
        
        if (urlToParse) {
            const newItem: QueueItem = {
                id: Math.random().toString(36).substring(7),
                originalUrl: urlToParse,
                status: 'parsing'
            };
            
            setQueue(prev => [newItem, ...prev]);
            
            // Wait a tick for queue state to settle, then call parse
            setTimeout(() => {
                parseLink(newItem.id, newItem.originalUrl);
            }, 50);

            // Clean up the URL to prevent double ingestion on refresh
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
            setDeepSearchResults(null);
            return;
        }
        const timeout = setTimeout(() => handleDeepSearch(searchQuery), 350);
        return () => clearTimeout(timeout);
    }, [searchQuery, deepSearchMode, handleDeepSearch]);

    // WID-307: Transcribe a single video
    const handleTranscribe = async (videoId: string) => {
        setTranscribingIds(prev => new Set(prev).add(videoId));
        try {
            const res = await fetch(`/api/transcription/${videoId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || "Transcription request failed");
            }
            toast.info("Transcription started — this may take a moment...");
            // Poll until done — tracked in pollingRefs for cleanup
            let pollCount = 0;
            const poll = setInterval(async () => {
                pollCount++;
                if (pollCount > 100) {
                    clearInterval(poll);
                    delete pollingRefs.current[`transcribe-${videoId}`];
                    setTranscribingIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
                    toast.error("Transcription polling timed out");
                    return;
                }
                try {
                    const statusRes = await fetch(`/api/transcription/${videoId}`);
                    const statusData = await statusRes.json();
                    if (statusData.status === "completed") {
                        clearInterval(poll);
                        delete pollingRefs.current[`transcribe-${videoId}`];
                        setTranscribingIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
                        toast.success("Transcription complete! You can now deep search this video.");
                        setVideos(prev => prev.map(v => v.id === videoId ? { ...v, transcriptStatus: "completed", transcriptText: statusData.text } : v));
                    } else if (statusData.status === "error") {
                        clearInterval(poll);
                        delete pollingRefs.current[`transcribe-${videoId}`];
                        setTranscribingIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
                        toast.error("Transcription failed for this video");
                        setVideos(prev => prev.map(v => v.id === videoId ? { ...v, transcriptStatus: "error" } : v));
                    }
                } catch { /* ignore */ }
            }, 3000);
            pollingRefs.current[`transcribe-${videoId}`] = poll;
        } catch (err: any) {
            setTranscribingIds(prev => { const s = new Set(prev); s.delete(videoId); return s; });
            toast.error(err.message);
        }
    };

    const fetchQueue = async () => {
        try {
            const res = await fetch("/api/download/queue");
            if (res.ok) {
                const jobs = await res.json();
                const activeJobs: QueueItem[] = (Array.isArray(jobs) ? jobs : []).map((j: any) => ({
                    id: j.id,
                    jobId: j.id,
                    kind: j.kind === "export" ? "export" : "download",
                    originalUrl: j.url,
                    title: j.title,
                    status: j.status,
                    progress: j.progress,
                    thumbnail: j.thumbnailUrl || j.imageUrl,
                    sourcePlatform: j.sourcePlatform,
                    duration: j.duration,
                    errorText: j.error,
                    mediaType: j.mediaType,
                    imageUrl: j.imageUrl,
                    matchedProfileName: j.profileName,
                    matchedFormatLabel: j.formatLabel,
                }));

                setQueue(prev => {
                    const localOnly = prev.filter(p => !p.jobId && (p.status === 'parsing' || p.status === 'pending'));
                    if (activeJobs.length === 0) return localOnly;
                    const prevById = new Map(prev.filter(p => p.jobId).map(p => [p.jobId as string, p]));
                    const merged = activeJobs.map(job => {
                        const existing = prevById.get(job.jobId as string);
                        if (!existing) return job;
                        return {
                            ...existing,
                            ...job,
                            id: existing.id,
                            thumbnail: existing.thumbnail || job.thumbnail,
                            title: job.title || existing.title,
                            sourcePlatform: existing.sourcePlatform || job.sourcePlatform,
                            duration: existing.duration || job.duration,
                            formats: existing.formats,
                            selectedFormat: existing.selectedFormat,
                            mediaType: existing.mediaType || job.mediaType,
                            imageUrl: existing.imageUrl || job.imageUrl,
                            matchedProfileName: existing.matchedProfileName || job.matchedProfileName,
                            matchedFormatLabel: existing.matchedFormatLabel || job.matchedFormatLabel,
                            progress: (job.status === "downloading" || job.status === "processing" || job.status === "paused")
                                ? Math.max(existing.progress || 0, job.progress || 0)
                                : (job.progress ?? existing.progress),
                            errorText: (job.status === "error" || job.status === "cancelled")
                                ? (job.errorText || existing.errorText)
                                : undefined,
                        } satisfies QueueItem;
                    });
                    return [...localOnly, ...merged];
                });

                activeJobs.forEach(q => {
                    if (q.status !== 'completed' && q.status !== 'error' && q.status !== 'cancelled' && q.jobId) {
                        pollProgress(q.id, q.jobId);
                    }
                });
            }
        } catch (error) {
            console.error("Failed to restore queue", error);
        }
    };

    const fetchLibrary = async () => {
        try {
            const res = await fetch("/api/library");
            if (!res.ok) throw new Error("Failed to fetch library");
            const data = await res.json();
            setVideos(data);
        } catch (error) {
            toast.error("Error loading library");
        } finally {
            setLoading(false);
        }
    };

    const fetchLabels = async () => {
        try {
            const res = await fetch("/api/labels");
            if (res.ok) {
                const data = await res.json();
                setGlobalLabels(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleAddLinks = () => {
        const links = [...new Set(urlText.split('\n').map(l => l.trim()).filter(l => l.length > 0))];
        if (links.length === 0) return;

        // Only block links that are CURRENTLY active in the queue (parsing/pending/downloading/etc).
        // Completed/cancelled queue items AND library items are allowed back in — user may want
        // to re-download with a different format/profile.
        const activeInQueue = new Set(
            queue
                .filter(q => !["completed", "error", "cancelled"].includes(q.status))
                .map(q => q.originalUrl)
        );

        let skippedCount = 0;
        const newItems: QueueItem[] = [];
        for (const url of links) {
            if (activeInQueue.has(url)) {
                skippedCount++;
                continue;
            }
            newItems.push({
                id: Math.random().toString(36).substring(7),
                originalUrl: url,
                status: 'parsing',
            });
        }

        if (skippedCount > 0) {
            toast.info(`Skipped ${skippedCount} link${skippedCount > 1 ? "s" : ""} — already being processed`);
        }
        if (newItems.length === 0) {
            setUrlText("");
            return;
        }

        setQueue(prev => [...newItems, ...prev]);
        setUrlText("");

        newItems.forEach(item => parseLink(item.id, item.originalUrl));
    };

    const parseLink = async (id: string, url: string) => {
        try {
            // 1. Parse Metadata
            const res = await fetch("/api/download/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            });
            const metadata = await res.json();
            if (!res.ok) throw new Error(metadata.error || "Metadata failed");

            // Check if this is a playlist
            if (metadata.isPlaylist && metadata.items?.length > 1) {
                toast.success(`📋 Playlist detected: "${metadata.playlistTitle}" (${metadata.items.length} items)`);

                // Remove the original parsing item
                setQueue(prev => prev.filter(q => q.id !== id));

                // Add individual items
                const playlistItems: QueueItem[] = metadata.items.map((item: any) => ({
                    id: Math.random().toString(36).substring(7),
                    originalUrl: item.url,
                    title: item.title,
                    thumbnail: item.thumbnail,
                    duration: item.duration,
                    status: 'parsing' as const,
                }));

                setQueue(prev => [...playlistItems, ...prev]);

                // Start parsing each item
                for (const item of playlistItems) {
                    parseLink(item.id, item.originalUrl);
                }
                return;
            }

            let autoItem: QueueItem | null = null;
            setQueue(prev => prev.map(q => {
                if (q.id !== id) return q;
                const updated = applyQueueProfileToItem({
                    ...q,
                    title: metadata.title,
                    thumbnail: metadata.thumbnail,
                    sourcePlatform: metadata.sourcePlatform,
                    duration: metadata.duration ?? null,
                    mediaType: metadata.mediaType || "video",
                    imageUrl: metadata.imageUrl,
                    formats: metadata.formats || [],
                    selectedFormat: "",
                    status: 'pending',
                });
                if (!updated.needsReview) {
                    autoItem = updated;
                }
                return updated;
            }));

            // Auto-start download when profile matches cleanly — no manual click required.
            if (autoItem) {
                const ai = autoItem as QueueItem;
                const label = ai.matchedFormatLabel ? ` · ${ai.matchedFormatLabel}` : "";
                toast.success(`Auto-downloading "${ai.title?.slice(0, 40)}${(ai.title?.length || 0) > 40 ? "…" : ""}" with ${ai.matchedProfileName || "default"}${label}`);
                setTimeout(() => startDownloadJobForItem(ai), 0);
            }

        } catch (error: any) {
            setQueue(prev => prev.map(q => q.id === id ? {
                ...q,
                status: 'error',
                errorText: error.message
            } : q));
        }
    };

    const startDownloadJobForItem = async (item: QueueItem) => {
        const id = item.id;
        if (retryingQueueIds.has(id)) return;
        if (item.needsReview && !item.selectedFormat) {
            toast.error(item.reviewReason || "This item needs format review before download");
            return;
        }

        const selectedProfile = selectedQueueProfile === "default-auto" ? undefined : selectedQueueProfile;

        try {
            setRetryingQueueIds((prev) => new Set(prev).add(id));
            setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'pending' as const, errorText: undefined } : q));

            const dlRes = await fetch("/api/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: item.originalUrl,
                    title: item.title,
                    sourcePlatform: item.sourcePlatform,
                    mediaType: item.mediaType || "video",
                    imageUrl: item.imageUrl,
                    thumbnail: item.thumbnail,
                    formatId: item.selectedFormat || undefined,
                    profileId: selectedProfile,
                    retryJobId: item.jobId || undefined,
                    duration: item.duration,
                    profileName: item.matchedProfileName,
                    formatLabel: item.matchedFormatLabel,
                }),
            });

            const dlData = await dlRes.json();
            if (!dlRes.ok) throw new Error(dlData.error || "Download failed");

            setQueue(prev => prev.map(q => q.id === id ? {
                ...q,
                jobId: dlData.jobId,
                status: 'downloading',
                progress: 0
            } : q));

            pollProgress(id, dlData.jobId);
        } catch (error: any) {
            setQueue(prev => prev.map(q => q.id === id ? {
                ...q,
                status: 'error',
                errorText: error.message
            } : q));
        } finally {
            setRetryingQueueIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const startDownloadJob = (id: string) => {
        const item = queue.find(q => q.id === id);
        if (!item) return;
        return startDownloadJobForItem(item);
    };

    // SSE-based progress: single connection streams all active job progress
    const setupSSE = useCallback(() => {
        if (sseRef.current) return;
        const es = new EventSource("/api/download/events");
        sseRef.current = es;
        let prevCompletedSet = new Set<string>();

        es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data._heartbeat || data._connected) return;

                const completedNow = new Set<string>();
                const completedKinds: Record<string, string> = {};
                setQueue(prev => {
                    let changed = false;
                    const next = prev.map(q => {
                        if (!q.jobId || !data[q.jobId]) return q;
                        const live = data[q.jobId];
                        if (live.status === q.status && Math.abs((live.progress || 0) - (q.progress || 0)) < 0.5) return q;
                        changed = true;
                        const updated = { ...q };
                        updated.status = live.status;
                        updated.progress = live.progress ?? q.progress;
                        if (live.status === "error" || live.status === "cancelled") {
                            updated.errorText = live.error || q.errorText;
                        } else {
                            updated.errorText = undefined;
                        }
                        if (live.status === "completed") {
                            completedNow.add(q.jobId!);
                            completedKinds[q.jobId!] = q.kind || "download";
                        }
                        return updated;
                    });
                    return changed ? next : prev;
                });

                // Check for newly completed jobs (downloads and exports)
                for (const jobId of completedNow) {
                    if (!prevCompletedSet.has(jobId)) {
                        toast.success(completedKinds[jobId] === "export" ? "Export complete!" : "Download complete!");
                        fetchLibrary();
                    }
                }
                prevCompletedSet = completedNow;
            } catch { /* ignore parse errors */ }
        };

        es.onerror = () => {
            es.close();
            sseRef.current = null;
            // Reconnect after 3s
            setTimeout(() => setupSSE(), 3000);
        };
    }, []);

    // Legacy per-job polling as fallback for when SSE is not yet connected
    const pollProgress = (itemId: string, jobId: string) => {
        if (pollingRefs.current[jobId]) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/download/${jobId}`);
                const data = await res.json();

                if (data.status === "completed") {
                    clearInterval(interval);
                    delete pollingRefs.current[jobId];
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
                        status: 'completed',
                        progress: 100
                    } : q));
                    toast.success("Download complete!");
                    fetchLibrary();
                } else if (data.status === "error") {
                    clearInterval(interval);
                    delete pollingRefs.current[jobId];
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
                        status: 'error',
                        errorText: data.error || "Download failed"
                    } : q));
                } else if (data.status === "paused") {
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
                        status: 'paused',
                        progress: data.progress || q.progress || 0,
                    } : q));
                } else if (data.status === "cancelled") {
                    clearInterval(interval);
                    delete pollingRefs.current[jobId];
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
                        status: 'cancelled',
                        errorText: data.error || "Cancelled by user",
                    } : q));
                } else {
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
                        status: (data.status || q.status),
                        progress: data.progress || 0
                    } : q));
                }
            } catch {
                // ignore network glitches
            }
        }, 1000);
        pollingRefs.current[jobId] = interval;
    };

    const handleOpenFolder = async (path: string) => {
        try {
            const res = await fetch("/api/library/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "open", targetPath: path }),
            });
            if (res.ok) {
                toast.success("Opened in Explorer");
            } else {
                toast.error("Failed to open folder");
            }
        } catch {
            toast.error("Action error");
        }
    };

    const handleRename = async (videoId: string) => {
        if (!editTitle.trim()) {
            setEditingVideoId(null);
            return;
        }

        const toastId = toast.loading("Renaming video...");
        try {
            const res = await fetch(`/api/library/${videoId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: editTitle }),
            });

            if (res.ok) {
                toast.success("Renamed successfully", { id: toastId });
                setVideos(prev => prev.map(v => v.id === videoId ? { ...v, title: editTitle } : v));
            } else {
                const data = await res.json();
                toast.error(`Rename failed: ${data.error}`, { id: toastId });
            }
        } catch {
            toast.error("Rename error", { id: toastId });
        } finally {
            setEditingVideoId(null);
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Path copied to clipboard");
        } catch {
            toast.error("Failed to copy path");
        }
    };

    const handleCloudUpload = async (video: Video) => {
        const toastId = toast.loading(`Uploading ${video.title}...`);
        try {
            const res = await fetch("/api/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId: video.id }),
            });

            const result = await res.json();
            if (res.ok && result.success) {
                toast.success(`Uploaded successfully`, { id: toastId });
                // Optimistic update
                setVideos(prev => prev.map(v => v.id === video.id ? { ...v, cloudKey: result.key, cloudUrl: result.cloudUrl, cloudUploadedAt: new Date().toISOString() } : v));
            } else {
                toast.error(`Upload failed: ${result.error}`, { id: toastId });
            }
        } catch {
            toast.error("Upload failed", { id: toastId });
        }
    };

    const handleCloudRemove = async (video: Video) => {
        if (!confirm(`Remove "${video.title}" from cloud storage? The local file will not be affected.`)) return;

        const toastId = toast.loading(`Removing from cloud...`);
        try {
            const res = await fetch("/api/sync", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId: video.id }),
            });

            const result = await res.json();
            if (res.ok && result.success) {
                toast.success(`Removed from cloud`, { id: toastId });
                // Optimistic update
                setVideos(prev => prev.map(v => v.id === video.id ? { ...v, cloudKey: null, cloudUrl: null, cloudUploadedAt: null } : v));
            } else {
                toast.error(`Remove failed: ${result.error}`, { id: toastId });
            }
        } catch {
            toast.error("Remove from cloud failed", { id: toastId });
        }
    };

    const openDeleteDialog = (videoId: string, title: string) => {
        setDeleteTarget({ id: videoId, title });
    };

    const performDelete = async () => {
        if (!deleteTarget) return;
        const { id: videoId } = deleteTarget;
        setDeleteTarget(null);

        const toastId = toast.loading("Deleting video...");
        try {
            const res = await fetch(`/api/library/${videoId}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("Video deleted", { id: toastId });
                setVideos(prev => prev.filter(v => v.id !== videoId));
            } else {
                toast.error("Failed to delete video", { id: toastId });
            }
        } catch {
            toast.error("Deletion error", { id: toastId });
        }
    };

    const providerLabel = transcriptionProvider === "groq" ? "Groq" : "OpenAI";

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(videos.map(v => v.id)));
    }, [videos]);

    const deselectAll = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    const attachLabel = async (videoId: string, labelId: string) => {
        try {
            const res = await fetch(`/api/library/${videoId}/labels`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ labelId })
            });
            if (res.ok) {
                const updatedVid = await res.json();
                setVideos(prev => prev.map(v => v.id === videoId ? { ...v, labels: updatedVid.labels } : v));
            }
        } catch (error) {
            toast.error("Failed to attach label");
        }
    };

    const detachLabel = async (videoId: string, labelId: string) => {
        try {
            const res = await fetch(`/api/library/${videoId}/labels`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ labelId })
            });
            if (res.ok) {
                const updatedVid = await res.json();
                setVideos(prev => prev.map(v => v.id === videoId ? { ...v, labels: updatedVid.labels } : v));
            }
        } catch (error) {
            toast.error("Failed to detach label");
        }
    };

    // Create a label (or reuse an existing one — the API upserts) and attach it to the
    // given item in one step, straight from the label search box.
    const createAndAttachLabel = async (videoId: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
            const res = await fetch("/api/labels", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed, color: "#3b82f6" }),
            });
            if (!res.ok) throw new Error("create failed");
            const newLabel = await res.json();
            setGlobalLabels(prev => prev.some(l => l.id === newLabel.id) ? prev : [...prev, newLabel]);
            setNewLabelName("");
            await attachLabel(videoId, newLabel.id);
            toast.success(`Added "${newLabel.name}"`);
        } catch {
            toast.error("Failed to create label");
        }
    };

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

    const filteredQueue = useMemo(() => {
        if (queueFilter === "all") return queue;
        if (queueFilter === "active") {
            return queue.filter((q) => ["parsing", "pending", "queued", "downloading", "processing", "paused"].includes(q.status));
        }
        return queue.filter((q) => q.status === "error" || q.status === "cancelled" || (q.status === "completed" && !!q.errorText));
    }, [queue, queueFilter]);

    // Get unique platforms for filter
    const platforms = useMemo(() => {
        const set = new Set(videos.map(v => v.sourcePlatform || "Unknown"));
        return Array.from(set).sort();
    }, [videos]);

    const renderVideoCard = (video: Video) => {
        const isSelected = selectedIds.has(video.id);
        const openInPlayer = () => {
            const idx = displayedVideos.findIndex(v => v.id === video.id);
            setPlayerIndex(idx >= 0 ? idx : 0);
            setPlayerOpen(true);
        };
        return (
        <Card
            key={video.id}
            className={cn(
                "flex flex-col group overflow-hidden transition-all duration-200 relative rounded-xl",
                "border-border/40 bg-card/50 backdrop-blur-sm",
                "hover:shadow-xl hover:shadow-primary/5 hover:border-primary/25",
                isSelected && "ring-2 ring-primary border-primary/50 shadow-lg shadow-primary/10",
                selectionMode && "cursor-pointer"
            )}
            onClick={selectionMode ? (e) => toggleSelection(video.id, e) : undefined}
        >
            {/* Media Preview — clean, uniform thumbnail for every media type */}
            <div
                className={cn(
                    "relative overflow-hidden h-[180px]",
                    video.mediaType === "image" ? "bg-muted/40" : video.mediaType === "audio" ? "" : "bg-muted/40"
                )}
            >
                {/* Selection checkbox overlay */}
                {selectionMode && (
                    <div className={cn(
                        "absolute top-2.5 left-2.5 z-20 w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150",
                        isSelected
                            ? "bg-primary text-primary-foreground shadow-md scale-100"
                            : "bg-background/70 backdrop-blur-md border border-border/60 text-muted-foreground hover:bg-background/90 hover:scale-105"
                    )}>
                        {isSelected
                            ? <CheckSquare className="w-4 h-4" />
                            : <Square className="w-4 h-4" />}
                    </div>
                )}

                {/* Expand / Play button — hidden in selection mode */}
                {!selectionMode && (
                    <Button
                        variant="secondary"
                        size="icon"
                        className="absolute top-2.5 right-2.5 z-10 w-8 h-8 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full bg-background/70 backdrop-blur-md border border-border/50 hover:bg-background hover:scale-105"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            openInPlayer();
                        }}
                        title="Open in Media Player"
                    >
                        <Maximize2 className="w-4 h-4 text-foreground/80" />
                    </Button>
                )}

                {/* Duration / size pill — duration is hidden for audio since the player shows it */}
                {(video.duration || video.fileSize) && (
                    <div className="absolute bottom-2 right-2 z-10 flex gap-1.5">
                        {video.mediaType !== "audio" && video.duration && video.duration > 0 && (
                            <span className="text-[10px] font-medium bg-black/70 text-white backdrop-blur-sm px-1.5 py-0.5 rounded-md">
                                {Math.floor(video.duration / 60)}:{String(Math.floor(video.duration % 60)).padStart(2, '0')}
                            </span>
                        )}
                        {video.fileSize && (
                            <span className="text-[10px] font-medium bg-black/70 text-white backdrop-blur-sm px-1.5 py-0.5 rounded-md">
                                {(video.fileSize / (1024 * 1024)).toFixed(1)} MB
                            </span>
                        )}
                    </div>
                )}


                {video.mediaType === "image" ? (
                    <div
                        className={cn("w-full h-full", !selectionMode && "cursor-pointer")}
                        onClick={selectionMode ? undefined : (e) => { e.stopPropagation(); openInPlayer(); }}
                    >
                        <img
                            src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                            alt={video.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            loading="lazy"
                        />
                    </div>
                ) : video.mediaType === "audio" ? (
                    <div className="w-full h-full bg-gradient-to-br from-primary/10 via-muted/30 to-muted/55">
                        {selectionMode ? (
                            <div className="w-full h-full flex items-center justify-center">
                                <Music className="w-10 h-10 text-muted-foreground/30" />
                            </div>
                        ) : (
                            <WaveformPlayer
                                variant="card"
                                src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                                seed={video.id}
                            />
                        )}
                    </div>
                ) : (
                    // Video: a clean poster thumbnail with a play overlay — opens the media player.
                    <div
                        className={cn("w-full h-full relative", !selectionMode && "cursor-pointer")}
                        onClick={selectionMode ? undefined : (e) => { e.stopPropagation(); openInPlayer(); }}
                    >
                        {video.thumbnailPath ? (
                            <img src={`/api/thumbnail/${video.id}`} alt={video.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <VideoIcon className="w-10 h-10 text-muted-foreground/30" />
                            </div>
                        )}
                        {!selectionMode && (
                            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="w-12 h-12 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center text-white transition-all group-hover:bg-black/65 group-hover:scale-105">
                                    <Play className="w-5 h-5 fill-white ml-0.5" />
                                </span>
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Card body */}
            <div className="p-3 flex flex-col gap-2 flex-1">
                <h3 className="text-sm font-medium line-clamp-2 leading-snug" title={video.title}>{video.title}</h3>

                {/* Meta row */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{new Date(video.createdAt).toLocaleDateString()}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span className="truncate">{video.sourcePlatform || "Unknown"}</span>
                    {video.originalUrl && (
                        <a href={video.originalUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-primary hover:text-primary/80 transition-colors flex-shrink-0" title="Open source link" onClick={(e) => e.stopPropagation()}>
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    )}
                </div>

                {/* Labels */}
                {((video.labels && video.labels.length > 0) || !selectionMode) && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                        {video.labels?.map(label => (
                            <Badge key={label.id} variant="secondary" className="text-[10px] px-1.5 py-0 hover:bg-destructive/10 hover:text-destructive cursor-pointer hover:line-through transition-all" onClick={(e) => { e.stopPropagation(); detachLabel(video.id, label.id); }} title="Click to remove">
                                {label.name}
                            </Badge>
                        ))}

                        {!selectionMode && (
                            <Popover onOpenChange={(open) => { if (open) setNewLabelName(""); }}>
                                <PopoverTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-[18px] text-[10px] px-1.5 py-0 text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded-full")} onClick={(e) => e.stopPropagation()}>
                                    <PlusCircle className="w-3 h-3 mr-1" /> Label
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-0" align="start" onClick={(e) => e.stopPropagation()}>
                                    {/* Single search box — type to filter existing labels, or create a new
                                        one inline when there's no exact match. */}
                                    <Command shouldFilter={false}>
                                        <CommandInput
                                            placeholder="Search or create label…"
                                            value={newLabelName}
                                            onValueChange={setNewLabelName}
                                            className="h-9 text-xs"
                                            onKeyDown={(e) => {
                                                // Enter creates the typed label when it doesn't already exist.
                                                const q = newLabelName.trim();
                                                if (e.key === "Enter" && q && !globalLabels.some(l => l.name.toLowerCase() === q.toLowerCase())) {
                                                    e.preventDefault();
                                                    createAndAttachLabel(video.id, q);
                                                }
                                            }}
                                        />
                                        <CommandList>
                                            {(() => {
                                                const q = newLabelName.trim().toLowerCase();
                                                const available = globalLabels.filter(gl => !(video.labels || []).find(vl => vl.id === gl.id));
                                                const matches = q ? available.filter(gl => gl.name.toLowerCase().includes(q)) : available;
                                                const exactExists = !!q && globalLabels.some(gl => gl.name.toLowerCase() === q);
                                                return (
                                                    <>
                                                        {matches.length > 0 && (
                                                            <CommandGroup>
                                                                {matches.map(label => (
                                                                    <CommandItem
                                                                        key={label.id}
                                                                        value={label.id}
                                                                        onSelect={() => { attachLabel(video.id, label.id); setNewLabelName(""); }}
                                                                        className="text-xs py-1.5"
                                                                    >
                                                                        <Tags className="mr-2 h-3 w-3 opacity-50" />
                                                                        {label.name}
                                                                    </CommandItem>
                                                                ))}
                                                            </CommandGroup>
                                                        )}
                                                        {q && !exactExists && (
                                                            <CommandGroup>
                                                                <CommandItem
                                                                    value="__create__"
                                                                    onSelect={() => createAndAttachLabel(video.id, newLabelName)}
                                                                    className="text-xs py-1.5 text-primary"
                                                                >
                                                                    <PlusCircle className="mr-2 h-3 w-3" />
                                                                    Create &ldquo;{newLabelName.trim()}&rdquo;
                                                                </CommandItem>
                                                            </CommandGroup>
                                                        )}
                                                        {matches.length === 0 && !q && (
                                                            <div className="py-3 px-2 text-center text-xs text-muted-foreground">Type to search or create a label.</div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                )}

                {/* Transcript snippet in deep search mode */}
                {video.transcriptSnippet && (
                    <div className="px-2 py-1.5 bg-primary/5 border border-primary/15 rounded-lg text-[10px] text-muted-foreground leading-relaxed">
                        <span className="font-semibold text-primary text-[9px] uppercase tracking-wider mr-1">Transcript match:</span>
                        {video.transcriptSnippet}
                    </div>
                )}
            </div>

            {/* Actions footer — hidden during selection mode to prevent accidental clicks */}
            {!selectionMode && (
            <div className="px-3 pb-3 pt-0 flex items-center justify-between mt-auto">
                <div className="flex items-center gap-1">
                    {video.cloudKey ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-emerald-500 bg-emerald-500/10 hover:bg-destructive/10 hover:text-destructive" onClick={() => handleCloudRemove(video)} title="Synced · Click to remove from cloud">
                            <Cloud className="h-3.5 w-3.5" />
                        </Button>
                    ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background" onClick={() => handleCloudUpload(video)} title="Upload to Cloud">
                            <Cloud className="h-3.5 w-3.5" />
                        </Button>
                    )}
                    {video.mediaType !== "image" && (
                        <>
                            {video.transcriptStatus === "completed" ? (
                                <Tooltip>
                                    <TooltipTrigger>
                                        <span className="inline-flex items-center justify-center text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-full w-5 h-5 cursor-default">
                                            <Mic className="w-2.5 h-2.5" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>Transcribed — available for deep search</TooltipContent>
                                </Tooltip>
                            ) : video.transcriptStatus === "processing" || transcribingIds.has(video.id) ? (
                                <Tooltip>
                                    <TooltipTrigger>
                                        <span className="inline-flex items-center justify-center text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full w-5 h-5 cursor-default">
                                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>Transcribing…</TooltipContent>
                                </Tooltip>
                            ) : video.transcriptStatus === "error" ? (
                                <Tooltip>
                                    <TooltipTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 rounded-md text-destructive hover:bg-destructive/10")} onClick={() => handleTranscribe(video.id)}>
                                        <AlertCircle className="w-3.5 h-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent>Retry transcription</TooltipContent>
                                </Tooltip>
                            ) : (
                                <Tooltip>
                                    <TooltipTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10")} onClick={() => handleTranscribe(video.id)}>
                                        <Mic className="w-3.5 h-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent>{`Generate AI transcript (${providerLabel})`}</TooltipContent>
                                </Tooltip>
                            )}
                        </>
                    )}
                </div>

                <div className="flex gap-0.5 flex-shrink-0 bg-muted/40 rounded-lg p-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background" onClick={() => copyToClipboard(video.localPath)} title="Copy Path">
                        <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background" onClick={() => handleOpenFolder(video.localPath)} title="View in Explorer">
                        <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                    {video.mediaType === "image" ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-primary/10 hover:text-primary" onClick={() => setEditingImageId(video.id)} title="Edit Image">
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                    ) : video.mediaType === "audio" ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-primary/10 hover:text-primary" onClick={() => setEditingAudioForEditor(video.id)} title="Edit Audio">
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                    ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-primary/10 hover:text-primary" onClick={() => setEditingVideoForEditor(video.id)} title="Edit Video">
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-destructive/20 hover:text-destructive" onClick={() => openDeleteDialog(video.id, video.title)} title="Delete Video">
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            )}
        </Card>
        );
    };

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
                            filteredQueue.map(item => {
                                const matchedVideo = item.status === 'completed'
                                    ? videos.find(v => (v.originalUrl && v.originalUrl === item.originalUrl))
                                    : null;
                                const isClickable = !!matchedVideo;
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
                                const iconBtn = cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-7 w-7 flex-shrink-0");
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
                                        "relative flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-md shadow-sm transition-all hover:bg-card/80",
                                        isClickable && "cursor-pointer hover:border-primary/40 hover:shadow-md"
                                    )}
                                >
                                    {item.thumbnail ? (
                                        <div className="w-16 h-12 sm:w-20 sm:h-14 rounded-md overflow-hidden flex-shrink-0 relative bg-muted shadow-inner group">
                                            <img src={item.thumbnail} className="object-cover w-full h-full" alt="thumb" />
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
                                        <p className={cn("text-sm font-semibold truncate text-foreground/90", isClickable && "group-hover:text-primary")}>
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
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-sky-500/40 text-sky-600 dark:text-sky-400 gap-1">
                                                    <Scissors className="w-2.5 h-2.5 flex-shrink-0" /> Export
                                                </Badge>
                                            )}
                                            {item.matchedProfileName && !item.needsReview && (
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary/80 gap-1 max-w-full truncate">
                                                    <Sparkles className="w-2.5 h-2.5 flex-shrink-0" />
                                                    <span className="truncate">
                                                        {item.matchedProfileName}
                                                        {item.matchedFormatLabel && <span className="opacity-70"> · {item.matchedFormatLabel}</span>}
                                                    </span>
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
                                                        <TooltipTrigger className="flex-shrink-0 text-amber-500 hover:text-amber-400 cursor-help">
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
                                                    <SelectTrigger size="sm" className="flex-1 min-w-0 text-[11px]">
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
                                            {(item.status === 'error' || item.status === 'cancelled') && (
                                                <Tooltip>
                                                    <TooltipTrigger
                                                        className={cn(iconBtnOutline, retryingQueueIds.has(item.id) && "opacity-50 pointer-events-none")}
                                                        onClick={() => startDownloadJob(item.id)}
                                                    >
                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>{retryingQueueIds.has(item.id) ? "Retrying…" : "Retry"}</TooltipContent>
                                                </Tooltip>
                                            )}
                                    </div>
                                </div>
                                );
                            })
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
