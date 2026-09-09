"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ExportQuality } from "@/lib/encoder";

/**
 * Quality picker shown next to Export whenever the export will re-encode.
 *
 * A pure trim is a stream copy — no encoder runs at all — so the picker is
 * hidden for that case rather than offering a choice that changes nothing.
 *
 * The labels describe outcomes (file size, quality) rather than codec settings:
 * every tier now runs on the hardware media engine, so none of them is the
 * "slow" option the old software x264 path was. The tooltips carry the detail.
 *
 * Deliberately a SegmentedControl rather than a dropdown: neither the Base UI
 * DropdownMenu nor Select popup opens on a real pointer press in this app (the
 * Settings selects have the same problem), whereas plain buttons — what the
 * mode switcher beside this uses — work.
 */

export const EXPORT_QUALITY_OPTIONS: {
    id: ExportQuality;
    label: string;
    detail: string;
}[] = [
    { id: "fast", label: "Fast", detail: "Smaller files, quickest export" },
    { id: "balanced", label: "Balanced", detail: "Matches the source — recommended" },
    { id: "maximum", label: "Maximum", detail: "Highest quality, largest files" },
];

interface ExportQualityMenuProps {
    value: ExportQuality;
    onChange: (value: ExportQuality) => void;
}

export function ExportQualityMenu({ value, onChange }: ExportQualityMenuProps) {
    return (
        <SegmentedControl
            size="sm"
            value={value}
            onValueChange={(v) => onChange(v as ExportQuality)}
            options={EXPORT_QUALITY_OPTIONS.map((o) => ({
                value: o.id,
                label: o.label,
                title: `${o.label} — ${o.detail}`,
            }))}
            className="hidden md:inline-flex"
        />
    );
}
