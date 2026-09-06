"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Cookie, Info } from "lucide-react";

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
                    <Tooltip>
                        <TooltipTrigger className="text-muted-foreground hover:text-foreground cursor-help">
                            <Info className="w-4 h-4" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[260px]">
                            Some sites (e.g. YouTube) now require a signed-in session to download
                            or to offer resolutions above 360p. Pick a browser you&rsquo;re logged
                            into — it must be installed on this machine. Cookies are read locally
                            by yt-dlp and never leave your computer.
                        </TooltipContent>
                    </Tooltip>
                </CardTitle>
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
                </div>
                <Button onClick={onSave} className="w-full">Save Downloader Settings</Button>
            </CardContent>
        </Card>
    );
}
