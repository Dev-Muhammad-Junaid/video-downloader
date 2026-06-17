"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, Loader2, Download, Eye, Clock, FileDown, Database, BrainCircuit, Mic, Plus, Trash2, Edit2, Settings2, CloudSync, Tags, Check, X, ShieldCheck, Film, ImageIcon, Music, CircleCheck, CircleX, CircleDashed, RefreshCw, Terminal, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// Value→label maps so each Select trigger shows the readable label (not the raw
// stored value like "604800" / "best" / "flexible") in its default state.
const EXPIRY_LABELS: Record<string, string> = {
    "3600": "1 hour",
    "21600": "6 hours",
    "86400": "24 hours",
    "259200": "3 days",
    "604800": "7 days (default)",
};
const PROVIDER_LABELS: Record<string, string> = { openai: "OpenAI", groq: "Groq" };
const RESOLUTION_LABELS: Record<string, string> = {
    best: "Best Available",
    "2160": "4K (2160p)",
    "1440": "2K (1440p)",
    "1080": "1080p",
    "720": "720p",
    "480": "480p",
    "360": "360p",
};
const RESOLUTION_MODE_LABELS: Record<string, string> = {
    flexible: "Flexible (≤ target)",
    strict: "Strict (= target)",
    minimum: "Minimum (≥ target)",
};
const FORMAT_LABELS: Record<string, string> = {
    mp4: "MP4 (Recommended)",
    mkv: "MKV (lossless container)",
    webm: "WebM",
    best: "Best (let yt-dlp decide)",
    mp3: "MP3 (extract audio)",
    m4a: "M4A (AAC audio)",
    wav: "WAV (lossless audio)",
};
const IMAGE_FORMAT_LABELS: Record<string, string> = {
    original: "Original (keep as-is)",
    jpg: "JPG (smaller, lossy)",
    png: "PNG (lossless)",
    webp: "WebP (modern, efficient)",
    avif: "AVIF (next-gen compression)",
};

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        s3Endpoint: "",
        s3Bucket: "",
        s3AccessKey: "",
        s3SecretKey: "",
        s3Region: "auto",
        storageLimit: 10,
        watchFolder: "",
        destinationFolder: "",
        urlExpiry: 604800,
        transcriptionProvider: "openai" as "openai" | "groq",
        openaiApiKey: "",
        groqApiKey: "",
        whisperLanguage: "",
    });
    const [pickingFolder, setPickingFolder] = useState<"watch" | "destination" | null>(null);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [labels, setLabels] = useState<any[]>([]);
    const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [baseUrl, setBaseUrl] = useState('');
    const [preflight, setPreflight] = useState<any>(null);
    const [preflightLoading, setPreflightLoading] = useState(false);
    const [healthExpanded, setHealthExpanded] = useState(false);

    useEffect(() => {
        setBaseUrl(window.location.origin);

        // Fetch everything from server APIs
        Promise.all([
            fetch("/api/settings/destination").then(res => res.json()),
            fetch("/api/profiles").then(res => res.json()),
            fetch("/api/labels").then(res => res.json()),
            fetch("/api/settings/r2").then(res => res.json()),
            fetch("/api/settings/ai").then(res => res.json()),
            fetch("/api/settings/watch").then(res => res.json()),
        ]).then(([destData, profilesData, labelsData, r2Data, aiData, watchData]) => {
            setSettings(s => ({
                ...s,
                destinationFolder: destData.path || "",
                ...(r2Data?.s3Endpoint ? r2Data : {}),
                transcriptionProvider: aiData.provider || "openai",
                openaiApiKey: aiData.hasOpenAiKey ? aiData.openaiApiKey : "",
                groqApiKey: aiData.hasGroqKey ? aiData.groqApiKey : "",
                whisperLanguage: aiData.whisperLanguage || "",
                watchFolder: watchData.watchFolder || "",
            }));
            if (Array.isArray(profilesData)) setProfiles(profilesData);
            if (Array.isArray(labelsData)) setLabels(labelsData);
            setIsLoading(false);
        }).catch(err => {
            console.error(err);
            setIsLoading(false);
        });
    }, []);

    const runPreflight = async () => {
        setPreflightLoading(true);
        try {
            const res = await fetch("/api/settings/preflight", { method: "POST" });
            if (res.ok) setPreflight(await res.json());
            else toast.error("Preflight check failed");
        } catch {
            toast.error("Preflight check error");
        } finally {
            setPreflightLoading(false);
        }
    };

    useEffect(() => { runPreflight(); }, []);

    const handleSaveCredentials = async () => {
        const creds = {
            s3Endpoint: settings.s3Endpoint,
            s3Bucket: settings.s3Bucket,
            s3AccessKey: settings.s3AccessKey,
            s3SecretKey: settings.s3SecretKey,
            s3Region: settings.s3Region,
            urlExpiry: settings.urlExpiry,
            storageLimit: settings.storageLimit,
        };

        try {
            const res = await fetch("/api/settings/r2", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(creds),
            });
            if (res.ok) {
                toast.success("R2 credentials saved");
            } else {
                toast.error("Failed to save R2 credentials");
            }
        } catch {
            toast.error("Failed to save R2 credentials");
        }
    };

    const handleSaveWatchFolder = async () => {
        try {
            const res = await fetch("/api/settings/watch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ watchFolder: settings.watchFolder }),
            });
            if (res.ok) {
                toast.success("Watch folder saved");
            } else {
                toast.error("Failed to save watch folder");
            }
        } catch {
            toast.error("Failed to save watch folder");
        }
    };

    const handleSaveDestination = async () => {
        try {
            const res = await fetch("/api/settings/destination", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: settings.destinationFolder }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success("Download destination saved");
            } else {
                toast.error(data.error || "Failed to save destination");
            }
        } catch {
            toast.error("Failed to save destination");
        }
    };

    const handlePickFolder = async (type: "watch" | "destination") => {
        setPickingFolder(type);
        try {
            const res = await fetch("/api/folder-picker");
            const data = await res.json();
            if (data.path) {
                if (type === "watch") {
                    setSettings(s => ({ ...s, watchFolder: data.path }));
                } else {
                    setSettings(s => ({ ...s, destinationFolder: data.path }));
                }
                toast.success("Folder selected");
            } else if (data.error) {
                toast.error(data.error);
            }
        } catch {
            toast.error("Failed to open folder picker");
        } finally {
            setPickingFolder(null);
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProfile?.name?.trim()) {
            toast.error("Profile name is required");
            return;
        }
        const method = editingProfile?.id ? "PATCH" : "POST";
        const url = editingProfile?.id ? `/api/profiles/${editingProfile.id}` : "/api/profiles";

        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editingProfile),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data.error || `Failed to save profile (HTTP ${res.status})`);
                return;
            }
            if (method === "POST") setProfiles([...profiles, data]);
            else setProfiles(profiles.map(p => p.id === data.id ? data : p));
            // Refresh full list so demoted defaults show their new priority correctly.
            fetch("/api/profiles").then(r => r.json()).then(list => { if (Array.isArray(list)) setProfiles(list); }).catch(() => {});
            setIsProfileDialogOpen(false);
            toast.success("Profile saved");
        } catch (err: any) {
            toast.error(err?.message || "Failed to save profile");
        }
    };

    const handleDeleteProfile = async (id: string) => {
        if (!confirm("Are you sure?")) return;
        try {
            const res = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
            if (res.ok) {
                setProfiles(profiles.filter(p => p.id !== id));
                toast.success("Profile deleted");
            } else {
                const d = await res.json();
                toast.error(d.error || "Failed to delete");
            }
        } catch {
            toast.error("Delete failed");
        }
    };

    const handleToggleLabelSync = async (label: any) => {
        const newValue = !label.autoCloudSync;
        try {
            const res = await fetch(`/api/labels/${label.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ autoCloudSync: newValue }),
            });
            if (res.ok) {
                setLabels(labels.map(l => l.id === label.id ? { ...l, autoCloudSync: newValue } : l));
                toast.success(`Auto-sync ${newValue ? 'enabled' : 'disabled'} for ${label.name}`);
            }
        } catch {
            toast.error("Failed to update label");
        }
    };

    const stagger = {
        hidden: {},
        show: { transition: { staggerChildren: 0.07 } },
    };
    const fadeUp = {
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 24, stiffness: 180 } },
    };

    return (
        <div className="flex-1 p-8 space-y-6 max-w-[1600px] mx-auto w-full">
            <motion.h1
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", damping: 20, stiffness: 180 }}
                className="text-3xl font-bold tracking-tight"
            >
                Settings
            </motion.h1>

            <motion.div
                variants={stagger}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
                {/* System Health / Preflight — compact collapsible */}
                <motion.div variants={fadeUp} className="lg:col-span-2">
                <Card>
                    <div
                        className="flex items-center justify-between px-5 py-3 cursor-pointer select-none"
                        onClick={() => setHealthExpanded(!healthExpanded)}
                    >
                        <div className="flex items-center gap-2.5">
                            <Terminal className="w-4 h-4 text-primary" />
                            <span className="text-sm font-semibold">System Health</span>
                            {preflight && !preflightLoading && (
                                <div className="flex items-center gap-1 ml-2">
                                    {[...Object.values(preflight.binaries as Record<string, any>), ...Object.values(preflight.providers as Record<string, any>)].map((item: any, i) => {
                                        const ok = item.available ?? (item.configured && item.reachable);
                                        const skip = item.configured === false;
                                        return <span key={i} className={cn("w-2 h-2 rounded-full", ok ? "bg-emerald-500" : skip ? "bg-muted-foreground/30" : "bg-destructive")} title={item.name} />;
                                    })}
                                </div>
                            )}
                            {preflightLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-2" />}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground" onClick={(e) => { e.stopPropagation(); runPreflight(); }} disabled={preflightLoading}>
                                <RefreshCw className="w-3 h-3" /> Re-check
                            </Button>
                            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", healthExpanded && "rotate-180")} />
                        </div>
                    </div>
                    {healthExpanded && preflight && (
                        <div className="px-5 pb-4 pt-0">
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                                {[...Object.values(preflight.binaries as Record<string, any>), ...Object.values(preflight.providers as Record<string, any>)].map((item: any) => {
                                    const ok = item.available ?? (item.configured && item.reachable);
                                    const skip = item.configured === false;
                                    return (
                                        <div key={item.name} className={cn(
                                            "flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs",
                                            ok ? "border-emerald-500/20 bg-emerald-500/5" : skip ? "border-border/50 bg-muted/20" : "border-destructive/20 bg-destructive/5"
                                        )}>
                                            {ok ? <CircleCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> : skip ? <CircleDashed className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <CircleX className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
                                            <div className="min-w-0">
                                                <div className="font-medium truncate">{item.name}</div>
                                                <div className="text-[10px] text-muted-foreground truncate">{ok ? (item.version || "OK") : skip ? "Not set" : (item.error || "Error")}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </Card>
                </motion.div>

                {/* Destination Folder */}
                <motion.div variants={fadeUp}>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Download className="w-5 h-5 text-primary" />
                            Download Destination
                        </CardTitle>
                        <CardDescription>
                            Where downloaded files are saved.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="destinationFolder">Folder Path</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="destinationFolder"
                                    placeholder="/Users/username/Downloads/videos"
                                    value={settings.destinationFolder}
                                    onChange={(e) => setSettings({ ...settings, destinationFolder: e.target.value })}
                                    className="flex-1"
                                />
                                <Button
                                    variant="outline"
                                    onClick={() => handlePickFolder("destination")}
                                    disabled={pickingFolder === "destination"}
                                    className="flex-shrink-0 gap-2"
                                    title="Browse for folder"
                                >
                                    {pickingFolder === "destination" ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <FolderOpen className="w-4 h-4" />
                                    )}
                                    Browse
                                </Button>
                            </div>
                        </div>
                        <Button onClick={handleSaveDestination} className="w-full">Save Destination</Button>
                    </CardContent>
                </Card>
                </motion.div>

                {/* Watch Folder */}
                <motion.div variants={fadeUp}>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Eye className="w-5 h-5 text-primary" />
                            Watch Folder
                        </CardTitle>
                        <CardDescription>
                            Files dropped here are auto-imported. Keep it separate from your download folder.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="watchFolder">Folder Path</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="watchFolder"
                                    placeholder="/Users/username/Videos/watch"
                                    value={settings.watchFolder}
                                    onChange={(e) => setSettings({ ...settings, watchFolder: e.target.value })}
                                    className="flex-1"
                                />
                                <Button
                                    variant="outline"
                                    onClick={() => handlePickFolder("watch")}
                                    disabled={pickingFolder === "watch"}
                                    className="flex-shrink-0 gap-2"
                                    title="Browse for folder"
                                >
                                    {pickingFolder === "watch" ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <FolderOpen className="w-4 h-4" />
                                    )}
                                    Browse
                                </Button>
                            </div>
                        </div>
                        <Button onClick={handleSaveWatchFolder} className="w-full">Save Watch Folder</Button>
                    </CardContent>
                </Card>
                </motion.div>

                {/* Cloudflare R2 Credentials */}
                <motion.div variants={fadeUp} className="lg:col-span-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Cloudflare R2 / S3 Credentials</CardTitle>
                        <CardDescription>
                            S3-compatible credentials for cloud sync.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="endpoint">Endpoint URL</Label>
                                <Input
                                    id="endpoint"
                                    placeholder="https://<account-id>.r2.cloudflarestorage.com"
                                    value={settings.s3Endpoint}
                                    onChange={(e) => setSettings({ ...settings, s3Endpoint: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bucket">Bucket Name</Label>
                                <Input
                                    id="bucket"
                                    placeholder="my-bucket"
                                    value={settings.s3Bucket}
                                    onChange={(e) => setSettings({ ...settings, s3Bucket: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="region">Region</Label>
                                <Input
                                    id="region"
                                    placeholder="auto"
                                    value={settings.s3Region}
                                    onChange={(e) => setSettings({ ...settings, s3Region: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="accessKey">Access Key ID</Label>
                                <Input
                                    id="accessKey"
                                    type="password"
                                    placeholder="Access Key"
                                    value={settings.s3AccessKey}
                                    onChange={(e) => setSettings({ ...settings, s3AccessKey: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="secretKey">Secret Access Key</Label>
                                <Input
                                    id="secretKey"
                                    type="password"
                                    placeholder="Secret Key"
                                    value={settings.s3SecretKey}
                                    onChange={(e) => setSettings({ ...settings, s3SecretKey: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="urlExpiry" className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                Presigned URL Expiry
                            </Label>
                            <Select
                                value={String(settings.urlExpiry)}
                                onValueChange={(val) => setSettings({ ...settings, urlExpiry: Number(val) })}
                            >
                                <SelectTrigger id="urlExpiry">
                                    <SelectValue>{(v) => EXPIRY_LABELS[String(v)] ?? "7 days (default)"}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="3600">1 hour</SelectItem>
                                    <SelectItem value="21600">6 hours</SelectItem>
                                    <SelectItem value="86400">24 hours</SelectItem>
                                    <SelectItem value="259200">3 days</SelectItem>
                                    <SelectItem value="604800">7 days (default)</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">How long shared links stay valid.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="storageLimit" className="flex items-center gap-2">
                                <Database className="w-3.5 h-3.5 text-muted-foreground" />
                                Storage Limit (GB)
                            </Label>
                            <Input
                                id="storageLimit"
                                type="number"
                                min={1}
                                value={settings.storageLimit}
                                onChange={(e) => setSettings({ ...settings, storageLimit: Number(e.target.value) || 10 })}
                                placeholder="10"
                            />
                            <p className="text-xs text-muted-foreground">Used for usage warnings. R2 free tier is 10 GB.</p>
                        </div>
                        <Button onClick={handleSaveCredentials} className="w-full sm:col-span-2">Save Credentials</Button>
                    </CardContent>
                </Card>
                </motion.div>

                {/* Export & Backup */}
                <motion.div variants={fadeUp}>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <FileDown className="w-5 h-5 text-primary" />
                            Export & Backup
                        </CardTitle>
                        <CardDescription>Export metadata or back up the database.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <Button
                                variant="outline"
                                className="h-auto py-4 flex flex-col items-center gap-2"
                                onClick={() => {
                                    window.location.href = "/api/export?format=json";
                                    toast.success("JSON export started");
                                }}
                            >
                                <FileDown className="w-6 h-6 text-blue-500" />
                                <span className="font-medium">Export JSON</span>
                                <span className="text-[10px] text-muted-foreground">Structured metadata</span>
                            </Button>
                            <Button
                                variant="outline"
                                className="h-auto py-4 flex flex-col items-center gap-2"
                                onClick={() => {
                                    window.location.href = "/api/export?format=csv";
                                    toast.success("CSV export started");
                                }}
                            >
                                <FileDown className="w-6 h-6 text-emerald-500" />
                                <span className="font-medium">Export CSV</span>
                                <span className="text-[10px] text-muted-foreground">Spreadsheet format</span>
                            </Button>
                            <Button
                                variant="outline"
                                className="h-auto py-4 flex flex-col items-center gap-2"
                                onClick={() => {
                                    window.location.href = "/api/export?format=db";
                                    toast.success("Database backup started");
                                }}
                            >
                                <Database className="w-6 h-6 text-amber-500" />
                                <span className="font-medium">Backup DB</span>
                                <span className="text-[10px] text-muted-foreground">Raw SQLite file</span>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
                </motion.div>

                {/* AI Transcription Settings (WID-307) */}
                <motion.div variants={fadeUp}>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <BrainCircuit className="w-5 h-5 text-primary" />
                            AI Transcription
                        </CardTitle>
                        <CardDescription>
                            Speech-to-text via OpenAI or Groq. Keys stay on your machine.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="transcriptionProvider">Provider</Label>
                            <Select
                                value={settings.transcriptionProvider}
                                onValueChange={(value) =>
                                    setSettings({
                                        ...settings,
                                        transcriptionProvider: value as "openai" | "groq",
                                    })
                                }
                            >
                                <SelectTrigger id="transcriptionProvider">
                                    <SelectValue placeholder="Select provider">{(v) => PROVIDER_LABELS[String(v)] ?? "OpenAI"}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="openai">OpenAI</SelectItem>
                                    <SelectItem value="groq">Groq</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="openaiKey" className="flex items-center gap-2">
                                <Mic className="w-3.5 h-3.5 text-muted-foreground" />
                                OpenAI API Key
                            </Label>
                            <Input
                                id="openaiKey"
                                type="password"
                                placeholder="sk-..."
                                value={settings.openaiApiKey}
                                onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">Get a key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">platform.openai.com</a>.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="groqKey" className="flex items-center gap-2">
                                <Mic className="w-3.5 h-3.5 text-muted-foreground" />
                                Groq API Key
                            </Label>
                            <Input
                                id="groqKey"
                                type="password"
                                placeholder="gsk_..."
                                value={settings.groqApiKey}
                                onChange={(e) => setSettings({ ...settings, groqApiKey: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">Get a key at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">console.groq.com</a>.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="whisperLang">Language (optional)</Label>
                            <Input
                                id="whisperLang"
                                placeholder="e.g. en, ar, es (leave blank for auto-detect)"
                                value={settings.whisperLanguage}
                                onChange={(e) => setSettings({ ...settings, whisperLanguage: e.target.value })}
                            />
                        </div>
                        <Button
                            onClick={async () => {
                                try {
                                    const res = await fetch("/api/settings/ai", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            provider: settings.transcriptionProvider,
                                            openaiApiKey: settings.openaiApiKey,
                                            groqApiKey: settings.groqApiKey,
                                            whisperLanguage: settings.whisperLanguage,
                                        }),
                                    });
                                    if (res.ok) toast.success("AI settings saved");
                                    else toast.error("Failed to save AI settings");
                                } catch {
                                    toast.error("Failed to save AI settings");
                                }
                            }}
                            className="w-full"
                        >
                            Save AI Settings
                        </Button>
                    </CardContent>
                </Card>
                </motion.div>

                {/* Quality & Format Profiles (WID-306) */}
                <motion.div variants={fadeUp} className="lg:col-span-2">
                <Card>
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <Settings2 className="w-5 h-5 text-primary" />
                                Quality & Format Profiles
                            </CardTitle>
                            <CardDescription>Presets or your own resolution &amp; format rules.</CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                onClick={async () => {
                                    try {
                                        const res = await fetch("/api/profiles/reset", { method: "POST" });
                                        const data = await res.json();
                                        if (res.ok) {
                                            setProfiles(data.profiles || []);
                                            if (data.added?.length > 0) {
                                                toast.success(`Added ${data.added.length} preset${data.added.length > 1 ? "s" : ""}: ${data.added.join(", ")}`);
                                            } else {
                                                toast.info("All presets are already present");
                                            }
                                        } else {
                                            toast.error(data.error || "Reset failed");
                                        }
                                    } catch { toast.error("Reset failed"); }
                                }}
                            >
                                Reset to Defaults
                            </Button>
                        <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
                            <DialogTrigger render={
                                <Button size="sm" className="gap-2" onClick={() => setEditingProfile({
                                    name: "",
                                    sitePattern: "*",
                                    maxResolution: "best",
                                    preferredFormat: "mp4",
                                    preferredImageFormat: "original",
                                    resolutionMode: "flexible",
                                    autoCloudSync: false,
                                    requireManualFormat: false,
                                    strictResolution: false,
                                    isActive: true,
                                    priority: 0,
                                })}>
                                    <Plus className="w-4 h-4" /> Add Profile
                                </Button>
                            } />
                            <DialogContent className="sm:max-w-[560px]">
                                <DialogHeader>
                                    <DialogTitle>{editingProfile?.id ? 'Edit Profile' : 'New Profile'}</DialogTitle>
                                    <DialogDescription>Apply rules based on the video URL.</DialogDescription>
                                </DialogHeader>
                                <form
                                    id="profile-form"
                                    onSubmit={handleSaveProfile}
                                    className="space-y-3 py-3 max-h-[72vh] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                                >
                                    {/* Basic Info */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="prof-name">Profile Name</Label>
                                            <Input id="prof-name" value={editingProfile?.name || ""} onChange={e => setEditingProfile({...editingProfile, name: e.target.value})} placeholder="e.g. YouTube 4K" required />
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="prof-site">Site Pattern</Label>
                                            <Input id="prof-site" value={editingProfile?.sitePattern || ""} onChange={e => setEditingProfile({...editingProfile, sitePattern: e.target.value})} placeholder="youtube.com or *" />
                                            <p className="text-[11px] text-muted-foreground">Use <code>*</code> to match any site, or e.g. <code>youtube.com</code></p>
                                        </div>
                                    </div>

                                    {/* VIDEO section */}
                                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Film className="w-3.5 h-3.5 text-primary" />
                                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Video</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                                            <div className="grid gap-1.5">
                                                <Label>Target Resolution</Label>
                                                <Select
                                                    value={editingProfile?.maxResolution || "best"}
                                                    onValueChange={v => setEditingProfile((p: any) => ({
                                                        ...p,
                                                        maxResolution: v,
                                                        resolutionMode: v === "best" ? "flexible" : (p?.resolutionMode || "flexible"),
                                                    }))}
                                                >
                                                    <SelectTrigger className="w-full"><SelectValue>{(v) => RESOLUTION_LABELS[String(v)] ?? "Best Available"}</SelectValue></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="best">Best Available</SelectItem>
                                                        <SelectItem value="2160">4K (2160p)</SelectItem>
                                                        <SelectItem value="1440">2K (1440p)</SelectItem>
                                                        <SelectItem value="1080">1080p</SelectItem>
                                                        <SelectItem value="720">720p</SelectItem>
                                                        <SelectItem value="480">480p</SelectItem>
                                                        <SelectItem value="360">360p</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className={cn("grid gap-1.5", (editingProfile?.maxResolution === "best" || editingProfile?.preferredFormat === "mp3" || editingProfile?.preferredFormat === "m4a") && "opacity-40 pointer-events-none")}>
                                                <Label>Resolution Mode</Label>
                                                <Select
                                                    value={editingProfile?.resolutionMode || "flexible"}
                                                    onValueChange={v => setEditingProfile((p: any) => ({ ...p, resolutionMode: v, strictResolution: v === "strict" }))}
                                                    disabled={editingProfile?.maxResolution === "best" || editingProfile?.preferredFormat === "mp3" || editingProfile?.preferredFormat === "m4a"}
                                                >
                                                    <SelectTrigger className="w-full"><SelectValue>{(v) => RESOLUTION_MODE_LABELS[String(v)] ?? "Flexible (≤ target)"}</SelectValue></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="flexible">Flexible (≤ target)</SelectItem>
                                                        <SelectItem value="strict">Strict (= target)</SelectItem>
                                                        <SelectItem value="minimum">Minimum (≥ target)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {(editingProfile?.resolutionMode || "flexible") === "flexible" && "Best quality up to the target."}
                                                    {editingProfile?.resolutionMode === "strict" && "Only downloads if exact resolution is available."}
                                                    {editingProfile?.resolutionMode === "minimum" && "Best quality at or above the target."}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label>Download Format</Label>
                                            <Select
                                                value={editingProfile?.preferredFormat || "mp4"}
                                                onValueChange={v => setEditingProfile((p: any) => ({
                                                    ...p,
                                                    preferredFormat: v,
                                                    resolutionMode: (v === "mp3" || v === "m4a") ? "flexible" : (p?.resolutionMode || "flexible"),
                                                    maxResolution: (v === "mp3" || v === "m4a") ? "best" : (p?.maxResolution || "best"),
                                                }))}
                                            >
                                                <SelectTrigger className="w-full"><SelectValue>{(v) => FORMAT_LABELS[String(v)] ?? "MP4 (Recommended)"}</SelectValue></SelectTrigger>
                                                <SelectContent>
                                                    <SelectGroup>
                                                        <SelectLabel>Video</SelectLabel>
                                                        <SelectItem value="mp4">MP4 (Recommended)</SelectItem>
                                                        <SelectItem value="mkv">MKV (lossless container)</SelectItem>
                                                        <SelectItem value="webm">WebM</SelectItem>
                                                        <SelectItem value="best">Best (let yt-dlp decide)</SelectItem>
                                                    </SelectGroup>
                                                    <SelectGroup>
                                                        <SelectLabel>Audio Only</SelectLabel>
                                                        <SelectItem value="mp3">MP3 (extract audio)</SelectItem>
                                                        <SelectItem value="m4a">M4A (AAC audio)</SelectItem>
                                                        <SelectItem value="wav">WAV (lossless audio)</SelectItem>
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                            {(editingProfile?.preferredFormat === "mp3" || editingProfile?.preferredFormat === "m4a") && (
                                                <p className="text-[11px] text-amber-600 dark:text-amber-400">Audio-only: resolution settings are ignored.</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* IMAGE section */}
                                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <ImageIcon className="w-3.5 h-3.5 text-primary" />
                                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Image</span>
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label>Output Format</Label>
                                            <Select
                                                value={editingProfile?.preferredImageFormat || "original"}
                                                onValueChange={v => setEditingProfile((p: any) => ({...p, preferredImageFormat: v}))}
                                            >
                                                <SelectTrigger className="w-full"><SelectValue>{(v) => IMAGE_FORMAT_LABELS[String(v)] ?? "Original (keep as-is)"}</SelectValue></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="original">Original (keep as-is)</SelectItem>
                                                    <SelectItem value="jpg">JPG (smaller, lossy)</SelectItem>
                                                    <SelectItem value="png">PNG (lossless)</SelectItem>
                                                    <SelectItem value="webp">WebP (modern, efficient)</SelectItem>
                                                    <SelectItem value="avif">AVIF (next-gen compression)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-[11px] text-muted-foreground">Applies to image posts only.</p>
                                        </div>
                                    </div>

                                    {/* AUDIO section */}
                                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Music className="w-3.5 h-3.5 text-primary" />
                                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Audio</span>
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label>Bitrate</Label>
                                            <Select
                                                value={editingProfile?.audioBitrate || "192k"}
                                                onValueChange={v => setEditingProfile((p: any) => ({ ...p, audioBitrate: v }))}
                                            >
                                                <SelectTrigger className="w-full"><SelectValue>{(v) => `${String(v).replace("k", "")} kbps`}</SelectValue></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="128k">128 kbps</SelectItem>
                                                    <SelectItem value="192k">192 kbps</SelectItem>
                                                    <SelectItem value="256k">256 kbps</SelectItem>
                                                    <SelectItem value="320k">320 kbps</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-[11px] text-muted-foreground">Used when the download format is MP3 or M4A. WAV is lossless.</p>
                                        </div>
                                    </div>

                                    {/* BEHAVIOUR section */}
                                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Settings2 className="w-3.5 h-3.5 text-primary" />
                                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Behaviour</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <label htmlFor="prof-default" className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 cursor-pointer transition-colors">
                                                <Checkbox
                                                    id="prof-default"
                                                    checked={editingProfile?.priority === -1 || !!editingProfile?.isDefault}
                                                    onCheckedChange={(checked) => setEditingProfile({ ...editingProfile, isDefault: !!checked, priority: checked ? -1 : 0 })}
                                                />
                                                <div>
                                                    <span className="text-sm font-medium">Default profile</span>
                                                    <p className="text-[10px] text-muted-foreground">Used when no site pattern matches</p>
                                                </div>
                                            </label>

                                            <label htmlFor="prof-manual" className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 cursor-pointer transition-colors">
                                                <Checkbox
                                                    id="prof-manual"
                                                    checked={!!editingProfile?.requireManualFormat}
                                                    onCheckedChange={(checked) => setEditingProfile({ ...editingProfile, requireManualFormat: !!checked })}
                                                />
                                                <div>
                                                    <span className="text-sm font-medium">Manual format select</span>
                                                    <p className="text-[10px] text-muted-foreground">Always prompt before downloading</p>
                                                </div>
                                            </label>

                                            <label
                                                htmlFor="prof-strict"
                                                className={cn(
                                                    "flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 cursor-pointer transition-colors",
                                                    (editingProfile?.maxResolution === "best" || editingProfile?.preferredFormat === "mp3") && "cursor-not-allowed [&>*]:opacity-50"
                                                )}
                                            >
                                                <Checkbox
                                                    id="prof-strict"
                                                    checked={!!editingProfile?.strictResolution}
                                                    onCheckedChange={(checked) => setEditingProfile({ ...editingProfile, strictResolution: !!checked })}
                                                    disabled={editingProfile?.maxResolution === "best" || editingProfile?.preferredFormat === "mp3"}
                                                />
                                                <div>
                                                    <span className="text-sm font-medium">Strict resolution</span>
                                                    <p className="text-[10px] text-muted-foreground">Fail if exact resolution unavailable</p>
                                                </div>
                                            </label>

                                            <label htmlFor="prof-sync" className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 cursor-pointer transition-colors">
                                                <Checkbox
                                                    id="prof-sync"
                                                    checked={!!editingProfile?.autoCloudSync}
                                                    onCheckedChange={(checked) => setEditingProfile({...editingProfile, autoCloudSync: !!checked})}
                                                />
                                                <div>
                                                    <span className="text-sm font-medium">Auto-sync to Cloud</span>
                                                    <p className="text-[10px] text-muted-foreground">Upload automatically after download</p>
                                                </div>
                                            </label>
                                        </div>
                                    </div>

                                </form>
                                <DialogFooter className="gap-2">
                                    <button type="button" onClick={() => setIsProfileDialogOpen(false)} className={cn(buttonVariants({ variant: "outline" }))}>
                                        Cancel
                                    </button>
                                    {/* Native submit button — base-ui Button primitive ignores type="submit"; `form` ties it to the form it now lives outside of. */}
                                    <button type="submit" form="profile-form" className={cn(buttonVariants({ variant: "default" }))}>
                                        Save Profile
                                    </button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                            {profiles.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground text-sm">No profiles yet. Use &quot;Reset to Defaults&quot; or &quot;Add Profile&quot;.</div>
                            ) : (
                                profiles.map((profile) => (
                                    <div key={profile.id} className="p-4 flex items-center justify-between group">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium">{profile.name}</span>
                                                {profile.priority === -1 && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">Default</span>}
                                                {!profile.isActive && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">Inactive</span>}
                                                {profile.requireManualFormat && <span className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">Manual</span>}
                                                {(profile.resolutionMode === 'strict' || (!profile.resolutionMode && profile.strictResolution)) && (
                                                    <span className="text-[10px] bg-purple-500/20 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded font-medium">Strict</span>
                                                )}
                                                {profile.resolutionMode === 'minimum' && (
                                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium">Minimum</span>
                                                )}
                                                {profile.autoCloudSync && <CloudSync className="w-3.5 h-3.5 text-blue-500" />}
                                            </div>
                                            <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                                                <span>Pattern: <code className="bg-muted px-1 rounded">{profile.sitePattern || '*'}</code></span>
                                                <span>Quality: {(() => {
                                                    if (profile.maxResolution === 'best') return 'Best';
                                                    const mode = profile.resolutionMode || (profile.strictResolution ? 'strict' : 'flexible');
                                                    const op = mode === 'strict' ? '=' : mode === 'minimum' ? '≥' : '≤';
                                                    return `${op}${profile.maxResolution}p`;
                                                })()}</span>
                                                <span>Video: <strong>{profile.preferredFormat?.toUpperCase()}</strong></span>
                                                {profile.preferredImageFormat && profile.preferredImageFormat !== 'original' && (
                                                    <span>Image: <strong>{profile.preferredImageFormat.toUpperCase()}</strong></span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingProfile(profile); setIsProfileDialogOpen(true); }}>
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteProfile(profile.id)}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
                </motion.div>

                {/* Auto Cloud-Sync by Label (WID-306) */}
                <motion.div variants={fadeUp} className="lg:col-span-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Tags className="w-5 h-5 text-primary" />
                            Auto-sync by Category
                        </CardTitle>
                        <CardDescription>Auto-upload videos in these categories to the cloud.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {labels.map(label => (
                                <div 
                                    key={label.id} 
                                    className={`p-3 rounded-xl border transition-all flex flex-col gap-3 ${label.autoCloudSync ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800' : 'bg-muted/30 border-border/60'}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">{label.name}</span>
                                        <div
                                            className={cn("w-2 h-2 rounded-full", label.color && !label.color.startsWith('#') ? label.color : "")}
                                            style={
                                                label.color?.startsWith('#')
                                                    ? { backgroundColor: label.color }
                                                    : !label.color
                                                        ? { backgroundColor: "#9ca3af" }
                                                        : undefined
                                            }
                                        />
                                    </div>
                                    <div className="flex items-center justify-between mt-auto">
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                            {label.autoCloudSync ? <CloudSync className="w-3 h-3 text-blue-500" /> : <ShieldCheck className="w-3 h-3" />}
                                            {label.autoCloudSync ? 'Auto-syncing' : 'Local only'}
                                        </span>
                                        <Switch
                                            checked={!!label.autoCloudSync}
                                            onCheckedChange={() => handleToggleLabelSync(label)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                        {labels.length === 0 && (
                            <div className="p-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">No labels yet — they appear as you download.</div>
                        )}
                    </CardContent>
                </Card>
                </motion.div>

                {/* Browser Integration (WID-300) */}
                <motion.div variants={fadeUp} className="lg:col-span-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Plus className="w-5 h-5 text-primary" />
                            Browser Integrations
                        </CardTitle>
                        <CardDescription>Send videos directly to SnapDown while browsing.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/* Bookmarklet */}
                            <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-border/60">
                                <h3 className="font-semibold text-lg">1. Universal Bookmarklet</h3>
                                <p className="text-sm text-muted-foreground">Drag to your bookmarks bar, then click it on any video page. Works on desktop & mobile.</p>
                                
                                <div className="flex items-center justify-center p-6 border border-dashed border-border/50 rounded-lg bg-card/30">
                                    <div 
                                        dangerouslySetInnerHTML={{ 
                                            __html: `<a href="javascript:(function(){window.open('${baseUrl}/?url='+encodeURIComponent(window.location.href),'_blank');})();" class="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground h-8 px-2.5 text-sm font-medium shadow-lg hover:scale-105 transition-transform cursor-move" onclick="event.preventDefault()">⬇️ Send to SnapDown</a>` 
                                        }} 
                                    />
                                </div>
                            </div>

                            {/* Chrome Extension */}
                            <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-border/60">
                                <h3 className="font-semibold text-lg">2. Chrome/Edge Extension</h3>
                                <p className="text-sm text-muted-foreground">Downloads without opening new tabs.</p>
                                <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-2">
                                    <li>Go to <strong>chrome://extensions</strong> and enable <strong>Developer Mode</strong>.</li>
                                    <li>Click <strong>Load unpacked</strong> and select the <code>extension/</code> folder.</li>
                                    <li>Click the extension icon on any video page.</li>
                                </ol>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                </motion.div>
            </motion.div>
        </div>
    );
}
