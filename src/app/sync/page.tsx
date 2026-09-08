"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { formatBytes, timeAgo } from "@/lib/format";
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
import { Skeleton } from "@/components/ui/skeleton";
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




export default function CloudSyncPage() {
    const [cloudVideos, setCloudVideos] = useState<CloudVideo[]>([]);
    const [stats, setStats] = useState<CloudStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

    const [storageLimitGb, setStorageLimitGb] = useState(10);
    const storageLimitBytes = storageLimitGb * 1024 * 1024 * 1024;

    const getPresignedUrl = async (videoId: string): Promise<string | null> => {
        try {
            const res = await fetch("/api/sync/presign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId }),
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
        // Fetch storage limit from server settings
        fetch("/api/settings/r2").then(r => r.json()).then(data => {
            if (data.storageLimit) setStorageLimitGb(data.storageLimit);
        }).catch(() => {});
    }, []);

    const handleRemoveFromCloud = async (video: CloudVideo) => {
        if (!confirm(`Remove "${video.title}" from cloud? The local file will not be affected.`)) return;

        setRemovingIds(prev => new Set(prev).add(video.id));
        const toastId = toast.loading("Removing from cloud...");

        try {
            const res = await fetch("/api/sync", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId: video.id }),
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

    const usagePercent = stats ? Math.min((stats.totalBytes / storageLimitBytes) * 100, 100) : 0;

    const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
    const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 22, stiffness: 180 } } };

    return (
        <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto w-full max-w-[1400px] space-y-5 overflow-x-hidden px-6 py-5">
            {/* Header */}
            <motion.div variants={fadeUp} className="flex items-center justify-between">
                <p className="text-[13px] text-muted-foreground">
                    Your cloud storage and synced files.
                </p>
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
            </motion.div>

            {/* Stats Cards */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i}>
                            <CardHeader className="pb-2">
                                <Skeleton className="h-4 w-24 bg-muted/30" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-8 w-16 bg-muted/30" />
                                <Skeleton className="h-3 w-32 mt-2 bg-muted/30" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Files */}
                <Card className="overflow-hidden relative group hover:border-chart-1/30 transition-all">
                    <CardHeader className="pb-2 relative">
                        <CardDescription className="flex items-center gap-2 text-xs font-medium">
                            <Upload className="w-3.5 h-3.5" />
                            Files in Cloud
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                        <div className="tabular text-[22px] font-semibold">{stats?.totalFiles || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            of {stats?.totalLibraryCount || 0} total in library
                        </p>
                    </CardContent>
                </Card>

                {/* Storage Used */}
                <Card className="overflow-hidden relative group hover:border-chart-2/30 transition-all">
                    <CardHeader className="pb-2 relative">
                        <CardDescription className="flex items-center gap-2 text-xs font-medium">
                            <HardDrive className="w-3.5 h-3.5" />
                            Storage Used
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                        <div className="tabular text-[22px] font-semibold">{formatBytes(stats?.totalBytes || 0)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            of {storageLimitGb} GB limit
                        </p>
                    </CardContent>
                </Card>

                {/* Videos / Images Breakdown */}
                <Card className="overflow-hidden relative group hover:border-chart-4/30 transition-all">
                    <CardHeader className="pb-2 relative">
                        <CardDescription className="flex items-center gap-2 text-xs font-medium">
                            <FileVideo className="w-3.5 h-3.5" />
                            Media Types
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                        <div className="flex items-baseline gap-3">
                            <div className="tabular text-[22px] font-semibold">{stats?.typeBreakdown?.video || 0}</div>
                            <span className="text-xs text-muted-foreground">videos</span>
                            <div className="tabular text-[17px] font-semibold text-muted-foreground">{stats?.typeBreakdown?.image || 0}</div>
                            <span className="text-xs text-muted-foreground">images</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Sync Ratio */}
                <Card className="overflow-hidden relative group hover:border-chart-3/30 transition-all">
                    <CardHeader className="pb-2 relative">
                        <CardDescription className="flex items-center gap-2 text-xs font-medium">
                            <TrendingUp className="w-3.5 h-3.5" />
                            Sync Ratio
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                        <div className="tabular text-[22px] font-semibold">
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
            )}

            {/* Storage Usage Bar */}
            {loading ? (
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex justify-between mb-4">
                            <Skeleton className="h-4 w-32 bg-muted/30" />
                            <Skeleton className="h-4 w-24 bg-muted/30" />
                        </div>
                        <Skeleton className="h-3 w-full bg-muted/30" />
                        <div className="flex justify-between mt-2">
                            <Skeleton className="h-3 w-16 bg-muted/30" />
                            <Skeleton className="h-3 w-24 bg-muted/30" />
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Server className="w-4 h-4 text-muted-foreground" />
                            Storage Usage
                        </div>
                        <span className="text-sm text-muted-foreground">
                            {formatBytes(stats?.totalBytes || 0)} / {storageLimitGb} GB
                        </span>
                    </div>
                    <Progress value={usagePercent} className="h-3" />
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">{usagePercent.toFixed(1)}% used</span>
                        <span className="text-xs text-muted-foreground">
                            {formatBytes(storageLimitBytes - (stats?.totalBytes || 0))} remaining
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
            )}

            {/* Cloud Files List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-tight">
                        Cloud Files
                        {cloudVideos.length > 0 && (
                            <span className="tabular ml-2 rounded-full bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                                {cloudVideos.length}
                            </span>
                        )}
                    </h2>
                </div>

                {loading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3.5 rounded-lg border border-border bg-card p-3.5">
                                <Skeleton className="w-10 h-10 rounded-lg bg-muted/30" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-[60%] sm:w-[300px] bg-muted/30" />
                                    <Skeleton className="h-3 w-48 bg-muted/30" />
                                </div>
                                <div className="flex gap-2">
                                    <Skeleton className="w-8 h-8 rounded-md bg-muted/30" />
                                    <Skeleton className="w-8 h-8 rounded-md bg-muted/30" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : cloudVideos.length === 0 ? (
                    <div className="flex h-48 flex-col items-center justify-center gap-2.5 rounded-[10px] border border-border bg-card/50 text-muted-foreground">
                        <Cloud className="w-10 h-10 opacity-20" />
                        <span className="text-sm opacity-60">No cloud files yet</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {cloudVideos.map(video => (
                            <div
                                key={video.id}
                                className="group flex items-center gap-3.5 overflow-hidden rounded-lg border border-border bg-card p-3.5 transition-colors hover:bg-muted/50"
                            >
                                {/* Icon */}
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    {video.mediaType === "image" ? (
                                        <ImageIcon className="size-[17px]" />
                                    ) : (
                                        <FileVideo className="size-[17px]" />
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-[13px] font-medium">{video.title}</p>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
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
                                                className="h-8 w-8 hover:bg-chart-1/10 hover:text-chart-1"
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
                                                className="h-8 w-8 hover:bg-chart-2/10 hover:text-chart-2"
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
        </motion.div>
    );
}
