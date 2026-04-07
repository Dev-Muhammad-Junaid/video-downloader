import React, { useRef, useEffect } from "react";
import { motion, useMotionValue, useMotionTemplate } from "framer-motion";

export interface CropState {
    x: number; // percentage
    y: number; // percentage
    w: number; // percentage
    h: number; // percentage
}

interface CropOverlayProps {
    crop: CropState;
    onChange: (crop: CropState) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export function CropOverlay({ crop, onChange, containerRef }: CropOverlayProps) {
    const isDragging = useRef<string | null>(null);

    // Motion values store the current percentage values
    const mvX = useMotionValue(crop.x);
    const mvY = useMotionValue(crop.y);
    const mvW = useMotionValue(crop.w);
    const mvH = useMotionValue(crop.h);

    // Sync from prop (e.g. if reset)
    useEffect(() => {
        mvX.set(crop.x);
        mvY.set(crop.y);
        mvW.set(crop.w);
        mvH.set(crop.h);
    }, [crop.x, crop.y, crop.w, crop.h, mvX, mvY, mvW, mvH]);

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!isDragging.current || !containerRef.current) return;
            const container = containerRef.current.getBoundingClientRect();
            // Calculate delta in percentage
            const dx = (e.movementX / container.width) * 100;
            const dy = (e.movementY / container.height) * 100;

            const cx = mvX.get();
            const cy = mvY.get();
            const cw = mvW.get();
            const ch = mvH.get();

            let newX = cx;
            let newY = cy;
            let newW = cw;
            let newH = ch;

            if (isDragging.current === "box") {
                newX = Math.max(0, Math.min(100 - cw, cx + dx));
                newY = Math.max(0, Math.min(100 - ch, cy + dy));
            } else if (isDragging.current.includes("nw")) {
                newX = Math.min(cx + cw - 5, Math.max(0, cx + dx));
                newY = Math.min(cy + ch - 5, Math.max(0, cy + dy));
                newW = cx + cw - newX;
                newH = cy + ch - newY;
            } else if (isDragging.current.includes("ne")) {
                newW = Math.max(5, Math.min(100 - cx, cw + dx));
                newY = Math.min(cy + ch - 5, Math.max(0, cy + dy));
                newH = cy + ch - newY;
            } else if (isDragging.current.includes("sw")) {
                newX = Math.min(cx + cw - 5, Math.max(0, cx + dx));
                newH = Math.max(5, Math.min(100 - cy, ch + dy));
                newW = cx + cw - newX;
            } else if (isDragging.current.includes("se")) {
                newW = Math.max(5, Math.min(100 - cx, cw + dx));
                newH = Math.max(5, Math.min(100 - cy, ch + dy));
            }

            mvX.set(newX);
            mvY.set(newY);
            mvW.set(newW);
            mvH.set(newH);
        };

        const handlePointerUp = () => {
            if (isDragging.current) {
                isDragging.current = null;
                // Commit to React state ONLY when done dragging
                onChange({
                    x: mvX.get(),
                    y: mvY.get(),
                    w: mvW.get(),
                    h: mvH.get()
                });
            }
        };

        if (typeof window !== "undefined") {
            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
            window.addEventListener("pointerleave", handlePointerUp);
        }

        return () => {
            if (typeof document !== "undefined") {
                window.removeEventListener("pointermove", handlePointerMove);
                window.removeEventListener("pointerup", handlePointerUp);
                window.removeEventListener("pointerleave", handlePointerUp);
            }
        };
    }, [containerRef, mvX, mvY, mvW, mvH, onChange]);

    const handlePointerDown = (type: string) => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isDragging.current = type;
        // Optional: Retain pointer capture if desired by capturing on container
    };

    // Construct hardware-accelerated style values using useMotionTemplate
    const leftPct = useMotionTemplate`${mvX}%`;
    const topPct = useMotionTemplate`${mvY}%`;
    const wPct = useMotionTemplate`${mvW}%`;
    const hPct = useMotionTemplate`${mvH}%`;

    // clipPath visually punches a hole for the crop box
    // To cleanly calculate in CSS, we use `calc()`
    const clipPathStr = useMotionTemplate`polygon(
        0% 0%, 100% 0%, 100% 100%, 0% 100%, 
        0% 0%, 
        ${mvX}% ${mvY}%, 
        ${mvX}% calc(${mvY}% + ${mvH}%), 
        calc(${mvX}% + ${mvW}%) calc(${mvY}% + ${mvH}%), 
        calc(${mvX}% + ${mvW}%) ${mvY}%, 
        ${mvX}% ${mvY}%
    )`;

    return (
        <motion.div
            className="absolute inset-0 z-10 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <div className="w-full h-full relative overflow-hidden">
                {/* Darken outside */}
                <motion.div 
                    className="absolute inset-0 bg-black/50 overflow-hidden" 
                    style={{ clipPath: clipPathStr }}
                />

                {/* The Crop Box */}
                <motion.div
                    className="absolute border-2 border-white pointer-events-auto cursor-move group/crop shadow-[0_0_20px_rgba(0,0,0,0.5)]"
                    style={{
                        left: leftPct,
                        top: topPct,
                        width: wPct,
                        height: hPct,
                    }}
                    onPointerDown={handlePointerDown("box")}
                    layoutId="crop-bounds"
                >
                    {/* Grid lines inside */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-0 group-hover/crop:opacity-100 transition-opacity duration-300 pointer-events-none">
                        <div className="border-r border-b border-white/30" />
                        <div className="border-r border-b border-white/30" />
                        <div className="border-b border-white/30" />
                        <div className="border-r border-b border-white/30" />
                        <div className="border-r border-b border-white/30" />
                        <div className="border-b border-white/30" />
                        <div className="border-r border-white/30" />
                        <div className="border-r border-white/30" />
                        <div className="" />
                    </div>

                    {/* Handles */}
                    <div className="absolute -top-2 -left-2 w-4 h-4 bg-white rounded-full cursor-nwse-resize shadow-md" onPointerDown={handlePointerDown("nw")} />
                    <div className="absolute -top-2 -right-2 w-4 h-4 bg-white rounded-full cursor-nesw-resize shadow-md" onPointerDown={handlePointerDown("ne")} />
                    <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-white rounded-full cursor-nesw-resize shadow-md" onPointerDown={handlePointerDown("sw")} />
                    <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white rounded-full cursor-nwse-resize shadow-md" onPointerDown={handlePointerDown("se")} />
                </motion.div>
            </div>
        </motion.div>
    );
}
