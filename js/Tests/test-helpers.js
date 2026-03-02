// ============================================
// TEST HELPERS
// ============================================
// Shared utilities for test setup and common operations.

let _originalRandom = null;

/**
 * Mulberry32 PRNG - deterministic pseudo-random number generator
 */
function mulberry32(seed) {
    return function() {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seedRandom(seed) {
    if (seed === undefined) seed = 42;
    _originalRandom = Math.random;
    Math.random = mulberry32(seed);
}

function restoreRandom() {
    if (_originalRandom) {
        Math.random = _originalRandom;
        _originalRandom = null;
    }
}

/**
 * Create a fresh engine with setupGame called
 */
function createEngine(numPlayers, seed) {
    if (numPlayers === undefined) numPlayers = 2;
    if (seed === undefined) seed = 42;
    seedRandom(seed);
    const engine = new GameEngine();
    const configs = [];
    for (let i = 0; i < numPlayers; i++) {
        configs.push({
            color: PLAYER_COLORS[i],
            isAI: false
        });
    }
    engine.setupGame(configs);
    restoreRandom();
    return engine;
}

/**
 * Create a bare engine with players but no starting pieces.
 * Useful for isolated tests where you want full control of piece placement.
 */
function createScenario(numPlayers) {
    if (numPlayers === undefined) numPlayers = 2;
    const engine = new GameEngine();
    engine.reset();

    for (let i = 0; i < numPlayers; i++) {
        engine.players.push({
            id: i,
            name: `Player ${i + 1}`,
            color: PLAYER_COLORS[i],
            techScore: 0,
            isHuman: true,
            isAI: false,
            aiDifficulty: AI_DIFFICULTY.MEDIUM,
            relations: {},
            relationsChangedRound: {},
            eliminated: false,
            warriorKills: 0,
            warriorsLost: 0
        });
    }

    // Initialize all players at peace with each other
    engine.players.forEach((player, i) => {
        engine.players.forEach((other, j) => {
            if (i !== j) {
                player.relations[j] = 'peace';
                player.relationsChangedRound[j] = -RELATION_MIN_TURNS;
            }
        });
    });

    return engine;
}

/**
 * Place a piece directly on the board
 */
function placePiece(engine, type, ownerId, row, col) {
    const piece = engine.createPiece(type, ownerId, row, col);
    engine.pieces.push(piece);
    engine.board[row][col] = piece;
    return piece;
}

/**
 * Clear all pieces and ownership from the board
 */
function clearBoard(engine) {
    engine.pieces = [];
    engine.board = engine.createEmptyBoard();
    engine.tileOwnership = engine.createEmptyBoard();
}

/**
 * Advance N turns (each player takes a turn = 1 "turn" per endTurn call)
 */
function advanceTurns(engine, n) {
    for (let i = 0; i < n; i++) {
        if (engine.gameOver) break;
        engine.endTurn();
    }
}

/**
 * Advance N complete rounds (all players take a turn)
 */
function advanceRounds(engine, n) {
    const playersAlive = engine.players.filter(p => !p.eliminated).length;
    advanceTurns(engine, n * playersAlive);
}

/**
 * Get the relation between two players
 */
function getPlayerRelation(engine, p1, p2) {
    return engine.players[p1].relations[p2];
}

// Export to global
globalThis.seedRandom = seedRandom;
globalThis.restoreRandom = restoreRandom;
globalThis.createEngine = createEngine;
globalThis.createScenario = createScenario;
globalThis.placePiece = placePiece;
globalThis.clearBoard = clearBoard;
globalThis.advanceTurns = advanceTurns;
globalThis.advanceRounds = advanceRounds;
globalThis.getPlayerRelation = getPlayerRelation;
