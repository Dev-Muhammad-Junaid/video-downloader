"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, Loader2, Download, Eye, Clock } from "lucide-react";

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        s3Endpoint: "",
        s3Bucket: "",
        s3AccessKey: "",
        s3SecretKey: "",
        s3Region: "auto",
        watchFolder: "",
        destinationFolder: "",
        urlExpiry: 604800,
    });
    const [pickingFolder, setPickingFolder] = useState<"watch" | "destination" | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem("r2_credentials");
        const folder = localStorage.getItem("watch_folder") || "";

        if (saved) {
            const parsed = JSON.parse(saved);
            setSettings(s => ({ ...s, ...parsed, watchFolder: folder, urlExpiry: parsed.urlExpiry || 604800 }));
        } else {
            setSettings(s => ({ ...s, watchFolder: folder }));
        }

        // Fetch the current download destination from the server
        fetch("/api/settings/destination")
            .then(res => res.json())
            .then(data => {
                if (data.path) {
                    setSettings(s => ({ ...s, destinationFolder: data.path }));
                }
            })
            .catch(console.error);
    }, []);

    const handleSaveCredentials = () => {
        localStorage.setItem("r2_credentials", JSON.stringify({
            s3Endpoint: settings.s3Endpoint,
            s3Bucket: settings.s3Bucket,
            s3AccessKey: settings.s3AccessKey,
            s3SecretKey: settings.s3SecretKey,
            s3Region: settings.s3Region,
            urlExpiry: settings.urlExpiry,
        }));
        toast.success("Credentials saved");
    };

    const handleSaveWatchFolder = () => {
        localStorage.setItem("watch_folder", settings.watchFolder);
        toast.success("Watch folder saved");
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
                        <Button onClick={handleSaveCredentials} className="w-full sm:col-span-2">Save Credentials</Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
