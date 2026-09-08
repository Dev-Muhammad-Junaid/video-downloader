"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption {
    value: string;
    label: React.ReactNode;
    /** Announced to screen readers when `label` is an icon rather than text. */
    title?: string;
}

/**
 * AppKit segmented control.
 *
 * The shape people recognise is a single recessed track with one raised
 * "thumb" sliding across it — not a row of adjacent bordered buttons. The
 * thumb is the only element with a fill and a shadow; unselected segments are
 * plain text on the track.
 */
export function SegmentedControl({
    value,
    onValueChange,
    options,
    className,
    size = "default",
    stretch = false,
}: {
    value: string;
    onValueChange: (value: string) => void;
    options: SegmentedOption[];
    className?: string;
    size?: "default" | "sm";
    /** Segments share the control's full width instead of hugging their labels. */
    stretch?: boolean;
}) {
    return (
        <div
            role="radiogroup"
            className={cn(
                "inline-flex shrink-0 items-center gap-0.5 rounded-[7px] bg-muted p-0.5",
                stretch ? "flex w-full" : "w-fit",
                "shadow-[inset_0_0_0_0.5px_var(--hairline)]",
                className
            )}
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        title={option.title}
                        onClick={() => onValueChange(option.value)}
                        className={cn(
                            "inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap transition-[background-color,box-shadow,color] duration-100 outline-none select-none",
                            "focus-visible:ring-[3px] focus-visible:ring-ring/45",
                            "[&_svg]:pointer-events-none [&_svg]:shrink-0",
                            stretch && "flex-1",
                            size === "sm"
                                ? "h-[19px] px-2 text-[11px] [&_svg]:size-3"
                                : "h-[23px] px-2.5 text-[12px] [&_svg]:size-3.5",
                            selected
                                ? "bg-elevated text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.06)] dark:bg-white/16 dark:shadow-[0_1px_2px_rgb(0_0_0/0.3)]"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
