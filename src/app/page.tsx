"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Copy, FolderOpen, Play, Cloud, CloudOff, DownloadCloud, Loader2, CheckCircle2, AlertCircle, Video as VideoIcon, Image as ImageIcon, Search, Pencil, Filter, ExternalLink, HelpCircle, XCircle, Maximize2, Mic, BrainCircuit, Sparkles } from "lucide-react";
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
import { Trash2, Tags, PlusCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { MediaPlayerModal } from "@/components/media-player-modal";
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
    status: 'parsing' | 'pending' | 'downloading' | 'completed' | 'error';
    jobId?: string;
    progress?: number;
    errorText?: string;
    mediaType?: string;
    imageUrl?: string;
    formats?: { formatId: string; label: string; ext: string; resolution: string | null; filesize: number | null; note: string }[];
    selectedFormat?: string;
};

export default function LibraryPage() {
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);

    // Bulk Downloader State
    const [urlText, setUrlText] = useState("");
    const [queue, setQueue] = useState<QueueItem[]>([]);

    // Filter & Sort State
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"newest" | "oldest" | "size-desc" | "size-asc">("newest");
    const [platformFilter, setPlatformFilter] = useState("all");
    // Keep SSR and first client render identical; hydrate localStorage prefs after mount.
    const [groupByDate, setGroupByDate] = useState(true);
    const [mediaTypeFilter, setMediaTypeFilter] = useState<"all" | "video" | "image">("all");

    // Renaming state
    const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");

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

    const pollingRefs = React.useRef<{ [key: string]: NodeJS.Timeout }>({});

    useEffect(() => {
        const savedGroupByDate = localStorage.getItem("ui_groupByDate");
        if (savedGroupByDate !== null) {
            setGroupByDate(savedGroupByDate === "true");
        }

        const savedMediaType = localStorage.getItem("ui_mediaTypeFilter");
        if (savedMediaType === "all" || savedMediaType === "video" || savedMediaType === "image") {
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

        // WID-300: Global Queue Sync for Chrome Extension interactions
        const globalPoll = setInterval(fetchQueue, 5000);

        return () => {
            clearInterval(globalPoll);
            // Cleanup active polling on unmount
            Object.values(pollingRefs.current).forEach(clearInterval);
        };
    }, []);

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
                if (jobs && jobs.length > 0) {
                    const activeJobs: QueueItem[] = jobs.map((j: any) => ({
                        id: j.id,
                        jobId: j.id,
                        originalUrl: j.url,
                        title: j.title,
                        status: j.status === 'processing' ? 'downloading' : j.status,
                        progress: j.progress,
                        errorText: j.error,
                    }));

                    setQueue(prev => {
                        const localOnly = prev.filter(p => !p.jobId && (p.status === 'parsing' || p.status === 'pending'));
                        const activeUrls = new Set(activeJobs.map((j: any) => j.originalUrl));
                        const uniqueLocal = localOnly.filter(p => !activeUrls.has(p.originalUrl));
                        return [...uniqueLocal, ...activeJobs];
                    });

                    activeJobs.forEach(q => {
                        if (q.status !== 'completed' && q.status !== 'error' && q.jobId) {
                            pollProgress(q.id, q.jobId);
                        }
                    });
                }
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

        const newItems: QueueItem[] = links.map(url => ({
            id: Math.random().toString(36).substring(7),
            originalUrl: url,
            status: 'parsing'
        }));

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

            setQueue(prev => prev.map(q => q.id === id ? {
                ...q,
                title: metadata.title,
                thumbnail: metadata.thumbnail,
                sourcePlatform: metadata.sourcePlatform,
                duration: metadata.duration ?? null,
                mediaType: metadata.mediaType || "video",
                imageUrl: metadata.imageUrl,
                formats: metadata.formats || [],
                selectedFormat: "",
                status: 'pending'
            } : q));

        } catch (error: any) {
            setQueue(prev => prev.map(q => q.id === id ? {
                ...q,
                status: 'error',
                errorText: error.message
            } : q));
        }
    };

    const startDownloadJob = async (id: string) => {
        const item = queue.find(q => q.id === id);
        if (!item) return;

        try {
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
                    formatId: item.selectedFormat || undefined,
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
        }
    };

    const pollProgress = (itemId: string, jobId: string) => {
        if (pollingRefs.current[jobId]) return; // Already polling

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
                    fetchLibrary(); // refresh library to show new video
                } else if (data.status === "error") {
                    clearInterval(interval);
                    delete pollingRefs.current[jobId];
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
                        status: 'error',
                        errorText: data.error || "Download failed"
                    } : q));
                } else {
                    setQueue(prev => prev.map(q => q.id === itemId ? {
                        ...q,
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

    const createLabel = async () => {
        if (!newLabelName.trim()) return;
        try {
            const res = await fetch("/api/labels", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newLabelName, color: "bg-blue-500" }) // Default color for now
            });
            if (res.ok) {
                const newLabel = await res.json();
                setGlobalLabels(prev => [...prev, newLabel]);
                setNewLabelName("");
                toast.success("Label created");
            }
        } catch (e) {
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

    // Get unique platforms for filter
    const platforms = useMemo(() => {
        const set = new Set(videos.map(v => v.sourcePlatform || "Unknown"));
        return Array.from(set).sort();
    }, [videos]);

    const renderVideoCard = (video: Video) => (
        <Card key={video.id} className="flex flex-col group overflow-hidden border-border/40 hover:border-primary/30 transition-all hover:shadow-lg bg-card/50 backdrop-blur-sm">
            <CardHeader className="p-4 z-10 bg-gradient-to-b from-card to-transparent border-b border-border/10 relative">
                {editingVideoId === video.id ? (
                    <div className="flex items-center gap-2 mb-1.5">
                        <Input
                            autoFocus
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            className="h-7 text-xs px-2 py-1"
                            onKeyDown={e => e.key === 'Enter' && handleRename(video.id)}
                        />
                        <Button size="sm" variant="default" className="h-7 px-2" onClick={() => handleRename(video.id)}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-start justify-between gap-1 group/title">
                        <CardTitle className="text-base line-clamp-2 leading-snug pr-4" title={video.title}>{video.title}</CardTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="w-6 h-6 shrink-0 opacity-0 group-hover/title:opacity-100 transition-opacity absolute right-2 top-3"
                            onClick={() => {
                                setEditTitle(video.title);
                                setEditingVideoId(video.id);
                            }}
                        >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        </Button>
                    </div>
                )}

                {/* Labels Area */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {video.labels?.map(label => (
                        <Badge key={label.id} variant="secondary" className="text-[10px] px-1.5 py-0 hover:bg-destructive/10 hover:text-destructive cursor-pointer hover:line-through transition-all" onClick={() => detachLabel(video.id, label.id)} title="Click to remove">
                            {label.name}
                        </Badge>
                    ))}

                    <Popover>
                        <PopoverTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-[18px] text-[10px] px-1.5 py-0 text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded-full")}>
                            <PlusCircle className="w-3 h-3 mr-1" /> Add Label
                        </PopoverTrigger>
                        <PopoverContent className="w-52 p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Search labels..." className="h-8 text-xs" />
                                <CommandList>
                                    <CommandEmpty className="py-2 px-2">
                                        <div className="flex flex-col gap-2">
                                            <span className="text-xs text-muted-foreground">No label found.</span>
                                            <div className="flex bg-muted/40 p-1 rounded-md">
                                                <Input placeholder="New label name" value={newLabelName} onChange={e => setNewLabelName(e.target.value)} className="h-7 text-xs border-r-0 rounded-r-none focus-visible:ring-0 shadow-none border -mr-px" onKeyDown={e => e.key === 'Enter' && createLabel()} />
                                                <Button size="sm" onClick={createLabel} className="h-7 rounded-l-none text-xs px-2 shadow-none border">Add</Button>
                                            </div>
                                        </div>
                                    </CommandEmpty>
                                    <CommandGroup>
                                        {globalLabels.filter(gl => !(video.labels || []).find(vl => vl.id === gl.id)).map(label => (
                                            <CommandItem
                                                key={label.id}
                                                onSelect={() => attachLabel(video.id, label.id)}
                                                className="text-xs py-1"
                                            >
                                                <Tags className="mr-2 h-3 w-3 opacity-50" />
                                                {label.name}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                <CardDescription className="text-xs mt-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                        <span className="opacity-80">{new Date(video.createdAt).toLocaleDateString()}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30"></span>
                        <span className="opacity-80 truncate">{video.sourcePlatform || "Unknown"}</span>
                        {video.originalUrl && (
                            <a href={video.originalUrl} target="_blank" rel="noopener noreferrer" className="ml-0.5 text-primary hover:text-primary/80 transition-colors flex-shrink-0" title="Open source link">
                                <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        {video.fileSize && (
                            <span className="opacity-80 font-medium text-foreground/60">{(video.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                        )}
                        {video.cloudKey && (
                            <>
                                {video.fileSize && <span className="w-1 h-1 rounded-full bg-muted-foreground/30"></span>}
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-500">
                                    <Cloud className="w-3 h-3" />
                                    Synced
                                </span>
                            </>
                        )}
                    </div>
                </CardDescription>
            </CardHeader>
            <CardContent
                className="p-0 flex-1 flex items-center justify-center bg-black relative min-h-[140px] overflow-hidden group"
            >
                {/* Expand Button for Media Player Modal */}
                <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-2 right-2 z-10 w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-background"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const idx = displayedVideos.findIndex(v => v.id === video.id);
                        setPlayerIndex(idx >= 0 ? idx : 0);
                        setPlayerOpen(true);
                    }}
                    title="Open in Media Player"
                >
                    <Maximize2 className="w-4 h-4 text-foreground/80" />
                </Button>

                {video.mediaType === "image" ? (
                    <img
                        src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                        alt={video.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <video
                        src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                        controls
                        preload={video.thumbnailPath ? "none" : "metadata"}
                        poster={video.thumbnailPath ? `/api/thumbnail/${video.id}` : undefined}
                        className="w-full h-full object-cover"
                    />
                )}
            </CardContent>
            <CardFooter className="p-3 border-t border-border/40 flex flex-col bg-card/80 backdrop-blur z-10">
                {/* Transcript snippet in deep search mode */}
                {video.transcriptSnippet && (
                    <div className="w-full mb-2 px-1.5 py-1 bg-primary/5 border border-primary/15 rounded-md text-[10px] text-muted-foreground leading-relaxed">
                        <span className="font-semibold text-primary text-[9px] uppercase tracking-wider mr-1">Transcript match:</span>
                        {video.transcriptSnippet}
                    </div>
                )}
                <div className="flex items-center justify-between w-full">
                    {/* Transcript Status Badge / Transcribe Button */}
                    <div className="flex items-center gap-1">
                        {video.mediaType !== "image" && (
                            <>
                                {video.transcriptStatus === "completed" ? (
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5 cursor-default">
                                                <Mic className="w-2.5 h-2.5" />
                                                Transcribed
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>Transcript available for deep search</TooltipContent>
                                    </Tooltip>
                                ) : video.transcriptStatus === "processing" || transcribingIds.has(video.id) ? (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5">
                                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                        Transcribing...
                                    </span>
                                ) : video.transcriptStatus === "error" ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 text-[10px] px-1.5 text-destructive hover:bg-destructive/10 rounded-full border border-destructive/20"
                                        onClick={() => handleTranscribe(video.id)}
                                        title="Retry transcription"
                                    >
                                        <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> Retry
                                    </Button>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full border border-dashed border-border/50"
                                        onClick={() => handleTranscribe(video.id)}
                                        title={`Generate AI transcript (${providerLabel})`}
                                    >
                                        <Mic className="w-2.5 h-2.5 mr-0.5" /> Transcribe
                                    </Button>
                                )}
                                <span className="inline-flex items-center rounded-full border border-border/60 bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                                    {providerLabel}
                                </span>
                            </>
                        )}
                    </div>

                    <div className="flex gap-1 flex-shrink-0 bg-background/50 rounded-lg p-0.5 border border-border/20">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background shadow-sm" onClick={() => copyToClipboard(video.localPath)} title="Copy Path">
                            <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background shadow-sm" onClick={() => handleOpenFolder(video.localPath)} title="View in Explorer">
                            <FolderOpen className="h-3.5 w-3.5" />
                        </Button>
                        {video.cloudKey ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-orange-500/10 hover:text-orange-500 shadow-sm" onClick={() => handleCloudRemove(video)} title="Remove from Cloud">
                                <CloudOff className="h-3.5 w-3.5" />
                            </Button>
                        ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background shadow-sm" onClick={() => handleCloudUpload(video)} title="Upload to Cloud">
                                <Cloud className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-destructive/20 hover:text-destructive shadow-sm ml-1" onClick={() => openDeleteDialog(video.id, video.title)} title="Delete Video">
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </CardFooter>
        </Card>
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
                <Card className="bg-background/60 backdrop-blur-2xl border-primary/10 shadow-xl overflow-hidden relative h-full">
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
                            Paste multiple links (one per line) to bulk extract and save.
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
                <div className="w-full xl:w-2/3 flex flex-col gap-4">
                    <div className="flex justify-between items-end mb-1">
                        <h2 className="text-xl font-bold tracking-tight text-foreground/90">
                            Active Queue
                            {queue.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded-full">{queue.length} jobs</span>}
                        </h2>
                        {queue.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1.5"
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
                                Clear Queue
                            </Button>
                        )}
                    </div>

                    <div className="flex-1 min-h-[220px] max-h-[300px] overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                        {queue.length === 0 ? (
                            <div className="h-full min-h-[220px] flex flex-col gap-3 items-center justify-center text-muted-foreground border-2 border-dashed border-muted rounded-2xl bg-muted/10">
                                <DownloadCloud className="w-10 h-10 opacity-20" />
                                <span className="text-sm opacity-60">No active downloads</span>
                            </div>
                        ) : (
                            queue.map(item => (
                                <div key={item.id} className="relative flex items-center gap-4 p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-md shadow-sm transition-all hover:bg-card/80 animate-in slide-in-from-right-4">
                                    {item.thumbnail ? (
                                        <div className="w-20 h-14 rounded-md overflow-hidden flex-shrink-0 relative bg-muted shadow-inner">
                                            <img src={item.thumbnail} className="object-cover w-full h-full" alt="thumb" />
                                        </div>
                                    ) : (
                                        <div className="w-20 h-14 rounded-md flex items-center justify-center flex-shrink-0 bg-muted/50 border border-dashed">
                                            <VideoIcon className="w-5 h-5 text-muted-foreground/30" />
                                        </div>
                                    )}

                                    <div className="flex-1 min-w-0 pr-4">
                                        <p className="text-sm font-semibold truncate text-foreground/90">
                                            {item.title || item.originalUrl}
                                        </p>
                                        {/* Format Selection Dropdown */}
                                        {item.formats && item.formats.length > 0 && item.status !== 'downloading' && item.status !== 'completed' && (
                                            <select
                                                value={item.selectedFormat || ""}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setQueue(prev => prev.map(q => q.id === item.id ? { ...q, selectedFormat: val } : q));
                                                }}
                                                className="mt-1.5 flex h-7 w-full max-w-[240px] rounded-md border border-input bg-transparent px-2 py-1 text-[11px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            >
                                                <option value="">Best Quality (default)</option>
                                                <option value="audio">🎵 Audio Only (MP3)</option>
                                                {item.formats.slice(0, 8).map(fmt => (
                                                    <option key={fmt.formatId} value={fmt.formatId}>
                                                        {fmt.label}{fmt.filesize ? ` (~${(fmt.filesize / (1024 * 1024)).toFixed(0)}MB)` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        <div className="flex items-center gap-3 mt-2">
                                            {item.status === 'parsing' && <><Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Parsing metadata...</span></>}
                                            {item.status === 'pending' && (
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="default"
                                                        className="h-7 px-3 text-[10px] gap-1.5 rounded-lg shadow-sm"
                                                        onClick={() => startDownloadJob(item.id)}
                                                    >
                                                        <DownloadCloud className="w-3 h-3" />
                                                        Download
                                                    </Button>
                                                    <span className="text-[10px] text-muted-foreground italic">← Select quality & start</span>
                                                </div>
                                            )}
                                            {item.status === 'downloading' && (
                                                <div className="flex-1 flex items-center gap-3">
                                                    <Progress value={item.progress ?? 0} className="h-1.5 flex-1 bg-muted/80" />
                                                    <span className="text-xs font-bold text-primary w-9">{Math.round(item.progress || 0)}%</span>
                                                </div>
                                            )}
                                            {item.status === 'completed' && <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-xs font-medium text-green-500">Completed & Saved</span></>}
                                            {item.status === 'error' && (
                                                <div className="flex flex-col gap-1 w-full">
                                                    <div className="flex items-center gap-2 text-destructive">
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                        <span className="text-xs font-medium truncate">{item.errorText}</span>
                                                    </div>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-6 w-fit text-[10px] px-2 self-start"
                                                        onClick={() => startDownloadJob(item.id)}
                                                    >
                                                        Try Again
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
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
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-1">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Saved Media</h2>
                        <div className="text-sm text-muted-foreground mt-1">
                            {displayedVideos.length} {displayedVideos.length === 1 ? 'item' : 'items'}
                        </div>
                    </div>

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
                                <SelectValue placeholder="Platform" />
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
                                <SelectValue placeholder="Sort By" />
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
                        </div>

                        <Button
                            variant={groupByDate ? "secondary" : "ghost"}
                            className="h-9 bg-background/50 border border-border/50 rounded-lg text-foreground/80 hover:bg-background/80"
                            onClick={() => { setGroupByDate(!groupByDate); localStorage.setItem("ui_groupByDate", String(!groupByDate)); }}
                        >
                            Group by Date
                        </Button>
                    </div>
                </div>

                {loading || deepSearchLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 min-h-[400px]">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/50 p-3 shadow-sm">
                                <Skeleton className="h-[200px] w-full rounded-xl bg-muted/20" />
                                <div className="space-y-2 mt-2">
                                    <Skeleton className="h-5 w-3/4 bg-muted/20" />
                                    <Skeleton className="h-4 w-1/2 bg-muted/20" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : videos.length === 0 ? (
                    <div className="min-h-[400px] flex items-center justify-center text-muted-foreground border border-dashed rounded-2xl bg-muted/10">
                        Library is empty. Download some videos above to get started.
                    </div>
                ) : displayedVideos.length === 0 ? (
                    <div className="min-h-[400px] flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-2xl bg-muted/10 gap-2">
                        <Search className="w-8 h-8 opacity-20" />
                        <div>No matching videos found</div>
                    </div>
                ) : (
                    <>
                        {!groupByDate ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                                        <h3 className="text-xl font-bold tracking-tight text-foreground/90 border-b border-border/40 pb-2 mb-4 sticky top-[72px] bg-background/80 backdrop-blur z-20 py-2">
                                            {dateObj}
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
