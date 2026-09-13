# Phase 1 Baseline Report

Date: 2026-09-11

## 1. Summary

The current hosted and local app is functional as a live teacher/student classroom prototype. The deployed landing, teacher, and student pages load successfully, CSS and JavaScript are present, and a minimal Firebase-backed gameplay flow worked in local browser testing.

The main Phase 1 finding is that the teacher setup screen is much too tall for a laptop browser. At a 1280 x 720 viewport, the setup content measured about 1870 px high, putting the audio section, sentences box, save button, and start button well below the fold. The teacher live screen is closer to a dashboard but still scrolls vertically at the same viewport, and it can inherit the setup page scroll position when the teacher starts the game, leaving the live header partly offscreen.

The student mobile experience is usable on a modern tall phone viewport, but the game screen begins to scroll on a shorter phone. The join flow also keeps the session-code input prominent even when the code is already supplied in the URL.

No redesign or feature implementation was done in this phase. This report is the only intentional file addition.

## 2. Current Hosted URLs

- Landing page: https://thow76.github.io/recall-the-number-live/
- Teacher page: https://thow76.github.io/recall-the-number-live/teacher.html
- Student page: https://thow76.github.io/recall-the-number-live/student.html

Hosted checks completed:

- `curl -I -L` returned HTTP 200 for the landing page, `teacher.html`, `student.html`, `css/styles.css`, and `js/teacher.js`.
- Browser checks loaded all three hosted pages successfully.
- Hosted browser console check showed no captured warning/error logs on the landing, teacher, or student pages.
- The hosted teacher page displayed the expected Firebase connection label and the expected `savedGames` permission warning.

## 3. Repository State

- Local path inspected: `/Users/home/Documents/ChatGPT/Word Order HTML Game/recall-the-number-live`
- Current branch: `main`
- Tracking: `main...origin/main`
- Local changes before this report: one untracked file, `PHASE_1_BASELINE_HANDOFF.md`
- No commits or pushes were made.

## 4. What Works

- Landing page renders with Teacher and Student links.
- Teacher page renders setup controls, creates a session code, and generates a student URL containing that session code.
- Student page accepts a `session` URL parameter and pre-fills the session-code input.
- Firebase loads and is used as the live bus.
- Students can join a session and appear in the teacher roster.
- Teacher can start a live game.
- Student number buttons become active during voting.
- Student answer confirmation dialog appears after tapping a number.
- Confirmed student votes reach the teacher vote chart.
- Teacher reveal updates both the teacher sentence reveal and the student answer feedback.
- Teacher next-round action advances the teacher screen and resets the student voting view.
- Local saved text game backup logic exists and should continue to work even when Firebase `savedGames` writes are blocked.

Minimal flow tested locally through `http://localhost:8765`:

1. Opened teacher page.
2. Opened student page with matching session code.
3. Joined as a test learner.
4. Started game.
5. Submitted a student vote.
6. Revealed answer.
7. Advanced to next round.
8. Confirmed the student view updated for the next round.

Console logs during this local flow: no captured warning/error logs on teacher or student tabs.

## 5. Teacher Setup Findings

At 1280 x 720, the teacher setup screen measured:

- Document scroll height: about 1870 px.
- Main setup panel height: about 1814 px.
- Audio setup top: about 1231 px.
- Sentences section top: about 1367 px.
- Setup actions top: about 1725 px.

Specific issues:

- The setup page is a single stacked column inside a large centered panel. This makes the teacher scroll through connection, student URL, session code, title, saved games, roster, audio, sentences, and final actions before starting.
- The Start Live Game button is below the fold on a laptop-sized viewport. A teacher can miss it unless they know to scroll.
- The student URL is shown as a full raw URL in its own full-width panel. It is useful but consumes vertical space and is hard to scan.
- The session code is clear, but it is separated from the student URL and future QR-code location. Phase 2 should group these into a compact join/access area.
- The saved-game panel is understandable, but it adds another full-width block before the teacher reaches audio and sentence setup.
- The game title is visually isolated in its own full-width panel. It could be closer to saved games or sentence content.
- The sentence textarea has a 220 px minimum height and measured about 237 px tall in the current setup. This is useful for editing, but it is a major contributor to below-fold actions.
- Audio upload and sentence entry are logically related, but they appear late in the vertical stack after roster and saved games.
- A QR code would fit naturally beside the session code/student URL as part of a compact join panel, not as another full-width stacked section.

## 6. Teacher Live Findings

At 1280 x 720, the teacher live screen measured:

- Document scroll height: about 844 px.
- Viewport height: 720 px.
- Teacher grid top at page top: about 219 px.
- Teacher grid bottom at page top: about 817 px.
- Control, chart, and students panels each measured about 598 px tall.

Specific issues:

- The live view is close to the desired dashboard shape, with controls, vote chart, and student list visible in three columns on desktop.
- It still requires vertical scrolling on a 720 px high laptop viewport. The lower part of the three dashboard panels falls below the viewport.
- Starting the game from the scrolled setup screen did not reset `scrollY`. In the test, the live screen initially appeared with the header partly offscreen because the browser kept the setup scroll offset.
- Play, reveal, and next controls are grouped in the left control panel and are usable once the panel is in view.
- The vote chart is prominent in the center column and updates correctly after a vote.
- Joined students are visible in the right column, but that column is narrow compared with the vote chart.
- There is no obvious reserved space for live scoring yet. Adding it later will require compressing or relocating either the student list, round status, or sentence reveal.
- The connection strip and progress dots add useful state, but they consume vertical dashboard space above the main panels.

