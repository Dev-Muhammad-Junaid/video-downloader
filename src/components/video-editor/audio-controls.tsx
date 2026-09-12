"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Volume1 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Preview volume for the editor.
 *
 * Strictly what you hear while editing — it has no effect on the exported
 * file. Whether the export keeps its audio is an export decision and lives in
 * the export dialog, alongside format and resolution.
 *
 * Rendered inline rather than in a Popover. A Popover portals to document.body
 * and, inside this editor, painted behind the modal — the button appeared to
 * do nothing at all.
 */
interface AudioControlsProps {
    /** 0–1. */
    volume: number;
    onVolumeChange: (v: number) => void;
    muted: boolean;
    onMutedChange: (m: boolean) => void;
}

export function AudioControls({ volume, onVolumeChange, muted, onMutedChange }: AudioControlsProps) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey, true);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey, true);
        };
    }, [open]);

    return (
        <div className="relative shrink-0" ref={wrapRef}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                title={muted ? "Unmute preview" : "Preview volume"}
                aria-label="Preview volume"
                aria-expanded={open}
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), open && "bg-accent")}
            >
                <Icon className="size-4" />
            </button>

            {open && (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-52 rounded-lg border bg-popover p-3 shadow-lg ring-1 ring-foreground/10">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-foreground">Preview volume</span>
                        <button
                            type="button"
                            onClick={() => onMutedChange(!muted)}
                            className="text-[11px] text-muted-foreground hover:text-foreground"
                        >
                            {muted ? "Unmute" : "Mute"}
                        </button>
                    </div>
                    <Slider
                        value={[muted ? 0 : Math.round(volume * 100)]}
                        max={100}
                        step={1}
                        onValueChange={(v) => {
                            const next = (Array.isArray(v) ? v[0] : v) as number;
                            onVolumeChange(next / 100);
                            if (next > 0 && muted) onMutedChange(false);
                        }}
                    />
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                        Only affects playback here, not the export.
                    </p>
                </div>
            )}
        </div>
    );
}
