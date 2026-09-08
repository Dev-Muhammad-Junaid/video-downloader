"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { WaveformPlayer } from "@/components/audio-player";
import {
    Copy,
    FolderOpen,
    Cloud,
    ExternalLink,
    Pencil,
    Maximize2,
    Mic,
    Loader2,
    AlertCircle,
    Video as VideoIcon,
    Play,
    Trash2,
    Tags,
    PlusCircle,
    CheckSquare,
    Square,
    Music,
} from "lucide-react";
import type { Video } from "@/types/media";

type LabelLite = { id: string; name: string; color: string | null };

/**
 * A single library item card (video / audio / image). Extracted verbatim from
 * page.tsx — props mirror the values/handlers it previously closed over, with
 * identical names, so the body is unchanged.
 */
export interface VideoCardProps {
    video: Video;
    selectionMode: boolean;
    selectedIds: Set<string>;
    displayedVideos: Video[];
    newLabelName: string;
    globalLabels: LabelLite[];
    transcribingIds: Set<string>;
    providerLabel: string;
    setPlayerIndex: (n: number) => void;
    setPlayerOpen: (b: boolean) => void;
    toggleSelection: (videoId: string, e?: React.MouseEvent) => void;
    attachLabel: (videoId: string, labelId: string) => void;
    detachLabel: (videoId: string, labelId: string) => void;
    createAndAttachLabel: (videoId: string, name: string) => void;
    deleteLabel: (labelId: string) => void;
    setNewLabelName: (s: string) => void;
    handleCloudUpload: (video: Video) => void;
    handleCloudRemove: (video: Video) => void;
    handleTranscribe: (videoId: string) => void;
    copyToClipboard: (text: string) => void;
    handleOpenFolder: (path: string) => void;
    setEditingImageId: (id: string) => void;
    setEditingAudioForEditor: (id: string) => void;
    setEditingVideoForEditor: (id: string) => void;
    openDeleteDialog: (videoId: string, title: string) => void;
}