## 7. Student Mobile Findings

Phone viewport checks:

- At 390 x 844, join screen and gameplay fit without page scroll.
- At 390 x 844, number buttons measured about 113 x 113 px.
- At 360 x 640, join screen still fit without page scroll.
- At 360 x 640, gameplay needed vertical scroll: page height measured about 765 px against a 640 px viewport.
- At 360 x 640, number buttons measured about 103 x 103 px, but the feedback panel began below the viewport.

Specific issues:

- Join flow is clear, with large input fields and a large Join button.
- When the session is passed in the URL, the session-code field is still fully visible and editable. For learners, this should probably be hidden, collapsed, or de-emphasised unless there is no URL code or they choose to change it.
- The name input is large enough for phone use.
- The Join button is large and easy to tap.
- Number buttons have strong tap targets on tested phone widths.
- Confirmation dialog is very clear visually: selected number, X, and OK. However, `OK` is English text; a more icon-led or bilingual treatment may be better for ESOL learners.
- On shorter phones, the 3 x 3 number grid and the feedback panel do not fit together. The learner may need to scroll to see "Listening..." or answer reveal feedback.
- There is no score badge during gameplay. A small badge could sit in the header area near the round label or learner name, but the current header is already two rows tall on mobile.

## 8. Gameplay Flow Findings

Working states observed:

- Student joined the teacher session via the session-code URL parameter.
- Teacher roster updated with the student name.
- Teacher started Round 1.
- Student saw active number buttons.
- Student tapped a number and saw the confirmation overlay.
- Student confirmed the answer.
- Teacher vote count changed from 0 to 1, and the vote chart showed the submitted number.
- Teacher revealed the answer.
- Student view changed to show the revealed sentence.
- Teacher moved to Round 2.
- Student view changed to Round 2 and number buttons became active again.

Confusing or fragile states observed:

- Starting live gameplay from the setup page preserved the old scroll position. The teacher may land mid-dashboard instead of at the top of the live screen.
- The teacher live screen says `Next round` even before reveal, but the button is disabled. This is understandable once noticed, but the disabled state is the only explanation.
- The default audio files are referenced in `js/questions.js`, but the baseline flow did not verify that all MP3 files are present and playable.
- Final scoreboard was not re-tested end-to-end in this pass; it was inspected in code and should be covered by later regression testing.

## 9. Risks and Bugs

- Firebase `savedGames` read/write is blocked by current Realtime Database rules. The UI handles this by showing a permission warning and keeping local browser backup behavior, but cloud saved-game sharing is not currently working.
- Teacher setup is long enough that important controls are hidden below the fold on a normal laptop browser.
- Teacher live screen is not fully dashboard-like at 1280 x 720 because it still scrolls.
- Teacher live screen can inherit setup scroll position, making the live header start offscreen.
- Student gameplay scrolls on shorter phone portrait viewports.
- Student session-code field may distract learners when the session was already supplied through the URL.
- No QR code exists yet, so the teacher must share a raw URL or session code manually.
- During gameplay, students do not see a score/points indicator.
- The teacher page exposes destructive-ish classroom controls such as New session and Clear students close to operational controls; later redesign should make these available but less accidentally clickable during live play.

## 10. Recommendations for Phase 2

- Rework teacher setup into a compact two-column or dashboard-style layout for laptop screens.
- Put session code, student URL, and future QR code together in a compact join/access panel near the top.
- Keep Start Live Game visible without scrolling on laptop viewports.
- Combine or reposition game title, saved-game loading, and sentence setup so the teacher understands the content workflow quickly.
- Keep audio upload close to sentence setup, since both define the round content.
- Consider making the sentences editor collapsible, shorter by default, or placed in a wider right-side editing area.
- Reset scroll to top when switching from setup to live gameplay.
- Compress the teacher live header/connection/progress area so the control, chart, and student panels fit in a 720 px high viewport.
- Reserve a small, fixed place for future live scoring before redesigning the teacher dashboard too tightly.
- On student mobile, hide or minimise the session-code field when a URL session is present.
- Keep number buttons large, but reduce vertical header/prompt/feedback spacing for shorter phones.
- Design the confirmation state around symbols and colour, with minimal English text.
- Add a compact student score badge in a stable header position once scoring during gameplay is introduced.

## 11. Regression Checklist

Protect these behaviours during later redesign:

- Landing page links to teacher and student pages.
- Teacher page creates and displays a session code.
- New session creates a new join code.
- Student URL includes the correct `session` parameter.
- Student page reads the `session` parameter and joins the correct session.
- Student name is written to the teacher roster.
- Teacher can remove one student.
- Teacher can clear all students.
- Teacher can start a live game only after valid sentence setup.
- Round order is randomized for a game.
- Student number buttons are disabled outside active voting.
- Student answer confirmation allows cancel/change before sending.
- Student votes reach the teacher vote chart.
- Teacher reveal updates the teacher and student views.
- Correct answer highlighting still works after reveal.
- Next round resets voting state for teacher and students.
- Final teacher scoreboard remains correct.
- Student final score display remains correct.
- Local saved text games remain usable even if Firebase `savedGames` is blocked.
- Firebase permission errors remain visible but non-fatal.
- Browser fallback/local saved data does not break normal Firebase play.
- Audio upload can still map files to sentence numbers.
- Default audio paths remain usable when hosted audio files are available.
