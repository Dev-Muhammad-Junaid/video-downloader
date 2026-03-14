"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    History,
    Trash2,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Loader2,
    Download,
    HardDrive,
    TrendingUp,
    ExternalLink,
    Clock,
} from "lucide-react";

type DownloadLog = {
    id: string;
    url: string;
    title: string;
    sourcePlatform: string | null;
    status: string;
    errorMessage: string | null;
    fileSize: number | null;
    videoId: string | null;
    duration: number | null;
    startedAt: string;
    completedAt: string | null;
};

type Stats = {
    totalDownloads: number;
    totalSize: number;
    completed: number;
    failed: number;
    successRate: number;
};

export default function HistoryPage() {
    const [logs, setLogs] = useState<DownloadLog[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchHistory = async () => {
        try {
            const res = await fetch("/api/history?limit=200");
            const data = await res.json();
            setLogs(data.logs || []);
            setStats(data.stats || null);
        } catch {
            toast.error("Failed to fetch history");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const handleClearHistory = async () => {
        if (!confirm("Clear all download history? This cannot be undone.")) return;
        try {
            await fetch("/api/history", { method: "DELETE" });
            setLogs([]);
            setStats({ totalDownloads: 0, totalSize: 0, completed: 0, failed: 0, successRate: 0 });
            toast.success("History cleared");
        } catch {
            toast.error("Failed to clear history");
        }
    };

    const handleRetry = async (log: DownloadLog) => {
        toast.info(`Re-downloading: ${log.title}`);
        try {
            // First preview to get metadata
            const previewRes = await fetch("/api/download/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: log.url }),
            });
            const preview = await previewRes.json();
            if (previewRes.ok) {
                // Start the download
                await fetch("/api/download", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        url: preview.originalUrl || log.url,
                        title: preview.title || log.title,
                        sourcePlatform: preview.sourcePlatform || log.sourcePlatform,
                        mediaType: preview.mediaType || "video",
                        imageUrl: preview.imageUrl,
                    }),
                });
                toast.success("Download started!");
                // Refresh to show new entry
                setTimeout(fetchHistory, 2000);
            } else {
                toast.error(preview.error || "Failed to fetch media info");
            }
        } catch {
            toast.error("Retry failed");
        }
    };

    const formatDuration = (seconds: number | null) => {
        if (!seconds) return "-";
        if (seconds < 60) return `${seconds.toFixed(1)}s`;
        return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    };

    const formatSize = (bytes: number | null) => {
        if (!bytes) return "-";
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
            </div>
        );
    }

    return (
        <div className="flex-1 p-8 space-y-6 max-w-[1200px] mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <History className="w-7 h-7 text-primary" />
                        Download History
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Track all your downloads with status and retry capability
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={fetchHistory}>
                        <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                    </Button>
                    {logs.length > 0 && (
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleClearHistory}>
                            <Trash2 className="w-4 h-4 mr-1" /> Clear
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats Cards */}
            {stats && stats.totalDownloads > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-background/60 backdrop-blur-xl border-border/50">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <Download className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.totalDownloads}</p>
                                <p className="text-xs text-muted-foreground">Total Downloads</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-background/60 backdrop-blur-xl border-border/50">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-500/10">
                                <TrendingUp className="w-5 h-5 text-emerald-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.successRate}%</p>
                                <p className="text-xs text-muted-foreground">Success Rate</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-background/60 backdrop-blur-xl border-border/50">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/10">
                                <HardDrive className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{formatSize(stats.totalSize)}</p>
                                <p className="text-xs text-muted-foreground">Total Downloaded</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-background/60 backdrop-blur-xl border-border/50">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-500/10">
                                <XCircle className="w-5 h-5 text-red-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.failed}</p>
                                <p className="text-xs text-muted-foreground">Failed</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* History Table */}
            <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Activity Log</CardTitle>
                    <CardDescription>{logs.length} entries</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {logs.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground">
                            <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No download history yet</p>
                            <p className="text-xs opacity-60 mt-1">Downloads will appear here automatically</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/50">
                            {logs.map((log) => (
                                <div
                                    key={log.id}
                                    className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
                                >
                                    {/* Status Icon */}
                                    <div className="flex-shrink-0">
                                        {log.status === "completed" ? (
                                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                        ) : log.status === "error" ? (
                                            <XCircle className="w-5 h-5 text-red-500" />
                                        ) : (
                                            <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{log.title}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[11px] text-muted-foreground">
                                                {new Date(log.startedAt).toLocaleDateString()} {new Date(log.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {log.sourcePlatform && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                                    <span className="text-[11px] text-muted-foreground">{log.sourcePlatform}</span>
                                                </>
                                            )}
                                            {log.duration != null && (
                                                <>
                                                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                                    <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                                        <Clock className="w-3 h-3" />
                                                        {formatDuration(log.duration)}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        {log.errorMessage && (
                                            <p className="text-[11px] text-red-500 mt-1 truncate">{log.errorMessage}</p>
                                        )}
                                    </div>

                                    {/* Size */}
                                    <div className="text-xs text-muted-foreground flex-shrink-0 w-16 text-right">
                                        {formatSize(log.fileSize)}
                                    </div>

                                    {/* Status Badge */}
                                    <Badge
                                        variant={log.status === "completed" ? "default" : log.status === "error" ? "destructive" : "secondary"}
                                        className="flex-shrink-0 text-[10px]"
                                    >
                                        {log.status === "completed" ? "Success" : log.status === "error" ? "Failed" : "In Progress"}
                                    </Badge>

                                    {/* Actions */}
                                    <div className="flex gap-1 flex-shrink-0">
                                        {log.url && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => window.open(log.url, "_blank")}
                                                title="Open source URL"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                        {log.status === "error" && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-primary"
                                                onClick={() => handleRetry(log)}
                                                title="Retry download"
                                            >
                                                <RefreshCw className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
