"use strict";

(function () {
  const questions = window.RECALL_NUMBER_QUESTIONS || [];
  const bus = window.RecallLiveBus || window.RecallLiveLocal;
  const app = document.getElementById("app");
  const params = new URLSearchParams(window.location.search);
  const studentSessionKey = "recallNumberLiveLocal.studentSessionCode";

  const state = {
    sessionCode: cleanSessionCode(params.get("session") || sessionStorage.getItem(studentSessionKey) || ""),
    playerId: sessionStorage.getItem("recallNumberLiveLocal.playerId") || "",
    name: "",
    rememberedName: sessionStorage.getItem("recallNumberLiveLocal.name") || "",
    snapshot: bus.read(),
    selectedAnswer: null,
    pendingAnswer: null,
    connectionMessage: "",
    removalMessage: "",
    seenOnRoster: false
  };

  let unsubscribeSession = null;

  function createPlayerId() {
    return `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function resetPlayerId() {
    state.playerId = createPlayerId();
    sessionStorage.setItem("recallNumberLiveLocal.playerId", state.playerId);
  }

  function cleanSessionCode(value) {
    return String(value || "").replace(/[^A-Z0-9-]/gi, "").toUpperCase();
  }

  if (!state.playerId) {
    resetPlayerId();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function currentSnapshot() {
    return state.snapshot && state.snapshot.sessionCode === state.sessionCode ? state.snapshot : null;
  }

  function subscribeToSession() {
    if (unsubscribeSession) {
      unsubscribeSession();
      unsubscribeSession = null;
    }
    if (!state.sessionCode) {
      return;
    }
    unsubscribeSession = bus.subscribe((snapshot) => {
      if (!snapshot || snapshot.sessionCode !== state.sessionCode) {
        return;
      }
      state.connectionMessage = "";
      const previousRound = state.snapshot ? state.snapshot.roundIndex : null;
      state.snapshot = snapshot;
      const players = snapshot.players || {};
      if (players[state.playerId]) {
        state.seenOnRoster = true;
      } else if (state.name && state.seenOnRoster) {
        leaveAfterRemoval();
        return;
      }
      if (snapshot.roundIndex !== previousRound) {
        state.selectedAnswer = null;
        state.pendingAnswer = null;
        if (state.name) {
          writePlayer();
        }
      }
      render();
    }, state.sessionCode, (error) => {
      state.connectionMessage = `Firebase read failed: ${error.message}`;
      render();
    });
  }

  function currentVotes() {
    const snapshot = currentSnapshot();
    if (!snapshot) {
      return {};
    }
    return snapshot.votes && snapshot.votes[String(snapshot.roundIndex)] ? snapshot.votes[String(snapshot.roundIndex)] : {};
  }

  function currentVote() {
    return currentVotes()[state.playerId] || null;
  }

  function currentQuestion() {
    const snapshot = currentSnapshot();
    if (!snapshot) {
      return null;
    }
    const activeQuestions = snapshot.questions || questions;
    return activeQuestions.find((question) => question.number === snapshot.currentNumber);
  }

  function myScore(snapshot) {
    if (!snapshot || !snapshot.randomOrder || !snapshot.votes) {
      return 0;
    }
    return snapshot.randomOrder.reduce((score, correctNumber, roundIndex) => {
      const roundVotes = snapshot.votes[String(roundIndex)] || {};
      const vote = roundVotes[state.playerId];
      return vote && vote.answer === correctNumber ? score + 1 : score;
    }, 0);
  }

  function joinGame() {
    const input = document.getElementById("studentName");
    const codeInput = document.getElementById("sessionCode");
    const name = input ? input.value.trim() : "";
    const sessionCode = cleanSessionCode(codeInput ? codeInput.value : state.sessionCode);
    if (!name) {
      renderName("Please enter your name.");
      return;
    }
    if (!sessionCode) {
      renderName("Please enter the session code from the teacher screen.");
      return;
    }

    state.sessionCode = sessionCode;
    state.name = name;
    state.rememberedName = name;
    state.removalMessage = "";
    state.seenOnRoster = false;
    sessionStorage.setItem("recallNumberLiveLocal.name", name);
    sessionStorage.setItem(studentSessionKey, sessionCode);
    subscribeToSession();
    writePlayer();
    render();
  }

  function leaveAfterRemoval() {
    state.name = "";
    state.selectedAnswer = null;
    state.pendingAnswer = null;
    state.seenOnRoster = false;
    state.removalMessage = "The teacher removed you from this game. Enter your name to join again.";
    sessionStorage.removeItem("recallNumberLiveLocal.name");
    resetPlayerId();
    render();
  }

  function leaveGame() {
    const leavingPlayerId = state.playerId;
    state.name = "";
    state.selectedAnswer = null;
    state.pendingAnswer = null;
    state.seenOnRoster = false;
    state.removalMessage = "You left the game.";
    sessionStorage.removeItem("recallNumberLiveLocal.name");
    resetPlayerId();
    const snapshot = currentSnapshot();
    const roundIndexes = snapshot && snapshot.votes ? Object.keys(snapshot.votes) : [];
    const result = bus.removePlayer(state.sessionCode, leavingPlayerId, roundIndexes);
    if (result && typeof result.catch === "function") {
      result.catch((error) => {
        state.connectionMessage = `Could not leave cleanly: ${error.message}`;
        render();
      });
    }
    render();
  }

  function writePlayer() {
    if (!state.sessionCode) {
      return;
    }
    const player = {
      id: state.playerId,
      name: state.name
    };
    const snapshot = currentSnapshot();
    if (snapshot) {
      snapshot.players = snapshot.players || {};
      snapshot.players[state.playerId] = player;
      state.snapshot = snapshot;
    }
    const result = bus.updatePlayer(state.sessionCode, player);
    if (result && typeof result.catch === "function") {
      result.catch((error) => {
        state.connectionMessage = `Firebase write failed: ${error.message}`;
        render();
      });
    }
  }

  function submitVote(answer) {
    const snapshot = currentSnapshot();
    if (!snapshot || snapshot.phase !== "voting" || currentVote()) {
      return;
    }
    const player = {
      id: state.playerId,
      name: state.name
    };
    snapshot.players = snapshot.players || {};
    snapshot.players[state.playerId] = player;
    snapshot.votes = snapshot.votes || {};
    snapshot.votes[String(snapshot.roundIndex)] = snapshot.votes[String(snapshot.roundIndex)] || {};
    snapshot.votes[String(snapshot.roundIndex)][state.playerId] = {
      answer,
      name: state.name,
      at: Date.now()
    };
    state.selectedAnswer = answer;
    state.snapshot = snapshot;
    const result = bus.submitVote(state.sessionCode, snapshot.roundIndex, player, answer);
    if (result && typeof result.catch === "function") {
      result.catch((error) => {
        state.connectionMessage = `Firebase vote failed: ${error.message}`;
        render();
      });
    }
    render();
  }

  function chooseAnswer(answer) {
    const snapshot = currentSnapshot();
    if (!snapshot || snapshot.phase !== "voting" || currentVote()) {
      return;
    }
    state.pendingAnswer = answer;
    render();
  }

  function cancelPendingAnswer() {
    state.pendingAnswer = null;
    render();
  }

  function confirmPendingAnswer() {
    if (!state.pendingAnswer) {
      return;
    }
    const answer = state.pendingAnswer;
    state.pendingAnswer = null;
    submitVote(answer);
  }

  function connectionLabel() {
    return bus.source === "firebase" ? "Firebase Realtime Database" : "Local tab test";
  }

  function renderName(message) {
    app.innerHTML = `
      <section class="screen student-screen">
        <div class="student-card">
          <p class="section-label">Student</p>
          <h1>Join the game</h1>
          <p class="connection-note">${escapeHtml(connectionLabel())}</p>
          <label class="name-field">
            Session code
            <input id="sessionCode" type="text" inputmode="text" autocapitalize="characters" autocomplete="off" value="${escapeHtml(state.sessionCode)}">
          </label>
          <label class="name-field">
            Your name
            <input id="studentName" type="text" autocomplete="name" value="${escapeHtml(state.rememberedName)}">
          </label>
          ${message ? `<p class="student-warning">${escapeHtml(message)}</p>` : ""}
          <button class="button button-primary button-large" type="button" data-action="join">Join</button>
        </div>
      </section>
    `;
    const input = document.getElementById("studentName");
    if (input) {
      input.focus();
      input.select();
    }
  }

  function renderWaiting() {
    app.innerHTML = `
      <section class="screen student-screen">
        <div class="student-card">
          <p class="section-label">Student</p>
          <h1>Hello, ${escapeHtml(state.name)}</h1>
          <p class="session-note">Session ${escapeHtml(state.sessionCode)}</p>
          <p class="subtitle">Waiting for the teacher to start.</p>
          ${state.connectionMessage ? `<p class="student-warning">${escapeHtml(state.connectionMessage)}</p>` : `<p class="connection-note">${escapeHtml(connectionLabel())}</p>`}
          <div class="button-row">
            <button class="button button-light" type="button" data-action="change-name">Change name</button>
            <button class="button button-danger" type="button" data-action="leave">Leave game</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderNumberButtons(snapshot) {
    const vote = currentVote();
    return questions.map((question) => {
      const number = question.number;
      const selected = vote && vote.answer === number;
      const pending = state.pendingAnswer === number;
      const correct = snapshot.revealed && number === snapshot.currentNumber;
      const wrongSelected = snapshot.revealed && selected && !correct;
      const className = [
        selected ? "is-selected" : "",
        pending ? "is-pending" : "",
        correct ? "is-correct" : "",
        wrongSelected ? "is-wrong" : ""
      ].join(" ");
      return `
        <button class="number-button ${className}" type="button" data-answer="${number}" ${vote || snapshot.phase !== "voting" ? "disabled" : ""}>
          <strong>${number}</strong>
        </button>
      `;
    }).join("");
  }

  function renderGame() {
    const snapshot = currentSnapshot();
    if (!snapshot || !["voting", "revealed", "finished"].includes(snapshot.phase)) {
      renderWaiting();
      return;
    }
    if (snapshot.phase === "finished") {
      const score = myScore(snapshot);
      app.innerHTML = `
        <section class="screen student-screen">
          <div class="student-card">
            <p class="section-label">Student</p>
            <h1>Score</h1>
            <div class="student-score">
              <strong>${score}</strong>
              <span>/ ${snapshot.totalRounds}</span>
            </div>
            <p class="subtitle">Thank you, ${escapeHtml(state.name)}.</p>
            <button class="button button-danger" type="button" data-action="leave">Leave game</button>
          </div>
        </section>
      `;
      return;
    }

    const vote = currentVote();
    const question = currentQuestion();
    app.innerHTML = `
      <section class="screen student-play-screen">
        <header class="student-header">
          <p class="section-label">Round ${snapshot.roundIndex + 1} of ${snapshot.totalRounds}</p>
          <div class="student-actions">
            <button class="button button-light" type="button" data-action="change-name">${escapeHtml(state.name)}</button>
            <button class="button button-danger" type="button" data-action="leave">Leave</button>
          </div>
        </header>

        <section class="student-prompt">
          <h1>Which number is it?</h1>
          <p>${vote ? "Answer sent. Wait for the teacher." : "Tap one number."}</p>
        </section>

        <div class="student-number-grid">
          ${renderNumberButtons(snapshot)}
        </div>

        ${
          state.pendingAnswer && snapshot.phase === "voting" && !vote
            ? `<section class="confirm-box" role="dialog" aria-label="Confirm answer">
                <strong>${state.pendingAnswer}</strong>
                <div class="confirm-actions">
                  <button class="confirm-button is-cancel" type="button" data-action="cancel-answer" aria-label="Change answer">X</button>
                  <button class="confirm-button is-send" type="button" data-action="send-answer" aria-label="Send answer">OK</button>
                </div>
              </section>`
            : ""
        }

        <section class="student-feedback ${snapshot.revealed ? "is-revealed" : ""}">
          ${
            snapshot.revealed && question
              ? `<p>The answer was sentence ${snapshot.currentNumber}.</p><strong>${escapeHtml(question.sentence)}</strong>`
              : `<p>${vote ? `You chose ${vote.answer}.` : "Listening..."}</p>`
          }
          ${state.connectionMessage ? `<p class="student-warning">${escapeHtml(state.connectionMessage)}</p>` : ""}
        </section>
      </section>
    `;
  }

  function render() {
    if (!state.name) {
      renderName(state.removalMessage || "");
      return;
    }
    renderGame();
  }

  app.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }
    const action = button.dataset.action;
    const answer = button.dataset.answer;
    if (action === "join") joinGame();
    if (action === "change-name") {
      state.rememberedName = state.name;
      renderName("");
    }
    if (action === "leave") leaveGame();
    if (action === "cancel-answer") cancelPendingAnswer();
    if (action === "send-answer") confirmPendingAnswer();
    if (answer) chooseAnswer(Number(answer));
  });

  app.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.id === "studentName") {
      joinGame();
    }
  });

  subscribeToSession();
  render();
}());
