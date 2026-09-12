"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Captions, Download, Loader2 } from "lucide-react";
import type { ExportQuality } from "@/lib/encoder";

/**
 * Everything you choose at export time, in one place.
 *
 * These options used to be scattered across the editor chrome — a quality
 * segmented control in the timeline area, a "Precise cut" checkbox beneath it,
 * an "Include Subtitles" checkbox in the header — each taking permanent space
 * for a decision that is only made once, at the end. Gathering them here keeps
 * the editor itself for editing.
 */

const QUALITIES: { id: ExportQuality; label: string; detail: string }[] = [
    { id: "fast", label: "Fast", detail: "Smaller file, quickest to make" },
    { id: "balanced", label: "Balanced", detail: "Matches the original — recommended" },
    { id: "maximum", label: "Maximum", detail: "Best quality, largest file" },
];

interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** trim / crop / subtitles — decides which options are relevant. */
    mode: "trim" | "crop" | "subtitles";
    quality: ExportQuality;
    onQualityChange: (q: ExportQuality) => void;
    /** Only offered when the file actually has subtitles to burn in. */
    hasSubtitles: boolean;
    includeSubtitles: boolean;
    onIncludeSubtitlesChange: (v: boolean) => void;
    /** Only meaningful for a pure trim, and only when snapping is in play. */
    canChoosePrecision: boolean;
    precise: boolean;
    onPreciseChange: (v: boolean) => void;
    /** True when the export will re-encode, so quality actually applies. */
    willReencode: boolean;
    isExporting: boolean;
    onExport: () => void;
}

export function ExportDialog({
    open,
    onOpenChange,
    mode,
    quality,
    onQualityChange,
    hasSubtitles,
    includeSubtitles,
    onIncludeSubtitlesChange,
    canChoosePrecision,
    precise,
    onPreciseChange,
    willReencode,
    isExporting,
    onExport,
}: ExportDialogProps) {
    const qualityIndex = Math.max(0, QUALITIES.findIndex((q) => q.id === quality));
    const active = QUALITIES[qualityIndex];
    const showSubtitleChoice = hasSubtitles && mode !== "subtitles";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Download className="size-4 text-primary" />
                        Export {mode === "trim" ? "trim" : mode === "crop" ? "crop" : "with subtitles"}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {showSubtitleChoice && (
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={includeSubtitles}
                                onChange={(e) => onIncludeSubtitlesChange(e.target.checked)}
                                className="mt-0.5 rounded border-border"
                            />
                            <span className="text-[12px]">
                                <span className="flex items-center gap-1.5 font-medium text-foreground">
                                    <Captions className="size-3.5" /> Burn in subtitles
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                    Permanently draws them onto the video.
                                </span>
                            </span>
                        </label>
                    )}

                    {/* Quality only applies when something is re-encoded. A plain
                        trim copies the video across untouched, so offering a
                        quality here would be a setting that does nothing. */}
                    {willReencode ? (
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
                                    onQualityChange(QUALITIES[i].id);
                                }}
                            />
                            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                                {QUALITIES.map((q) => <span key={q.id}>{q.label}</span>)}
                            </div>
                            <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                                {active.detail}
                            </p>
                        </div>
                    ) : (
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            The video is copied across without re-encoding, so it keeps its
                            original quality exactly.
                        </p>
                    )}

                    {canChoosePrecision && (
                        <label className="flex items-start gap-2.5 cursor-pointer select-none border-t pt-3">
                            <input
                                type="checkbox"
                                checked={precise}
                                onChange={(e) => onPreciseChange(e.target.checked)}
                                className="mt-0.5 rounded border-border"
                            />
                            <span className="text-[12px]">
                                <span className="font-medium text-foreground">Precise cut</span>
                                <span className="block text-[11px] text-muted-foreground">
                                    Cut exactly where you set it rather than at the nearest
                                    frame the video can be split on. Re-encodes, so it takes longer.
                                </span>
                            </span>
                        </label>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => onOpenChange(false)}
                            disabled={isExporting}
                        >
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
