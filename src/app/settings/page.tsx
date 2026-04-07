"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, Loader2, Download, Eye, Clock, FileDown, Database, BrainCircuit, Mic, Plus, Trash2, Edit2, Settings2, CloudSync, Tags, Check, X, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
        openaiApiKey: "",
        whisperLanguage: "",
    });
    const [pickingFolder, setPickingFolder] = useState<"watch" | "destination" | null>(null);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [labels, setLabels] = useState<any[]>([]);
    const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [baseUrl, setBaseUrl] = useState('');

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
                openaiApiKey: r2Data?.s3Endpoint ? (aiData.hasKey ? aiData.openaiApiKey : "") : "",
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
        const method = editingProfile?.id ? "PATCH" : "POST";
        const url = editingProfile?.id ? `/api/profiles/${editingProfile.id}` : "/api/profiles";
        
        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editingProfile),
            });
            if (res.ok) {
                const updated = await res.json();
                if (method === "POST") setProfiles([...profiles, updated]);
                else setProfiles(profiles.map(p => p.id === updated.id ? updated : p));
                setIsProfileDialogOpen(false);
                toast.success("Profile saved");
            }
        } catch {
            toast.error("Failed to save profile");
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

    return (
        <div className="flex-1 p-8 space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Destination Folder */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Download className="w-5 h-5 text-primary" />
                            Download Destination
                        </CardTitle>
                        <CardDescription>
                            Where downloaded videos and images are saved on your computer.
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

                {/* Watch Folder */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Eye className="w-5 h-5 text-primary" />
                            Watch Folder
                        </CardTitle>
                        <CardDescription>
                            Drop media files here to auto-import them into your library. This should be a separate folder from the download destination.
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

                {/* Cloudflare R2 Credentials */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Cloudflare R2 / S3 Credentials</CardTitle>
                        <CardDescription>
                            Enter your S3-compatible cloud storage credentials to enable direct cloud syncing.
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
                            <select
                                id="urlExpiry"
                                value={settings.urlExpiry}
                                onChange={(e) => setSettings({ ...settings, urlExpiry: Number(e.target.value) })}
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                <option value={3600}>1 hour</option>
                                <option value={21600}>6 hours</option>
                                <option value={86400}>24 hours</option>
                                <option value={259200}>3 days</option>
                                <option value={604800}>7 days (default)</option>
                            </select>
                            <p className="text-xs text-muted-foreground">How long preview and download links stay valid before expiring.</p>
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
                            <p className="text-xs text-muted-foreground">R2 storage quota in GB (free tier: 10 GB). Used to display usage warnings.</p>
                        </div>
                        <Button onClick={handleSaveCredentials} className="w-full sm:col-span-2">Save Credentials</Button>
                    </CardContent>
                </Card>

                {/* Export & Backup */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <FileDown className="w-5 h-5 text-primary" />
                            Export & Backup
                        </CardTitle>
                        <CardDescription>Export your library metadata or backup the entire database.</CardDescription>
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
                        <p className="text-xs text-muted-foreground">JSON and CSV export library metadata. Database backup includes raw SQLite for full restoration.</p>
                    </CardContent>
                </Card>

                {/* AI Transcription Settings (WID-307) */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <BrainCircuit className="w-5 h-5 text-primary" />
                            AI Transcription
                        </CardTitle>
                        <CardDescription>
                            Powered by OpenAI Whisper. Your API key is stored locally and never shared.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
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
                            <p className="text-xs text-muted-foreground">Required for AI transcription. Get it at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">platform.openai.com</a>.</p>
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
                                        body: JSON.stringify({ openaiApiKey: settings.openaiApiKey, whisperLanguage: settings.whisperLanguage }),
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

                {/* Quality & Format Profiles (WID-306) */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <Settings2 className="w-5 h-5 text-primary" />
                                Quality & Format Profiles
                            </CardTitle>
                            <CardDescription>Define site-specific resolution and format rules.</CardDescription>
                        </div>
                        <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
                            <DialogTrigger render={
                                <Button size="sm" className="gap-2" onClick={() => setEditingProfile({ name: "", sitePattern: "*", maxResolution: "best", preferredFormat: "mp4", autoCloudSync: false, priority: 0 })}>
                                    <Plus className="w-4 h-4" /> Add Profile
                                </Button>
                            } />
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>{editingProfile?.id ? 'Edit Profile' : 'New Profile'}</DialogTitle>
                                    <DialogDescription>Apply rules based on the video URL.</DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleSaveProfile} className="space-y-4 py-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="prof-name">Profile Name</Label>
                                        <Input id="prof-name" value={editingProfile?.name || ""} onChange={e => setEditingProfile({...editingProfile, name: e.target.value})} placeholder="e.g. YouTube 4K" required />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="prof-site">Site Pattern (URL includes)</Label>
                                        <Input id="prof-site" value={editingProfile?.sitePattern || ""} onChange={e => setEditingProfile({...editingProfile, sitePattern: e.target.value})} placeholder="youtube.com (or * for all)" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="grid gap-2">
                                            <Label>Max Resolution</Label>
                                            <Select value={editingProfile?.maxResolution || "best"} onValueChange={v => setEditingProfile({...editingProfile, maxResolution: v})}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="best">Best Available</SelectItem>
                                                    <SelectItem value="2160">4K (2160p)</SelectItem>
                                                    <SelectItem value="1440">2K (1440p)</SelectItem>
                                                    <SelectItem value="1080">1080p</SelectItem>
                                                    <SelectItem value="720">720p</SelectItem>
                                                    <SelectItem value="480">480p</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Format</Label>
                                            <Select value={editingProfile?.preferredFormat || "mp4"} onValueChange={v => setEditingProfile({...editingProfile, preferredFormat: v})}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="mp4">MP4 (Recommended)</SelectItem>
                                                    <SelectItem value="mkv">MKV</SelectItem>
                                                    <SelectItem value="webm">WebM</SelectItem>
                                                    <SelectItem value="mp3">MP3 (Audio Only)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2 pt-2">
                                        <input 
                                            type="checkbox" 
                                            id="prof-sync" 
                                            checked={!!editingProfile?.autoCloudSync} 
                                            onChange={e => setEditingProfile({...editingProfile, autoCloudSync: e.target.checked})}
                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <Label htmlFor="prof-sync" className="cursor-pointer">Auto-sync to Cloud after download</Label>
                                    </div>
                                    <DialogFooter>
                                        <Button type="submit">Save Profile</Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                            {profiles.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground text-sm">No profiles defined. The system will use defaults.</div>
                            ) : (
                                profiles.map((profile) => (
                                    <div key={profile.id} className="p-4 flex items-center justify-between group">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{profile.name}</span>
                                                {profile.priority === -1 && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Default</span>}
                                                {profile.autoCloudSync && <CloudSync className="w-3.5 h-3.5 text-blue-500" />}
                                            </div>
                                            <div className="text-xs text-muted-foreground flex gap-3">
                                                <span>Pattern: <code className="bg-muted px-1 rounded">{profile.sitePattern}</code></span>
                                                <span>Quality: {profile.maxResolution === 'best' ? 'Best' : profile.maxResolution + 'p'}</span>
                                                <span>Format: {profile.preferredFormat?.toUpperCase()}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingProfile(profile); setIsProfileDialogOpen(true); }}>
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </Button>
                                            {profile.priority !== -1 && (
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteProfile(profile.id)}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Auto Cloud-Sync by Label (WID-306) */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Tags className="w-5 h-5 text-primary" />
                            Auto-sync by Category
                        </CardTitle>
                        <CardDescription>Automatically upload videos the cloud if they match these categories.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {labels.map(label => (
                                <div 
                                    key={label.id} 
                                    className={`p-3 rounded-xl border transition-all flex flex-col gap-3 ${label.autoCloudSync ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800' : 'bg-background/40 border-border/50'}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">{label.name}</span>
                                        <div 
                                            className={`w-2 h-2 rounded-full ${label.color || 'bg-gray-400'}`} 
                                            style={label.color?.startsWith('#') ? {backgroundColor: label.color} : {}}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between mt-auto">
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                            {label.autoCloudSync ? <CloudSync className="w-3 h-3 text-blue-500" /> : <ShieldCheck className="w-3 h-3" />}
                                            {label.autoCloudSync ? 'Auto-syncing' : 'Local only'}
                                        </span>
                                        <button
                                            onClick={() => handleToggleLabelSync(label)}
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${label.autoCloudSync ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-800'}`}
                                        >
                                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${label.autoCloudSync ? 'translate-x-5' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {labels.length === 0 && (
                            <div className="p-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">No labels found. They will appear here once you start downloading content.</div>
                        )}
                    </CardContent>
                </Card>

                {/* Browser Integration (WID-300) */}
                <Card className="bg-background/60 backdrop-blur-xl border-border/50 shadow-lg lg:col-span-2">
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
                            <div className="space-y-4 p-4 rounded-xl bg-background/40 border border-border/50">
                                <h3 className="font-semibold text-lg">1. Universal Bookmarklet</h3>
                                <p className="text-sm text-muted-foreground">Works on Desktop & Mobile (Safari/Chrome). Drag this button into your browser's bookmarks bar. Click it when watching a video to send it here!</p>
                                
                                <div className="flex items-center justify-center p-6 border border-dashed border-border/50 rounded-lg bg-card/30">
                                    <div 
                                        dangerouslySetInnerHTML={{ 
                                            __html: `<a href="javascript:(function(){window.open('${baseUrl}/?url='+encodeURIComponent(window.location.href),'_blank');})();" class="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground h-8 px-2.5 text-sm font-medium shadow-lg hover:scale-105 transition-transform cursor-move" onclick="event.preventDefault()">⬇️ Send to SnapDown</a>` 
                                        }} 
                                    />
                                </div>
                            </div>

                            {/* Chrome Extension */}
                            <div className="space-y-4 p-4 rounded-xl bg-background/40 border border-border/50">
                                <h3 className="font-semibold text-lg">2. Chrome/Edge Extension</h3>
                                <p className="text-sm text-muted-foreground">For desktop power users. Downloads without opening new tabs.</p>
                                <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-2">
                                    <li>Open your Chrome settings and go to <strong>chrome://extensions</strong></li>
                                    <li>Enable <strong>Developer Mode</strong> in the top right.</li>
                                    <li>Click <strong>Load unpacked</strong> and select the <code>extension/</code> folder inside this repository.</li>
                                    <li>Click the extension icon on any video page!</li>
                                </ol>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