export function VideoCard({
    video,
    selectionMode,
    selectedIds,
    displayedVideos,
    newLabelName,
    globalLabels,
    transcribingIds,
    providerLabel,
    setPlayerIndex,
    setPlayerOpen,
    toggleSelection,
    attachLabel,
    detachLabel,
    createAndAttachLabel,
    deleteLabel,
    setNewLabelName,
    handleCloudUpload,
    handleCloudRemove,
    handleTranscribe,
    copyToClipboard,
    handleOpenFolder,
    setEditingImageId,
    setEditingAudioForEditor,
    setEditingVideoForEditor,
    openDeleteDialog,
}: VideoCardProps) {
    const isSelected = selectedIds.has(video.id);
    const openInPlayer = () => {
        const idx = displayedVideos.findIndex(v => v.id === video.id);
        setPlayerIndex(idx >= 0 ? idx : 0);
        setPlayerOpen(true);
    };
    return (
        <Card
            key={video.id}
            className={cn(
                "group relative flex flex-col overflow-hidden rounded-[10px] transition-[box-shadow,border-color] duration-150",
                "hover:border-border hover:shadow-[0_2px_8px_rgb(0_0_0/0.07)] dark:hover:shadow-[0_2px_8px_rgb(0_0_0/0.35)]",
                isSelected && "border-primary ring-2 ring-primary/35",
                selectionMode && "cursor-pointer"
            )}
            onClick={selectionMode ? (e) => toggleSelection(video.id, e) : undefined}
        >
            {/* Media Preview — clean, uniform thumbnail for every media type */}
            <div
                className={cn(
                    "relative overflow-hidden h-[180px]",
                    video.mediaType === "image" ? "bg-muted/40" : video.mediaType === "audio" ? "" : "bg-muted/40"
                )}
            >
                {/* Selection checkbox overlay */}
                {selectionMode && (
                    <div className={cn(
                        "absolute top-2.5 left-2.5 z-20 w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150",
                        isSelected
                            ? "bg-primary text-primary-foreground shadow-md scale-100"
                            : "bg-background/70 backdrop-blur-md border border-border/60 text-muted-foreground hover:bg-background/90 hover:scale-105"
                    )}>
                        {isSelected
                            ? <CheckSquare className="w-4 h-4" />
                            : <Square className="w-4 h-4" />}
                    </div>
                )}

                {/* Expand / Play button — hidden in selection mode */}
                {!selectionMode && (
                    <Button
                        variant="secondary"
                        size="icon"
                        className="absolute top-2.5 right-2.5 z-10 w-8 h-8 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full bg-background/70 backdrop-blur-md border border-border/50 hover:bg-background hover:scale-105"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            openInPlayer();
                        }}
                        title="Open in Media Player"
                    >
                        <Maximize2 className="w-4 h-4 text-foreground/80" />
                    </Button>
                )}

                {/* Duration / size pill — duration is hidden for audio since the player shows it */}
                {(video.duration || video.fileSize) && (
                    <div className="absolute bottom-2 right-2 z-10 flex gap-1.5">
                        {video.mediaType !== "audio" && video.duration && video.duration > 0 && (
                            <span className="tabular rounded-[5px] bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                                {Math.floor(video.duration / 60)}:{String(Math.floor(video.duration % 60)).padStart(2, '0')}
                            </span>
                        )}
                        {video.fileSize && (
                            <span className="tabular rounded-[5px] bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                                {(video.fileSize / (1024 * 1024)).toFixed(1)} MB
                            </span>
                        )}
                    </div>
                )}


                {video.mediaType === "image" ? (
                    <div
                        className={cn("w-full h-full", !selectionMode && "cursor-pointer")}
                        onClick={selectionMode ? undefined : (e) => { e.stopPropagation(); openInPlayer(); }}
                    >
                        <img
                            src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                            alt={video.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            loading="lazy"
                        />
                    </div>
                ) : video.mediaType === "audio" ? (
                    <div className="w-full h-full bg-gradient-to-br from-primary/10 via-muted/30 to-muted/55">
                        {selectionMode ? (
                            <div className="w-full h-full flex items-center justify-center">
                                <Music className="w-10 h-10 text-muted-foreground/30" />
                            </div>
                        ) : (
                            <WaveformPlayer
                                variant="card"
                                src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                                seed={video.id}
                            />
                        )}
                    </div>
                ) : (
                    // Video: a clean poster thumbnail with a play overlay — opens the media player.
                    <div
                        className={cn("w-full h-full relative", !selectionMode && "cursor-pointer")}
                        onClick={selectionMode ? undefined : (e) => { e.stopPropagation(); openInPlayer(); }}
                    >
                        {video.thumbnailPath ? (
                            <img src={`/api/thumbnail/${video.id}`} alt={video.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <VideoIcon className="w-10 h-10 text-muted-foreground/30" />
                            </div>
                        )}
                        {!selectionMode && (
                            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="w-12 h-12 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center text-white transition-all group-hover:bg-black/65 group-hover:scale-105">
                                    <Play className="w-5 h-5 fill-white ml-0.5" />
                                </span>
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Card body */}
            <div className="p-3 flex flex-col gap-2 flex-1">
                <h3 className="line-clamp-2 text-[13px] font-medium leading-snug" title={video.title}>{video.title}</h3>

                {/* Meta row */}
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>{new Date(video.createdAt).toLocaleDateString()}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span className="truncate">{video.sourcePlatform || "Unknown"}</span>
                    {video.originalUrl && (
                        <a href={video.originalUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-primary hover:text-primary/80 transition-colors flex-shrink-0" title="Open source link" onClick={(e) => e.stopPropagation()}>
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    )}
                </div>

                {/* Labels */}
                {((video.labels && video.labels.length > 0) || !selectionMode) && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                        {video.labels?.map(label => (
                            <Badge key={label.id} variant="secondary" className="text-[10px] px-1.5 py-0 hover:bg-destructive/10 hover:text-destructive cursor-pointer hover:line-through transition-all" onClick={(e) => { e.stopPropagation(); detachLabel(video.id, label.id); }} title="Click to remove">
                                {label.name}
                            </Badge>
                        ))}

                        {!selectionMode && (
                            <Popover onOpenChange={(open) => { if (open) setNewLabelName(""); }}>
                                <PopoverTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-[18px] text-[10px] px-1.5 py-0 text-muted-foreground hover:text-foreground border border-dashed border-border/50 rounded-full")} onClick={(e) => e.stopPropagation()}>
                                    <PlusCircle className="w-3 h-3 mr-1" /> Label
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-0" align="start" onClick={(e) => e.stopPropagation()}>
                                    {/* Single search box — type to filter existing labels, or create a new
                                        one inline when there's no exact match. */}
                                    <Command shouldFilter={false}>
                                        <CommandInput
                                            placeholder="Search or create label…"
                                            value={newLabelName}
                                            onValueChange={setNewLabelName}
                                            className="h-9 text-xs"
                                            onKeyDown={(e) => {
                                                // Enter creates the typed label when it doesn't already exist.
                                                const q = newLabelName.trim();
                                                if (e.key === "Enter" && q && !globalLabels.some(l => l.name.toLowerCase() === q.toLowerCase())) {
                                                    e.preventDefault();
                                                    createAndAttachLabel(video.id, q);
                                                }
                                            }}
                                        />
                                        <CommandList>
                                            {(() => {
                                                const q = newLabelName.trim().toLowerCase();
                                                const available = globalLabels.filter(gl => !(video.labels || []).find(vl => vl.id === gl.id));
                                                const matches = q ? available.filter(gl => gl.name.toLowerCase().includes(q)) : available;
                                                const exactExists = !!q && globalLabels.some(gl => gl.name.toLowerCase() === q);
                                                return (
                                                    <>
                                                        {matches.length > 0 && (
                                                            <CommandGroup>
                                                                {matches.map(label => (
                                                                    <CommandItem
                                                                        key={label.id}
                                                                        value={label.id}
                                                                        onSelect={() => { attachLabel(video.id, label.id); setNewLabelName(""); }}
                                                                        className="group/lbl text-xs py-1.5"
                                                                    >
                                                                        <Tags className="mr-2 h-3 w-3 opacity-50" />
                                                                        <span className="truncate">{label.name}</span>
                                                                        {/* Delete the label from the library entirely (not just detach it here). */}
                                                                        <button
                                                                            type="button"
                                                                            title="Delete label from library"
                                                                            className="ml-auto opacity-0 group-hover/lbl:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteLabel(label.id); }}
                                                                        >
                                                                            <Trash2 className="h-3 w-3" />
                                                                        </button>
                                                                    </CommandItem>
                                                                ))}
                                                            </CommandGroup>
                                                        )}
                                                        {q && !exactExists && (
                                                            <CommandGroup>
                                                                <CommandItem
                                                                    value="__create__"
                                                                    onSelect={() => createAndAttachLabel(video.id, newLabelName)}
                                                                    className="text-xs py-1.5 text-primary"
                                                                >
                                                                    <PlusCircle className="mr-2 h-3 w-3" />
                                                                    Create &ldquo;{newLabelName.trim()}&rdquo;
                                                                </CommandItem>
                                                            </CommandGroup>
                                                        )}
                                                        {matches.length === 0 && !q && (
                                                            <div className="py-3 px-2 text-center text-xs text-muted-foreground">Type to search or create a label.</div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                )}

                {/* Transcript snippet in deep search mode */}
                {video.transcriptSnippet && (
                    <div className="rounded-md border border-primary/20 bg-primary/6 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-primary text-[9px] uppercase tracking-wider mr-1">Transcript match:</span>
                        {video.transcriptSnippet}
                    </div>
                )}
            </div>

            {/* Actions footer — hidden during selection mode to prevent accidental clicks */}
            {!selectionMode && (
            <div className="px-3 pb-3 pt-0 flex items-center justify-between mt-auto">
                <div className="flex items-center gap-1">
                    {video.cloudKey ? (
                        <Button variant="ghost" size="icon-sm" className="bg-chart-2/12 text-chart-2 hover:bg-destructive/12 hover:text-destructive" onClick={() => handleCloudRemove(video)} title="Synced · Click to remove from cloud">
                            <Cloud className="h-3.5 w-3.5" />
                        </Button>
                    ) : (
                        <Button variant="ghost" size="icon-sm" className="hover:bg-accent" onClick={() => handleCloudUpload(video)} title="Upload to Cloud">
                            <Cloud className="h-3.5 w-3.5" />
                        </Button>
                    )}
                    {video.mediaType !== "image" && (
                        <>
                            {video.transcriptStatus === "completed" ? (
                                <Tooltip>
                                    <TooltipTrigger>
                                        <span className="inline-flex items-center justify-center size-[18px] rounded-full bg-chart-2/12 text-chart-2 ring-1 ring-chart-2/25 cursor-default">
                                            <Mic className="w-2.5 h-2.5" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>Transcribed — available for deep search</TooltipContent>
                                </Tooltip>
                            ) : video.transcriptStatus === "processing" || transcribingIds.has(video.id) ? (
                                <Tooltip>
                                    <TooltipTrigger>
                                        <span className="inline-flex items-center justify-center size-[18px] rounded-full bg-chart-3/12 text-chart-3 ring-1 ring-chart-3/25 cursor-default">
                                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>Transcribing…</TooltipContent>
                                </Tooltip>
                            ) : video.transcriptStatus === "error" ? (
                                <Tooltip>
                                    <TooltipTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-destructive hover:bg-destructive/12")} onClick={() => handleTranscribe(video.id)}>
                                        <AlertCircle className="w-3.5 h-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent>Retry transcription</TooltipContent>
                                </Tooltip>
                            ) : (
                                <Tooltip>
                                    <TooltipTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-primary")} onClick={() => handleTranscribe(video.id)}>
                                        <Mic className="w-3.5 h-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent>{`Generate AI transcript (${providerLabel})`}</TooltipContent>
                                </Tooltip>
                            )}
                        </>
                    )}
                </div>

                <div className="flex shrink-0 gap-0.5">
                    <Button variant="ghost" size="icon-sm" className="hover:bg-accent" onClick={() => copyToClipboard(video.localPath)} title="Copy Path">
                        <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="hover:bg-accent" onClick={() => handleOpenFolder(video.localPath)} title="View in Explorer">
                        <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                    {video.mediaType === "image" ? (
                        <Button variant="ghost" size="icon-sm" className="hover:text-primary" onClick={() => setEditingImageId(video.id)} title="Edit Image">
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                    ) : video.mediaType === "audio" ? (
                        <Button variant="ghost" size="icon-sm" className="hover:text-primary" onClick={() => setEditingAudioForEditor(video.id)} title="Edit Audio">
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                    ) : (
                        <Button variant="ghost" size="icon-sm" className="hover:text-primary" onClick={() => setEditingVideoForEditor(video.id)} title="Edit Video">
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" className="hover:bg-destructive/12 hover:text-destructive" onClick={() => openDeleteDialog(video.id, video.title)} title="Delete Video">
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            )}
        </Card>
    );
}
