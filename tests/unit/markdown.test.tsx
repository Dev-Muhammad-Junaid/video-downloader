import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/ui/markdown";

/**
 * The changelog text comes from the GitHub releases API, so the security
 * property that matters is that nothing in a release body can become live
 * markup. These render the component for real and inspect the HTML it
 * produces.
 */
const html = (md: string) => renderToStaticMarkup(<Markdown content={md} />);

describe("Markdown renderer", () => {
    it("renders headings, bold, italic and code as elements", () => {
        const out = html("## Title\n\nSome **bold** and *italic* and `code` here.");
        expect(out).toContain("<strong");
        expect(out).toContain("<em");
        expect(out).toContain("<code");
        expect(out).toContain("Title");
        // No leftover markdown punctuation in the output text.
        expect(out).not.toContain("**bold**");
        expect(out).not.toContain("## Title");
    });

    it("renders a GitHub-style table", () => {
        const out = html("| | Before | After |\n|---|---|---|\n| Burn | 477% | 36% |");
        expect(out).toContain("<table");
        expect(out).toContain("<th");
        expect(out).toContain("477%");
        expect(out).not.toContain("|---|");
    });

    it("renders bulleted and numbered lists", () => {
        expect(html("- one\n- two")).toContain("<ul");
        expect(html("1. one\n2. two")).toContain("<ol");
        expect(html("- one\n- two")).toContain("<li");
    });

    it("escapes HTML in the release body instead of executing it", () => {
        const out = html('Hello <img src=x onerror="alert(1)"> world');
        // React escapes it, so it renders as visible text, not a live element.
        expect(out).not.toContain("<img");
        expect(out).toContain("&lt;img");
        expect(out).not.toContain("onerror=\"alert(1)\"");
    });

    it("refuses javascript: links but keeps their text", () => {
        const out = html("[click me](javascript:alert(1))");
        expect(out).not.toContain("javascript:");
        expect(out).toContain("click me");
    });

    it("renders http(s) links with noopener", () => {
        const out = html("[release](https://github.com/foo/bar/releases/tag/v1)");
        expect(out).toContain('href="https://github.com/foo/bar/releases/tag/v1"');
        expect(out).toContain('rel="noopener noreferrer"');
    });

    it("does not treat emphasis markers inside code spans as formatting", () => {
        const out = html("Use `a ** b` carefully");
        expect(out).toContain("<code");
        expect(out).not.toContain("<strong");
    });

    it("handles an empty or whitespace-only changelog without throwing", () => {
        expect(() => html("")).not.toThrow();
        expect(() => html("\n\n   \n")).not.toThrow();
    });

    it("renders a horizontal rule", () => {
        expect(html("a\n\n---\n\nb")).toContain("<hr");
    });
});
