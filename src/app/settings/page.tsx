"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        s3Endpoint: "",
        s3Bucket: "",
        s3AccessKey: "",
        s3SecretKey: "",
        s3Region: "auto",
        watchFolder: "",
    });

    useEffect(() => {
        const saved = localStorage.getItem("r2_credentials");
        const folder = localStorage.getItem("watch_folder") || "";

        if (saved) {
            setSettings({ ...JSON.parse(saved), watchFolder: folder });
        } else {
            setSettings(s => ({ ...s, watchFolder: folder }));
        }
    }, []);

    const handleSave = () => {
        localStorage.setItem("r2_credentials", JSON.stringify({
            s3Endpoint: settings.s3Endpoint,
            s3Bucket: settings.s3Bucket,
            s3AccessKey: settings.s3AccessKey,
            s3SecretKey: settings.s3SecretKey,
            s3Region: settings.s3Region
        }));
        localStorage.setItem("watch_folder", settings.watchFolder);
        toast.success("Settings saved");
    };

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

            <Card>
                <CardHeader>
                    <CardTitle>Local Watch Folder</CardTitle>
                    <CardDescription>
                        Set an absolute path on your computer. When you open the Library, it will automatically sync new video files dropped into this folder.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="watchFolder">Absolute Folder Path</Label>
                        <Input
                            id="watchFolder"
                            placeholder="/Users/username/Downloads/social-media"
                            value={settings.watchFolder}
                            onChange={(e) => setSettings({ ...settings, watchFolder: e.target.value })}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Cloudflare R2 / S3 Credentials</CardTitle>
                    <CardDescription>
                        Enter your S3-compatible cloud storage credentials to enable direct cloud syncing.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
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
                    <Button onClick={handleSave} className="mt-4">Save Credentials</Button>
                </CardContent>
            </Card>
        </div>
    );
}
