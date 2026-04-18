# Recent Changes — Quick Review

A running log of fixes made across this session, each with a short before/after so you can remember the intent.

---

## 1. Queue card — responsive layout (latest)

**Problem:** Each queue item had a fixed `w-[220px]` right column holding the format dropdown and action buttons (Download, Pause, Cancel, Resume, Try Again, etc.). On the `All / Active / Failed` tabs the buttons overflowed the card or got clipped — the three tabs looked inconsistent.

**Before:**
```
┌──────────────────────────────────────────────────────────────────┐
│ [thumb]  Title                            [Best available ▼]    │
│          pending · Best Quality           [ Download      ]     │
│                                                 ^^^^ overflow   │
└──────────────────────────────────────────────────────────────────┘
```

**After:**
```
┌──────────────────────────────────────────────────┐
│ [thumb]  Title                          [⬇]     │
│          pending · Best Quality                  │
│          [Best available (auto)            ▼]    │
└──────────────────────────────────────────────────┘
```

- Right column is now `flex-shrink-0` + icon-only buttons (`h-7 w-7`), with tooltips.
- Thumbnail scales down on narrow screens (`w-16 h-12 sm:w-20 sm:h-14`).
- Format dropdown moved into the title column and takes full remaining width.
- Progress bar + percentage use a proper flex layout (no more jitter between 9% and 100%).
- Matched-profile badge truncates gracefully.
- All three tabs look identical regardless of panel width.

**Files:** `src/app/page.tsx`

---

## 2. Profile editor — dialog UX & Save button

**Problem:** Save button did nothing. The dialog felt cramped. Cancel and Save buttons had mismatched styles. Error toasts were generic.

**Root cause:** `@base-ui/react/button` (what our `<Button>` wraps) silently strips `type="submit"`. The form submit event never fired.

**Fixes:**
- Replaced both Save and Cancel with native `<button>` elements styled via `buttonVariants(...)` — identical rendering, but `type="submit"` actually works.
- Wider dialog: `sm:max-w-[560px]` (was ~384px).
- 2-column grid for `Profile Name + Site Pattern` and `Max Resolution + Format`.
- Behaviour toggles collapsed to single-line chips in a 2×2 grid.
- Hidden scrollbar while keeping overflow-y scroll.
- API now surfaces real Prisma errors (`P2002 → "A profile named X already exists"`).

**Files:** `src/app/settings/page.tsx`, `src/app/api/profiles/route.ts`, `src/app/api/profiles/[id]/route.ts`

---

## 3. Matched-profile badge persistence

**Problem:** The purple `✨ ProfileName · Format` badge disappeared after reload because it was only client-side state.

**Fix:** Added a `profileName` column to `DownloadQueueJob` (reusing existing `formatLabel`). Server persists both on create; `getAllJobs` returns them; client maps into `matchedProfileName` / `matchedFormatLabel`.

**Files:** `prisma/schema.prisma`, `src/lib/download-manager.ts`, `src/app/api/download/route.ts`, `src/app/page.tsx`

---

## 4. "4K Only" downloading 240p — added strict resolution

**Problem:** A custom profile named "4K Only" with `maxResolution: 2160` was treated as a ≤ ceiling, so it matched any lower resolution (e.g. 240p) and auto-downloaded.

**Fix:**
- New `strictResolution` field on `DownloadProfile`.
- When true:
  - Client matcher uses `resolution === exactValue` instead of `≤`.
  - Server yt-dlp format string emits `[height=2160]` instead of `[height<=2160]`.
  - If strict match fails → manual review with clear reason.
- Settings dialog has a new **Strict resolution** toggle (disabled for Best / MP3 profiles).
- Profile list shows colored badges: `Default`, `Manual`, `Strict`.

**Files:** `prisma/schema.prisma`, `src/lib/profiles.ts`, `src/app/page.tsx`, `src/app/settings/page.tsx`

---

## 5. yt-dlp format string — silent escalation bug

**Problem:** Resolution-constrained profiles (720p, 1080p, Audio Only) sometimes got ignored. Root cause was an unconditional `/best` fallback at the end of the format string:

**Before (silently wrong):**
```
bestvideo[height<=480][ext=mp4]+bestaudio/best[height<=480][ext=mp4]/best[height<=480]/best
                                                                              ^^^^
                                                                     downloads 1080p if no ≤480 available
```

**After (strict):**
```
bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]
```
"Best Quality" profile (no ceiling) still appends `/best` because that's its intent.

**Client:** stops auto-starting when `formats` array is empty AND the profile has a resolution ceiling — forces manual review instead of optimistic silent escalation.

**Files:** `src/lib/profiles.ts`, `src/app/page.tsx`

---

## 6. Auto-start + visible matching

**Fix:** After parsing, the queue item auto-starts download if the profile matches and doesn't require manual format. Before, every item needed a manual click.

**Visibility additions:**
- Toast on auto-start: *"Auto-downloading 'X' with Balanced 1080p · 1080p (mp4)"*.
- Purple `✨ Profile · Format` badge on each queue row.
- `Auto (match by URL)` label in the queue dropdown is now clearer.

