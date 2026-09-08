import { cn } from "@/lib/utils";

/**
 * The small, quiet, uppercase heading macOS uses to separate groups — a source
 * list's section header and a settings list's group title are the same thing.
 *
 * Shared so the tracking, weight and colour of every group heading move
 * together; they were previously restated at each call site and had already
 * drifted apart in size.
 */
export function SectionLabel({
    className,
    ...props
}: React.ComponentProps<"h2">) {
    return (
        <h2
            data-slot="section-label"
            className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground select-none",
                className
            )}
            {...props}
        />
    );
}
