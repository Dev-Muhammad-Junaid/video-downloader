import { describe, it, expect } from "vitest";

/**
 * A completed export didn't appear in the library until a manual refresh.
 *
 * Completion used to be detected as a STATE TRANSITION: a job had to already be
 * in the local queue as "processing" when a "completed" message arrived. The
 * SSE handler early-returns when the incoming status already matches local
 * state, so anything that finished before the UI saw it running was skipped
 * entirely — no toast, and no refreshLibrary(), so the new file stayed
 * invisible.
 *
 * Exports hit this constantly: a trim is a stream copy that finishes well
 * inside the five second queue poll, so the job routinely first appears already
 * completed.
 *
 * This models the announce-once rule the fix relies on.
 */

function makeAnnouncer() {
    const announced = new Set<string>();
    const refreshes: string[] = [];
    let seeded = false;

    return {
        refreshes,
        /** Jobs already finished at startup are not news. */
        seed(jobs: { id: string; status: string }[]) {
            for (const j of jobs) if (j.status === "completed") announced.add(j.id);
            seeded = true;
        },
        observe(jobs: { id: string; status: string }[]) {
            if (!seeded) return;
            for (const j of jobs) {
                if (j.status !== "completed" || announced.has(j.id)) continue;
                announced.add(j.id);
                refreshes.push(j.id);
            }
        },
    };
}

describe("completion announcement", () => {
    it("refreshes for a job first seen already completed", () => {
        // The exact failure: too fast to ever be observed running.
        const a = makeAnnouncer();
        a.seed([]);
        a.observe([{ id: "export_fast", status: "completed" }]);
        expect(a.refreshes).toEqual(["export_fast"]);
    });

    it("refreshes for a job observed transitioning", () => {
        const a = makeAnnouncer();
        a.seed([]);
        a.observe([{ id: "job1", status: "processing" }]);
        expect(a.refreshes).toEqual([]);
        a.observe([{ id: "job1", status: "completed" }]);
        expect(a.refreshes).toEqual(["job1"]);
    });

    it("announces once, however many times the payload repeats", () => {
        // SSE pushes every second and the queue polls every five; a completed
        // job stays in the payload for ten minutes.
        const a = makeAnnouncer();
        a.seed([]);
        for (let i = 0; i < 25; i++) a.observe([{ id: "job1", status: "completed" }]);
        expect(a.refreshes).toEqual(["job1"]);
    });

    it("does not replay past completions on startup", () => {
        // Otherwise reopening the app toasts every finished job in history.
        const a = makeAnnouncer();
        a.seed([{ id: "old1", status: "completed" }, { id: "old2", status: "completed" }]);
        a.observe([{ id: "old1", status: "completed" }, { id: "old2", status: "completed" }]);
        expect(a.refreshes).toEqual([]);
    });

    it("still announces a new job after seeding", () => {
        const a = makeAnnouncer();
        a.seed([{ id: "old", status: "completed" }]);
        a.observe([{ id: "old", status: "completed" }, { id: "new", status: "completed" }]);
        expect(a.refreshes).toEqual(["new"]);
    });

    it("ignores failed and cancelled jobs", () => {
        const a = makeAnnouncer();
        a.seed([]);
        a.observe([{ id: "e", status: "error" }, { id: "c", status: "cancelled" }]);
        expect(a.refreshes).toEqual([]);
    });
});
