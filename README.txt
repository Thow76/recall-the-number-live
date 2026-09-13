Shopping Recall the Number Live Prototype
=========================================

This is the live classroom version.

It has separate teacher and student pages:

- teacher.html
- student.html

How to test on one computer
---------------------------
1. Open teacher.html in Chrome or Edge.
2. Open student.html in another tab or window.
3. Enter the session code shown on the teacher page.
4. Enter a student name and press Join.
5. On the teacher page, press Start Live Game.
6. The teacher plays the audio.
7. The student taps a number.
8. The student confirms with the green tick button or changes with the red X button.
9. The teacher screen shows the vote chart.
10. The teacher reveals the answer and moves to the next round.
11. After round 9, the teacher presses See scores.
12. The teacher screen shows all learner scores.
13. Each learner screen shows that learner's score.

The student page is optimised for phone portrait use. After joining, learners see a compact score badge such as Score 3 / 9 during play and a larger final score at the end.

Student names
-------------
The teacher page can remove one student name by clicking that name in the student list.

Use Clear students to remove all stale names and votes from the current session.

During a live round, the teacher page uses a compact dashboard with the round, session code, student count, vote count, controls, vote chart, and learner score/status list kept together for laptop classroom use.

When the teacher removes a student, that student page returns to the join screen.
They can enter their name again if they need to rejoin.

Students can also use Leave game on their own screen.

Use New session on the teacher page to create a fresh session code and ignore any old database roster.
Student pages do not auto-rejoin after a reload; the learner must press Join.

When internet access is available, the pages use Firebase Realtime Database.
If Firebase cannot load, they fall back to browser tab-to-tab messaging for same-computer testing.

Firebase setup
--------------
The Firebase config is in js/firebase-config.js.

For early testing, Firebase Realtime Database needs read/write rules that allow the game to use sessions.
The file firebase-database-rules.testing.json contains simple testing rules.

Important: those testing rules are open. They are suitable for a prototype, but not a polished public app.

Hosting later
-------------
To use real phones, publish this folder through GitHub Pages or another static web host.

The teacher opens teacher.html.
Students open student.html with the session code in the address.
The teacher setup screen also shows a QR code for the current student link.
The QR code is generated in local browser JavaScript and does not use a third-party image service.

For example:

student.html?session=LOCAL

If this folder is published as the GitHub repository named recall-the-number-live, the hosted links will be:

https://Thow76.github.io/recall-the-number-live/
https://Thow76.github.io/recall-the-number-live/teacher.html
https://Thow76.github.io/recall-the-number-live/student.html

Audio
-----
The teacher page can choose all 9 MP3 files at once for a testing session.

For fixed local audio, put the MP3s in the audio folder using the filenames listed in audio/README.txt.

Sentences
---------
The teacher setup screen has a Sentences box.

Enter one sentence per line.
Use exactly 9 sentences.

When the teacher starts the live game, those sentences are sent to the session so student screens reveal the same text.

Saved text games
----------------
The teacher setup screen can save and load titled text games.

Saved text games include:
- title
- 9 sentences

Saved text games do not include the MP3 audio files.

If Firebase is connected, saved text games are stored in Realtime Database under savedGames.
The teacher page also keeps a browser backup immediately, so saving still works on this computer if Firebase rules block savedGames.

If a save says "permission denied", copy the rules from firebase-database-rules.testing.json into Firebase Realtime Database Rules and publish them.
If Firebase is not available, the local fallback stores the text games in this browser only.
