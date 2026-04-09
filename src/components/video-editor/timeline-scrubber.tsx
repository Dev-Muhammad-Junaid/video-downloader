"use client";

import React, { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { motion, useMotionValue, useMotionTemplate, useAnimationFrame, useTransform } from "framer-motion";

interface TimelineScrubberProps {
    duration: number;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    trimStart: number;
    trimEnd: number;
    onTrimChange: (start: number, end: number) => void;
    onSeek: (time: number) => void;
}

export function TimelineScrubber({ duration, videoRef, trimStart, trimEnd, onTrimChange, onSeek }: TimelineScrubberProps) {
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

    const handleCommit = (val: number | readonly number[]) => {
        const valueArray = Array.isArray(val) ? val : [val, val];
        onTrimChange(valueArray[0], valueArray[1]);
    };

    // Calculate motion templates for GPU rendering
    const playPercentage = useTransform(mvCurrentTime, t => duration > 0 ? (t / duration) * 100 : 0);
    const startPercentage = useTransform(mvTrimStart, t => duration > 0 ? (t / duration) * 100 : 0);
    // Note: right width is 100% - endPercentage
    const endPercentage = useTransform(mvTrimEnd, t => duration > 0 ? (t / duration) * 100 : 0);
    const rightWidth = useTransform(endPercentage, p => 100 - p);

    const playheadLeft = useMotionTemplate`calc(1.5rem + ${playPercentage}% - (2rem * ${playPercentage}/100))`;
    const startRegionWidth = useMotionTemplate`calc(1.5rem + ${startPercentage}% - (2rem * ${startPercentage}/100))`;
    const endRegionWidth = useMotionTemplate`calc(1.5rem + ${rightWidth}% - (2rem * ${rightWidth}/100))`;

    return (
        <div className="relative w-full h-24 bg-muted rounded-lg flex items-center px-6 overflow-hidden ring-1 ring-border/50">
            {/* Visual playhead tracking current time */}
            <motion.div 
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" 
                style={{ left: playheadLeft }} 
            />

            <div className="w-full relative z-20">
                <Slider
                    defaultValue={[0, duration]}
                    value={localTrim}
                    max={duration}
                    step={0.1}
                    minStepsBetweenValues={0.5}
                    onValueChange={handleValueChange}
                    onValueCommitted={handleCommit}
                    className="w-full h-8"
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
    );
}
