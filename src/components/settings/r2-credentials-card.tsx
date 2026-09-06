"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Database } from "lucide-react";
import type { SettingsState, SetSettings } from "./types";

const EXPIRY_LABELS: Record<string, string> = {
    "3600": "1 hour",
    "21600": "6 hours",
    "86400": "24 hours",
    "259200": "3 days",
    "604800": "7 days (default)",
};

interface R2CredentialsCardProps {
    settings: SettingsState;
    setSettings: SetSettings;
    onSave: () => void;
}

export function R2CredentialsCard({ settings, setSettings, onSave }: R2CredentialsCardProps) {
    return (
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
                <Button onClick={onSave} className="w-full sm:col-span-2">Save</Button>
            </CardContent>
        </Card>
    );
}