**Files:** `src/app/page.tsx`, `src/lib/download-manager.ts`

---

## 7. Manual review UI — icon + tooltip

**Problem:** A long amber banner under the title took up a lot of space and highlighted the format dropdown with an amber border.

**Fix:** Replaced with a small `AlertCircle` icon next to the format dropdown. Hover shows the explanation in a tooltip. No more amber border.

**Files:** `src/app/page.tsx`

---

## 8. Preset profiles — 6 seeded + Reset button

**Added:**
- **Best Quality** (default, priority -1)
- **Balanced 1080p**
- **Data Saver 720p**
- **Lowest Quality 480p**
- **Audio Only (MP3)**
- **Manual Select** (requireManualFormat: true) — NEW

**Settings → "Reset to Defaults"** button idempotently re-adds any missing presets without touching user-created/renamed profiles. Users can now delete any preset (including the default) and recover with one click.

**Files:** `src/lib/profiles.ts`, `src/app/api/profiles/reset/route.ts`, `src/app/settings/page.tsx`

---

## 9. Duplicate handling — format-aware

**Problem:** Pasting a link that already existed in the queue/library triggered *"Skipped 1 duplicate link"* even when the user wanted a different format.

**Fix:**
- Client only blocks URLs currently **active** in the queue (`parsing/pending/downloading/queued/paused`).
- Completed/cancelled queue items AND anything in the library are allowed back in.
- Server no longer auto-completes as "duplicate" — it just labels the existing library item as `Duplicate` for awareness and proceeds with the new download.

**Files:** `src/app/page.tsx`, `src/lib/download-manager.ts`

---

## 10. History page — accurate cancelled/cleared logs

**Problem:** When you cancelled a queue job or hit *Clear Queue*, the `DownloadLog` entries were left stuck at `"downloading"`. The History page showed stale rows forever.

**Fix:**
- `cancelJob` now finalizes matching log entries to `cancelled` when the job had no live process (paused/queued).
- `clearAllJobs` bulk-updates every in-flight log for the URLs it's about to delete.

**Files:** `src/lib/download-manager.ts`

---

## 11. Queue toolbar — simplified icon buttons

**Before:** `Retry All Failed | Download All Pending (3) | Pause All | Cancel All | Resume All | Clear Queue` — 6 wide text buttons wrapping onto two rows.

**After:** 6 icon-only buttons (right-aligned) with tooltips, all in a single row, separated by a divider before Clear Queue.

**Files:** `src/app/page.tsx`

---

## 12. Cloud sync — proper error details + logging

**Problems:**
- Bulk cloud sync reported success but files weren't uploaded.
- Errors toast said only *"Bulk upload failed"* with no detail.
- No `DownloadLog` entries for cloud uploads.

**Fixes:**
- `uploadToCloud` now **throws** on failure instead of silently returning `null`.
- Validates credentials, local file existence, and `cloudKey` state before uploading.
- Creates `DownloadLog` rows (`type: "cloud-upload"`) for both success (with size + duration) and failure (with error stack snippet).
- Extended MIME map so audio files upload with the correct `Content-Type`.
- Bulk sync route returns `{ uploaded, skipped, total, errors[] }` so the UI can show per-item details.

**Files:** `src/lib/cloud.ts`, `src/app/api/sync/bulk/route.ts`, `src/app/api/sync/route.ts`, `src/app/page.tsx`

---

## 13. Bulk selection bar — responsive layout fix

**Problem:** The inline `Select / Select All / Deselect All / Delete (N) / Cloud Upload` buttons broke the library header on smaller screens.

**Fix:** Selection actions moved into their own row below the title, hosted in a subtle `bg-muted/40` container. Wraps cleanly on narrow viewports.

**Files:** `src/app/page.tsx`

---

## 14. Completed queue items — click to open

Any completed queue row is now clickable (and keyboard-accessible). Clicking opens the Media Player modal at the correct index. Hover shows a dark overlay + play icon on the thumbnail.

**Files:** `src/app/page.tsx`

---

## 15. DB file mismatch — schema changes not taking effect

**Problem:** `"column strictResolution does not exist"` persisted after multiple `prisma db push` runs.

**Root cause:** `src/lib/prisma.ts` hardcodes `file:./dev.db` (project root), but `prisma db push` without an explicit `DATABASE_URL` used the Prisma default of `./prisma/dev.db`. Two different SQLite files, one with the new columns and one without.

**Fix:** Pushed schema to the correct DB (`./dev.db`) and deleted the stray `./prisma/dev.db`. Both new columns are now present in the real DB.

**Files:** `dev.db` (schema update), `prisma/dev.db` (removed)

---

### Quick verification checklist

After pulling these changes:

1. `npx prisma generate && npm run dev` (restart).
2. Settings → Profiles → **Reset to Defaults** → confirm Manual Select preset appears.
3. Edit "4K Only" (or any custom profile) → tick **Strict resolution** → Save.
4. Paste a link with a non-best profile selected → see the purple badge + auto-download toast.
5. Reload the page → badge persists.
6. Cancel a downloading item → check `/history` → row shows `cancelled`, not `downloading`.
