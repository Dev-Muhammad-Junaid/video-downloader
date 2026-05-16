"use client";

import React, { useEffect, useState, useCallback } from "react";
import { formatSize, formatDuration } from "@/lib/format";
import { toast } from "sonner";
import { motion } from "framer-motion";
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
    Mic,
    BrainCircuit,
    ChevronDown,
    ChevronUp,
    FileText,
    AlertCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type ActivityLog = {
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
    type: string;    // "download" | "transcription"
    output: string | null; // transcript snippet or error output
};

type Stats = {
    totalDownloads: number;
    totalSize: number;
    completed: number;
    failed: number;
    successRate: number;
    transcriptions: number;
    transcriptionErrors: number;
};

type TabType = "all" | "download" | "transcription";

export default function HistoryPage() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>("all");
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/history?limit=500&type=all`);
            const data = await res.json();
            setLogs(data.logs || []);
            setStats(data.stats || null);
        } catch {
            toast.error("Failed to fetch history");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const filteredLogs = logs.filter(log => {
        if (activeTab === "all") return true;
        return log.type === activeTab;
    });

    const handleClearHistory = async () => {
        const label = activeTab === "all" ? "all activity" : `${activeTab} history`;
        if (!confirm(`Clear ${label}? This cannot be undone.`)) return;
        try {
            await fetch(`/api/history?type=${activeTab}`, { method: "DELETE" });
            toast.success("History cleared");
            fetchHistory();
        } catch {
            toast.error("Failed to clear history");
        }
    };

    const handleRetryDownload = async (log: ActivityLog) => {
        toast.info(`Re-downloading: ${log.title}`);
        try {
            const previewRes = await fetch("/api/download/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: log.url }),
            });
            const preview = await previewRes.json();
            if (previewRes.ok) {
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
                setTimeout(() => fetchHistory(), 2000);
            } else {
                toast.error(preview.error || "Failed to fetch media info");
            }
        } catch {
            toast.error("Retry failed");
        }
    };

    const handleRetryTranscription = async (log: ActivityLog) => {
        if (!log.videoId) { toast.error("No video ID on this log entry"); return; }
        toast.info(`Retrying transcription: ${log.title}`);
        try {
            const res = await fetch(`/api/transcription/${log.videoId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error);
            }
            toast.success("Transcription re-queued. Refresh in a few moments to see the result.");
            setTimeout(() => fetchHistory(), 5000);
        } catch (err: any) {
            toast.error(err.message || "Retry failed");
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const TAB_CONFIG: { id: TabType; label: string; icon: React.ReactNode }[] = [
        { id: "all", label: "All Activity", icon: <History className="w-4 h-4" /> },
        { id: "download", label: "Downloads", icon: <Download className="w-4 h-4" /> },
        { id: "transcription", label: "Transcriptions", icon: <Mic className="w-4 h-4" /> },
    ];

    const stagger = {
        hidden: {},
        show: { transition: { staggerChildren: 0.06 } },
    };
    const fadeUp = {
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 22, stiffness: 180 } },
    };

    return (
        <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="flex-1 w-full p-8 space-y-6 max-w-[1600px] mx-auto overflow-x-hidden"
        >
            {/* Header */}
            <motion.div variants={fadeUp} className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <History className="w-7 h-7 text-primary" />
                        Activity History
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Track all downloads and AI transcriptions with full logs
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => fetchHistory()}>
                        <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                    </Button>
                    {filteredLogs.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={handleClearHistory}
                        >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Clear {activeTab === "all" ? "All" : activeTab === "download" ? "Downloads" : "Transcriptions"}
                        </Button>
                    )}
                </div>
            </motion.div>

            {/* Stats Cards */}
            {loading ? (
                <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i}>
                            <CardContent className="p-4 flex items-center gap-3">
                                <Skeleton className="w-9 h-9 rounded-lg bg-muted/30" />
                                <div className="space-y-2 mt-1">
                                    <Skeleton className="h-6 w-12 bg-muted/30" />
                                    <Skeleton className="h-3 w-20 bg-muted/30" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </motion.div>
            ) : stats && stats.totalDownloads > 0 ? (
                <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="overflow-hidden relative group hover:border-primary/30 transition-all">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardContent className="p-4 flex items-center gap-3 relative">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <Download className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.totalDownloads}</p>
                                <p className="text-xs text-muted-foreground">Total Events</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="overflow-hidden relative group hover:border-emerald-500/30 transition-all">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardContent className="p-4 flex items-center gap-3 relative">
                            <div className="p-2 rounded-lg bg-emerald-500/10">
                                <TrendingUp className="w-5 h-5 text-emerald-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.successRate}%</p>
                                <p className="text-xs text-muted-foreground">Success Rate</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="overflow-hidden relative group hover:border-violet-500/30 transition-all">
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardContent className="p-4 flex items-center gap-3 relative">
                            <div className="p-2 rounded-lg bg-violet-500/10">
                                <BrainCircuit className="w-5 h-5 text-violet-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.transcriptions}</p>
                                <p className="text-xs text-muted-foreground">Transcribed</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="overflow-hidden relative group hover:border-red-500/30 transition-all">
                        <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardContent className="p-4 flex items-center gap-3 relative">
                            <div className="p-2 rounded-lg bg-red-500/10">
                                <XCircle className="w-5 h-5 text-red-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.failed}</p>
                                <p className="text-xs text-muted-foreground">Failed</p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            ) : null}

            {/* Tab Switcher */}
            <motion.div variants={fadeUp} className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 w-fit border border-border/40">
                {TAB_CONFIG.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                                ? "bg-foreground text-background shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </motion.div>

            {/* Log Table */}
            <motion.div variants={fadeUp}>
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                        {activeTab === "transcription" ? <Mic className="w-4 h-4 text-violet-500" /> : <History className="w-4 h-4" />}
                        {activeTab === "all" ? "All Activity" : activeTab === "download" ? "Download Logs" : "Transcription Logs"}
                    </CardTitle>
                    <CardDescription>{filteredLogs.length} entries</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="min-h-[400px] flex flex-col pt-2">
                            {Array.from({ length: 10 }).map((_, i) => (
                                <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 border-b border-border/40 hover:bg-muted/10">
                                    <Skeleton className="h-10 w-10 shrink-0 rounded-lg bg-muted/30" />
                                    <div className="flex-1 space-y-2 w-full">
                                        <Skeleton className="h-4 w-[250px] bg-muted/30" />
                                        <div className="flex gap-2">
                                            <Skeleton className="h-3 w-16 bg-muted/30" />
                                            <Skeleton className="h-3 w-20 bg-muted/30" />
                                        </div>
                                    </div>
                                    <Skeleton className="h-8 w-[100px] rounded-full hidden sm:block bg-muted/30" />
                                </div>
                            ))}
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground">
                            <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No history yet</p>
                            <p className="text-xs opacity-60 mt-1">
                                {activeTab === "transcription"
                                    ? "Transcription events will appear here"
                                    : "Downloads will appear here automatically"}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/50">
                            {filteredLogs.map((log) => {
                                const isTranscription = log.type === "transcription";
                                const isExpanded = expandedIds.has(log.id);
                                const hasOutput = !!log.output;

                                return (
                                    <div key={log.id} className="transition-colors hover:bg-muted/20">
                                        {/* Main Row */}
                                        <div className="flex items-center gap-4 p-4">
                                            {/* Type + Status Icon */}
                                            <div className="flex-shrink-0 relative">
                                                {log.status === "completed" ? (
                                                    <CheckCircle2 className={`w-5 h-5 ${isTranscription ? "text-violet-500" : "text-emerald-500"}`} />
                                                ) : log.status === "error" ? (
                                                    <XCircle className="w-5 h-5 text-red-500" />
                                                ) : (
                                                    <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                                                )}
                                                {/* Type indicator pill */}
                                                {isTranscription && (
                                                    <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
                                                        <Mic className="w-1.5 h-1.5 text-violet-500" />
                                                    </span>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <p className="text-sm font-medium truncate min-w-0">{log.title}</p>
                                                    {isTranscription && (
                                                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-violet-500/10 text-violet-500 border-violet-500/20 border shrink-0">
                                                            AI
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                    <span className="text-[11px] text-muted-foreground">
                                                        {new Date(log.startedAt).toLocaleDateString()} {new Date(log.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                                                {/* Error message */}
                                                {log.errorMessage && (
                                                    <p className="text-[11px] text-red-500 mt-1 line-clamp-1">
                                                        <AlertCircle className="w-3 h-3 inline mr-0.5 mb-px" />
                                                        {log.errorMessage}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Size (downloads only) */}
                                            <div className="text-xs text-muted-foreground flex-shrink-0 w-16 text-right">
                                                {!isTranscription ? formatSize(log.fileSize) : ""}
                                            </div>

                                            {/* Status Badge */}
                                            <Badge
                                                variant={log.status === "completed" ? "default" : log.status === "error" ? "destructive" : "secondary"}
                                                className={`flex-shrink-0 text-[10px] ${log.status === "completed" && isTranscription
                                                        ? "bg-violet-500/10 text-violet-600 border-violet-500/20 border"
                                                        : ""
                                                    }`}
                                            >
                                                {log.status === "completed" ? (isTranscription ? "Transcribed" : "Success")
                                                    : log.status === "error" ? "Failed"
                                                        : "In Progress"}
                                            </Badge>

                                            {/* Actions */}
                                            <div className="flex gap-1 flex-shrink-0">
                                                {/* Expand output button */}
                                                {hasOutput && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onClick={() => toggleExpand(log.id)}
                                                        title={isExpanded ? "Collapse" : "Show output"}
                                                    >
                                                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                    </Button>
                                                )}
                                                {/* Open URL */}
                                                {log.url && !log.url.startsWith("/") && (
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
                                                {/* Retry */}
                                                {log.status === "error" && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-primary hover:text-primary"
                                                        onClick={() =>
                                                            isTranscription
                                                                ? handleRetryTranscription(log)
                                                                : handleRetryDownload(log)
                                                        }
                                                        title={isTranscription ? "Retry transcription" : "Retry download"}
                                                    >
                                                        <RefreshCw className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expanded output panel */}
                                        {isExpanded && hasOutput && (
                                            <div className="px-4 pb-4 pt-0">
                                                <div className={`rounded-lg p-3 border text-xs font-mono leading-relaxed whitespace-pre-wrap break-all max-h-40 overflow-y-auto ${log.status === "error"
                                                        ? "bg-red-500/5 border-red-500/20 text-red-400"
                                                        : "bg-muted/40 border-border/40 text-muted-foreground"
                                                    }`}>
                                                    <div className="flex items-center gap-1.5 text-[10px] font-sans font-semibold uppercase tracking-wider mb-2 opacity-60">
                                                        {log.status === "error"
                                                            ? <><AlertCircle className="w-3 h-3" /> Error Output</>
                                                            : isTranscription
                                                                ? <><FileText className="w-3 h-3" /> Transcript Preview</>
                                                                : <><FileText className="w-3 h-3" /> Output</>
                                                        }
                                                    </div>
                                                    {log.output}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
            </motion.div>
        </motion.div>
    );
}
