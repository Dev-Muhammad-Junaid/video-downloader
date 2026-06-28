"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
    Play,
    Pause,
    Download,
    Loader2,
    RotateCcw,
    Wand2,
    Volume2,
    Scissors,
    AudioWaveform,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type AudioItem = {
    id: string;
    title: string;
    localPath: string;
    duration?: number | null;
    fileSize?: number | null;
};

const WAVE_BARS = 200;

function fmtTime(s: number): string {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
}

const ENHANCE_OPTIONS = [
    { id: "off", label: "Off", desc: "No processing" },
    { id: "light", label: "Clean Up", desc: "Denoise + de-ess + normalize" },
    { id: "studio", label: "Studio Voice", desc: "Strong denoise, presence EQ, compression" },
] as const;

export function AudioEditorModal({
    audio,
    onClose,
    onRefreshLibrary,
}: {
    audio: AudioItem;
    onClose: () => void;
    onRefreshLibrary?: () => void;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const waveRef = useRef<HTMLDivElement>(null);

    const srcExt = (audio.localPath.split(".").pop() || "mp3").toLowerCase();

    const [duration, setDuration] = useState(audio.duration || 0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(audio.duration || 0);

    const [format, setFormat] = useState<"original" | "mp3" | "m4a" | "wav">("original");
    const [bitrate, setBitrate] = useState("192k");
    const [enhance, setEnhance] = useState<"off" | "light" | "studio">("off");
    const [gainDb, setGainDb] = useState(0);
    const [normalize, setNormalize] = useState(false);
    const [fadeIn, setFadeIn] = useState(0);
    const [fadeOut, setFadeOut] = useState(0);

    const [peaks, setPeaks] = useState<number[] | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    // Drive the Radix dialog's open state so closing runs its open→closed
    // transition (which removes the body scroll-lock / pointer-events) BEFORE
    // the parent unmounts us. Unmounting while still `open` can otherwise leave
    // <body> with data-scroll-locked / pointer-events:none — i.e. the page
    // stops scrolling after the editor closes.
    const [open, setOpen] = useState(true);
    const requestClose = () => {
        setOpen(false);
        setTimeout(onClose, 200);
    };

    const mediaUrl = `/api/media?path=${encodeURIComponent(audio.localPath)}`;

    // NOTE: scroll locking is handled by the Radix <Dialog> (react-remove-scroll).
    // A manual `document.body.style.overflow` lock here fought that mechanism and
    // could leave the page unscrollable after close (Radix's data-scroll-locked
    // CSS uses !important, which an inline overflow reset can't override).

    // Decode the audio into a peaks array for the waveform (best-effort).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(mediaUrl);
                const buf = await res.arrayBuffer();
                const Ctx = window.AudioContext || (window as any).webkitAudioContext;
                const ctx = new Ctx();
                const decoded = await ctx.decodeAudioData(buf);
                const raw = decoded.getChannelData(0);
                const block = Math.floor(raw.length / WAVE_BARS) || 1;
                const out: number[] = [];
                for (let i = 0; i < WAVE_BARS; i++) {
                    let sum = 0;
                    for (let j = 0; j < block; j++) sum += Math.abs(raw[i * block + j] || 0);
                    out.push(sum / block);
                }
                const max = Math.max(...out, 0.0001);
                if (!cancelled) setPeaks(out.map((v) => v / max));
                ctx.close();
            } catch {
                if (!cancelled) setPeaks([]); // fall back to a flat placeholder bar
            }
        })();
        return () => { cancelled = true; };
    }, [mediaUrl]);

    const handleLoadedMetadata = () => {
        const d = audioRef.current?.duration || 0;
        if (d && isFinite(d)) {
            setDuration(d);
            setTrimEnd((prev) => (prev > 0 ? prev : d));
        }
    };

    // ── Live preview via Web Audio ──
    // The element is routed through a filter graph so gain, fades, trim and the
    // EQ/compression part of enhancement are audible while previewing. (Denoise and
    // loudness-normalize have no Web Audio equivalent and are applied on export.)
    const ctxRef = useRef<AudioContext | null>(null);
    const nodesRef = useRef<{ highpass: BiquadFilterNode; mud: BiquadFilterNode; presence: BiquadFilterNode; comp: DynamicsCompressorNode; gain: GainNode } | null>(null);
    const rafRef = useRef<number | null>(null);
    // Live mirror of the params so the loop and graph always read current values.
    const paramsRef = useRef({ trimStart, trimEnd, fadeIn, fadeOut, gainDb, enhance });
    useEffect(() => {
        paramsRef.current = { trimStart, trimEnd, fadeIn, fadeOut, gainDb, enhance };
    }, [trimStart, trimEnd, fadeIn, fadeOut, gainDb, enhance]);

    const applyEnhanceParams = useCallback(() => {
        const n = nodesRef.current;
        if (!n) return;
        const e = paramsRef.current.enhance;
        if (e === "studio") {
            n.highpass.frequency.value = 90;
            n.mud.gain.value = -2;
            n.presence.gain.value = 3;
            n.comp.threshold.value = -18; n.comp.ratio.value = 3; n.comp.knee.value = 6; n.comp.attack.value = 0.02; n.comp.release.value = 0.25;
        } else if (e === "light") {
            n.highpass.frequency.value = 80;
            n.mud.gain.value = 0;
            n.presence.gain.value = 2;
            n.comp.threshold.value = -24; n.comp.ratio.value = 2; n.comp.knee.value = 6; n.comp.attack.value = 0.02; n.comp.release.value = 0.25;
        } else {
            n.highpass.frequency.value = 20;
            n.mud.gain.value = 0;
            n.presence.gain.value = 0;
            n.comp.threshold.value = 0; n.comp.ratio.value = 1; n.comp.knee.value = 0;
        }
    }, []);

    // Enforce the trim region and apply the gain + fade envelope. Called from both
    // `timeupdate` (fires reliably, even when the tab is backgrounded) and rAF (smooth fades).
    const applyLive = useCallback(() => {
        const el = audioRef.current;
        const n = nodesRef.current;
        const p = paramsRef.current;
        if (!el) return;
        const t = el.currentTime;
        if (!el.paused && t >= p.trimEnd - 0.02) {
            el.pause();
            el.currentTime = p.trimEnd;
            setIsPlaying(false);
            setCurrentTime(p.trimEnd);
            return;
        }
        if (n) {
            let fadeMul = 1;
            if (p.fadeIn > 0 && t - p.trimStart < p.fadeIn) fadeMul = Math.max(0, (t - p.trimStart) / p.fadeIn);
            if (p.fadeOut > 0 && p.trimEnd - t < p.fadeOut) fadeMul = Math.min(fadeMul, Math.max(0, (p.trimEnd - t) / p.fadeOut));
            n.gain.gain.value = Math.pow(10, p.gainDb / 20) * fadeMul;
        }
    }, []);

    const ensureGraph = useCallback(() => {
        if (ctxRef.current || !audioRef.current) return;
        try {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new Ctx();
            const source = ctx.createMediaElementSource(audioRef.current);
            const highpass = ctx.createBiquadFilter(); highpass.type = "highpass"; highpass.frequency.value = 20;
            const mud = ctx.createBiquadFilter(); mud.type = "peaking"; mud.frequency.value = 200; mud.Q.value = 1;
            const presence = ctx.createBiquadFilter(); presence.type = "peaking"; presence.frequency.value = 3000; presence.Q.value = 1.5;
            const comp = ctx.createDynamicsCompressor();
            const gain = ctx.createGain(); gain.gain.value = Math.pow(10, paramsRef.current.gainDb / 20);
            source.connect(highpass); highpass.connect(mud); mud.connect(presence); presence.connect(comp); comp.connect(gain); gain.connect(ctx.destination);
            ctxRef.current = ctx;
            nodesRef.current = { highpass, mud, presence, comp, gain };
            applyEnhanceParams();
        } catch {
            /* Web Audio unavailable — playback still works through the element directly */
        }
    }, [applyEnhanceParams]);

    // rAF loop: smooth fade updates while playing (the clamp itself is also enforced by timeupdate).
    const tick = useCallback(() => {
        applyLive();
        rafRef.current = requestAnimationFrame(tick);
    }, [applyLive]);

    // Keep the UI playhead in sync AND enforce trim/gain on every time update.
    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;
        const onTime = () => { setCurrentTime(el.currentTime); applyLive(); };
        const onEnd = () => setIsPlaying(false);
        el.addEventListener("timeupdate", onTime);
        el.addEventListener("ended", onEnd);
        return () => {
            el.removeEventListener("timeupdate", onTime);
            el.removeEventListener("ended", onEnd);
        };
    }, [applyLive]);

    // Apply enhancement EQ live as the user changes it.
    useEffect(() => { applyEnhanceParams(); }, [enhance, applyEnhanceParams]);
    // Apply gain live when paused (the rAF loop owns it while playing).
    useEffect(() => {
        const n = nodesRef.current;
        if (n && audioRef.current?.paused) n.gain.gain.value = Math.pow(10, gainDb / 20);
    }, [gainDb]);

    // Cleanup graph + loop on unmount.
    useEffect(() => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        ctxRef.current?.close().catch(() => {});
    }, []);

    const togglePlay = () => {
        const el = audioRef.current;
        if (!el) return;
        if (el.paused) {
            ensureGraph();
            ctxRef.current?.resume().catch(() => {});
            const p = paramsRef.current;
            if (el.currentTime < p.trimStart || el.currentTime >= p.trimEnd - 0.02) {
                el.currentTime = p.trimStart;
                setCurrentTime(p.trimStart);
            }
            el.play().catch(() => {});
            setIsPlaying(true);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(tick);
        } else {
            el.pause();
            setIsPlaying(false);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        }
    };

    const seekTo = (t: number) => {
        const el = audioRef.current;
        if (!el) return;
        el.currentTime = Math.max(0, Math.min(t, duration));
        setCurrentTime(el.currentTime);
    };

    // Click the waveform to seek; drag handles to trim.
    const posFromEvent = useCallback((clientX: number) => {
        const rect = waveRef.current?.getBoundingClientRect();
        if (!rect || duration <= 0) return 0;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return ratio * duration;
    }, [duration]);

    const startHandleDrag = (which: "start" | "end") => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const move = (ev: PointerEvent) => {
            const t = posFromEvent(ev.clientX);
            if (which === "start") setTrimStart(Math.min(t, trimEnd - 0.1));
            else setTrimEnd(Math.max(t, trimStart + 0.1));
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    const isTrimmed = trimStart > 0.05 || trimEnd < duration - 0.05;
    const supportsBitrate = (format === "original" ? srcExt : format) !== "wav";

    const handleReset = () => {
        setTrimStart(0);
        setTrimEnd(duration);
        setFormat("original");
        setBitrate("192k");
        setEnhance("off");
        setGainDb(0);
        setNormalize(false);
        setFadeIn(0);
        setFadeOut(0);
        seekTo(0);
    };

    const handleExport = async () => {
        setIsExporting(true);
        const toastId = toast.loading("Processing audio…");
        try {
            const params: Record<string, unknown> = { format };
            if (isTrimmed) {
                params.startTime = String(trimStart.toFixed(2));
                params.endTime = String(trimEnd.toFixed(2));
            }
            if (supportsBitrate) params.bitrate = bitrate;
            if (enhance !== "off") params.enhance = enhance;
            if (gainDb !== 0) params.gainDb = gainDb;
            if (normalize) params.normalize = true;
            if (fadeIn > 0) params.fadeIn = fadeIn;
            if (fadeOut > 0) params.fadeOut = fadeOut;

            await api.post("/api/library/edit", { videoId: audio.id, action: "process-audio", params });
            toast.success("Audio saved to your library", { id: toastId });
            onRefreshLibrary?.();
            requestClose();
        } catch (err: any) {
            toast.error(err.message || "Export failed", { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) requestClose(); }}>
            <DialogContent className="w-[95vw] max-w-2xl sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
                <DialogTitle className="sr-only">Edit audio: {audio.title}</DialogTitle>
                <audio ref={audioRef} src={mediaUrl} preload="metadata" onLoadedMetadata={handleLoadedMetadata} className="hidden" />

                {/* Header */}
                <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-border/60">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <AudioWaveform className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold truncate">{audio.title}</h2>
                        <p className="text-[11px] text-muted-foreground">Audio editor</p>
                    </div>
                </div>

                <div className="p-4 sm:p-5 space-y-5">
                    {/* Waveform + trim */}
                    <div>
                        <div
                            ref={waveRef}
                            className="relative h-24 select-none rounded-lg bg-muted/30 border border-border/50 px-2 cursor-pointer"
                            onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.bar) seekTo(posFromEvent(e.clientX)); }}
                        >
                            {/* Bars */}
                            <div className="flex items-center gap-[1.5px] h-full pointer-events-none">
                                {(peaks && peaks.length ? peaks : Array(WAVE_BARS).fill(0.25)).map((p, i) => {
                                    const t = (i / WAVE_BARS) * duration;
                                    const inTrim = t >= trimStart && t <= trimEnd;
                                    const played = t <= currentTime;
                                    return (
                                        <div
                                            key={i}
                                            data-bar
                                            className={cn(
                                                "flex-1 rounded-full",
                                                inTrim ? (played ? "bg-primary" : "bg-primary/45") : "bg-muted-foreground/20",
                                            )}
                                            style={{ height: `${Math.max(p * 100, 4)}%` }}
                                        />
                                    );
                                })}
                            </div>

                            {/* Dimmed regions outside trim */}
                            <div className="absolute inset-y-0 left-0 bg-background/55 pointer-events-none rounded-l-lg" style={{ width: `${pct(trimStart)}%` }} />
                            <div className="absolute inset-y-0 right-0 bg-background/55 pointer-events-none rounded-r-lg" style={{ width: `${100 - pct(trimEnd)}%` }} />

                            {/* Trim handles */}
                            <div
                                className="absolute inset-y-0 w-3 -ml-1.5 flex items-center justify-center cursor-ew-resize group z-10"
                                style={{ left: `${pct(trimStart)}%` }}
                                onPointerDown={startHandleDrag("start")}
                            >
                                <div className="w-1 h-full bg-primary rounded-full group-hover:w-1.5 transition-all" />
                            </div>
                            <div
                                className="absolute inset-y-0 w-3 -ml-1.5 flex items-center justify-center cursor-ew-resize group z-10"
                                style={{ left: `${pct(trimEnd)}%` }}
                                onPointerDown={startHandleDrag("end")}
                            >
                                <div className="w-1 h-full bg-primary rounded-full group-hover:w-1.5 transition-all" />
                            </div>

                            {/* Playhead */}
                            <div className="absolute inset-y-0 w-px bg-foreground/80 pointer-events-none z-20" style={{ left: `${pct(currentTime)}%` }} />
                        </div>

                        {/* Transport */}
                        <div className="flex items-center gap-3 mt-3">
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={togglePlay}
                                className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0"
                            >
                                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                            </motion.button>
                            <span className="text-xs font-mono tabular-nums text-muted-foreground">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
                            <div className="flex-1" />
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Scissors className="w-3.5 h-3.5" />
                                <span className="font-mono tabular-nums">{fmtTime(trimStart)} – {fmtTime(trimEnd)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Voice Enhancement */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Wand2 className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Voice Enhancement</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {ENHANCE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setEnhance(opt.id)}
                                    className={cn(
                                        "flex flex-col items-center text-center gap-0.5 px-2 py-2.5 rounded-lg border text-xs transition-all",
                                        enhance === opt.id
                                            ? "border-primary bg-primary/10 text-foreground"
                                            : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60",
                                    )}
                                >
                                    <span className="font-medium">{opt.label}</span>
                                    <span className="text-[9px] leading-tight opacity-70 hidden sm:block">{opt.desc}</span>
                                </button>
                            ))}
                        </div>
                        {enhance !== "off" && (
                            <p className="text-[11px] text-muted-foreground">
                                Preview plays the EQ &amp; compression live; full noise removal and loudness-normalize are applied on export.
                            </p>
                        )}
                    </div>

                    {/* Format / bitrate + gain + fades */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Format</label>
                            <Select value={format} onValueChange={(v) => setFormat((v || "original") as any)}>
                                <SelectTrigger className="w-full"><SelectValue>{(v) => ({ original: `Original (${srcExt.toUpperCase()})`, mp3: "MP3", m4a: "M4A (AAC)", wav: "WAV (lossless)" }[String(v)] ?? "Original")}</SelectValue></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="original">Original ({srcExt.toUpperCase()})</SelectItem>
                                    <SelectItem value="mp3">MP3</SelectItem>
                                    <SelectItem value="m4a">M4A (AAC)</SelectItem>
                                    <SelectItem value="wav">WAV (lossless)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className={cn("space-y-1.5", !supportsBitrate && "opacity-40 pointer-events-none")}>
                            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bitrate</label>
                            <Select value={bitrate} onValueChange={(v) => setBitrate(v || "192k")} disabled={!supportsBitrate}>
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

                    {/* Volume + normalize */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Volume2 className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Volume</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">Gain</span>
                            <Slider value={[gainDb]} min={-12} max={12} step={1} onValueChange={(v) => setGainDb((Array.isArray(v) ? v[0] : v) as number)} className="flex-1" />
                            <span className="text-xs font-mono w-12 text-right shrink-0">{gainDb > 0 ? "+" : ""}{gainDb} dB</span>
                        </div>
                        <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/30 cursor-pointer">
                            <div>
                                <span className="text-sm font-medium">Normalize loudness</span>
                                <p className="text-[10px] text-muted-foreground">Even out overall volume to a standard level</p>
                            </div>
                            <Switch checked={normalize} onCheckedChange={setNormalize} />
                        </label>
                    </div>

                    {/* Fades */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-14 shrink-0">Fade in</span>
                            <Slider value={[fadeIn]} min={0} max={5} step={0.5} onValueChange={(v) => setFadeIn((Array.isArray(v) ? v[0] : v) as number)} className="flex-1" />
                            <span className="text-xs font-mono w-8 text-right shrink-0">{fadeIn}s</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-14 shrink-0">Fade out</span>
                            <Slider value={[fadeOut]} min={0} max={5} step={0.5} onValueChange={(v) => setFadeOut((Array.isArray(v) ? v[0] : v) as number)} className="flex-1" />
                            <span className="text-xs font-mono w-8 text-right shrink-0">{fadeOut}s</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/40 px-4 sm:px-5 py-3">
                    <Button variant="outline" size="sm" onClick={handleReset} disabled={isExporting}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
                    </Button>
                    <Button size="sm" onClick={handleExport} disabled={isExporting}>
                        {isExporting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                        {isExporting ? "Processing…" : "Export Audio"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
