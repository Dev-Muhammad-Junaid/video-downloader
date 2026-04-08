"use client";

import React, { useRef, useEffect } from "react";
import { motion, useMotionValue, useMotionTemplate, animate } from "framer-motion";

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
    /** When true the overlay is visual-only (used in trim mode for aspect ratio preview) */
    readOnly?: boolean;
}

const SPRING = { stiffness: 320, damping: 28 };

export function CropOverlay({ crop, onChange, containerRef, readOnly = false }: CropOverlayProps) {
    const isDragging = useRef<string | null>(null);

    // Display values as motion values
    const mvX = useMotionValue(crop.x);
    const mvY = useMotionValue(crop.y);
    const mvW = useMotionValue(crop.w);
    const mvH = useMotionValue(crop.h);

    // When props change (e.g. from aspect ratio preset), spring-animate to the new values.
    // During dragging we call .set() directly (immediate), so the spring only activates
    // for programmatic changes from outside.
    useEffect(() => {
        if (isDragging.current) return; // skip animation while dragging
        animate(mvX, crop.x, { type: "spring", ...SPRING });
        animate(mvY, crop.y, { type: "spring", ...SPRING });
        animate(mvW, crop.w, { type: "spring", ...SPRING });
        animate(mvH, crop.h, { type: "spring", ...SPRING });
    }, [crop.x, crop.y, crop.w, crop.h, mvX, mvY, mvW, mvH]);

    useEffect(() => {
        if (readOnly) return; // no pointer events in read-only mode

        const handlePointerMove = (e: PointerEvent) => {
            if (!isDragging.current || !containerRef.current) return;
            const container = containerRef.current.getBoundingClientRect();
            const dx = (e.movementX / container.width) * 100;
            const dy = (e.movementY / container.height) * 100;

            const cx = mvX.get();
            const cy = mvY.get();
            const cw = mvW.get();
            const ch = mvH.get();

            let newX = cx, newY = cy, newW = cw, newH = ch;

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

            // Immediate set during drag — no spring delay
            mvX.set(newX);
            mvY.set(newY);
            mvW.set(newW);
            mvH.set(newH);
        };

        const handlePointerUp = () => {
            if (isDragging.current) {
                isDragging.current = null;
                onChange({ x: mvX.get(), y: mvY.get(), w: mvW.get(), h: mvH.get() });
            }
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointerleave", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointerleave", handlePointerUp);
        };
    }, [containerRef, mvX, mvY, mvW, mvH, onChange, readOnly]);

    const handlePointerDown = (type: string) => (e: React.PointerEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        isDragging.current = type;
    };

    const leftPct    = useMotionTemplate`${mvX}%`;
    const topPct     = useMotionTemplate`${mvY}%`;
    const wPct       = useMotionTemplate`${mvW}%`;
    const hPct       = useMotionTemplate`${mvH}%`;

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
            transition={{ duration: 0.2 }}
        >
            <div className="w-full h-full relative overflow-hidden">
                {/* Darken everything outside the crop region */}
                <motion.div
                    className="absolute inset-0 bg-black/55 overflow-hidden"
                    style={{ clipPath: clipPathStr }}
                />

                {/* The crop region box */}
                <motion.div
                    className={`absolute border-2 border-white shadow-[0_0_20px_rgba(0,0,0,0.5)] group/crop ${readOnly ? "cursor-default" : "pointer-events-auto cursor-move"}`}
                    style={{ left: leftPct, top: topPct, width: wPct, height: hPct }}
                    onPointerDown={handlePointerDown("box")}
                >
                    {/* Rule-of-thirds grid lines */}
                    <div className={`absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none transition-opacity duration-300 ${readOnly ? "opacity-30" : "opacity-0 group-hover/crop:opacity-100"}`}>
                        <div className="border-r border-b border-white/30" />
                        <div className="border-r border-b border-white/30" />
                        <div className="border-b border-white/30" />
                        <div className="border-r border-b border-white/30" />
                        <div className="border-r border-b border-white/30" />
                        <div className="border-b border-white/30" />
                        <div className="border-r border-white/30" />
                        <div className="border-r border-white/30" />
                        <div />
                    </div>

                    {/* Resize handles — hidden in readOnly mode */}
                    {!readOnly && (
                        <>
                            <div className="absolute -top-2 -left-2 w-4 h-4 bg-white rounded-full cursor-nwse-resize shadow-md" onPointerDown={handlePointerDown("nw")} />
                            <div className="absolute -top-2 -right-2 w-4 h-4 bg-white rounded-full cursor-nesw-resize shadow-md" onPointerDown={handlePointerDown("ne")} />
                            <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-white rounded-full cursor-nesw-resize shadow-md" onPointerDown={handlePointerDown("sw")} />
                            <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white rounded-full cursor-nwse-resize shadow-md" onPointerDown={handlePointerDown("se")} />
                        </>
                    )}
                </motion.div>
            </div>
        </motion.div>
    );
}
