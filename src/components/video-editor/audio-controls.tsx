"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Volume1 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Preview volume for the editor.
 *
 * The slider expands along the control row rather than floating above it. As a
 * popover it was a panel hovering over the video to hold one control, when
 * there is room for it right where the other transport controls already live.
 *
 * Zero IS muted rather than a separate flag to keep in sync: dragging to the
 * bottom silences the video and flips the icon, which is what dragging a
 * volume slider to zero should do.
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

    // Collapse when attention moves elsewhere, so an expanded slider doesn't
    // sit there taking room in the row indefinitely.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    return (
        <div
            ref={wrapRef}
            className="flex shrink-0 items-center gap-1.5"
            onMouseLeave={() => setOpen(false)}
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                onDoubleClick={() => onVolumeChange(muted ? lastAudible.current : 0)}
                title="Volume"
                aria-label="Volume"
                aria-expanded={open}
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), open && "bg-accent")}
            >
                <Icon className="size-4" />
            </button>

            {/* Width rather than mount/unmount, so the row's other controls
                slide instead of jumping when it opens. */}
            <div
                className={cn(
                    "overflow-hidden transition-[width,opacity] duration-200",
                    open ? "w-24 opacity-100" : "w-0 opacity-0",
                )}
            >
                <Slider
                    aria-label="Volume"
                    value={[Math.round(volume * 100)]}
                    max={100}
                    step={1}
                    onValueChange={(v) => onVolumeChange(((Array.isArray(v) ? v[0] : v) as number) / 100)}
                />
            </div>
        </div>
    );
}
