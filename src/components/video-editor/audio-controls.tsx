"use client";

import { Volume2, VolumeX, Volume1 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Audio controls for the video editor.
 *
 * Two separate things live here, and the split matters: the preview volume
 * only changes what you hear while editing, while the export settings change
 * the file you get. Conflating them is the classic way to have someone mute
 * the preview and be surprised their export is silent.
 *
 * Every video export path previously hardcoded `-c:a copy`, so none of the
 * export side was possible at all — even though the underlying ffmpeg filter
 * chain already existed for audio-only files.
 */

export interface VideoAudioSettings {
    removeAudio: boolean;
    gainDb: number;
    normalize: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: VideoAudioSettings = {
    removeAudio: false,
    gainDb: 0,
    normalize: false,
};

/** Whether the export will actually touch the audio. Drives the button's
 *  active state, so a non-default setting is visible without opening it. */
export function audioSettingsAreDefault(s: VideoAudioSettings): boolean {
    return !s.removeAudio && s.gainDb === 0 && !s.normalize;
}

interface AudioControlsProps {
    /** Preview-only volume, 0–1. */
    previewVolume: number;
    onPreviewVolumeChange: (v: number) => void;
    previewMuted: boolean;
    onPreviewMutedChange: (m: boolean) => void;
    settings: VideoAudioSettings;
    onSettingsChange: (s: VideoAudioSettings) => void;
}

export function AudioControls({
    previewVolume,
    onPreviewVolumeChange,
    previewMuted,
    onPreviewMutedChange,
    settings,
    onSettingsChange,
}: AudioControlsProps) {
    const modified = !audioSettingsAreDefault(settings);
    const Icon = settings.removeAudio || previewMuted ? VolumeX : previewVolume < 0.5 ? Volume1 : Volume2;

    const set = (patch: Partial<VideoAudioSettings>) => onSettingsChange({ ...settings, ...patch });

    return (
        <Popover>
            <PopoverTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        title={modified ? "Audio — export settings changed" : "Audio"}
                        className={cn("relative shrink-0", modified && "text-primary")}
                    >
                        <Icon className="size-4" />
                        {modified && (
                            <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-primary" />
                        )}
                    </Button>
                }
            />
            <PopoverContent align="start" className="w-64 p-3">
                <div className="space-y-3">
                    <div>
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[11px] font-medium text-foreground">Preview volume</span>
                            <button
                                type="button"
                                onClick={() => onPreviewMutedChange(!previewMuted)}
                                className="text-[11px] text-muted-foreground hover:text-foreground"
                            >
                                {previewMuted ? "Unmute" : "Mute"}
                            </button>
                        </div>
                        <Slider
                            value={[previewMuted ? 0 : Math.round(previewVolume * 100)]}
                            max={100}
                            step={1}
                            onValueChange={(v) => {
                                const next = (Array.isArray(v) ? v[0] : v) as number;
                                onPreviewVolumeChange(next / 100);
                                if (next > 0 && previewMuted) onPreviewMutedChange(false);
                            }}
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                            Only what you hear here — the export is unaffected.
                        </p>
                    </div>

                    <div className="border-t pt-3">
                        <span className="text-[11px] font-medium text-foreground">In the exported file</span>

                        <label className="mt-2 flex items-center gap-2 text-[11px] cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={settings.removeAudio}
                                onChange={(e) => set({ removeAudio: e.target.checked })}
                                className="rounded border-border"
                            />
                            <span>Remove audio entirely</span>
                        </label>

                        {/* Gain and normalise are meaningless with no audio track,
                            so they're hidden rather than left to contradict it. */}
                        {!settings.removeAudio && (
                            <>
                                <div className="mt-2.5">
                                    <div className="mb-1 flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Volume</span>
                                        <span className="font-mono tabular-nums text-foreground">
                                            {settings.gainDb > 0 ? "+" : ""}{settings.gainDb} dB
                                        </span>
                                    </div>
                                    <Slider
                                        value={[settings.gainDb]}
                                        min={-20}
                                        max={12}
                                        step={1}
                                        onValueChange={(v) => set({ gainDb: (Array.isArray(v) ? v[0] : v) as number })}
                                    />
                                </div>

                                <label className="mt-2.5 flex items-center gap-2 text-[11px] cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={settings.normalize}
                                        onChange={(e) => set({ normalize: e.target.checked })}
                                        className="rounded border-border"
                                    />
                                    <span>Even out loudness</span>
                                </label>
                            </>
                        )}

                        {modified && (
                            <button
                                type="button"
                                onClick={() => onSettingsChange(DEFAULT_AUDIO_SETTINGS)}
                                className="mt-2.5 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                            >
                                Reset audio
                            </button>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
