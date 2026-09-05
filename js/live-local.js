"use strict";

(function () {
  const channelName = "recallNumberLiveLocal";
  const storageKey = "recallNumberLiveLocal.snapshot";
  const savedGamesKey = "recallNumberLiveLocal.savedGames";
  const canBroadcast = "BroadcastChannel" in window;
  const channel = canBroadcast ? new BroadcastChannel(channelName) : null;
  const listeners = [];

  function safeParse(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function readSnapshot() {
    try {
      return safeParse(localStorage.getItem(storageKey));
    } catch (error) {
      return null;
    }
  }

  function readSavedGames() {
    try {
      return safeParse(localStorage.getItem(savedGamesKey)) || {};
    } catch (error) {
      return {};
    }
  }

  function writeSavedGames(savedGames) {
    try {
      localStorage.setItem(savedGamesKey, JSON.stringify(savedGames));
    } catch (error) {
      // Saved games are a convenience in local fallback mode.
    }
  }

  function writeSnapshot(snapshot) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch (error) {
      // BroadcastChannel still covers the tab-to-tab prototype when storage is unavailable.
    }
    if (channel) {
      channel.postMessage(snapshot);
    }
  }

  function notify(snapshot) {
    listeners.forEach((listener) => listener(snapshot));
  }

  if (channel) {
    channel.addEventListener("message", (event) => notify(event.data));
  }

  window.addEventListener("storage", (event) => {
    if (event.key === storageKey && event.newValue) {
      notify(safeParse(event.newValue));
    }
  });

  window.RecallLiveLocal = {
    source: "local",
    read: readSnapshot,
    write: writeSnapshot,
    updatePlayer(sessionCode, player) {
      const snapshot = readSnapshot() || {
        sessionCode,
        view: "setup",
        players: {},
        votes: {}
      };
      snapshot.sessionCode = sessionCode;
      snapshot.view = snapshot.view || "setup";
      snapshot.players = snapshot.players || {};
      snapshot.players[player.id] = player;
      writeSnapshot(snapshot);
    },
    submitVote(sessionCode, roundIndex, player, answer) {
      const snapshot = readSnapshot() || {
        sessionCode,
        view: "setup",
        players: {},
        votes: {}
      };
      snapshot.players = snapshot.players || {};
      snapshot.players[player.id] = player;
      snapshot.votes = snapshot.votes || {};
      snapshot.votes[String(roundIndex)] = snapshot.votes[String(roundIndex)] || {};
      snapshot.votes[String(roundIndex)][player.id] = {
        answer,
        name: player.name,
        at: Date.now()
      };
      writeSnapshot(snapshot);
    },
    removePlayer(sessionCode, playerId) {
      const snapshot = readSnapshot() || {
        sessionCode,
        view: "setup",
        players: {},
        votes: {}
      };
      if (snapshot.players) {
        delete snapshot.players[playerId];
      }
      Object.keys(snapshot.votes || {}).forEach((roundKey) => {
        if (snapshot.votes[roundKey]) {
          delete snapshot.votes[roundKey][playerId];
        }
      });
      writeSnapshot(snapshot);
    },
    saveGame(game) {
      const savedGames = readSavedGames();
      savedGames[game.id] = game;
      writeSavedGames(savedGames);
    },
    deleteGame(gameId) {
      const savedGames = readSavedGames();
      delete savedGames[gameId];
      writeSavedGames(savedGames);
    },
    subscribeSavedGames(listener) {
      listener(readSavedGames());
      return () => {};
    },
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    }
  };

  if (!window.RecallLiveBus) {
    window.RecallLiveBus = window.RecallLiveLocal;
    window.RecallLiveBusSource = "local";
  }
}());
