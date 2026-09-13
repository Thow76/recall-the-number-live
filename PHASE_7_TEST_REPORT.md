# Phase 7 Test Report

Date: 2026-09-12

## 1. Summary

Phase 7 regression testing passed for the current local working tree. The local game loads, teacher setup is usable at the required setup viewports, QR/session links update correctly, student mobile states fit the target phone viewports, live voting works through Firebase, local fallback works when Firebase scripts are blocked, scoring is reveal-gated, and teacher/student final scores match.

No P1 or P2 blockers were found. The main remaining risk is the known Firebase `savedGames` permission denial in the currently connected database; browser-local saved-game backup works and live session voting is not blocked.

Recommendation: ready for Phase 8 static publish of the current local build, provided the uncommitted changes are intentionally included. Firebase cloud saved-game persistence remains a documented P3 caveat until database rules equivalent to `firebase-database-rules.testing.json` are published.

## 2. Build / Working Tree

- Local path: `/Users/home/Documents/ChatGPT/Word Order HTML Game/recall-the-number-live`
- Branch: `main`
- HEAD: `659f9a9`
- Local server: `python3 -m http.server 8765`
- Current implementation files modified before this report: `README.txt`, `css/styles.css`, `js/student.js`, `js/teacher.js`, `teacher.html`
- Phase handoff/review documents are untracked in this working tree.
- `PHASE_7_REVIEW_PROMPT.md` and `PHASE_7_REVIEW_FINDINGS_FIX_HANDOFF.md` are local review/remediation artifacts. Leave them untracked unless the documentation set is intentionally committed.
- Phase 7 handoff, review, remediation, and report documents are currently untracked. Include only intentionally selected documentation files in any publish/docs commit.

## 3. Technical Checks

Passed:

- `node --check js/teacher.js`
- `node --check js/student.js`
- `node --check js/live-firebase.js`
- `node --check js/live-local.js`
- `git diff --check`

Diff review:

- The current diff contains the expected previous-phase surfaces: teacher setup/QR, student mobile/scoring, teacher live dashboard, README notes, and teacher cache-busting query strings.
- No unrelated source files were observed in the implementation diff.

## 4. Browser Console Findings

- Local teacher/student gameplay console logs: no JavaScript errors or warnings during the tested live flows.
- Firebase live session read/write worked for joins, votes, reveal, next round, final scores, remove, clear, and local fallback comparison.
- Firebase `savedGames` cloud save/load emitted permission-denied warnings. The UI documented this and local browser backup still worked.
- The landing page produced a non-blocking 404 for a browser-requested missing favicon-like resource. App CSS/JS loaded.

## 5. Page Load Results

- Landing page: passed locally.
- Teacher page: passed locally.
- Student page: passed locally.
- CSS and local scripts loaded.
- Firebase module loaded for normal local testing.
- Hosted smoke test was not treated as representative because the current Phase 2-7 build is still uncommitted/unpublished in this working tree.

## 6. Teacher Setup Viewports

Tested at `1280 x 720`, `900 x 720`, and `540 x 720`.

Passed:

- Session code visible.
- QR code visible.
- Student link visible and wraps without horizontal overflow.
- `New session` is grouped with session/QR access.
- Saved-game controls are usable.
- Joined-students panel is usable.
- Game title, audio upload, sentence editor, `Save Text Game`, and `Start Live Game` are reachable.
- No horizontal overflow or overlapping content was detected.

Notes:

- At `1280 x 720`, `Save Text Game` and `Start Live Game` are visible without scrolling.
- At `900 x 720` and `540 x 720`, the important start/save controls remain visible; the sentence textarea continues below the fold, which is acceptable for setup but still scroll-based.

## 7. Teacher Live Dashboard

Tested at `1280 x 720`, `900 x 720`, and `540 x 720` in voting and revealed states.

Passed:

- Current round, session, student count, vote count, connection state, controls, chart, and student score/status list render.
- Vote chart updates after student votes.
- Correct answer is highlighted after reveal and the sentence reveal appears.
- Reveal and next controls remain visible at laptop sizes.
- No horizontal overflow.
- `1280 x 720` and `900 x 720` fit as a one-screen dashboard.

Stress note:

- At `540 x 720`, layout remains usable without horizontal overflow, but it becomes a vertical stack with page scroll; the student panel starts below the first fold. This matches the stress-case expectation rather than a laptop-primary target.

## 8. Student Mobile Viewports

Tested at `390 x 844`, `375 x 667`, `414 x 896`, and `360 x 740`.

Passed:

- Join controls fit and are tappable.
- URL `?session=...` pre-fills the session field.
- Name input is easy to use.
- Waiting state is simple and readable.
- Score badge remains visible during play.
- Number grid, confirmation overlay, and feedback fit without horizontal overflow.
- Revealed feedback clearly shows tick/cross, answer number, sentence, and score.
- Final student score screen is clear.

## 9. Core Single-Student Gameplay

Passed locally through Firebase-backed pages.

Flow tested:

- Teacher created session `ZLLY3`.
- Student joined as `Test Student`.
- Teacher roster updated.
- Teacher started live game.
- Student voted `1` for all 9 rounds.
- Teacher chart updated each round.
- Teacher revealed each round and moved to the next round.
- Student score stayed `0 / 9` for wrong rounds.
- Student score increased to `1 / 9` when sentence 1 appeared.
- Final teacher scoreboard showed `Test Student 1 / 9`.
- Student final screen showed `1 / 9`.

Score agreement: passed.

Remediation check on 2026-09-13:

- Ran a local-fallback browser pass with Firebase scripts blocked.
- Joined `Score Gate Test`, started round 1, read the correct round-one number from the local session snapshot, and submitted that correct answer before reveal.
- Before reveal, teacher vote count showed `1 / 1`, teacher live score for `Score Gate Test` stayed `0 / 9`, and the student score badge stayed `Score 0 / 9`.
- After reveal, teacher live score and student score both changed to `1 / 9`.

## 10. Multi-Student Gameplay

Passed locally.

Flow tested:

- Joined `Student One`, `Student Two`, and `Alexandra Longname`.
- Teacher roster showed all three names.
- Started game.
- Students voted `1`, `2`, and `3`.
- Teacher vote count showed `3 / 3`.
- Chart counts showed one vote each for 1, 2, and 3.
- Reveal worked.
- Teacher removed `Alexandra Longname`.
- Removed student returned to join screen with removal message.
- Teacher roster and vote count dropped to 2.
- `Clear all` cleared remaining students and votes.
- `New session` returned teacher to setup with a new code and no stale roster.

## 11. QR / Session Link

Passed.

- Student link contained the current session code.
- QR SVG accessible label contained the same student URL.
- Pressing `New session` changed the session code.
- Student link updated to the new code.
- QR target label updated to the new student URL.
- Opening the new student URL prefilled the new session code.

Real-phone scan was not tested.

Remediation note:

- Local fallback retest confirmed that pressing `New session` clears the old roster; `Old Session Test` did not remain on the teacher roster after the reset.
- The stronger stale-tab behavior, where an already-open old-session student cannot affect the new session unless it joins through the new URL, is source-backed by per-session snapshot checks but was not fully re-exercised end-to-end in this remediation pass.

## 12. Saved Text Games

Passed for local browser backup.

Flow tested:

- Saved title: `Phase 7 Saved 1789249931911`.
- Entered exactly 9 test sentences.
- `Save Text Game` added the title to the saved-game selector.
- Changed title/sentences.
- Loaded saved game.
- Title and all 9 sentences restored correctly.
- Refreshed teacher page.
- Saved title still appeared from local browser backup.

Known issue: Firebase cloud saved-game write failed with `permission_denied`; local backup handled it and the UI showed a clear warning.

## 13. Audio

Passed for missing-audio behavior.

- Repo contains only `audio/README.txt`; no MP3 files were available.
- Starting a game and pressing play did not crash.
- Teacher UI showed: `Audio could not play. Check the MP3 file or choose files again.`
- Uploaded-MP3 playback was not tested because no MP3 files were available.

## 14. Leave / Remove / Reset

Passed.

