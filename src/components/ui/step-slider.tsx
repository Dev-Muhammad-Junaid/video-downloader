"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";

/**
 * A slider for a small number of named steps.
 *
 * Shaped like a segmented track rather than a hairline with a dot: a recessed
 * pill holding one marker per position, with a raised thumb that lands on
 * them. At three or four steps the positions are the whole point, and a thin
 * line gives no sense of where they are or how many remain.
 */
interface StepSliderProps {
    value: number;
    onValueChange: (value: number) => void;
    /** One entry per step; length defines the range. */
    steps: number;
    className?: string;
    "aria-label"?: string;
}

/** Thumb width; the markers need it to line up with where the thumb stops. */
const THUMB_W = 30;

export function StepSlider({ value, onValueChange, steps, className, ...rest }: StepSliderProps) {
    const max = Math.max(0, steps - 1);

    return (
        <SliderPrimitive.Root
            value={value}
            onValueChange={(v) => onValueChange((Array.isArray(v) ? v[0] : v) as number)}
            min={0}
            max={max}
            step={1}
            thumbAlignment="edge"
            className={cn("w-full", className)}
            aria-label={rest["aria-label"]}
        >
            <SliderPrimitive.Control className="relative flex h-7 w-full touch-none items-center select-none">
                <SliderPrimitive.Track className="relative h-7 w-full rounded-[9px] bg-muted select-none">
                    {/* One marker per step, so the number of positions and how
                        far the thumb has to travel are both visible at rest. */}
                    {Array.from({ length: steps }, (_, i) => (
                        <span
                            key={i}
                            aria-hidden="true"
                            // Positioned where the THUMB's centre lands, not
                            // where a bare percentage would put it: the thumb
                            // travels the track minus its own width, so the two
                            // only line up once that is accounted for.
                            className="pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/30"
                            style={{ left: `calc(${THUMB_W / 2}px + ${max === 0 ? 0 : i / max} * (100% - ${THUMB_W}px))` }}
                        />
                    ))}
                    <SliderPrimitive.Indicator className="h-full rounded-l-[9px] bg-foreground/[0.07] select-none" />
                </SliderPrimitive.Track>

                <SliderPrimitive.Thumb
                    className={cn(
                        "relative block h-[26px] w-[30px] shrink-0 rounded-[8px] bg-foreground select-none",
                        "shadow-[0_1px_3px_rgb(0_0_0/0.35)]",
                        "ring-ring/50 transition-[box-shadow] after:absolute after:-inset-2",
                        "hover:ring-2 focus-visible:ring-2 focus-visible:outline-hidden active:ring-2",
                    )}
                />
            </SliderPrimitive.Control>
        </SliderPrimitive.Root>
    );
}
