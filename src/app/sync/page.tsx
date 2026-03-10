"use client";

import React, { useEffect, useState } from "react";
import {
    Cloud,
    CloudOff,
    HardDrive,
    Upload,
    Trash2,
    FileVideo,
    ImageIcon,
    Loader2,
    RefreshCcw,
    Server,
    TrendingUp,
    ArrowUpRight,
    Download,
    ExternalLink,
    Eye,
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

type CloudVideo = {
    id: string;
    title: string;
    duration: number | null;
    sourcePlatform: string | null;
    localPath: string;
    fileSize: number | null;
    mediaType?: string | null;
    cloudKey?: string | null;
    cloudUrl?: string | null;
    cloudUploadedAt?: string | null;
};

type CloudStats = {
    totalFiles: number;
    totalBytes: number;
    totalLibraryCount: number;
    platformBreakdown: Record<string, { count: number; bytes: number }>;
    typeBreakdown: Record<string, number>;
    recentUploads: {
        id: string;
        title: string;
        fileSize: number | null;
        sourcePlatform: string | null;
        mediaType: string | null;
        cloudUploadedAt: string | null;
    }[];
};

const STORAGE_LIMIT_GB = 10; // R2 free tier default
const STORAGE_LIMIT_BYTES = STORAGE_LIMIT_GB * 1024 * 1024 * 1024;

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function timeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export default function CloudSyncPage() {
    const [cloudVideos, setCloudVideos] = useState<CloudVideo[]>([]);
    const [stats, setStats] = useState<CloudStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

    const getPresignedUrl = async (videoId: string): Promise<string | null> => {
        const saved = localStorage.getItem("r2_credentials");
        if (!saved) {
            toast.error("Please configure S3 credentials in Settings first");
            return null;
        }
        try {
            const res = await fetch("/api/sync/presign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId, credentials: JSON.parse(saved) }),
            });
            const data = await res.json();
            if (res.ok && data.url) return data.url;
            toast.error(data.error || "Failed to get file URL");
            return null;
        } catch {
            toast.error("Failed to get file URL");
            return null;
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [videosRes, statsRes] = await Promise.all([
                fetch("/api/sync"),
                fetch("/api/cloud/stats"),
            ]);

            if (videosRes.ok) setCloudVideos(await videosRes.json());
            if (statsRes.ok) setStats(await statsRes.json());
        } catch {
            toast.error("Failed to load cloud data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRemoveFromCloud = async (video: CloudVideo) => {
        const saved = localStorage.getItem("r2_credentials");
        if (!saved) {
            toast.error("Please configure S3 credentials in Settings first");
            return;
        }

        if (!confirm(`Remove "${video.title}" from cloud? The local file will not be affected.`)) return;

        setRemovingIds(prev => new Set(prev).add(video.id));
        const toastId = toast.loading("Removing from cloud...");

        try {
            const res = await fetch("/api/sync", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId: video.id, credentials: JSON.parse(saved) }),
            });

            const result = await res.json();
            if (res.ok && result.success) {
                toast.success("Removed from cloud", { id: toastId });
                setCloudVideos(prev => prev.filter(v => v.id !== video.id));
                // Refresh stats
                const statsRes = await fetch("/api/cloud/stats");
                if (statsRes.ok) setStats(await statsRes.json());
            } else {
                toast.error(`Remove failed: ${result.error}`, { id: toastId });
            }
        } catch {
            toast.error("Failed to remove from cloud", { id: toastId });
        } finally {
            setRemovingIds(prev => {
                const next = new Set(prev);
                next.delete(video.id);
                return next;
            });
        }
    };

    const usagePercent = stats ? Math.min((stats.totalBytes / STORAGE_LIMIT_BYTES) * 100, 100) : 0;

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto min-h-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-500/10">
                            <Cloud className="w-6 h-6 text-sky-500" />
                        </div>
                        Cloud Storage
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage your Cloudflare R2 storage and synced media
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => fetchData()}
                    disabled={loading}
                >
                    <RefreshCcw className="w-4 h-4" />
                    Refresh
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Files */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg overflow-hidden relative group hover:border-sky-500/30 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-2 relative">
                        <CardDescription className="flex items-center gap-2 text-xs font-medium">
                            <Upload className="w-3.5 h-3.5" />
                            Files in Cloud
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                        <div className="text-3xl font-bold tracking-tight">{stats?.totalFiles || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            of {stats?.totalLibraryCount || 0} total in library
                        </p>
                    </CardContent>
                </Card>

                {/* Storage Used */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg overflow-hidden relative group hover:border-emerald-500/30 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-2 relative">
                        <CardDescription className="flex items-center gap-2 text-xs font-medium">
                            <HardDrive className="w-3.5 h-3.5" />
                            Storage Used
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                        <div className="text-3xl font-bold tracking-tight">{formatBytes(stats?.totalBytes || 0)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            of {STORAGE_LIMIT_GB} GB limit
                        </p>
                    </CardContent>
                </Card>

                {/* Videos / Images Breakdown */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg overflow-hidden relative group hover:border-violet-500/30 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-2 relative">
                        <CardDescription className="flex items-center gap-2 text-xs font-medium">
                            <FileVideo className="w-3.5 h-3.5" />
                            Media Types
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                        <div className="flex items-baseline gap-3">
                            <div className="text-3xl font-bold tracking-tight">{stats?.typeBreakdown?.video || 0}</div>
                            <span className="text-xs text-muted-foreground">videos</span>
                            <div className="text-xl font-bold tracking-tight text-muted-foreground">{stats?.typeBreakdown?.image || 0}</div>
                            <span className="text-xs text-muted-foreground">images</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Sync Ratio */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg overflow-hidden relative group hover:border-amber-500/30 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-2 relative">
                        <CardDescription className="flex items-center gap-2 text-xs font-medium">
                            <TrendingUp className="w-3.5 h-3.5" />
                            Sync Ratio
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                        <div className="text-3xl font-bold tracking-tight">
                            {stats && stats.totalLibraryCount > 0
                                ? Math.round((stats.totalFiles / stats.totalLibraryCount) * 100)
                                : 0}%
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            of library backed up
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Storage Usage Bar */}
            <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Server className="w-4 h-4 text-muted-foreground" />
                            Storage Usage
                        </div>
                        <span className="text-sm text-muted-foreground">
                            {formatBytes(stats?.totalBytes || 0)} / {STORAGE_LIMIT_GB} GB
                        </span>
                    </div>
                    <Progress value={usagePercent} className="h-3" />
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">{usagePercent.toFixed(1)}% used</span>
                        <span className="text-xs text-muted-foreground">
                            {formatBytes(STORAGE_LIMIT_BYTES - (stats?.totalBytes || 0))} remaining
                        </span>
                    </div>

                    {/* Platform breakdown pills */}
                    {stats && Object.keys(stats.platformBreakdown).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/30">
                            {Object.entries(stats.platformBreakdown).map(([platform, data]) => (
                                <Badge key={platform} variant="secondary" className="text-[11px] px-2.5 py-1 gap-1.5">
                                    <span className="font-semibold">{platform}</span>
                                    <span className="text-muted-foreground">·</span>
                                    <span>{data.count} files</span>
                                    <span className="text-muted-foreground">·</span>
                                    <span>{formatBytes(data.bytes)}</span>
                                </Badge>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Cloud Files List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-tight">
                        Cloud Files
                        {cloudVideos.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
                                {cloudVideos.length}
                            </span>
                        )}
                    </h2>
                </div>

                {cloudVideos.length === 0 ? (
                    <div className="h-48 flex flex-col gap-3 items-center justify-center text-muted-foreground border-2 border-dashed border-muted rounded-2xl bg-muted/10">
                        <Cloud className="w-10 h-10 opacity-20" />
                        <span className="text-sm opacity-60">No files uploaded to cloud yet</span>
                        <span className="text-xs opacity-40">Upload videos from your library using the cloud button</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {cloudVideos.map(video => (
                            <div
                                key={video.id}
                                className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/60 backdrop-blur-md hover:bg-card/80 hover:border-primary/20 transition-all shadow-sm overflow-hidden"
                            >
                                {/* Icon */}
                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500/20 to-indigo-500/20 flex items-center justify-center flex-shrink-0 border border-sky-500/10">
                                    {video.mediaType === "image" ? (
                                        <ImageIcon className="w-5 h-5 text-sky-500" />
                                    ) : (
                                        <FileVideo className="w-5 h-5 text-sky-500" />
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold truncate">{video.title}</p>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                        <span>{video.sourcePlatform || "Unknown"}</span>
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30"></span>
                                        <span>{formatBytes(video.fileSize || 0)}</span>
                                        {video.cloudUploadedAt && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-muted-foreground/30"></span>
                                                <span>Uploaded {timeAgo(video.cloudUploadedAt)}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-1 flex-shrink-0">
                                    {video.cloudKey && (
                                        <>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 hover:bg-sky-500/10 hover:text-sky-600"
                                                onClick={async () => {
                                                    const url = await getPresignedUrl(video.id);
                                                    if (url) window.open(url, '_blank');
                                                }}
                                                title="Preview in browser"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 hover:bg-emerald-500/10 hover:text-emerald-600"
                                                onClick={async () => {
                                                    const url = await getPresignedUrl(video.id);
                                                    if (url) {
                                                        const a = document.createElement('a');
                                                        a.href = url;
                                                        a.download = video.title;
                                                        a.target = '_blank';
                                                        a.click();
                                                    }
                                                }}
                                                title="Download file"
                                            >
                                                <Download className="w-4 h-4" />
                                            </Button>
                                        </>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => handleRemoveFromCloud(video)}
                                        disabled={removingIds.has(video.id)}
                                        title="Remove from cloud"
                                    >
                                        {removingIds.has(video.id) ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <CloudOff className="w-4 h-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
