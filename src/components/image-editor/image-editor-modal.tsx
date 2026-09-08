"use client";

import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useModalChrome } from "@/hooks/use-modal-chrome";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
    X,
    Download,
    Loader2,
    Crop as CropIcon,
    SlidersHorizontal,
    FileImage,
    RotateCw,
    RotateCcw,
    FlipHorizontal,
    FlipVertical,
    RotateCcw as Reset,
    RectangleHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { CropOverlay, CropState } from "@/components/video-editor/crop-overlay";

interface ImageItem {
    id: string;
    title: string;
    localPath: string;
    mediaType?: string | null;
}

interface ImageEditorModalProps {
    image: ImageItem;
    onClose: () => void;
    onRefreshLibrary?: () => void;
}

type ImageMode = "crop" | "adjust" | "export";
type Rotation = "none" | "90cw" | "90ccw" | "180";

const ASPECT_RATIOS: { id: string; label: string; w: number; h: number }[] = [
    { id: "original", label: "Original", w: 0, h: 0 },
    { id: "1:1",      label: "1:1",      w: 1, h: 1 },
    { id: "4:3",      label: "4:3",      w: 4, h: 3 },
    { id: "3:4",      label: "3:4",      w: 3, h: 4 },
    { id: "16:9",     label: "16:9",     w: 16, h: 9 },
    { id: "9:16",     label: "9:16",     w: 9, h: 16 },
    { id: "4:5",      label: "4:5",      w: 4, h: 5 },
];

const FORMAT_OPTIONS = [
    { id: "jpg",  label: "JPG",  desc: "Smaller file, lossy" },
    { id: "png",  label: "PNG",  desc: "Lossless, larger file" },
    { id: "webp", label: "WEBP", desc: "Modern, great compression" },
] as const;

