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

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function makeQrSvg(value) {
    const matrix = makeQrMatrix(value);
    const quiet = 4;
    const size = matrix.length + quiet * 2;
    const cells = [];
    matrix.forEach((row, y) => {
      row.forEach((isDark, x) => {
        if (isDark) {
          cells.push(`M${x + quiet},${y + quiet}h1v1h-1z`);
        }
      });
    });

    return `
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code for ${escapeAttribute(value)}">
        <rect width="${size}" height="${size}" fill="#ffffff"></rect>
        <path d="${cells.join("")}" fill="#172033"></path>
      </svg>
    `;
  }

  function makeQrMatrix(value) {
    const version = 6;
    const size = version * 4 + 17;
    const dataCodewords = 136;
    const errorCodewords = 18;
    const blockCount = 2;
    const modules = Array.from({ length: size }, () => Array(size).fill(false));
    const isFunction = Array.from({ length: size }, () => Array(size).fill(false));
    const data = qrDataCodewords(value, dataCodewords);
    const blocks = [];

    for (let block = 0; block < blockCount; block += 1) {
      const start = block * 68;
      const blockData = data.slice(start, start + 68);
      blocks.push({
        data: blockData,
        ecc: reedSolomonRemainder(blockData, errorCodewords)
      });
    }

    const codewords = [];
    for (let index = 0; index < 68; index += 1) {
      blocks.forEach((block) => codewords.push(block.data[index]));
    }
    for (let index = 0; index < errorCodewords; index += 1) {
      blocks.forEach((block) => codewords.push(block.ecc[index]));
    }

    drawFunctionPatterns(modules, isFunction, version);

    let bestModules = null;
    let bestMask = 0;
    let bestPenalty = Infinity;
    for (let mask = 0; mask < 8; mask += 1) {
      const trial = modules.map((row) => row.slice());
      drawCodewords(trial, isFunction, codewords, mask);
      drawFormatBits(trial, isFunction, mask);
      const penalty = qrPenalty(trial);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestMask = mask;
        bestModules = trial;
      }
    }

    drawFormatBits(bestModules, isFunction, bestMask);
    return bestModules;
  }

  function qrDataCodewords(value, maxCodewords) {
    const bytes = Array.from(new TextEncoder().encode(value));
    const bits = [];
    appendBits(bits, 0x4, 4);
    appendBits(bits, bytes.length, 8);
    bytes.forEach((byte) => appendBits(bits, byte, 8));
    if (bits.length > maxCodewords * 8) {
      throw new Error("Student URL is too long for the setup QR code.");
    }
    appendBits(bits, 0, Math.min(4, maxCodewords * 8 - bits.length));
    while (bits.length % 8) {
      bits.push(0);
    }

    const codewords = [];
    for (let index = 0; index < bits.length; index += 8) {
      let codeword = 0;
      for (let offset = 0; offset < 8; offset += 1) {
        codeword = (codeword << 1) | bits[index + offset];
      }
      codewords.push(codeword);
    }
    for (let pad = 0; codewords.length < maxCodewords; pad += 1) {
      codewords.push(pad % 2 ? 0x11 : 0xec);
    }
    return codewords;
  }

  function appendBits(bits, value, length) {
    for (let index = length - 1; index >= 0; index -= 1) {
      bits.push((value >>> index) & 1);
    }
  }

  function reedSolomonRemainder(data, degree) {
    const generator = reedSolomonGenerator(degree);
    const result = Array(degree).fill(0);
    data.forEach((byte) => {
      const factor = byte ^ result.shift();
      result.push(0);
      generator.forEach((coefficient, index) => {
        result[index] ^= gfMultiply(coefficient, factor);
      });
    });
    return result;
  }

  function reedSolomonGenerator(degree) {
    let result = [1];
    for (let index = 0; index < degree; index += 1) {
      const next = Array(result.length + 1).fill(0);
      result.forEach((coefficient, position) => {
        next[position] ^= gfMultiply(coefficient, 1);
        next[position + 1] ^= gfMultiply(coefficient, gfPow(2, index));
      });
      result = next;
    }
    return result.slice(1);
  }

  function gfPow(value, power) {
    let result = 1;
    for (let index = 0; index < power; index += 1) {
      result = gfMultiply(result, value);
    }
    return result;
  }

  function gfMultiply(left, right) {
    let result = 0;
    for (let index = 0; index < 8; index += 1) {
      if ((right & 1) !== 0) {
        result ^= left;
      }
      const carry = left & 0x80;
      left = (left << 1) & 0xff;
      if (carry) {
        left ^= 0x1d;
      }
      right >>>= 1;
    }
    return result;
  }

  function drawFunctionPatterns(modules, isFunction, version) {
    const size = modules.length;
    drawFinderPattern(modules, isFunction, 3, 3);
    drawFinderPattern(modules, isFunction, size - 4, 3);
    drawFinderPattern(modules, isFunction, 3, size - 4);

    for (let index = 8; index < size - 8; index += 1) {
      setFunctionModule(modules, isFunction, index, 6, index % 2 === 0);
      setFunctionModule(modules, isFunction, 6, index, index % 2 === 0);
    }

    [6, 34].forEach((x) => {
      [6, 34].forEach((y) => {
        if (!isFunction[y][x]) {
          drawAlignmentPattern(modules, isFunction, x, y);
        }
      });
    });

    drawFormatBits(modules, isFunction, 0);
    setFunctionModule(modules, isFunction, 8, version * 4 + 9, true);
  }

  function drawFinderPattern(modules, isFunction, centerX, centerY) {
    for (let y = -4; y <= 4; y += 1) {
      for (let x = -4; x <= 4; x += 1) {
        const distance = Math.max(Math.abs(x), Math.abs(y));
        const moduleX = centerX + x;
        const moduleY = centerY + y;
        if (moduleX >= 0 && moduleX < modules.length && moduleY >= 0 && moduleY < modules.length) {
          setFunctionModule(modules, isFunction, moduleX, moduleY, distance !== 2 && distance !== 4);
        }
      }
    }
  }

  function drawAlignmentPattern(modules, isFunction, centerX, centerY) {
    for (let y = -2; y <= 2; y += 1) {
      for (let x = -2; x <= 2; x += 1) {
        const distance = Math.max(Math.abs(x), Math.abs(y));
        setFunctionModule(modules, isFunction, centerX + x, centerY + y, distance !== 1);
      }
    }
  }

  function setFunctionModule(modules, isFunction, x, y, isDark) {
    modules[y][x] = isDark;
    isFunction[y][x] = true;
  }

  function drawCodewords(modules, isFunction, codewords, mask) {
    const size = modules.length;
    let bitIndex = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) {
        right -= 1;
      }
      for (let vertical = 0; vertical < size; vertical += 1) {
        const y = upward ? size - 1 - vertical : vertical;
        for (let offset = 0; offset < 2; offset += 1) {
          const x = right - offset;
          if (!isFunction[y][x]) {
            const bit = bitIndex < codewords.length * 8
              ? (codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1
              : 0;
            modules[y][x] = Boolean(bit ^ maskCondition(mask, x, y));
            bitIndex += 1;
          }
        }
      }
      upward = !upward;
    }
  }

  function maskCondition(mask, x, y) {
    if (mask === 0) return (x + y) % 2 === 0;
    if (mask === 1) return y % 2 === 0;
    if (mask === 2) return x % 3 === 0;
    if (mask === 3) return (x + y) % 3 === 0;
    if (mask === 4) return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    if (mask === 5) return ((x * y) % 2) + ((x * y) % 3) === 0;
    if (mask === 6) return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }

  function drawFormatBits(modules, isFunction, mask) {
    const size = modules.length;
    const bits = formatBits(mask);
    for (let index = 0; index <= 5; index += 1) {
      setFunctionModule(modules, isFunction, 8, index, getBit(bits, index));
    }
    setFunctionModule(modules, isFunction, 8, 7, getBit(bits, 6));
    setFunctionModule(modules, isFunction, 8, 8, getBit(bits, 7));
    setFunctionModule(modules, isFunction, 7, 8, getBit(bits, 8));
    for (let index = 9; index < 15; index += 1) {
      setFunctionModule(modules, isFunction, 14 - index, 8, getBit(bits, index));
    }
    for (let index = 0; index < 8; index += 1) {
      setFunctionModule(modules, isFunction, size - 1 - index, 8, getBit(bits, index));
    }
    for (let index = 8; index < 15; index += 1) {
      setFunctionModule(modules, isFunction, 8, size - 15 + index, getBit(bits, index));
    }
    setFunctionModule(modules, isFunction, 8, size - 8, true);
  }

  function formatBits(mask) {
    const data = (1 << 3) | mask;
    let remainder = data;
    for (let index = 0; index < 10; index += 1) {
      remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) ? 0x537 : 0);
    }
    return ((data << 10) | remainder) ^ 0x5412;
  }

  function getBit(value, index) {
    return Boolean((value >>> index) & 1);
  }

  function qrPenalty(modules) {
    const size = modules.length;
    let penalty = 0;

    for (let y = 0; y < size; y += 1) {
      penalty += linePenalty(modules[y]);
    }
    for (let x = 0; x < size; x += 1) {
      penalty += linePenalty(modules.map((row) => row[x]));
    }

    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const color = modules[y][x];
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) {
          penalty += 3;
        }
      }
    }

    const darkCount = modules.flat().filter(Boolean).length;
    penalty += Math.floor(Math.abs(darkCount * 20 - size * size * 10) / (size * size)) * 10;
    return penalty;
  }

  function linePenalty(line) {
    let penalty = 0;
    let runColor = line[0];
    let runLength = 1;
    for (let index = 1; index <= line.length; index += 1) {
      if (index < line.length && line[index] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) {
          penalty += runLength - 2;
        }
        runColor = line[index];
        runLength = 1;
      }
    }
    return penalty;
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
    window.scrollTo(0, 0);
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

  function playerScoreThroughRound(playerId, maxRoundIndex) {
    if (maxRoundIndex < 0) {
      return 0;
    }

    return state.randomOrder.slice(0, maxRoundIndex + 1).reduce((score, correctNumber, roundIndex) => {
      const roundVotes = state.votes[String(roundIndex)] || {};
      const vote = roundVotes[playerId];
      return vote && vote.answer === correctNumber ? score + 1 : score;
    }, 0);
  }

  function playerScore(playerId) {
    return playerScoreThroughRound(playerId, state.randomOrder.length - 1);
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

  function visiblePlayerScore(playerId) {
    const lastVisibleRound = state.revealed ? state.roundIndex : state.roundIndex - 1;
    return playerScoreThroughRound(playerId, lastVisibleRound);
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
    const baseHref = window.location.href === "about:srcdoc" ? document.baseURI : window.location.href;
    const url = new URL("student.html", baseHref);
    url.search = "";
    url.searchParams.set("session", state.sessionCode);
    return url.href;
  }

  function renderSetup() {
    const joinUrl = studentUrl();
    app.innerHTML = `
      <section class="screen teacher-setup-screen">
        <div class="teacher-setup">
          <header class="setup-header">
            <div>
              <p class="section-label">Teacher</p>
              <h1>Recall the Number Live</h1>
            </div>
            <div class="connection-strip setup-connection ${state.connectionMessage ? "is-warning" : ""}">
              <span>${escapeHtml(connectionLabel())}</span>
              ${state.connectionMessage ? `<strong>${escapeHtml(state.connectionMessage)}</strong>` : `<strong>Ready</strong>`}
            </div>
          </header>

          <section class="setup-access" aria-label="Student joining details">
            <div class="access-session">
              <span>Session code</span>
              <strong class="session-code">${escapeHtml(state.sessionCode)}</strong>
              <button class="button button-light button-small" type="button" data-action="new-session">New session</button>
            </div>
            <div class="access-qr">
              <div class="qr-code">${makeQrSvg(joinUrl)}</div>
              <span>Scan to join</span>
            </div>
            <div class="access-link">
              <span>Student link</span>
              <a href="${escapeAttribute(joinUrl)}" target="_blank" rel="noopener">${escapeHtml(joinUrl)}</a>
            </div>
          </section>

          <div class="setup-workspace">
            <aside class="setup-sidebar">
              <section class="library-panel ${state.savedGamesStatus === "ready" ? "is-ready" : ""} ${state.savedGamesStatus === "warning" ? "is-warning" : ""}" aria-label="Load saved text game">
                <div class="panel-heading">
                  <span>Load saved game</span>
                </div>
                ${renderSavedGames()}
                <p>${state.savedGamesMessage ? escapeHtml(state.savedGamesMessage) : "Saved games keep titles and sentences. Audio is selected separately."}</p>
              </section>

              <section class="join-panel roster-panel" aria-label="Joined students">
                <div class="panel-heading">
                  <span>Joined students</span>
                  <button class="button button-light button-small" type="button" data-action="clear-students" ${playerCount() ? "" : "disabled"}>Clear students</button>
                </div>
                ${renderStudentList()}
              </section>
            </aside>

            <section class="setup-main" aria-label="Game setup">
              <div class="setup-title-row">
                <label class="name-field compact-field">
                  Game title
                  <input id="gameTitle" type="text" value="${escapeHtml(state.gameTitle)}">
                </label>
                <div class="setup-actions">
                  <button class="button button-light button-large" type="button" data-action="save-text-game">Save Text Game</button>
                  <button class="button button-primary button-large" type="button" data-action="start">Start Live Game</button>
                </div>
              </div>

              <section class="audio-setup ${state.audioUploadStatus === "ready" ? "is-ready" : ""} ${state.audioUploadStatus === "warning" ? "is-warning" : ""}" aria-label="Audio setup">
                <div class="panel-heading">
                  <span>Audio files</span>
                  <label class="upload-button">
                    Choose files
                    <input id="audioUpload" class="file-input" type="file" accept="audio/*,.mp3" multiple>
                  </label>
                </div>
                <p>${state.audioUploadMessage ? escapeHtml(state.audioUploadMessage) : "Choose all 9 MP3 files, or use the files already in the audio folder."}</p>
              </section>

              <section class="sentence-setup ${state.sentenceStatus === "ready" ? "is-ready" : ""} ${state.sentenceStatus === "warning" ? "is-warning" : ""}" aria-label="Sentence setup">
                <label class="sentence-label" for="sentenceList">Sentences</label>
                <textarea id="sentenceList" rows="9" spellcheck="true">${escapeHtml(state.sentenceDraft)}</textarea>
                <p>${state.sentenceMessage ? escapeHtml(state.sentenceMessage) : "Enter one sentence per line, in the same order as the audio files."}</p>
              </section>

            </section>
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
    return `
      <div class="vote-chart">
        ${questions.map((question) => {
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
        }).join("")}
      </div>
    `;
  }

  function renderStudentList(showLiveScores = false) {
    const players = Object.values(state.players || {});
    if (!players.length) {
      return `<p class="muted">No students joined yet.</p>`;
    }

    const votes = currentVotes();
    return `
      <div class="student-list">
        ${players.map((player) => {
          const score = visiblePlayerScore(player.id);
          const voteStatus = votes[player.id] ? "Voted" : "Waiting";
          return `
            <button class="student-chip ${showLiveScores ? "has-score" : ""}" type="button" data-remove-player="${escapeHtml(player.id)}" aria-label="Remove ${escapeHtml(player.name)}">
              <span class="student-name">${escapeHtml(player.name)}</span>
              ${showLiveScores ? `<strong>${score} / ${questions.length}</strong><small>${voteStatus}</small>` : ""}
              <em>Remove</em>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderLive() {
    const round = state.roundIndex + 1;
    const question = currentQuestion();
    const nextLabel = round === questions.length ? "See scores" : "Next round";
    const phaseLabel = state.revealed ? "Revealed" : "Voting";
    const connectionStatus = state.connectionMessage ? state.connectionMessage : "Ready";
    app.innerHTML = `
      <section class="screen teacher-screen">
        <header class="live-topbar">
          <div class="live-title">
            <p class="section-label">Teacher live</p>
            <h1>Round ${round} / ${questions.length}</h1>
            <div class="progress live-progress" aria-label="Round ${round} of ${questions.length}">
              ${renderProgressDots()}
            </div>
          </div>

          <div class="live-metrics" aria-label="Live game status">
            <span><em>Session</em><strong>${escapeHtml(state.sessionCode)}</strong></span>
            <span><em>Students</em><strong>${playerCount()}</strong></span>
            <span><em>Votes</em><strong>${voteCount()}</strong></span>
            <span class="${state.connectionMessage ? "is-warning" : ""}"><em>${escapeHtml(connectionLabel())}</em><strong>${escapeHtml(connectionStatus)}</strong></span>
          </div>

          <div class="teacher-actions live-actions">
            <button class="button button-light button-small" type="button" data-action="setup">Setup</button>
            <button class="button button-light button-small" type="button" data-action="restart">Restart</button>
            <button class="button button-light button-small" type="button" data-action="new-session">New session</button>
          </div>
        </header>

        <section class="teacher-grid">
          <div class="control-panel">
            <div class="panel-heading">
              <h2>Controls</h2>
              <span class="phase-pill">${phaseLabel}</span>
            </div>
            <div class="control-actions">
              <button class="play-button" type="button" data-action="play" aria-label="Play sentence audio">
                <span class="play-triangle" aria-hidden="true"></span>
              </button>
              <div class="button-row">
                <button class="button button-light" type="button" data-action="reveal" ${state.revealed ? "disabled" : ""}>Reveal answer</button>
                <button class="button button-primary" type="button" data-action="next" ${state.revealed ? "" : "disabled"}>${nextLabel}</button>
              </div>
            </div>
            <p class="audio-warning ${state.audioWarning ? "" : "is-empty"}">${state.audioWarning ? escapeHtml(state.audioWarning) : "Audio status"}</p>
            ${state.revealed && question ? `<div class="sentence-reveal"><span>Sentence ${currentNumber()}</span><strong>${escapeHtml(question.sentence)}</strong></div>` : `<div class="sentence-reveal is-empty"><span>Sentence</span><strong>Answer hidden</strong></div>`}
          </div>

          <div class="chart-panel">
            <div class="panel-heading chart-heading">
              <h2>Votes</h2>
              <span>${voteCount()} / ${playerCount()}</span>
            </div>
            ${renderChart()}
          </div>

          <div class="students-panel">
            <div class="panel-heading">
              <h2>Students</h2>
              <button class="button button-light button-small" type="button" data-action="clear-students" ${playerCount() ? "" : "disabled"}>Clear all</button>
            </div>
            ${renderStudentList(true)}
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
