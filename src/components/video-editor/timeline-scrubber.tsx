"use client";

import React, { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { motion, useMotionValue, useMotionTemplate, useAnimationFrame, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";

interface TimelineScrubberProps {
    duration: number;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    trimStart: number;
    trimEnd: number;
    onTrimChange: (start: number, end: number) => void;
    onSeek: (time: number) => void;
    /** Tiled thumbnail strip drawn as the track background, so the timeline
     *  shows what is in the video rather than a blank bar. */
    filmstripUrl?: string | null;
    /** Normalised amplitude peaks (0–1), drawn along the bottom so speech and
     *  silence are visible without playing through. */
    peaks?: number[];
}

export function TimelineScrubber({ duration, videoRef, trimStart, trimEnd, onTrimChange, onSeek, filmstripUrl = null, peaks = [] }: TimelineScrubberProps) {
    const [localTrim, setLocalTrim] = useState([trimStart, trimEnd]);

    // Motion values for ultra-smooth UI
    const mvCurrentTime = useMotionValue(0);
    const mvTrimStart = useMotionValue(trimStart);
    const mvTrimEnd = useMotionValue(trimEnd);

    useEffect(() => {
        setLocalTrim([trimStart, trimEnd]);
        mvTrimStart.set(trimStart);
        mvTrimEnd.set(trimEnd);
    }, [trimStart, trimEnd, mvTrimStart, mvTrimEnd]);

    // Track playback dynamically on the GPU bypassing React renders
    useAnimationFrame(() => {
        if (videoRef.current) {
            mvCurrentTime.set(videoRef.current.currentTime);
        }
    });

    const handleValueChange = (val: number | readonly number[]) => {
        const valueArray = Array.isArray(val) ? val : [val, val];
        setLocalTrim([valueArray[0], valueArray[1]]);
        mvTrimStart.set(valueArray[0]);
        mvTrimEnd.set(valueArray[1]);
        
        // Quick heuristic to seek
        if (Math.abs(valueArray[0] - trimStart) > 0.1) {
            onSeek(valueArray[0]);
        } else if (Math.abs(valueArray[1] - trimEnd) > 0.1) {
            onSeek(valueArray[1]);
        }
    };

    // No snapping: exports always re-encode, so a cut lands exactly where the
    // handle is put. Snapping only ever existed because a stream copy could
    // not cut between keyframes.
    const handleCommit = (val: number | readonly number[]) => {
        const valueArray = Array.isArray(val) ? val : [val, val];
        onTrimChange(valueArray[0], valueArray[1]);
    };

    /**
     * Drag the whole selection.
     *
     * Only the two handles were grabbable, so moving a chosen span somewhere
     * else meant dragging one end, then the other, and hoping the length came
     * out the same. Dragging the middle keeps the duration fixed and slides
     * both ends together, which is what the region looks like it should do.
     */
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);

    const beginRangeDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        if (duration <= 0) return;
        e.preventDefault();
        e.stopPropagation();

        const rail = trackRef.current;
        if (!rail) return;
        const railWidth = rail.getBoundingClientRect().width;
        if (railWidth <= 0) return;

        const startX = e.clientX;
        const [origStart, origEnd] = [localTrim[0], localTrim[1]];
        const span = origEnd - origStart;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setDragging(true);

        const move = (ev: PointerEvent) => {
            const deltaSeconds = ((ev.clientX - startX) / railWidth) * duration;
            // Clamp as a pair so the selection keeps its length at both ends
            // instead of being squashed against 0 or the duration.
            const nextStart = Math.min(Math.max(0, origStart + deltaSeconds), duration - span);
            const nextEnd = nextStart + span;
            setLocalTrim([nextStart, nextEnd]);
            mvTrimStart.set(nextStart);
            mvTrimEnd.set(nextEnd);
        };

        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            setDragging(false);
            setLocalTrim((cur) => { onTrimChange(cur[0], cur[1]); return cur; });
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    // Calculate motion templates for GPU rendering
    const playPercentage = useTransform(mvCurrentTime, t => duration > 0 ? (t / duration) * 100 : 0);
    const startPercentage = useTransform(mvTrimStart, t => duration > 0 ? (t / duration) * 100 : 0);
    // Note: right width is 100% - endPercentage
    const endPercentage = useTransform(mvTrimEnd, t => duration > 0 ? (t / duration) * 100 : 0);
    const rightWidth = useTransform(endPercentage, p => 100 - p);

    // The selection's on-screen box, in the same coordinate space the slider
    // uses (1.5rem padding, thumb inset), so the grab surface and the duration
    // badge sit exactly over the highlighted range.
    const rangeLeft = useMotionTemplate`calc(1.5rem + ${startPercentage}% - (2rem * ${startPercentage}/100) + 30px)`;
    const rangeWidth = useMotionTemplate`max(0px, calc(${endPercentage}% - ${startPercentage}% - (2rem * (${endPercentage} - ${startPercentage})/100) - 60px))`;
    const badgeLeft = useMotionTemplate`calc(1.5rem + ${startPercentage}% - (2rem * ${startPercentage}/100) + (${endPercentage}% - ${startPercentage}% - (2rem * (${endPercentage} - ${startPercentage})/100)) / 2)`;

    const playheadLeft = useMotionTemplate`calc(1.5rem + ${playPercentage}% - (2rem * ${playPercentage}/100))`;
    const startRegionWidth = useMotionTemplate`calc(1.5rem + ${startPercentage}% - (2rem * ${startPercentage}/100))`;
    const endRegionWidth = useMotionTemplate`calc(1.5rem + ${rightWidth}% - (2rem * ${rightWidth}/100))`;

    const selected = Math.max(0, localTrim[1] - localTrim[0]);

    return (
        <div className="relative w-full">
            {/* How long the selection is, sitting over its own middle so it
                reads as a label on the range rather than a stat about the
                video. Without it the only way to know was subtracting the two
                timecodes by eye. */}
            {duration > 0 && (
                <motion.div
                    className="pointer-events-none absolute -top-1 z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-background shadow-sm"
                    style={{ left: badgeLeft }}
                >
                    {formatDuration(selected)}
                </motion.div>
            )}

        <div className="relative w-full h-14 bg-muted rounded-lg flex items-center px-6 overflow-hidden ring-1 ring-border/50">
            {/* Waveform along the bottom. Drawn as one polygon rather than a
                bar per peak — 400 DOM nodes per render is not worth it. */}
            {/* Thumbnails behind everything, dimmed so the controls stay
                readable over whatever the video happens to look like. Stretched
                to `100% 100%` rather than `cover`, which centre-crops — only
                the middle of the video would show, and a thumbnail would no
                longer sit above the moment it came from. Spans the slider's own
                range, not the padded track, so the two line up. */}
            {filmstripUrl && (
                <>
                    <div
                        className="pointer-events-none absolute inset-x-6 inset-y-0 opacity-70"
                        style={{
                            backgroundImage: `url(${filmstripUrl})`,
                            backgroundSize: "100% 100%",
                            backgroundRepeat: "no-repeat",
                        }}
                    />
                    <div className="pointer-events-none absolute inset-x-6 inset-y-0 bg-background/25" />
                </>
            )}

            {/* Current position. Sits above the waveform so it stays visible
                over it, and below the slider so it never blocks a handle. */}
            <motion.div
                className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-red-500"
                style={{ left: playheadLeft }}
            />

            {/* An <svg> carries its own intrinsic size, so `inset-x-6` alone left
                it 80px wide instead of filling the track — the wrapper owns the
                geometry and the svg just fills it. */}
            {peaks.length > 0 && (
                <div className="pointer-events-none absolute inset-x-6 bottom-0 h-5">
                    <svg
                        className="h-full w-full"
                        viewBox={`0 0 ${peaks.length} 100`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                    >
                        <polygon
                            className="fill-foreground/30"
                            points={`0,100 ${peaks.map((p, i) => `${i},${100 - p * 100}`).join(" ")} ${peaks.length - 1},100`}
                        />
                    </svg>
                </div>
            )}
            {/* Grab surface for moving the whole selection.
                Sits ABOVE the slider: the slider's control spans the full
                width and claims the pointer anywhere on it, so a surface
                underneath never received the drag — the range resized instead
                of moving.

                Kept well clear of both handles by insetting it, rather than by
                z-index: the thumbs live inside the slider's own stacking
                context, so raising them above this surface is not possible
                from out here. 30px is measured, not guessed — a 13px inset
                still overlapped the thumb centre by a few pixels. */}
            {duration > 0 && (
                <motion.div
                    role="presentation"
                    onPointerDown={beginRangeDrag}
                    className={cn(
                        "absolute inset-y-0 z-30 touch-none",
                        dragging ? "cursor-grabbing" : "cursor-grab",
                    )}
                    style={{ left: rangeLeft, width: rangeWidth }}
                />
            )}

            <div ref={trackRef} className="w-full relative z-20">
                <Slider
                    defaultValue={[0, duration]}
                    value={localTrim}
                    max={duration}
                    step={0.1}
                    minStepsBetweenValues={0.5}
                    onValueChange={handleValueChange}
                    onValueCommitted={handleCommit}
                    variant="pill"
                    className="w-full"
                />
            </div>
            
            {/* Subdued regions for cut out portions visually bound to Motion Values */}
            {duration > 0 && (
                <>
                    <motion.div 
                        className="absolute top-0 bottom-0 left-0 bg-foreground/10 dark:bg-foreground/20 pointer-events-none"
                        style={{ width: startRegionWidth }}
                    />
                    <motion.div 
                        className="absolute top-0 bottom-0 right-0 bg-foreground/10 dark:bg-foreground/20 pointer-events-none"
                        style={{ width: endRegionWidth }}
                    />
                </>
            )}
        </div>
        </div>
    );
}