export function ImageEditorModal({ image, onClose, onRefreshLibrary }: ImageEditorModalProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [mode, setMode]             = useState<ImageMode>("crop");
    const [crop, setCrop]             = useState<CropState>({ x: 5, y: 5, w: 90, h: 90 });
    const [cropEnabled, setCropEnabled] = useState(false);
    const [aspectRatio, setAspectRatio] = useState("original");

    const [rotation, setRotation]     = useState<Rotation>("none");
    const [flipH, setFlipH]           = useState(false);
    const [flipV, setFlipV]           = useState(false);
    const [brightness, setBrightness] = useState(0);    // -1 to 1
    const [contrast, setContrast]     = useState(1);    // 0 to 3
    const [saturation, setSaturation] = useState(1);    // 0 to 3

    const [outputFormat, setOutputFormat] = useState<"jpg" | "png" | "webp">("jpg");
    const [quality, setQuality]           = useState(85);

    const [isExporting, setIsExporting] = useState(false);

    const modalRef = useRef<HTMLDivElement>(null);

    // Background scroll lock + Esc-to-close + focus-trap (shared, leak-proof).
    useModalChrome(modalRef, onClose);

    // ── Crop helpers ──────────────────────────────────────────────────────────

    const applyAspectRatio = useCallback((ratioId: string) => {
        setAspectRatio(ratioId);
        const preset = ASPECT_RATIOS.find(a => a.id === ratioId)!;
        if (ratioId === "original" || !imgRef.current) {
            setCrop({ x: 5, y: 5, w: 90, h: 90 });
            return;
        }
        const nw = imgRef.current.naturalWidth;
        const nh = imgRef.current.naturalHeight;
        if (!nw || !nh) return;
        const targetRatio = preset.w / preset.h;
        const imageRatio  = nw / nh;

        let cropW: number, cropH: number;
        if (targetRatio > imageRatio) {
            cropW = 90;
            cropH = (imageRatio / targetRatio) * 90;
        } else {
            cropH = 90;
            cropW = (targetRatio / imageRatio) * 90;
        }
        setCrop({
            x: (100 - cropW) / 2,
            y: (100 - cropH) / 2,
            w: cropW,
            h: cropH,
        });
        setCropEnabled(true);
    }, []);

    const handleCropChange = useCallback((next: CropState) => {
        setCrop(next);
        setCropEnabled(true);
    }, []);

    // ── CSS transform preview ─────────────────────────────────────────────────

    const rotationDeg = rotation === "90cw" ? 90 : rotation === "90ccw" ? -90 : rotation === "180" ? 180 : 0;
    const previewTransform = [
        rotationDeg !== 0 ? `rotate(${rotationDeg}deg)` : "",
        flipH ? "scaleX(-1)" : "",
        flipV ? "scaleY(-1)" : "",
    ].filter(Boolean).join(" ") || "none";

    // ── Export ────────────────────────────────────────────────────────────────

    const handleExport = async () => {
        setIsExporting(true);
        const toastId = toast.loading("Exporting image…");
        try {
            // Compute pixel crop values from percentage + natural dimensions
            let pixelCrop: { w: number; h: number; x: number; y: number } | undefined;
            if (cropEnabled && imgRef.current) {
                const nw = imgRef.current.naturalWidth;
                const nh = imgRef.current.naturalHeight;
                pixelCrop = {
                    x: Math.round((crop.x / 100) * nw),
                    y: Math.round((crop.y / 100) * nh),
                    w: Math.round((crop.w / 100) * nw),
                    h: Math.round((crop.h / 100) * nh),
                };
            }

            // Resolve combined rotation+flip into a single token the backend understands
            let rotationParam: string | undefined;
            if (rotation !== "none") rotationParam = rotation;
            else if (flipH && flipV) rotationParam = "180"; // flipH + flipV = 180° rotation
            else if (flipH) rotationParam = "fliph";
            else if (flipV) rotationParam = "flipv";

            const hasAdjust = brightness !== 0 || contrast !== 1 || saturation !== 1;

            await api.post("/api/library/edit", {
                videoId: image.id,
                action: "image-edit",
                params: {
                    ...(pixelCrop     ? { crop: pixelCrop }                  : {}),
                    ...(rotationParam ? { rotation: rotationParam }         : {}),
                    ...(hasAdjust     ? { brightness, contrast, saturation } : {}),
                    format: outputFormat,
                    quality,
                },
            });

            toast.success("Image saved to library!", { id: toastId });
            onRefreshLibrary?.();
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Export failed", { id: toastId });
        } finally {
            setIsExporting(false);
        }
    };

    const hasChanges =
        cropEnabled ||
        rotation !== "none" ||
        flipH || flipV ||
        brightness !== 0 || contrast !== 1 || saturation !== 1;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Edit image: ${image.title}`}
            className="fixed inset-0 z-[60] bg-background text-foreground flex flex-col"
        >
            {/* ── Header ── */}
            {/* Reserves the traffic-light strip, same as the video editor. */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur-md sm:px-5 sm:py-3 in-data-[electron=true]:pl-[82px]! in-data-[electron=true]:pt-[38px]!">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <FileImage className="w-4 h-4 text-primary shrink-0" />
                    <h2 className="font-semibold text-sm truncate max-w-[140px] sm:max-w-[320px]" title={image.title}>{image.title}</h2>
                </div>

                {/* Mode Tabs — own full-width row on mobile, inline on desktop */}
                <div className="order-last w-full sm:order-none sm:w-auto flex justify-center">
                  <div className="flex items-center gap-1 bg-muted/60 rounded-xl p-1 border border-border/40">
                    {([
                        { id: "crop",   label: "Crop",    Icon: CropIcon          },
                        { id: "adjust", label: "Adjust",  Icon: SlidersHorizontal },
                        { id: "export", label: "Export",  Icon: FileImage         },
                    ] as const).map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            onClick={() => setMode(id)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                mode === id
                                    ? "bg-foreground text-background shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        onClick={handleExport}
                        disabled={isExporting}
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                    >
                        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        {isExporting ? "Exporting…" : "Export"}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* ── Main Area ── */}
            <div className="flex-1 flex flex-col min-h-0">
                {/* Image Preview */}
                <div
                    ref={containerRef}
                    className="flex-1 flex items-center justify-center bg-black/90 relative overflow-hidden min-h-0"
                >
                    <div className="relative max-w-full max-h-full flex items-center justify-center"
                        style={{ width: "100%", height: "100%" }}>
                        <img
                            ref={imgRef}
                            src={`/api/media?path=${encodeURIComponent(image.localPath)}`}
                            alt={image.title}
                            className="max-w-full max-h-full object-contain select-none"
                            style={{
                                transform: mode === "adjust" ? previewTransform : "none",
                                transition: "transform 0.25s ease",
                                filter: mode === "adjust"
                                    ? `brightness(${1 + brightness}) contrast(${contrast}) saturate(${saturation})`
                                    : "none",
                            }}
                            draggable={false}
                        />
                        <AnimatePresence>
                            {mode === "crop" && (
                                <motion.div
                                    className="absolute inset-0"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <CropOverlay
                                        crop={crop}
                                        onChange={handleCropChange}
                                        containerRef={containerRef}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* ── Bottom Controls ── */}
                <AnimatePresence mode="popLayout">
                    {mode === "crop" && (
                        <motion.div
                            key="crop-panel"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 12 }}
                            transition={{ duration: 0.18 }}
                            className="border-t border-border bg-card/80 backdrop-blur-sm shrink-0"
                        >
                            {/* Aspect Ratio Presets */}
                            <div className="px-5 py-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <RectangleHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                                    <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Aspect Ratio</h3>
                                    {cropEnabled && (
                                        <button
                                            onClick={() => { setCropEnabled(false); setCrop({ x: 5, y: 5, w: 90, h: 90 }); setAspectRatio("original"); }}
                                            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                                        >
                                            <Reset className="w-3 h-3" /> Reset
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {ASPECT_RATIOS.map(ratio => (
                                        <button
                                            key={ratio.id}
                                            onClick={() => applyAspectRatio(ratio.id)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                                aspectRatio === ratio.id
                                                    ? "bg-primary/15 border-primary/40 text-foreground"
                                                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                                            )}
                                        >
                                            {ratio.label}
                                        </button>
                                    ))}
                                </div>
                                {!cropEnabled && (
                                    <p className="text-[10px] text-muted-foreground mt-3 opacity-70">Drag the crop box or pick an aspect ratio to enable cropping.</p>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {mode === "adjust" && (
                        <motion.div
                            key="adjust-panel"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 12 }}
                            transition={{ duration: 0.18 }}
                            className="border-t border-border bg-card/80 backdrop-blur-sm shrink-0"
                        >
                            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Rotate / Flip */}
                                <div>
                                    <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Rotate &amp; Flip</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            variant={rotation === "90ccw" ? "default" : "outline"}
                                            size="sm" className="h-8 gap-1.5 text-xs"
                                            onClick={() => setRotation(r => r === "90ccw" ? "none" : "90ccw")}
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" /> 90° CCW
                                        </Button>
                                        <Button
                                            variant={rotation === "90cw" ? "default" : "outline"}
                                            size="sm" className="h-8 gap-1.5 text-xs"
                                            onClick={() => setRotation(r => r === "90cw" ? "none" : "90cw")}
                                        >
                                            <RotateCw className="w-3.5 h-3.5" /> 90° CW
                                        </Button>
                                        <Button
                                            variant={rotation === "180" ? "default" : "outline"}
                                            size="sm" className="h-8 gap-1.5 text-xs"
                                            onClick={() => setRotation(r => r === "180" ? "none" : "180")}
                                        >
                                            <RotateCw className="w-3.5 h-3.5" /> 180°
                                        </Button>
                                        <Button
                                            variant={flipH ? "default" : "outline"}
                                            size="sm" className="h-8 gap-1.5 text-xs"
                                            onClick={() => setFlipH(v => !v)}
                                        >
                                            <FlipHorizontal className="w-3.5 h-3.5" /> Flip H
                                        </Button>
                                        <Button
                                            variant={flipV ? "default" : "outline"}
                                            size="sm" className="h-8 gap-1.5 text-xs"
                                            onClick={() => setFlipV(v => !v)}
                                        >
                                            <FlipVertical className="w-3.5 h-3.5" /> Flip V
                                        </Button>
                                        {(rotation !== "none" || flipH || flipV) && (
                                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground"
                                                onClick={() => { setRotation("none"); setFlipH(false); setFlipV(false); }}>
                                                <Reset className="w-3.5 h-3.5" /> Reset
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Colour Adjustments */}
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Colour</h3>
                                    <SliderRow
                                        label="Brightness"
                                        value={brightness}
                                        min={-1} max={1} step={0.05}
                                        displayValue={brightness >= 0 ? `+${(brightness * 100).toFixed(0)}` : `${(brightness * 100).toFixed(0)}`}
                                        onChange={setBrightness}
                                        onReset={() => setBrightness(0)}
                                        isDefault={brightness === 0}
                                    />
                                    <SliderRow
                                        label="Contrast"
                                        value={contrast}
                                        min={0} max={3} step={0.05}
                                        displayValue={contrast.toFixed(2)}
                                        onChange={setContrast}
                                        onReset={() => setContrast(1)}
                                        isDefault={contrast === 1}
                                    />
                                    <SliderRow
                                        label="Saturation"
                                        value={saturation}
                                        min={0} max={3} step={0.05}
                                        displayValue={saturation.toFixed(2)}
                                        onChange={setSaturation}
                                        onReset={() => setSaturation(1)}
                                        isDefault={saturation === 1}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {mode === "export" && (
                        <motion.div
                            key="export-panel"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 12 }}
                            transition={{ duration: 0.18 }}
                            className="border-t border-border bg-card/80 backdrop-blur-sm shrink-0"
                        >
                            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Format picker */}
                                <div>
                                    <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Output Format</h3>
                                    <div className="flex gap-2">
                                        {FORMAT_OPTIONS.map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => setOutputFormat(f.id)}
                                                className={cn(
                                                    "flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border text-xs transition-all",
                                                    outputFormat === f.id
                                                        ? "bg-primary/15 border-primary/40 text-foreground"
                                                        : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                                                )}
                                            >
                                                <span className="text-[13px] font-semibold">{f.label}</span>
                                                <span className="text-[10px] opacity-70">{f.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Quality slider (jpg / webp only) */}
                                <div>
                                    <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                        Quality {outputFormat === "png" && <span className="normal-case text-[9px] opacity-60">(PNG is always lossless)</span>}
                                    </h3>
                                    <SliderRow
                                        label="Quality"
                                        value={quality}
                                        min={10} max={100} step={5}
                                        displayValue={`${quality}%`}
                                        onChange={setQuality}
                                        onReset={() => setQuality(85)}
                                        isDefault={quality === 85}
                                        disabled={outputFormat === "png"}
                                    />
                                    <p className="mt-3 text-[10px] text-muted-foreground opacity-70">
                                        {hasChanges
                                            ? "Crop, adjustments, and format will all be applied in a single pass."
                                            : "No edits selected — export will convert format only."}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

// ── Small helper component ────────────────────────────────────────────────────

function SliderRow({
    label, value, min, max, step, displayValue,
    onChange, onReset, isDefault, disabled = false,
}: {
    label: string; value: number; min: number; max: number; step: number;
    displayValue: string; onChange: (v: number) => void;
    onReset: () => void; isDefault: boolean; disabled?: boolean;
}) {
    return (
        <div className={cn("flex items-center gap-3", disabled && "opacity-40")}>
            <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
            <Slider
                value={value}
                min={min} max={max} step={step}
                disabled={disabled}
                onValueChange={(v) => onChange(v as number)}
                className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right shrink-0">{displayValue}</span>
            {!isDefault && (
                <button onClick={onReset} className="text-muted-foreground hover:text-foreground transition-colors">
                    <Reset className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}