- Remediation check on 2026-09-13, local fallback with Firebase scripts blocked: `Leave Test` joined and appeared in the teacher roster; the student clicked `Leave game`; the teacher roster removed `Leave Test`; the student returned to the join screen with `You left the game`; the same tab rejoined; the teacher roster showed `Leave Test` again.
- Firebase-backed multi-student pass: teacher remove returned the removed student to the join screen with a removal message.
- Firebase-backed multi-student pass: `Clear all` removed remaining students and votes.
- `New session` changed the code in the original QR/session-link test and did not carry stale students into the new setup; a remediation retest also confirmed the roster reset.

## 15. Local Fallback

Passed.

Firebase module URLs were blocked in headless Chrome.

- Teacher page loaded with `Local tab test`.
- Student joined locally.
- Teacher roster updated locally.
- Teacher started the game.
- Student voted.
- Teacher vote chart updated to `1 / 1`.

The blocked Firebase module generated no app-breaking errors in the tested flow.

## 16. Hosted Smoke Test

Not executed as a current-build validation.

Reason: the Phase 2-7 implementation is still local and uncommitted/unpublished. Testing the GitHub Pages URLs now would validate a stale hosted build, not this working tree. Hosted smoke testing should be done after Phase 8 publish.

## 17. Findings

- [P3] Firebase cloud saved-games are still blocked
  File/line if known: Firebase Realtime Database rules in the connected project, not local source.
  Reproduction: Save a text game while Firebase is connected.
  Expected: Saved game writes to `savedGames` in Firebase.
  Actual: Firebase warning reports `permission_denied`; UI falls back to local browser backup.
  Impact: Saved text games do not sync across browsers/devices until database rules are published.
  Suggested fix: Publish rules equivalent to `firebase-database-rules.testing.json` if cloud saved games are required.

No P1/P2 bugs were found.

Review-remediation status:

- Explicit student leave -> roster update -> rejoin evidence was added on 2026-09-13.
- Explicit pre-reveal score-gating evidence was added on 2026-09-13.
- Old-session roster carryover after `New session` was retested and did not reproduce; old-tab isolation remains a documented source-backed residual risk rather than a fully retested browser flow.

## 18. Residual Risks / Untested Areas

- Hosted current-build smoke test is pending publish.
- Real-phone QR scanning was not tested.
- Uploaded MP3 playback was not tested because no MP3 files were present.
- Long classroom sessions with many more than 3 students were not load-tested.
- Firebase production security hardening remains outside this phase.
- Firebase `savedGames` cloud persistence remains blocked until database rules are published; Phase 8 static publish can proceed with this as a P3 caveat if cross-browser saved-game sync is not required immediately.
- Old-session student-tab isolation is source-backed by session-code filtering and observed roster reset, but the exact stale-tab -> new-session -> new-URL rejoin sequence was not fully completed in the remediation browser pass.
- `PHASE_7_REVIEW_PROMPT.md` and `PHASE_7_REVIEW_FINDINGS_FIX_HANDOFF.md` are untracked review artifacts, not app source. They should remain untracked unless these review docs are intentionally included in the publish commit.

## 19. Regression Checklist

- Landing page loads: passed locally.
- Teacher setup loads: passed locally.
- Student page loads: passed locally.
- Firebase connection works for live sessions: passed.
- Local fallback works: passed.
- Session code generation works: passed.
- New Session works: passed.
- QR/session link updates: passed.
- Student URL session parameter works: passed.
- Manual session code entry: not separately typed in this pass; field remains editable.
- Student name entry works: passed.
- Student join works: passed.
- Teacher roster updates: passed.
- Student voting works: passed.
- Confirmation works: passed.
- Teacher vote chart updates: passed.
- Reveal works: passed.
- Next round works: passed.
- Final round / See scores works: passed.
- Teacher final scoreboard works: passed.
- Student final score works: passed.
- Teacher and student scores match: passed.
- Student leave works: passed via explicit 2026-09-13 leave/rejoin remediation check.
- Pre-reveal score gating works after a known-correct vote: passed via explicit 2026-09-13 remediation check.
- Old-session roster carryover after New Session: roster reset passed; stale-tab isolation remains source-backed residual risk.
- Teacher remove student works: passed.
- Clear students works: passed.
- Saved text games work locally: passed.
- Audio missing-file warning is accurate: passed.
- Teacher setup target viewports pass: passed.
- Teacher live target viewports pass: passed for 1280/900; 540 usable with vertical scroll.
- Student mobile target viewports pass: passed.
