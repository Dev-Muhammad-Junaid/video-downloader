"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Download,
    Library,
    Scissors,
    Cloud,
    Sparkles,
    ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "snapdown_onboarding_seen";

const slides = [
    {
        icon: Sparkles,
        title: "Welcome to SnapDown",
        body: "A local-first media studio: download videos, images, and audio from social platforms, then organize, edit, and back them up — all on your own Mac.",
    },
    {
        icon: Download,
        title: "Paste a link, get the right quality",
        body: "Drop one link, several, or a whole playlist into the Studio Downloader. Quality profiles matched by site pick the right resolution and format automatically — set them once in Settings.",
    },
    {
        icon: Library,
        title: "A real library, not just a folder",
        body: "Search by title, label, or transcript (AI-powered deep search), filter by platform or type, group by date, and manage everything in bulk.",
    },
    {
        icon: Scissors,
        title: "Edit right where it lives",
        body: "Trim and crop video, burn in AI-transcribed subtitles with a live style preview, tweak images, and process audio — no separate app needed.",
    },
    {
        icon: Cloud,
        title: "Back it up when you're ready",
        body: "Push items to Cloudflare R2 (or any S3-compatible bucket) individually, in bulk, or automatically by label — from the Cloud Sync tab.",
    },
];

/** Shows once on first launch (tracked in localStorage). Re-openable from
 *  Settings, so dismissing it isn't a one-way door. */
export function OnboardingModal() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        // Check localStorage once after mount (kept out of SSR to avoid a
        // hydration mismatch). Intentional post-mount setState.
        /* eslint-disable react-hooks/set-state-in-effect */
        try {
            if (!localStorage.getItem(STORAGE_KEY)) {
                setOpen(true);
            }
        } catch {
            // localStorage unavailable — skip onboarding rather than crash
        }
        /* eslint-enable react-hooks/set-state-in-effect */
    }, []);

    const close = () => {
        setOpen(false);
        try { localStorage.setItem(STORAGE_KEY, "true"); } catch { }
    };

    const isLast = step === slides.length - 1;
    const slide = slides[step];

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
            <DialogContent className="max-w-md p-0 gap-0 overflow-hidden" showCloseButton={false}>
                <DialogTitle className="sr-only">Welcome to SnapDown</DialogTitle>
                <div className="p-8 pb-6 flex flex-col items-center text-center min-h-[300px] justify-center">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col items-center gap-4"
                        >
                            <div className="flex size-14 items-center justify-center rounded-[14px] bg-primary/10">
                                <slide.icon className="size-6 text-primary" strokeWidth={1.75} />
                            </div>
                            <h2 className="text-[17px] font-semibold tracking-[-0.015em]">{slide.title}</h2>
                            <p className="max-w-[340px] text-[13px] leading-relaxed text-muted-foreground">
                                {slide.body}
                            </p>
                        </motion.div>
                    </AnimatePresence>
                </div>

                <div className="flex items-center justify-between gap-3 border-t bg-muted/60 px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                        {slides.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setStep(i)}
                                aria-label={`Go to step ${i + 1}`}
                                className={cn(
                                    "h-1.5 rounded-full transition-all",
                                    i === step ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground/40"
                                )}
                            />
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        {!isLast && (
                            <Button variant="ghost" size="sm" onClick={close}>Skip</Button>
                        )}
                        <Button
                            size="sm"
                            className="gap-1"
                            onClick={() => (isLast ? close() : setStep((s) => s + 1))}
                        >
                            {isLast ? "Get started" : "Next"}
                            {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** For a manual "Show tour again" entry point (e.g. in Settings). */
export function restartOnboarding() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
    } catch {
        // no-op if localStorage is unavailable
    }
}
