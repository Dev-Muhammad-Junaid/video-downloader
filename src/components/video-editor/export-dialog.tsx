"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Captions, Download, Loader2, Volume2 } from "lucide-react";
import type { ExportQuality } from "@/lib/encoder";

/**
 * Everything you choose at export time, in one place.
 *
 * Only opened from the caret beside Export — pressing Export itself just
 * exports with these defaults, which are the obvious ones: subtitles in if the
 * video has them, audio kept, source resolution and container, quality
 * matching the original.
 */

export type ExportFormat = "original" | "mp4" | "mov" | "mkv";
export type ExportResolution = "original" | "1080" | "720" | "480";

export interface ExportOptions {
    quality: ExportQuality;
    includeSubtitles: boolean;
    keepAudio: boolean;
    format: ExportFormat;
    resolution: ExportResolution;
}

export const DEFAULT_EXPORT_OPTIONS: Omit<ExportOptions, "quality" | "includeSubtitles"> = {
    keepAudio: true,
    format: "original",
    resolution: "original",
};

const QUALITIES: { id: ExportQuality; label: string; detail: string }[] = [
    { id: "fast", label: "Fast", detail: "Smaller file, quickest to make" },
    { id: "balanced", label: "Balanced", detail: "Matches the original — recommended" },
    { id: "maximum", label: "Maximum", detail: "Best quality, largest file" },
];

interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: "trim" | "crop" | "subtitles";
    options: ExportOptions;
    onChange: (o: ExportOptions) => void;
    /** Only offered when the file actually has subtitles to burn in. */
    hasSubtitles: boolean;
    isExporting: boolean;
    onExport: () => void;
}

export function ExportDialog({
    open,
    onOpenChange,
    mode,
    options,
    onChange,
    hasSubtitles,
    isExporting,
    onExport,
}: ExportDialogProps) {
    const set = (patch: Partial<ExportOptions>) => onChange({ ...options, ...patch });
    const qualityIndex = Math.max(0, QUALITIES.findIndex((q) => q.id === options.quality));
    const active = QUALITIES[qualityIndex];
    const showSubtitleChoice = hasSubtitles && mode !== "subtitles";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Download className="size-4 text-primary" />
                        Export options
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <div className="mb-2 flex items-baseline justify-between">
                            <span className="text-[12px] font-medium text-foreground">Quality</span>
                            <span className="text-[12px] text-primary">{active.label}</span>
                        </div>
                        <Slider
                            value={[qualityIndex]}
                            min={0}
                            max={QUALITIES.length - 1}
                            step={1}
                            onValueChange={(v) => {
                                const i = (Array.isArray(v) ? v[0] : v) as number;
                                set({ quality: QUALITIES[i].id });
                            }}
                        />
                        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                            {QUALITIES.map((q) => <span key={q.id}>{q.label}</span>)}
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted-foreground">{active.detail}</p>
                    </div>

                    <div>
                        <span className="mb-1.5 block text-[12px] font-medium text-foreground">Resolution</span>
                        <SegmentedControl
                            size="sm"
                            stretch
                            value={options.resolution}
                            onValueChange={(v) => set({ resolution: v as ExportResolution })}
                            options={[
                                { value: "original", label: "Original" },
                                { value: "1080", label: "1080p" },
                                { value: "720", label: "720p" },
                                { value: "480", label: "480p" },
                            ]}
                        />
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                            Only scales down — a smaller video is never stretched back up.
                        </p>
                    </div>

                    <div>
                        <span className="mb-1.5 block text-[12px] font-medium text-foreground">Format</span>
                        <SegmentedControl
                            size="sm"
                            stretch
                            value={options.format}
                            onValueChange={(v) => set({ format: v as ExportFormat })}
                            options={[
                                { value: "original", label: "Same" },
                                { value: "mp4", label: "MP4" },
                                { value: "mov", label: "MOV" },
                                { value: "mkv", label: "MKV" },
                            ]}
                        />
                    </div>

                    <div className="space-y-2 border-t pt-3">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none text-[12px]">
                            <input
                                type="checkbox"
                                checked={options.keepAudio}
                                onChange={(e) => set({ keepAudio: e.target.checked })}
                                className="rounded border-border"
                            />
                            <span className="flex items-center gap-1.5">
                                <Volume2 className="size-3.5 text-muted-foreground" /> Include audio
                            </span>
                        </label>

                        {showSubtitleChoice && (
                            <label className="flex items-center gap-2.5 cursor-pointer select-none text-[12px]">
                                <input
                                    type="checkbox"
                                    checked={options.includeSubtitles}
                                    onChange={(e) => set({ includeSubtitles: e.target.checked })}
                                    className="rounded border-border"
                                />
                                <span className="flex items-center gap-1.5">
                                    <Captions className="size-3.5 text-muted-foreground" /> Burn in subtitles
                                </span>
                            </label>
                        )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={isExporting}>
                            Cancel
                        </Button>
                        <Button className="flex-1 gap-1.5" onClick={onExport} disabled={isExporting}>
                            {isExporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                            Export
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
