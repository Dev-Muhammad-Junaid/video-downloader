"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Volume1 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Preview volume for the editor.
 *
 * Just a slider. It sits under a speaker icon in a media editor, which says
 * everything a label would — and the panel had grown a heading, a Mute link
 * and an explanatory sentence for what is ultimately one control.
 *
 * Zero IS muted rather than a separate state to keep in sync: dragging to the
 * bottom silences it and flips the icon, which is what dragging a volume
 * slider to zero should do.
 *
 * Rendered inline rather than in a Popover — a Popover portals to
 * document.body and, inside this editor, painted behind the modal.
 */
interface AudioControlsProps {
    /** 0–1. Zero means muted. */
    volume: number;
    onVolumeChange: (v: number) => void;
}

export function AudioControls({ volume, onVolumeChange }: AudioControlsProps) {
    const [open, setOpen] = useState(false);
    /** Restores the previous level when the icon is used to unmute. */
    const lastAudible = useRef(1);
    const wrapRef = useRef<HTMLDivElement>(null);

    const muted = volume === 0;
    const Icon = muted ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

    useEffect(() => {
        if (volume > 0) lastAudible.current = volume;
    }, [volume]);

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
                // Alt-click mutes without opening, since that's the one action
                // worth having without a trip through the slider.
                onDoubleClick={() => onVolumeChange(muted ? lastAudible.current : 0)}
                title="Volume"
                aria-label="Volume"
                aria-expanded={open}
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), open && "bg-accent")}
            >
                <Icon className="size-4" />
            </button>

            {open && (
                <div className="absolute bottom-full left-1/2 z-50 mb-2 w-40 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2.5 shadow-lg ring-1 ring-foreground/10">
                    <Slider
                        aria-label="Volume"
                        value={[Math.round(volume * 100)]}
                        max={100}
                        step={1}
                        onValueChange={(v) => onVolumeChange(((Array.isArray(v) ? v[0] : v) as number) / 100)}
                    />
                </div>
            )}
        </div>
    );
}
