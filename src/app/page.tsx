"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Copy, FolderOpen, Play, Cloud, DownloadCloud, Loader2, CheckCircle2, AlertCircle, Video as VideoIcon, Search, Pencil, Filter, ExternalLink } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

type Video = {
    id: string;
    title: string;
    duration: number | null;
    sourcePlatform: string | null;
    localPath: string;
    fileSize: number | null;
    originalUrl?: string | null;
    createdAt: string;
    labels?: { id: string; name: string; color: string | null }[];
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

    // Renaming state
    const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");

    // Labels State
    const [globalLabels, setGlobalLabels] = useState<{ id: string; name: string; color: string | null }[]>([]);
    const [newLabelName, setNewLabelName] = useState("");

    const pollingRefs = React.useRef<{ [key: string]: NodeJS.Timeout }>({});

    useEffect(() => {
        const init = async () => {
            const watchPath = localStorage.getItem("watch_folder");
            if (watchPath) {
                // Background scan
                fetch("/api/library/scan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ folderPath: watchPath }),
                }).then(() => fetchLibrary()).catch(console.error);
            }
            fetchLibrary();
            fetchQueue();
            fetchLabels();
        };
        init();

        return () => {
            // Cleanup active polling on unmount
            Object.values(pollingRefs.current).forEach(clearInterval);
        };
    }, []);

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

                    setQueue(activeJobs);

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
        const links = urlText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (links.length === 0) return;

        const newItems: QueueItem[] = links.map(url => ({
            id: Math.random().toString(36).substring(7),
            originalUrl: url,
            status: 'parsing'
        }));

        setQueue(prev => [...newItems, ...prev]);
        setUrlText("");

        newItems.forEach(item => parseAndDownload(item.id, item.originalUrl));
    };

    const parseAndDownload = async (id: string, url: string) => {
        try {
            // 1. Parse Metadata
            const res = await fetch("/api/download/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            });
            const metadata = await res.json();
            if (!res.ok) throw new Error(metadata.error || "Metadata failed");

            setQueue(prev => prev.map(q => q.id === id ? {
                ...q,
                title: metadata.title,
                thumbnail: metadata.thumbnail,
                sourcePlatform: metadata.sourcePlatform,
                duration: metadata.duration ?? null,
                status: 'pending'
            } : q));

            // 2. Start Download immediately
            const dlRes = await fetch("/api/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: metadata.originalUrl,
                    title: metadata.title,
                    sourcePlatform: metadata.sourcePlatform
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

            // 3. Poll
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
        const saved = localStorage.getItem("r2_credentials");
        if (!saved) {
            toast.error("Please configure S3 credentials in Settings first");
            return;
        }

        const toastId = toast.loading(`Uploading ${video.title}...`);
        try {
            const res = await fetch("/api/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId: video.id, credentials: JSON.parse(saved) }),
            });

            const result = await res.json();
            if (res.ok && result.success) {
                toast.success(`Uploaded successfully`, { id: toastId });
            } else {
                toast.error(`Upload failed: ${result.error}`, { id: toastId });
            }
        } catch {
            toast.error("Upload failed", { id: toastId });
        }
    };

    const handleDelete = async (videoId: string, title: string) => {
        if (!confirm(`Are you sure you want to completely delete "${title}"? This will remove the file from your computer.`)) return;

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
        let result = [...videos];

        // Filter by platform
        if (platformFilter !== "all") {
            result = result.filter(v =>
                (v.sourcePlatform || "Unknown").toLowerCase() === platformFilter.toLowerCase()
            );
        }

        // Search query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(v => v.title.toLowerCase().includes(q));
        }

        // Sort
        result.sort((a, b) => {
            if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            if (sortBy === "size-desc") return (b.fileSize || 0) - (a.fileSize || 0);
            if (sortBy === "size-asc") return (a.fileSize || 0) - (b.fileSize || 0);
            return 0;
        });

        return result;
    }, [videos, searchQuery, sortBy, platformFilter]);

    // Get unique platforms for filter
    const platforms = useMemo(() => {
        const set = new Set(videos.map(v => v.sourcePlatform || "Unknown"));
        return Array.from(set).sort();
    }, [videos]);

    if (loading) {
        return <div className="p-8 flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-primary/50" /></div>;
    }

    return (
        <div className="p-8 space-y-10 max-w-[1600px] mx-auto min-h-full">

            {/* Top Section: Dashboard Split View */}
            <div className="flex flex-col xl:flex-row gap-8 items-stretch pt-2">

                {/* Left Panel: Bulk Input */}
                <Card className="w-full xl:w-1/3 bg-background/60 backdrop-blur-2xl border-primary/10 shadow-xl overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50 pointer-events-none" />
                    <CardHeader className="relative">
                        <CardTitle className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                            <DownloadCloud className="w-6 h-6 text-primary" />
                            Studio Downloader
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

                {/* Right Panel: Active Queue */}
                <div className="w-full xl:w-2/3 flex flex-col gap-4">
                    <div className="flex justify-between items-end mb-1">
                        <h2 className="text-xl font-bold tracking-tight text-foreground/90">
                            Active Queue
                            {queue.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded-full">{queue.length} jobs</span>}
                        </h2>
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
                                        <div className="flex items-center gap-3 mt-2">
                                            {item.status === 'parsing' && <><Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Parsing metadata...</span></>}
                                            {item.status === 'pending' && <><Loader2 className="w-3.5 h-3.5 text-primary animate-spin" /><span className="text-xs text-muted-foreground">Initializing download...</span></>}
                                            {item.status === 'downloading' && (
                                                <div className="flex-1 flex items-center gap-3">
                                                    <Progress value={item.progress ?? null} className="h-1.5 flex-1 bg-muted/80" />
                                                    <span className="text-xs font-bold text-primary w-9">{Math.round(item.progress || 0)}%</span>
                                                </div>
                                            )}
                                            {item.status === 'completed' && <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-xs font-medium text-green-500">Completed & Saved</span></>}
                                            {item.status === 'error' && <><AlertCircle className="w-4 h-4 text-destructive" /><span className="text-xs text-destructive truncate">{item.errorText}</span></>}
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
            <div className="space-y-6 pt-4 animate-in fade-in duration-700">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-1">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Saved Media</h2>
                        <div className="text-sm text-muted-foreground mt-1">
                            {displayedVideos.length} {displayedVideos.length === 1 ? 'item' : 'items'}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-56">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search videos..."
                                className="pl-9 bg-background/50 h-9 rounded-lg"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
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
                    </div>
                </div>

                {videos.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-muted-foreground border border-dashed rounded-2xl bg-muted/10">
                        Library is empty. Download some videos above to get started.
                    </div>
                ) : displayedVideos.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-2xl bg-muted/10 gap-2">
                        <Search className="w-8 h-8 opacity-20" />
                        <div>No matching videos found</div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {displayedVideos.map((video) => (
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
                                            <PopoverTrigger>
                                                <Button variant="ghost" size="sm" className="h-[18px] text-[10px] px-1.5 py-0 text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded-full">
                                                    <PlusCircle className="w-3 h-3 mr-1" /> Add Label
                                                </Button>
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

                                    <CardDescription className="text-xs mt-2.5 flex items-center gap-1.5">
                                        <span className="opacity-80">{new Date(video.createdAt).toLocaleDateString()}</span>
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30"></span>
                                        <span className="opacity-80">{video.sourcePlatform || "Unknown"}</span>
                                        {video.originalUrl && (
                                            <a href={video.originalUrl} target="_blank" rel="noopener noreferrer" className="ml-0.5 text-primary hover:text-primary/80 transition-colors" title="Open source link">
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        )}
                                        {video.fileSize && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-muted-foreground/30"></span>
                                                <span className="opacity-80 font-medium text-foreground/60">{(video.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                                            </>
                                        )}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-0 flex-1 flex items-center justify-center bg-black relative min-h-[140px] overflow-hidden">
                                    <video
                                        src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                                        controls
                                        preload="metadata"
                                        className="w-full h-full object-cover"
                                    />
                                </CardContent>
                                <CardFooter className="p-3 border-t border-border/40 flex items-center gap-2 justify-between bg-card/80 backdrop-blur z-10">
                                    <div className="text-[11px] text-muted-foreground/70 truncate pr-2 font-mono" title={video.localPath}>
                                        {video.localPath.split('/').pop()}
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0 bg-background/50 rounded-lg p-0.5 border border-border/20">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background shadow-sm" onClick={() => copyToClipboard(video.localPath)} title="Copy Path">
                                            <Copy className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background shadow-sm" onClick={() => handleOpenFolder(video.localPath)} title="View in Explorer">
                                            <FolderOpen className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background shadow-sm" onClick={() => handleCloudUpload(video)} title="Upload to Cloud">
                                            <Cloud className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-destructive/20 hover:text-destructive shadow-sm ml-1" onClick={() => handleDelete(video.id, video.title)} title="Delete Video">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
