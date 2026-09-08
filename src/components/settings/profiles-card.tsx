"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Edit2, Settings2, CloudSync, Film, ImageIcon, Music } from "lucide-react";

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

interface ProfilesCardProps {
    profiles: any[];
    editingProfile: any;
    setEditingProfile: (p: any) => void;
    isProfileDialogOpen: boolean;
    setIsProfileDialogOpen: (b: boolean) => void;
    onSaveProfile: (e: React.FormEvent) => void;
    onDeleteProfile: (id: string) => void;
    onReset: () => void;
}

export function ProfilesCard({
    profiles, editingProfile, setEditingProfile, isProfileDialogOpen, setIsProfileDialogOpen, onSaveProfile, onDeleteProfile, onReset,
}: ProfilesCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
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
                        onClick={onReset}
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
                            audioFormat: "mp3",
                            audioBitrate: "192k",
                            extractAudio: false,
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
                            onSubmit={onSaveProfile}
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
                                    <div className={cn("grid gap-1.5", (editingProfile?.maxResolution === "best") && "opacity-40 pointer-events-none")}>
                                        <Label>Resolution Mode</Label>
                                        <Select
                                            value={editingProfile?.resolutionMode || "flexible"}
                                            onValueChange={v => setEditingProfile((p: any) => ({ ...p, resolutionMode: v, strictResolution: v === "strict" }))}
                                            disabled={editingProfile?.maxResolution === "best"}
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
                                    <Label>Video Format</Label>
                                    <Select
                                        value={editingProfile?.preferredFormat || "mp4"}
                                        onValueChange={v => setEditingProfile((p: any) => ({ ...p, preferredFormat: v }))}
                                    >
                                        <SelectTrigger className="w-full"><SelectValue>{(v) => FORMAT_LABELS[String(v)] ?? "MP4 (Recommended)"}</SelectValue></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="mp4">MP4 (Recommended)</SelectItem>
                                            <SelectItem value="mkv">MKV (lossless container)</SelectItem>
                                            <SelectItem value="webm">WebM</SelectItem>
                                            <SelectItem value="best">Best (let yt-dlp decide)</SelectItem>
                                        </SelectContent>
                                    </Select>
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                                    <div className="grid gap-1.5">
                                        <Label>Audio Format</Label>
                                        <Select
                                            value={editingProfile?.audioFormat || "mp3"}
                                            onValueChange={v => setEditingProfile((p: any) => ({ ...p, audioFormat: v }))}
                                        >
                                            <SelectTrigger className="w-full"><SelectValue>{(v) => ({ mp3: "MP3", m4a: "M4A (AAC)", wav: "WAV (lossless)" }[String(v)] ?? "MP3")}</SelectValue></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="mp3">MP3</SelectItem>
                                                <SelectItem value="m4a">M4A (AAC)</SelectItem>
                                                <SelectItem value="wav">WAV (lossless)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className={cn("grid gap-1.5", editingProfile?.audioFormat === "wav" && "opacity-40 pointer-events-none")}>
                                        <Label>Bitrate</Label>
                                        <Select
                                            value={editingProfile?.audioBitrate || "192k"}
                                            onValueChange={v => setEditingProfile((p: any) => ({ ...p, audioBitrate: v }))}
                                            disabled={editingProfile?.audioFormat === "wav"}
                                        >
                                            <SelectTrigger className="w-full"><SelectValue>{(v) => `${String(v).replace("k", "")} kbps`}</SelectValue></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="128k">128 kbps</SelectItem>
                                                <SelectItem value="192k">192 kbps</SelectItem>
                                                <SelectItem value="256k">256 kbps</SelectItem>
                                                <SelectItem value="320k">320 kbps</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <label htmlFor="prof-extract-audio" className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 cursor-pointer transition-colors">
                                    <Checkbox
                                        id="prof-extract-audio"
                                        checked={!!editingProfile?.extractAudio}
                                        onCheckedChange={(checked) => setEditingProfile({ ...editingProfile, extractAudio: !!checked })}
                                    />
                                    <div>
                                        <span className="text-sm font-medium">Extract audio from videos</span>
                                        <p className="text-[10px] text-muted-foreground">Always download audio only, even from video links</p>
                                    </div>
                                </label>
                                <p className="text-[11px] text-muted-foreground">Used for audio links (and videos when extract is on). WAV is lossless.</p>
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
                                            (editingProfile?.maxResolution === "best") && "cursor-not-allowed [&>*]:opacity-50"
                                        )}
                                    >
                                        <Checkbox
                                            id="prof-strict"
                                            checked={!!editingProfile?.strictResolution}
                                            onCheckedChange={(checked) => setEditingProfile({ ...editingProfile, strictResolution: !!checked })}
                                            disabled={editingProfile?.maxResolution === "best"}
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
                                Save
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
                                        {profile.extractAudio && <span className="text-[10px] bg-sky-500/20 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded font-medium">Audio Only</span>}
                                        {profile.autoCloudSync && <CloudSync className="w-3.5 h-3.5 text-blue-500" />}
                                    </div>
                                    <div className="text-xs text-muted-foreground flex gap-x-3 gap-y-1 flex-wrap items-center">
                                        <span>Pattern: <code className="bg-muted px-1 rounded">{profile.sitePattern || '*'}</code></span>
                                        {profile.extractAudio ? (
                                            <span className="inline-flex items-center gap-1"><Film className="w-3 h-3 opacity-60" /> Audio only</span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1">
                                                <Film className="w-3 h-3 opacity-60" />
                                                {(() => {
                                                    if (profile.maxResolution === 'best') return 'Best';
                                                    const mode = profile.resolutionMode || (profile.strictResolution ? 'strict' : 'flexible');
                                                    const op = mode === 'strict' ? '=' : mode === 'minimum' ? '≥' : '≤';
                                                    return `${op}${profile.maxResolution}p`;
                                                })()} <strong>{(profile.preferredFormat || 'mp4').toUpperCase()}</strong>
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1"><ImageIcon className="w-3 h-3 opacity-60" /> <strong>{(profile.preferredImageFormat || 'original') === 'original' ? 'Original' : (profile.preferredImageFormat || 'original').toUpperCase()}</strong></span>
                                        <span className="inline-flex items-center gap-1"><Music className="w-3 h-3 opacity-60" /> <strong>{(profile.audioFormat || 'mp3').toUpperCase()}</strong>{(profile.audioFormat || 'mp3') !== 'wav' && ` ${(profile.audioBitrate || '192k').replace('k', '')}k`}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingProfile(profile); setIsProfileDialogOpen(true); }}>
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDeleteProfile(profile.id)}>
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
