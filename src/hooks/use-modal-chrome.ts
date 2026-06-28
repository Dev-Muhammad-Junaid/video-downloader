import { useEffect } from "react";

/**
 * Shared chrome for the app's hand-rolled full-screen editor modals
 * (video + image editors). Centralizes what each used to copy-paste:
 *
 *  - background scroll lock — **leak-proof**: it restores whatever `overflow`
 *    was there before (not a hardcoded ""), so closing can never leave the
 *    page stuck (the class of bug that hit the audio editor),
 *  - Escape to close,
 *  - Tab focus-trap within the modal container.
 *
 * Centred dialogs (audio editor, media player) use the `@base-ui/react`
 * `<Dialog>` primitive, which provides the same behaviours. This hook is the
 * single home for the equivalent logic in our custom full-screen overlays.
 */
export function useModalChrome(
    containerRef: React.RefObject<HTMLElement | null>,
    onClose: () => void,
): void {
    useEffect(() => {
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
                return;
            }
            if (e.key === "Tab" && containerRef.current) {
                const focusable = containerRef.current.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                );
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [containerRef, onClose]);
}
