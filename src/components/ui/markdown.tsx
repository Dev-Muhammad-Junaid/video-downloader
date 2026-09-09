"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * A small Markdown renderer for release notes.
 *
 * Deliberately builds React elements rather than setting innerHTML: the text
 * comes from the GitHub releases API, so treating it as markup would hand a
 * remote source a script-injection path into the app. Nothing here can emit
 * raw HTML — an `<img onerror=...>` in a release body renders as literal text.
 *
 * It covers the subset release notes actually use (headings, lists, tables,
 * emphasis, code, links, rules) rather than trying to be a full CommonMark
 * implementation, which is why it's ~150 lines instead of a dependency plus a
 * sanitiser.
 */

/** Only ever link somewhere the user can safely be sent. Anything else — most
 *  importantly `javascript:` — renders as plain text. */
function safeHref(url: string): string | null {
    try {
        const parsed = new URL(url, "https://github.com");
        return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
    } catch {
        return null;
    }
}

// Code first so ** and _ inside a span of code aren't treated as emphasis.
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let i = 0;

    INLINE.lastIndex = 0;
    while ((match = INLINE.exec(text)) !== null) {
        if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
        const token = match[0];
        const key = `${keyPrefix}-i${i++}`;

        if (token.startsWith("`")) {
            nodes.push(
                <code key={key} className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[11px]">
                    {token.slice(1, -1)}
                </code>,
            );
        } else if (token.startsWith("**")) {
            nodes.push(<strong key={key} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>);
        } else if (token.startsWith("[")) {
            const split = token.indexOf("](");
            const label = token.slice(1, split);
            const href = safeHref(token.slice(split + 2, -1));
            nodes.push(
                href
                    ? <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{label}</a>
                    : <span key={key}>{label}</span>,
            );
        } else {
            nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
        }
        lastIndex = match.index + token.length;
    }

    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
}

const isTableRow = (line: string) => line.trim().startsWith("|");
const isTableDivider = (line: string) => /^\s*\|?[\s:-]*\|[\s|:-]*$/.test(line) && line.includes("-");
const splitRow = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ content, className }: { content: string; className?: string }) {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    const blocks: React.ReactNode[] = [];
    let paragraph: string[] = [];
    let key = 0;

    const flushParagraph = () => {
        if (paragraph.length === 0) return;
        const text = paragraph.join(" ");
        blocks.push(<p key={`p${key++}`} className="leading-relaxed">{renderInline(text, `p${key}`)}</p>);
        paragraph = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === "") { flushParagraph(); continue; }

        // Horizontal rule
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushParagraph();
            blocks.push(<hr key={`hr${key++}`} className="my-3 border-border" />);
            continue;
        }

        // Heading
        const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
        if (heading) {
            flushParagraph();
            const level = heading[1].length;
            blocks.push(
                <p
                    key={`h${key++}`}
                    className={cn(
                        "mt-3 mb-1 font-semibold text-foreground first:mt-0",
                        level <= 2 ? "text-[13px]" : "text-[12px]",
                    )}
                >
                    {renderInline(heading[2], `h${key}`)}
                </p>,
            );
            continue;
        }

        // Table: a row followed by a |---|---| divider
        if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
            flushParagraph();
            const header = splitRow(line);
            const rows: string[][] = [];
            i += 2;
            while (i < lines.length && isTableRow(lines[i])) rows.push(splitRow(lines[i++]));
            i--;

            blocks.push(
                <div key={`t${key++}`} className="my-2 overflow-x-auto">
                    <table className="w-full border-collapse text-[11px]">
                        <thead>
                            <tr>
                                {header.map((cell, c) => (
                                    <th key={c} className="border-b border-border px-2 py-1 text-left font-semibold text-foreground">
                                        {renderInline(cell, `th${key}-${c}`)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, r) => (
                                <tr key={r}>
                                    {row.map((cell, c) => (
                                        <td key={c} className="border-b border-border/50 px-2 py-1 align-top">
                                            {renderInline(cell, `td${key}-${r}-${c}`)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>,
            );
            continue;
        }

        // List (bulleted or numbered) — consume the whole run
        if (/^([-*+]|\d+\.)\s+/.test(trimmed)) {
            flushParagraph();
            const ordered = /^\d+\.\s+/.test(trimmed);
            const items: string[] = [];
            while (i < lines.length && /^([-*+]|\d+\.)\s+/.test(lines[i].trim())) {
                items.push(lines[i].trim().replace(/^([-*+]|\d+\.)\s+/, ""));
                i++;
            }
            i--;

            const ListTag = ordered ? "ol" : "ul";
            blocks.push(
                <ListTag key={`l${key++}`} className={cn("my-1.5 space-y-1 pl-4", ordered ? "list-decimal" : "list-disc")}>
                    {items.map((item, idx) => (
                        <li key={idx} className="leading-relaxed marker:text-muted-foreground">
                            {renderInline(item, `li${key}-${idx}`)}
                        </li>
                    ))}
                </ListTag>,
            );
            continue;
        }

        paragraph.push(trimmed);
    }
    flushParagraph();

    return <div className={cn("text-[12px] text-foreground/90", className)}>{blocks}</div>;
}
