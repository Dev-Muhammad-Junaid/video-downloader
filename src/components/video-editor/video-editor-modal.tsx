"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Play, Pause, RotateCcw, Scissors, Loader2, Crop as CropIcon } from "lucide-react";
import { TimelineScrubber } from "./timeline-scrubber";
import { toast } from "sonner";
import { motion, AnimatePresence, useAnimationFrame } from "framer-motion";
import { CropOverlay, CropState } from "./crop-overlay";

interface Video {
    id: string;
    title: string;
    localPath: string;
    mediaType?: string | null;
}

interface VideoEditorModalProps {
    video: Video;
    onClose: () => void;
    onRefreshLibrary?: () => void;
}

export function VideoEditorModal({ video, onClose, onRefreshLibrary }: VideoEditorModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const timeDisplayRef = useRef<HTMLSpanElement>(null);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const [mode, setMode] = useState<"trim" | "crop">("trim");

    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    
    // Default 80% box centered
    const [crop, setCrop] = useState<CropState>({ x: 10, y: 10, w: 80, h: 80 });

    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
            setTrimEnd(videoRef.current.duration);
            if (timeDisplayRef.current) {
                timeDisplayRef.current.innerText = new Date(0).toISOString().substr(14, 5);
            }
        }
    };

    useAnimationFrame(() => {
        if (videoRef.current) {
            const current = videoRef.current.currentTime;

            // Bounds locking: If playing and it passes trim end, pause.
            if (current >= trimEnd && isPlaying && mode === "trim") {
                videoRef.current.pause();
                setIsPlaying(false);
                videoRef.current.currentTime = trimEnd;
            }

            if (timeDisplayRef.current) {
                timeDisplayRef.current.innerText = new Date(current * 1000).toISOString().substr(14, 5);
            }
        }
    });

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            // Re-start from start trim if currently at the end
            if (mode === "trim" && videoRef.current.currentTime >= trimEnd) {
                videoRef.current.currentTime = trimStart;
            }
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            if (timeDisplayRef.current) {
                timeDisplayRef.current.innerText = new Date(time * 1000).toISOString().substr(14, 5);
            }
        }
    };

    const handleApplyExport = async () => {
        setIsExporting(true);
        const toastId = toast.loading(`Exporting your ${mode === "trim" ? "trimmed" : "cropped"} media...`);
        try {
            let bodyPayload: any = {
                videoId: video.id,
            };

            if (mode === "trim") {
                if (trimEnd - trimStart <= 0.1) {
                    throw new Error("Trim duration is too short.");
                }
                bodyPayload.action = "trim";
                bodyPayload.params = {
                    startTime: trimStart,
                    endTime: trimEnd,
                };
            } else if (mode === "crop") {
                if (!videoRef.current) throw new Error("Video element missing.");
                const nw = videoRef.current.videoWidth;
                const nh = videoRef.current.videoHeight;
                if (!nw || !nh) throw new Error("Could not detect native video resolution.");
                
                // Map percentages to native pixels
                const exactX = Math.round((crop.x / 100) * nw);
                const exactY = Math.round((crop.y / 100) * nh);
                const exactW = Math.round((crop.w / 100) * nw);
                const exactH = Math.round((crop.h / 100) * nh);

                bodyPayload.action = "crop";
                bodyPayload.params = {
                    x: exactX,
                    y: exactY,
                    w: exactW,
                    h: exactH,
                };
            }

            const res = await fetch("/api/library/edit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to edit media");
            
            toast.success(`Media successfully ${mode === "trim" ? "trimmed" : "cropped"}!`, { id: toastId });
            onRefreshLibrary?.();
            onClose(); 
        } catch (error: any) {
            toast.error(error.message, { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[60] bg-black text-white flex flex-col"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/50 backdrop-blur-md relative">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-white/10">
                        <X className="w-5 h-5 text-white" />
                    </Button>
                    <h2 className="text-lg font-medium tracking-tight text-white/90 truncate max-w-sm">
                        Editing {video.title}
                    </h2>
                </div>

                {/* Mode segmented control */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/10 p-1 rounded-full flex gap-1 items-center backdrop-blur-xl">
                    <button 
                        onClick={() => setMode("trim")}
                        className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-300 flex items-center gap-2 ${mode === "trim" ? "bg-white text-black shadow-lg" : "text-white/70 hover:text-white"}`}
                    >
                        <Scissors className="w-4 h-4" /> Trim
                    </button>
                    <button 
                        onClick={() => setMode("crop")}
                        className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-300 flex items-center gap-2 ${mode === "crop" ? "bg-white text-black shadow-lg" : "text-white/70 hover:text-white"}`}
                    >
                        <CropIcon className="w-4 h-4" /> Crop
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        onClick={() => {
                            if (mode === "trim") {
                                setTrimStart(0);
                                setTrimEnd(duration);
                                handleSeek(0);
                            } else {
                                setCrop({ x: 10, y: 10, w: 80, h: 80 });
                            }
                        }}
                    >
                        <RotateCcw className="w-4 h-4 mr-2" /> Reset
                    </Button>
                    <Button 
                        size="sm"
                        className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20 shadow-lg"
                        onClick={handleApplyExport}
                        disabled={isExporting}
                    >
                        {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : mode === "trim" ? <Scissors className="w-4 h-4 mr-2" /> : <CropIcon className="w-4 h-4 mr-2" />}
                        Export {mode === "trim" ? "Trim" : "Crop"}
                    </Button>
                </div>
            </div>

            {/* Main Stage */}
            <div className="flex-1 overflow-hidden relative bg-neutral-950 flex items-center justify-center p-8 select-none">
                {video.localPath ? (
                    <div ref={containerRef} className="relative max-h-full max-w-full flex items-center justify-center">
                        <video
                            ref={videoRef}
                            src={`/api/media?path=${encodeURIComponent(video.localPath)}`}
                            className="max-h-full max-w-full rounded-md shadow-2xl object-contain bg-black/50"
                            onLoadedMetadata={handleLoadedMetadata}
                            onEnded={() => setIsPlaying(false)}
                            onClick={togglePlay}
                        />
                        <AnimatePresence>
                            {mode === "crop" && (
                                <CropOverlay 
                                    crop={crop} 
                                    onChange={setCrop} 
                                    containerRef={containerRef} 
                                />
                            )}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-neutral-500">Media not available offline.</p>
                    </div>
                )}
            </div>

            {/* Timeline & Controls */}
            <motion.div 
                layout
                className="border-t border-white/10 bg-neutral-900/80 backdrop-blur-xl p-6 flex flex-col justify-center gap-4 relative z-[70]"
                animate={{ height: mode === "trim" ? 192 : 120 }}
            >
                <div className="flex items-center justify-between w-full">
                    <span ref={timeDisplayRef} className="text-xs text-neutral-400 font-mono">
                        00:00
                    </span>
                    
                    <div className="flex items-center gap-6">
                        <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10 transition-transform active:scale-95" onClick={() => handleSeek(Math.max(0, (videoRef.current?.currentTime || 0) - 5))}>
                            <span className="text-xs font-bold">-5s</span>
                        </Button>
                        <Button variant="outline" size="icon" className="w-12 h-12 rounded-full border-white/20 hover:bg-white/10 transition-transform active:scale-90" onClick={togglePlay}>
                            {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-1" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10 transition-transform active:scale-95" onClick={() => handleSeek(Math.min(duration, (videoRef.current?.currentTime || 0) + 5))}>
                            <span className="text-xs font-bold">+5s</span>
                        </Button>
                    </div>

                    <span className="text-xs text-neutral-400 font-mono">
                        {new Date(duration * 1000).toISOString().substr(14, 5)}
                    </span>
                </div>

                <AnimatePresence>
                    {mode === "trim" && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="mt-2"
                        >
                            <TimelineScrubber 
                                duration={duration}
                                videoRef={videoRef}
                                trimStart={trimStart}
                                trimEnd={trimEnd}
                                onTrimChange={(start, end) => {
                                    setTrimStart(start);
                                    setTrimEnd(end);
                                }}
                                onSeek={handleSeek}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
}
