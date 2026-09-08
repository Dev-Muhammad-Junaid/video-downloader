"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Music } from "lucide-react";
import { cn } from "@/lib/utils";

function fmtTime(s: number): string {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Deterministic, varied "waveform" bars seeded by the item id — stable per item and
 *  free to render (no decode), used for the compact card where decoding every file
 *  in a large library would be wasteful. The full player decodes the real waveform. */
function seededBars(seed: string, count: number): number[] {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
        h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
        out.push(0.2 + (h % 1000) / 1000 * 0.8);
    }
    return out;
}

export function WaveformPlayer({
    src,
    seed,
    variant = "card",
    autoPlay = false,
    className,
}: {
    src: string;
    seed?: string;
    variant?: "card" | "full";
    autoPlay?: boolean;
    className?: string;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);

    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [peaks, setPeaks] = useState<number[] | null>(null);

    const barCount = variant === "full" ? 120 : 40;
    const bars = peaks && peaks.length ? peaks : seededBars(seed || src, barCount);

    // Decode the real waveform only for the full (focused) player.
    useEffect(() => {
        if (variant !== "full") return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(src);
                const buf = await res.arrayBuffer();
                const Ctx = window.AudioContext || (window as any).webkitAudioContext;
                const ctx = new Ctx();
                const decoded = await ctx.decodeAudioData(buf);
                const raw = decoded.getChannelData(0);
                const block = Math.floor(raw.length / barCount) || 1;
                const out: number[] = [];
                for (let i = 0; i < barCount; i++) {
                    let s = 0;
                    for (let j = 0; j < block; j++) s += Math.abs(raw[i * block + j] || 0);
                    out.push(s / block);
                }
                const max = Math.max(...out, 0.0001);
                if (!cancelled) setPeaks(out.map((v) => Math.max(v / max, 0.06)));
                ctx.close();
            } catch {
                /* keep the seeded placeholder */
            }
        })();
        return () => { cancelled = true; };
    }, [src, variant, barCount]);

    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;
        const onTime = () => setCurrentTime(el.currentTime);
        const onMeta = () => setDuration(el.duration || 0);
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnd = () => setIsPlaying(false);
        el.addEventListener("timeupdate", onTime);
        el.addEventListener("loadedmetadata", onMeta);
        el.addEventListener("play", onPlay);
        el.addEventListener("pause", onPause);
        el.addEventListener("ended", onEnd);
        return () => {
            el.removeEventListener("timeupdate", onTime);
            el.removeEventListener("loadedmetadata", onMeta);
            el.removeEventListener("play", onPlay);
            el.removeEventListener("pause", onPause);
            el.removeEventListener("ended", onEnd);
        };
    }, []);

    const toggle = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        e?.preventDefault();
        const el = audioRef.current;
        if (!el) return;
        if (el.paused) el.play().catch(() => {});
        else el.pause();
    }, []);

    const seekFromEvent = (clientX: number) => {
        const rect = trackRef.current?.getBoundingClientRect();
        const el = audioRef.current;
        if (!rect || !el || !duration) return;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        el.currentTime = ratio * duration;
        setCurrentTime(el.currentTime);
    };

    const skip = (delta: number) => {
        const el = audioRef.current;
        if (!el) return;
        el.currentTime = Math.max(0, Math.min((el.currentTime || 0) + delta, duration || el.duration || 0));
    };

    const progress = duration > 0 ? currentTime / duration : 0;

    const Bars = ({ activeClass, idleClass, minH }: { activeClass: string; idleClass: string; minH: number }) => (
        <div
            ref={trackRef}
            onPointerDown={(e) => { e.stopPropagation(); seekFromEvent(e.clientX); }}
            className="flex-1 flex items-center gap-[2px] h-full cursor-pointer"
        >
            {bars.map((h, i) => {
                const on = i / bars.length <= progress;
                return (
                    <div
                        key={i}
                        className={cn("flex-1 rounded-full transition-colors duration-150", on ? activeClass : idleClass)}
                        style={{ height: `${Math.max(h * 100, minH)}%` }}
                    />
                );
            })}
        </div>
    );

    if (variant === "full") {
        return (
            <div className={cn("w-full h-full flex flex-col items-center justify-center gap-8 px-6 py-8 sm:px-10", className)}>
                <audio ref={audioRef} src={src} preload="metadata" autoPlay={autoPlay} />
                <div className="flex size-20 items-center justify-center rounded-[18px] bg-white/10 ring-1 ring-white/15">
                    <Music className="size-8 text-white/80" strokeWidth={1.5} />
                </div>
                <div className="w-full max-w-xl space-y-3">
                    <div className="h-20 flex items-center">
                        <Bars activeClass="bg-primary" idleClass="bg-white/20" minH={6} />
                    </div>
                    <div className="flex justify-between text-xs font-mono text-white/55 tabular-nums">
                        <span>{fmtTime(currentTime)}</span>
                        <span>{fmtTime(duration)}</span>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <button onClick={() => skip(-10)} className="w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors" aria-label="Back 10 seconds">
                        <span className="text-[11px] font-semibold tabular">-10</span>
                    </button>
                    <button onClick={toggle} className="flex size-14 items-center justify-center rounded-full bg-white text-black shadow-[0_2px_10px_rgb(0_0_0/0.3)] transition-transform hover:scale-105 active:scale-95" aria-label={isPlaying ? "Pause" : "Play"}>
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                    </button>
                    <button onClick={() => skip(10)} className="w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors" aria-label="Forward 10 seconds">
                        <span className="text-[11px] font-semibold tabular">+10</span>
                    </button>
                </div>
            </div>
        );
    }

    // Compact card variant.
    return (
        <div className={cn("w-full h-full flex items-center gap-3 px-4", className)} onClick={(e) => e.stopPropagation()}>
            <audio ref={audioRef} src={src} preload="metadata" autoPlay={autoPlay} />
            <button
                onClick={toggle}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_8px_rgb(0_0_0/0.22)] transition-transform hover:scale-105 active:scale-95"
                aria-label={isPlaying ? "Pause" : "Play"}
            >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="h-9">
                    <Bars activeClass="bg-primary" idleClass="bg-muted-foreground/25" minH={14} />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-muted-foreground/80 tabular-nums leading-none">
                    <span>{fmtTime(currentTime)}</span>
                    <span>{fmtTime(duration)}</span>
                </div>
            </div>
        </div>
    );
}
