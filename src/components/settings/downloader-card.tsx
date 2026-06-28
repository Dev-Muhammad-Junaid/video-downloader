"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cookie } from "lucide-react";

const BROWSER_LABELS: Record<string, string> = {
    "": "Off (no cookies)",
    chrome: "Chrome",
    safari: "Safari",
    firefox: "Firefox",
    edge: "Edge",
    brave: "Brave",
};

interface DownloaderCardProps {
    ytCookiesBrowser: string;
    setYtCookiesBrowser: (v: string) => void;
    onSave: () => void;
}

export function DownloaderCard({ ytCookiesBrowser, setYtCookiesBrowser, onSave }: DownloaderCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                    <Cookie className="w-5 h-5 text-primary" />
                    Downloader Cookies
                </CardTitle>
                <CardDescription>
                    Some sites (e.g. YouTube) now require a signed-in session to download or
                    to offer resolutions above 360p. Pick the browser you&rsquo;re logged into
                    and yt-dlp will use its cookies.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="ytCookiesBrowser">Read cookies from</Label>
                    <Select
                        value={ytCookiesBrowser || "off"}
                        onValueChange={(v) => setYtCookiesBrowser(v === "off" ? "" : (v ?? ""))}
                    >
                        <SelectTrigger id="ytCookiesBrowser">
                            <SelectValue>{(v) => BROWSER_LABELS[v === "off" ? "" : String(v)] ?? "Off (no cookies)"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="off">Off (no cookies)</SelectItem>
                            <SelectItem value="chrome">Chrome</SelectItem>
                            <SelectItem value="safari">Safari</SelectItem>
                            <SelectItem value="firefox">Firefox</SelectItem>
                            <SelectItem value="edge">Edge</SelectItem>
                            <SelectItem value="brave">Brave</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        The browser must be installed on this machine and logged into the site.
                        Cookies are read locally by yt-dlp and never leave your computer.
                    </p>
                </div>
                <Button onClick={onSave} className="w-full">Save Downloader Settings</Button>
            </CardContent>
        </Card>
    );
}
