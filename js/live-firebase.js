"use strict";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref,
  set,
  update
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

(function () {
  const config = window.RECALL_FIREBASE_CONFIG;
  if (!config || !config.databaseURL) {
    window.dispatchEvent(new CustomEvent("recall-bus-ready", { detail: { source: "missing-firebase-config" } }));
    return;
  }

  const app = initializeApp(config);
  const database = getDatabase(app);

  function cleanSessionCode(sessionCode) {
    return String(sessionCode || "LOCAL").replace(/[^A-Z0-9-]/gi, "").toUpperCase() || "LOCAL";
  }

  function sessionRef(sessionCode) {
    return ref(database, `sessions/${cleanSessionCode(sessionCode)}`);
  }

  function playerRef(sessionCode, playerId) {
    return ref(database, `sessions/${cleanSessionCode(sessionCode)}/players/${playerId}`);
  }

  function savedGamesRef() {
    return ref(database, "savedGames");
  }

  function savedGameRef(gameId) {
    return ref(database, `savedGames/${gameId}`);
  }

  window.RecallLiveFirebase = {
    source: "firebase",
    read() {
      return null;
    },
    write(snapshot) {
      return set(sessionRef(snapshot.sessionCode), snapshot);
    },
    updatePlayer(sessionCode, player) {
      const code = cleanSessionCode(sessionCode);
      const updates = {};
      updates[`sessions/${code}/sessionCode`] = code;
      updates[`sessions/${code}/players/${player.id}`] = player;
      return update(ref(database), updates);
    },
    submitVote(sessionCode, roundIndex, player, answer) {
      const updates = {};
      const code = cleanSessionCode(sessionCode);
      updates[`sessions/${code}/players/${player.id}`] = player;
      updates[`sessions/${code}/votes/${roundIndex}/${player.id}`] = {
        answer,
        name: player.name,
        at: Date.now()
      };
      return update(ref(database), updates);
    },
    removePlayer(sessionCode, playerId, roundIndexes) {
      const code = cleanSessionCode(sessionCode);
      const updates = {};
      updates[`sessions/${code}/players/${playerId}`] = null;
      (roundIndexes || []).forEach((roundIndex) => {
        updates[`sessions/${code}/votes/${roundIndex}/${playerId}`] = null;
      });
      return update(ref(database), updates);
    },
    saveGame(game) {
      return set(savedGameRef(game.id), game);
    },
    deleteGame(gameId) {
      return set(savedGameRef(gameId), null);
    },
    subscribeSavedGames(listener, onError) {
      return onValue(savedGamesRef(), (snapshot) => listener(snapshot.val() || {}), (error) => {
        if (onError) {
          onError(error);
        }
      });
    },
    subscribe(listener, sessionCode, onError) {
      return onValue(sessionRef(sessionCode), (snapshot) => listener(snapshot.val()), (error) => {
        if (onError) {
          onError(error);
        }
      });
    }
  };

  window.RecallLiveBus = window.RecallLiveFirebase;
  window.RecallLiveBusSource = "firebase";
  window.dispatchEvent(new CustomEvent("recall-bus-ready", { detail: { source: "firebase" } }));
}());
