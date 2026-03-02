// ============================================
// DEV CONTROLS - DevManager
// ============================================
// Singleton registry for managing multiple concurrent DevGame instances.
// Designed for headless batch operation and data extraction.

const DevManager = {
    _games: {},
    _gameCount: 0,

    _generateId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    createGame(playerConfigs, options) {
        const id = this._generateId();
        const game = new DevGame(id, playerConfigs);
        this._games[id] = game;
        this._gameCount++;

        if (options) {
            if (options.disableGameEnding) game.setGameEndingEnabled(false);
            if (options.disableLogging) game.setLoggingEnabled(false);
            if (options.recordHistory) game.setHistoryRecording(true);
        }

        return { id, game };
    },

    getGame(id) {
        return this._games[id] || null;
    },

    listGames() {
        return Object.values(this._games).map(g => ({
            id: g.id,
            turnNumber: g.engine.turnNumber,
            roundNumber: g.engine.roundNumber,
            playerCount: g.engine.players.length,
            currentPlayerIndex: g.engine.currentPlayerIndex,
            gameOver: g.engine.gameOver,
            winner: g.engine.winner,
            pieceCount: g.engine.pieces.length,
            gameEndingEnabled: g.isGameEndingEnabled(),
            loggingEnabled: g.isLoggingEnabled()
        }));
    },

    destroyGame(id) {
        if (this._games[id]) {
            delete this._games[id];
            this._gameCount--;
            return true;
        }
        return false;
    },

    destroyAll() {
        const count = this._gameCount;
        this._games = {};
        this._gameCount = 0;
        return count;
    },

    getGameCount() {
        return this._gameCount;
    },

    // ================================================================
    // Batch Operations — create and manage many games at once
    // ================================================================

    createGames(count, playerConfigs, options) {
        const results = [];
        for (let i = 0; i < count; i++) {
            results.push(this.createGame(playerConfigs, options));
        }
        return results;
    },

    forEachGame(callback) {
        const ids = Object.keys(this._games);
        for (let i = 0; i < ids.length; i++) {
            callback(this._games[ids[i]], ids[i], i);
        }
    },

    mapGames(callback) {
        const results = [];
        const ids = Object.keys(this._games);
        for (let i = 0; i < ids.length; i++) {
            results.push(callback(this._games[ids[i]], ids[i], i));
        }
        return results;
    },

    filterGames(predicate) {
        const results = [];
        const ids = Object.keys(this._games);
        for (let i = 0; i < ids.length; i++) {
            const game = this._games[ids[i]];
            if (predicate(game, ids[i], i)) {
                results.push(game);
            }
        }
        return results;
    },

    getActiveGames() {
        return this.filterGames(g => !g.engine.gameOver);
    },

    getFinishedGames() {
        return this.filterGames(g => g.engine.gameOver);
    },

    // ================================================================
    // Batch Execution
    // ================================================================

    runAllTurns(count) {
        this.forEachGame(game => {
            if (!game.engine.gameOver) {
                game.runTurns(count);
            }
        });
    },

    runAllRounds(count) {
        this.forEachGame(game => {
            if (!game.engine.gameOver) {
                game.runRounds(count);
            }
        });
    },

    runAllUntilGameOver(maxTurns) {
        return this.mapGames(game => ({
            id: game.id,
            result: game.runUntilGameOver(maxTurns)
        }));
    },

    // ================================================================
    // Batch Data Extraction
    // ================================================================

    getAllStates() {
        return this.mapGames(game => game.getState());
    },

    getAllCompactStates() {
        return this.mapGames(game => game.getCompactState());
    },

    getSummary() {
        const games = Object.values(this._games);
        const active = games.filter(g => !g.engine.gameOver);
        const finished = games.filter(g => g.engine.gameOver);

        const winners = {};
        finished.forEach(g => {
            const w = g.engine.winner;
            winners[w] = (winners[w] || 0) + 1;
        });

        return {
            totalGames: games.length,
            activeGames: active.length,
            finishedGames: finished.length,
            winners,
            averageTurns: finished.length > 0
                ? finished.reduce((s, g) => s + g.engine.turnNumber, 0) / finished.length
                : 0
        };
    }
};
