"use strict";

(function () {
  const questions = window.RECALL_NUMBER_QUESTIONS || [];
  const bus = window.RecallLiveBus || window.RecallLiveLocal;
  const app = document.getElementById("app");
  const audio = document.getElementById("sentenceAudio");
  const params = new URLSearchParams(window.location.search);
  const teacherSessionKey = "recallNumberLiveLocal.teacherSessionCode";
  const savedGamesBackupKey = "recallNumberLiveLocal.savedTextGamesBackup";
  const savedGamesLegacyKey = "recallNumberLiveLocal.savedGames";

  questions.forEach((question) => {
    question.defaultAudio = question.audio;
  });

  const state = {
    sessionCode: params.get("session") || readSavedSessionCode() || makeSessionCode(),
    view: "setup",
    roundIndex: 0,
    randomOrder: [],
    phase: "waiting",
    revealed: false,
    votes: {},
    players: {},
    audioWarning: "",
    connectionMessage: "",
    audioUploadStatus: "none",
    audioUploadMessage: "",
    gameTitle: "Shopping",
    savedGames: readAllLocalSavedGames(),
    selectedSavedGameId: "",
    savedGamesStatus: "none",
    savedGamesMessage: "",
    sentenceStatus: "none",
    sentenceMessage: "",
    sentenceDraft: questions.map((question) => question.sentence).join("\n")
  };

  let uploadedAudioUrls = [];
  let unsubscribeSession = null;
  let unsubscribeSavedGames = null;

  saveSessionCode();

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function shuffleNumbers() {
    const values = questions.map((question) => question.number);
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = values[index];
      values[index] = values[swapIndex];
      values[swapIndex] = current;
    }
    if (values.length > 1 && values.every((value, index) => value === questions[index].number)) {
      const first = values[0];
      values[0] = values[1];
      values[1] = first;
    }
    return values;
  }

  function makeSessionCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let index = 0; index < 5; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  function readSavedSessionCode() {
    try {
      return localStorage.getItem(teacherSessionKey);
    } catch (error) {
      return "";
    }
  }

  function saveSessionCode() {
    try {
      localStorage.setItem(teacherSessionKey, state.sessionCode);
    } catch (error) {
      // The current session still works if storage is unavailable.
    }
  }

  function readJsonStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function readSavedGamesBackup() {
    return readJsonStorage(savedGamesBackupKey, {});
  }

  function readAllLocalSavedGames() {
    return Object.assign(
      {},
      readJsonStorage(savedGamesLegacyKey, {}),
      readJsonStorage(savedGamesBackupKey, {})
    );
  }

  function writeSavedGamesBackup(savedGames) {
    return writeJsonStorage(savedGamesBackupKey, savedGames);
  }

  function mergedSavedGames(remoteSavedGames) {
    return Object.assign({}, readAllLocalSavedGames(), remoteSavedGames || {});
  }

  function persistVisibleSavedGames(extraGames) {
    return writeSavedGamesBackup(Object.assign({}, readAllLocalSavedGames(), state.savedGames || {}, extraGames || {}));
  }

  function firebaseBlockedMessage(error) {
    const detail = error && error.message ? error.message : "Firebase error";
    if (/permission/i.test(detail)) {
      return "Firebase permission denied. Publish the savedGames rule to save across browsers.";
    }
    return `${detail}. Local save is still working.`;
  }

  function currentNumber() {
    return state.randomOrder[state.roundIndex];
  }

  function currentQuestion() {
    return questions.find((question) => question.number === currentNumber());
  }

  function clearUploadedAudio() {
    uploadedAudioUrls.forEach((url) => URL.revokeObjectURL(url));
    uploadedAudioUrls = [];
  }

  function sentenceNumberFromFilename(filename) {
    const match = filename.match(/^0?([1-9])(?:\D|$)/);
    return match ? Number(match[1]) : null;
  }

  function attachAudioFile(question, file) {
    const url = URL.createObjectURL(file);
    uploadedAudioUrls.push(url);
    question.audio = url;
    question.audioName = file.name;
  }

  function normaliseSentence(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function captureGameTitle() {
    const input = document.getElementById("gameTitle");
    if (input) {
      state.gameTitle = input.value.trim();
    }
  }

  function captureSentenceDraft() {
    const textarea = document.getElementById("sentenceList");
    if (textarea) {
      state.sentenceDraft = textarea.value;
    }
  }

  function captureSetupText() {
    captureGameTitle();
    captureSentenceDraft();
  }

  function makeGameId(title) {
    const slug = String(title || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || `game-${Date.now()}`;
  }

  function sessionQuestions() {
    return questions.map((question) => ({
      number: question.number,
      sentence: question.sentence
    }));
  }

  function applySentenceDraft() {
    const lines = state.sentenceDraft
      .split(/\r?\n/)
      .map(normaliseSentence)
      .filter(Boolean);

    if (lines.length !== questions.length) {
      state.sentenceStatus = "warning";
      state.sentenceMessage = `Please enter exactly ${questions.length} sentences. You have ${lines.length}.`;
      render();
      return false;
    }

    questions.forEach((question, index) => {
      question.sentence = lines[index];
    });
    state.sentenceStatus = "ready";
    state.sentenceMessage = `${questions.length} sentences ready.`;
    return true;
  }

  function sentenceLinesFromDraft() {
    return state.sentenceDraft
      .split(/\r?\n/)
      .map(normaliseSentence)
      .filter(Boolean);
  }

  function saveTextGame() {
    captureSetupText();
    const title = state.gameTitle.trim();
    const sentences = sentenceLinesFromDraft();
    if (!title) {
      state.savedGamesStatus = "warning";
      state.savedGamesMessage = "Enter a title before saving.";
      render();
      return;
    }
    if (sentences.length !== questions.length) {
      state.savedGamesStatus = "warning";
      state.savedGamesMessage = `Save needs exactly ${questions.length} sentences. You have ${sentences.length}.`;
      render();
      return;
    }

    const now = Date.now();
    const gameId = makeGameId(title);
    const existing = state.savedGames[gameId] || {};
    const game = {
      id: gameId,
      title,
      sentences,
      createdAt: existing.createdAt || now,
      updatedAt: now
    };
    const backupSavedGames = Object.assign({}, readAllLocalSavedGames(), { [gameId]: game });
    const savedLocally = writeSavedGamesBackup(backupSavedGames);
    state.savedGames = Object.assign({}, state.savedGames, { [gameId]: game });
    state.selectedSavedGameId = gameId;
    state.savedGamesStatus = "ready";
    state.savedGamesMessage = savedLocally
      ? `Saved "${title}" in this browser. Trying Firebase...`
      : `Saved "${title}" on screen. Browser storage may be full or blocked. Trying Firebase...`;
    const result = bus.saveGame(game);
    if (result && typeof result.catch === "function") {
      result
        .then(() => {
          state.savedGamesStatus = "ready";
          state.savedGamesMessage = bus.source === "firebase"
            ? `Saved "${title}" to Firebase and this browser.`
            : `Saved "${title}" in this browser.`;
          render();
        })
        .catch((error) => {
          state.savedGames = Object.assign({}, state.savedGames, readAllLocalSavedGames());
          state.savedGamesStatus = savedLocally ? "ready" : "warning";
          state.savedGamesMessage = savedLocally
            ? `Saved "${title}" in this browser. Firebase cloud save is blocked: ${firebaseBlockedMessage(error)}`
            : `Save failed: ${firebaseBlockedMessage(error)}`;
          render();
        });
    } else {
      state.savedGamesMessage = savedLocally
        ? `Saved "${title}" in this browser.`
        : `Saved "${title}" on screen, but browser storage may be full or blocked.`;
    }
    render();
  }

  function saveRemoteDelete(gameId, title) {
    const result = bus.deleteGame(gameId);
    if (result && typeof result.catch === "function") {
      result
        .then(() => {
          state.savedGamesStatus = "ready";
          state.savedGamesMessage = bus.source === "firebase"
            ? `Deleted "${title}" from Firebase and this browser.`
            : `Deleted "${title}" from this browser.`;
          render();
        })
        .catch((error) => {
          state.savedGamesStatus = "ready";
          state.savedGamesMessage = `Deleted "${title}" from this browser. Firebase cloud delete is blocked: ${firebaseBlockedMessage(error)}`;
          render();
        });
    }
  }

  function loadTextGame(gameId) {
    captureSetupText();
    const game = state.savedGames[gameId];
    if (!game || !Array.isArray(game.sentences)) {
      state.savedGamesStatus = "warning";
      state.savedGamesMessage = "That saved game could not be loaded. Try saving it again.";
      render();
      return;
    }
    persistVisibleSavedGames({ [gameId]: game });
    state.gameTitle = game.title || "";
    state.selectedSavedGameId = gameId;
    state.sentenceDraft = game.sentences.join("\n");
    state.sentenceStatus = "ready";
    state.sentenceMessage = `${game.sentences.length} sentences loaded.`;
    state.savedGamesStatus = "ready";
    state.savedGamesMessage = `Loaded "${state.gameTitle}".`;
    applySentenceDraft();
    render();
  }

  function deleteTextGame(gameId) {
    captureSetupText();
    const game = state.savedGames[gameId];
    if (!game) {
      return;
    }
    const nextSavedGames = Object.assign({}, state.savedGames);
    delete nextSavedGames[gameId];
    state.savedGames = nextSavedGames;
    if (state.selectedSavedGameId === gameId) {
      state.selectedSavedGameId = Object.keys(nextSavedGames)[0] || "";
    }
    const backupSavedGames = readSavedGamesBackup();
    delete backupSavedGames[gameId];
    writeSavedGamesBackup(backupSavedGames);
    const legacySavedGames = readJsonStorage(savedGamesLegacyKey, {});
    delete legacySavedGames[gameId];
    writeJsonStorage(savedGamesLegacyKey, legacySavedGames);
    state.savedGamesStatus = "ready";
    state.savedGamesMessage = `Deleted "${game.title}" from this browser.`;
    saveRemoteDelete(gameId, game.title);
    render();
  }

  function selectedSavedGameId() {
    const select = document.getElementById("savedGameSelect");
    return select ? select.value : state.selectedSavedGameId;
  }

  function handleAudioUpload(fileList) {
    captureSetupText();
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith("audio/") || file.name.toLowerCase().endsWith(".mp3"));
    if (!files.length) {
      state.audioUploadStatus = "warning";
      state.audioUploadMessage = "No audio files were selected.";
      render();
      return;
    }

    clearUploadedAudio();
    questions.forEach((question) => {
      question.audio = question.defaultAudio;
      delete question.audioName;
    });

    const filesByNumber = new Map();
    files.forEach((file) => {
      const number = sentenceNumberFromFilename(file.name);
      if (number && !filesByNumber.has(number)) {
        filesByNumber.set(number, file);
      }
    });

    if (filesByNumber.size) {
      questions.forEach((question) => {
        const file = filesByNumber.get(question.number);
        if (file) {
          attachAudioFile(question, file);
        }
      });
    } else if (files.length === questions.length) {
      files
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name))
        .forEach((file, index) => attachAudioFile(questions[index], file));
    }

    const loadedCount = questions.filter((question) => question.audioName).length;
    if (loadedCount === questions.length) {
      state.audioUploadStatus = "ready";
      state.audioUploadMessage = "9 audio files ready for this session.";
    } else if (loadedCount) {
      const missing = questions
        .filter((question) => !question.audioName)
        .map((question) => question.number)
        .join(", ");
      state.audioUploadStatus = "warning";
      state.audioUploadMessage = `${loadedCount} audio files ready. Missing sentence ${missing}.`;
    } else {
      state.audioUploadStatus = "warning";
      state.audioUploadMessage = "No files matched the sentence numbers. Rename files 01 to 09 or choose exactly 9 files.";
    }
    render();
  }

  function stopAudio() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  function playAudio() {
    const question = currentQuestion();
    if (!question || !question.audio) {
      state.audioWarning = "Audio file is not set for this sentence.";
      render();
      return;
    }

    state.audioWarning = "";
    audio.pause();
    audio.src = question.audio;
    audio.currentTime = 0;
    audio.play().catch(() => {
      state.audioWarning = "Audio could not play. Check the MP3 file or choose files again.";
      render();
    });
  }

  function publish() {
    const result = bus.write({
      sessionCode: state.sessionCode,
      view: state.view,
      roundIndex: state.roundIndex,
      totalRounds: questions.length,
      randomOrder: state.randomOrder,
      currentNumber: currentNumber() || null,
      questions: sessionQuestions(),
      phase: state.phase,
      revealed: state.revealed,
      players: state.players,
      votes: state.votes
    });
    if (result && typeof result.catch === "function") {
      result.catch((error) => {
        state.connectionMessage = `Firebase write failed: ${error.message}`;
        render();
      });
    }
  }

  function subscribeToSession() {
    if (unsubscribeSession) {
      unsubscribeSession();
    }
    unsubscribeSession = bus.subscribe((snapshot) => {
      if (!snapshot || snapshot.sessionCode !== state.sessionCode) {
        return;
      }
      state.connectionMessage = "";
      state.players = snapshot.players || {};
      state.votes = snapshot.votes || {};
      render();
    }, state.sessionCode, (error) => {
      state.connectionMessage = `Firebase read failed: ${error.message}`;
      render();
    });
  }

  function connectionLabel() {
    return bus.source === "firebase" ? "Firebase Realtime Database" : "Local tab test";
  }

  function beginGame() {
    captureSetupText();
    if (!applySentenceDraft()) {
      return;
    }
    stopAudio();
    state.view = "live";
    state.roundIndex = 0;
    state.randomOrder = shuffleNumbers();
    state.phase = "voting";
    state.revealed = false;
    state.votes = {};
    state.players = state.players || {};
    state.audioWarning = "";
    publish();
    render();
  }

  function resetCurrentVotes() {
    state.votes[String(state.roundIndex)] = {};
  }

  function revealAnswer() {
    state.revealed = true;
    state.phase = "revealed";
    stopAudio();
    publish();
    render();
  }

  function nextRound() {
    stopAudio();
    if (state.roundIndex >= questions.length - 1) {
      state.view = "finished";
      state.phase = "finished";
      publish();
      render();
      return;
    }

    state.roundIndex += 1;
    state.phase = "voting";
    state.revealed = false;
    state.audioWarning = "";
    resetCurrentVotes();
    publish();
    render();
  }

  function restart() {
    beginGame();
  }

  function currentVotes() {
    return state.votes[String(state.roundIndex)] || {};
  }

  function voteCounts() {
    const counts = {};
    questions.forEach((question) => {
      counts[question.number] = 0;
    });
    Object.values(currentVotes()).forEach((vote) => {
      counts[vote.answer] = (counts[vote.answer] || 0) + 1;
    });
    return counts;
  }

  function playerCount() {
    return Object.keys(state.players || {}).length;
  }

  function voteCount() {
    return Object.keys(currentVotes()).length;
  }

  function playerScore(playerId) {
    return state.randomOrder.reduce((score, correctNumber, roundIndex) => {
      const roundVotes = state.votes[String(roundIndex)] || {};
      const vote = roundVotes[playerId];
      return vote && vote.answer === correctNumber ? score + 1 : score;
    }, 0);
  }

  function scoreRows() {
    return Object.values(state.players || {})
      .map((player) => ({
        id: player.id,
        name: player.name,
        score: playerScore(player.id)
      }))
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  }

  function removePlayer(playerId) {
    if (!playerId || !state.players[playerId]) {
      return;
    }

    delete state.players[playerId];
    Object.keys(state.votes || {}).forEach((roundKey) => {
      if (state.votes[roundKey]) {
        delete state.votes[roundKey][playerId];
      }
    });
    publish();
    render();
  }

  function clearStudents() {
    state.players = {};
    state.votes = {};
    publish();
    render();
  }

  function newSession() {
    captureSetupText();
    stopAudio();
    state.sessionCode = makeSessionCode();
    state.view = "setup";
    state.roundIndex = 0;
    state.randomOrder = [];
    state.phase = "waiting";
    state.revealed = false;
    state.players = {};
    state.votes = {};
    state.audioWarning = "";
    state.connectionMessage = "";
    saveSessionCode();
    subscribeToSession();
    publish();
    render();
  }

  function studentUrl() {
    const href = window.location.href.replace(/teacher\.html.*$/, `student.html?session=${state.sessionCode}`);
    return href;
  }

  function renderSetup() {
    app.innerHTML = `
      <section class="screen start-screen">
        <div class="start-panel">
          <p class="section-label">Teacher</p>
          <h1>RECALL THE NUMBER LIVE</h1>
          <p class="subtitle">Open the student page in another tab to test live voting.</p>

          <section class="join-panel" aria-label="Student joining details">
            <span>Connection</span>
            <strong>${escapeHtml(connectionLabel())}</strong>
            ${state.connectionMessage ? `<p class="connection-warning">${escapeHtml(state.connectionMessage)}</p>` : ""}
          </section>

          <section class="join-panel" aria-label="Student joining details">
            <span>Student page</span>
            <strong>${escapeHtml(studentUrl())}</strong>
          </section>

          <section class="join-panel" aria-label="Session code">
            <div class="panel-heading">
              <span>Session code</span>
              <button class="button button-light button-small" type="button" data-action="new-session">New session</button>
            </div>
            <strong class="session-code">${escapeHtml(state.sessionCode)}</strong>
          </section>

          <section class="join-panel" aria-label="Game title">
            <label class="name-field compact-field">
              Game title
              <input id="gameTitle" type="text" value="${escapeHtml(state.gameTitle)}">
            </label>
          </section>

          <section class="library-panel ${state.savedGamesStatus === "ready" ? "is-ready" : ""} ${state.savedGamesStatus === "warning" ? "is-warning" : ""}" aria-label="Load saved text game">
            <div class="panel-heading">
              <span>Load saved game</span>
            </div>
            ${renderSavedGames()}
            <p>${state.savedGamesMessage ? escapeHtml(state.savedGamesMessage) : "Saved games are title and sentence text only. Audio files are selected separately."}</p>
          </section>

          <section class="join-panel roster-panel" aria-label="Joined students">
            <div class="panel-heading">
              <span>Joined students</span>
              <button class="button button-light button-small" type="button" data-action="clear-students" ${playerCount() ? "" : "disabled"}>Clear students</button>
            </div>
            ${renderStudentList()}
          </section>

          <section class="audio-setup ${state.audioUploadStatus === "ready" ? "is-ready" : ""} ${state.audioUploadStatus === "warning" ? "is-warning" : ""}" aria-label="Audio setup">
            <label class="upload-button">
              Choose audio files
              <input id="audioUpload" class="file-input" type="file" accept="audio/*,.mp3" multiple>
            </label>
            <p>${state.audioUploadMessage ? escapeHtml(state.audioUploadMessage) : "Choose all 9 MP3 files here, or use files already in the audio folder."}</p>
          </section>

          <section class="sentence-setup ${state.sentenceStatus === "ready" ? "is-ready" : ""} ${state.sentenceStatus === "warning" ? "is-warning" : ""}" aria-label="Sentence setup">
            <label class="sentence-label" for="sentenceList">Sentences</label>
            <textarea id="sentenceList" rows="9" spellcheck="true">${escapeHtml(state.sentenceDraft)}</textarea>
            <p>${state.sentenceMessage ? escapeHtml(state.sentenceMessage) : "Enter one sentence per line, in the same order as the audio files."}</p>
          </section>

          <div class="setup-actions">
            <button class="button button-light button-large" type="button" data-action="save-text-game">Save Text Game</button>
            <button class="button button-primary button-large" type="button" data-action="start">Start Live Game</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderSavedGames() {
    const games = Object.values(state.savedGames || {})
      .sort((left, right) => String(left.title || "").localeCompare(String(right.title || "")));
    if (!games.length) {
      return `<p class="muted">No saved text games yet.</p>`;
    }
    const selectedGameId = games.some((game) => game.id === state.selectedSavedGameId)
      ? state.selectedSavedGameId
      : games[0].id;
    state.selectedSavedGameId = selectedGameId;

    return `
      <div class="load-game-control">
        <label class="select-field" for="savedGameSelect">
          Saved game (${games.length} saved)
          <select id="savedGameSelect">
            ${games.map((game) => `<option value="${escapeHtml(game.id)}" ${game.id === selectedGameId ? "selected" : ""}>${escapeHtml(game.title)}</option>`).join("")}
          </select>
        </label>
        <div class="saved-game-actions">
          <button class="button button-light button-small" type="button" data-action="load-selected-game">Load</button>
          <button class="button button-danger button-small" type="button" data-action="delete-selected-game">Delete</button>
        </div>
      </div>
    `;
  }

  function renderProgressDots() {
    return questions.map((_, index) => {
      const status = index < state.roundIndex ? "is-complete" : "";
      const current = index === state.roundIndex ? "is-current" : "";
      return `<span class="progress-dot ${status} ${current}" aria-hidden="true"></span>`;
    }).join("");
  }

  function renderChart() {
    const counts = voteCounts();
    const max = Math.max(1, ...Object.values(counts));
    return questions.map((question) => {
      const count = counts[question.number] || 0;
      const width = Math.max(4, Math.round((count / max) * 100));
      const correctClass = state.revealed && question.number === currentNumber() ? "is-correct" : "";
      return `
        <div class="vote-row ${correctClass}">
          <span class="vote-number">${question.number}</span>
          <div class="vote-track">
            <div class="vote-bar" style="width:${width}%"></div>
          </div>
          <strong>${count}</strong>
        </div>
      `;
    }).join("");
  }

  function renderStudentList() {
    const players = Object.values(state.players || {});
    if (!players.length) {
      return `<p class="muted">No students joined yet.</p>`;
    }

    return `
      <div class="student-list">
        ${players.map((player) => `
          <button class="student-chip" type="button" data-remove-player="${escapeHtml(player.id)}" aria-label="Remove ${escapeHtml(player.name)}">
            <span>${escapeHtml(player.name)}</span>
            <em>Remove</em>
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderLive() {
    const round = state.roundIndex + 1;
    const question = currentQuestion();
    const nextLabel = round === questions.length ? "See scores" : "Next round";
    app.innerHTML = `
      <section class="screen teacher-screen">
        <header class="game-header">
          <div>
            <p class="section-label">Teacher</p>
            <h1>Round ${round} of ${questions.length}</h1>
          </div>
          <div class="teacher-actions">
            <button class="button button-light" type="button" data-action="restart">Restart game</button>
            <button class="button button-light" type="button" data-action="new-session">New session</button>
          </div>
        </header>

        <div class="connection-strip ${state.connectionMessage ? "is-warning" : ""}">
          <span>${escapeHtml(connectionLabel())}</span>
          ${state.connectionMessage ? `<strong>${escapeHtml(state.connectionMessage)}</strong>` : `<strong>Ready</strong>`}
        </div>

        <div class="progress" aria-label="Round ${round} of ${questions.length}">
          ${renderProgressDots()}
        </div>

        <section class="teacher-grid">
          <div class="control-panel">
            <button class="play-button" type="button" data-action="play" aria-label="Play sentence audio">
              <span class="play-triangle" aria-hidden="true"></span>
            </button>
            <p class="audio-warning ${state.audioWarning ? "" : "is-empty"}">${state.audioWarning ? escapeHtml(state.audioWarning) : "Audio status"}</p>
            <div class="round-status">
              <span>${voteCount()} votes</span>
              <span>${playerCount()} students</span>
            </div>
            <div class="button-row">
              <button class="button button-light" type="button" data-action="reveal" ${state.revealed ? "disabled" : ""}>Reveal answer</button>
              <button class="button button-primary" type="button" data-action="next" ${state.revealed ? "" : "disabled"}>${nextLabel}</button>
            </div>
            ${state.revealed && question ? `<div class="sentence-reveal"><span>Sentence ${currentNumber()}</span><strong>${escapeHtml(question.sentence)}</strong></div>` : `<div class="sentence-reveal is-empty"><span>Sentence</span><strong>Answer hidden</strong></div>`}
          </div>

          <div class="chart-panel">
            <h2>Votes</h2>
            ${renderChart()}
          </div>

          <div class="students-panel">
            <div class="panel-heading">
              <h2>Students</h2>
              <button class="button button-light button-small" type="button" data-action="clear-students" ${playerCount() ? "" : "disabled"}>Clear all</button>
            </div>
            ${renderStudentList()}
          </div>
        </section>
      </section>
    `;
  }

  function renderFinished() {
    const rows = scoreRows();
    const topScore = rows.length ? rows[0].score : 0;
    app.innerHTML = `
      <section class="screen start-screen">
        <div class="start-panel results-panel">
          <p class="section-label">Teacher</p>
          <h1>Scores</h1>
          <p class="subtitle">Correct answers out of ${questions.length}.</p>
          <section class="scoreboard" aria-label="Final scores">
            ${
              rows.length
                ? rows.map((row) => `
                    <div class="score-row ${row.score === topScore ? "is-top" : ""}">
                      <span>${escapeHtml(row.name)}</span>
                      <strong>${row.score} / ${questions.length}</strong>
                    </div>
                  `).join("")
                : `<p class="muted">No student scores yet.</p>`
            }
          </section>
          <div class="button-row">
            <button class="button button-primary button-large" type="button" data-action="start">Play Again</button>
            <button class="button button-light button-large" type="button" data-action="setup">Back to Setup</button>
            <button class="button button-light button-large" type="button" data-action="new-session">New session</button>
          </div>
        </div>
      </section>
    `;
  }

  function render() {
    if (state.view === "live") {
      renderLive();
      return;
    }
    if (state.view === "finished") {
      renderFinished();
      return;
    }
    renderSetup();
  }

  subscribeToSession();
  if (bus.subscribeSavedGames) {
    unsubscribeSavedGames = bus.subscribeSavedGames((savedGames) => {
      state.savedGames = mergedSavedGames(savedGames);
      if (!state.savedGamesMessage) {
        state.savedGamesStatus = "none";
      }
      render();
    }, (error) => {
      state.savedGames = readAllLocalSavedGames();
      state.savedGamesStatus = Object.keys(state.savedGames).length ? "ready" : "warning";
      state.savedGamesMessage = `Firebase saved games failed to load: ${firebaseBlockedMessage(error)} Local saved titles still work in this browser.`;
      render();
    });
  }

  app.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const playerId = button.dataset.removePlayer;
    const loadGameId = button.dataset.loadGame;
    const deleteGameId = button.dataset.deleteGame;
    if (playerId) removePlayer(playerId);
    if (loadGameId) loadTextGame(loadGameId);
    if (deleteGameId) deleteTextGame(deleteGameId);
    if (action === "load-selected-game") loadTextGame(selectedSavedGameId());
    if (action === "delete-selected-game") deleteTextGame(selectedSavedGameId());
    if (action === "start") beginGame();
    if (action === "restart") restart();
    if (action === "new-session") newSession();
    if (action === "clear-students") clearStudents();
    if (action === "save-text-game") saveTextGame();
    if (action === "setup") {
      stopAudio();
      state.view = "setup";
      state.phase = "waiting";
      publish();
      render();
    }
    if (action === "play") playAudio();
    if (action === "reveal") revealAnswer();
    if (action === "next") nextRound();
  });

  app.addEventListener("change", (event) => {
    if (event.target.id === "audioUpload") {
      handleAudioUpload(event.target.files);
    }
    if (event.target.id === "savedGameSelect") {
      state.selectedSavedGameId = event.target.value;
    }
  });

  app.addEventListener("input", (event) => {
    if (event.target.id === "sentenceList") {
      state.sentenceDraft = event.target.value;
      state.sentenceStatus = "none";
      state.sentenceMessage = "";
    }
    if (event.target.id === "gameTitle") {
      state.gameTitle = event.target.value;
      state.savedGamesStatus = "none";
      state.savedGamesMessage = "";
    }
  });

  audio.addEventListener("error", () => {
    if (state.view !== "live") {
      return;
    }
    state.audioWarning = "Audio file missing or unreadable.";
    render();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      stopAudio();
    }
    if (event.key.toLowerCase() === "r" && state.view === "live") {
      playAudio();
    }
  });

  render();
}());
