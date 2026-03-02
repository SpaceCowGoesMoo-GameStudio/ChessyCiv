#!/usr/bin/env python3
"""
Thorough test suite for the Dev-Controls API.

Concatenates the required JS source files and runs test cases via Node.js,
reporting pass/fail for each test with location info on failures.
"""

import subprocess
import json
import os
import sys
import tempfile
import textwrap

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# JS files needed to bootstrap the engine + Dev-Controls (in load order).
JS_DEPS = [
    "js/SoundManager.js",
    "js/constants.js",
    "js/GameHistory.js",
    "js/Game-Engine/GameEngine.js",
    "js/Game-Engine/setup.js",
    "js/Game-Engine/movement.js",
    "js/Game-Engine/combat.js",
    "js/Game-Engine/production.js",
    "js/Game-Engine/territory.js",
    "js/Game-Engine/diplomacy.js",
    "js/Game-Engine/settlers.js",
    "js/Game-Engine/turns.js",
    "js/Game-Engine/ai-support.js",
    "js/Game-Engine/persistence.js",
    "js/Game-Engine/ml-state-encoder.js",
    "js/Dev-Controls/DevExport.js",
    "js/Dev-Controls/DevGame.js",
    "js/Dev-Controls/state.js",
    "js/Dev-Controls/pieces.js",
    "js/Dev-Controls/players.js",
    "js/Dev-Controls/actions.js",
    "js/Dev-Controls/ai-control.js",
    "js/Dev-Controls/game-control.js",
    "js/Dev-Controls/events.js",
    "js/Dev-Controls/ml-bridge.js",
    "js/Dev-Controls/DevManager.js",
]

# Stubs for browser globals that don't exist in Node.
NODE_PREAMBLE = textwrap.dedent(r"""
    // Stub browser globals for Node.js environment
    const window = globalThis;
    const navigator = { maxTouchPoints: 0 };
    const document = {
        createElement: () => ({ click() {}, href: '', download: '' }),
    };
    const URL = { createObjectURL: () => 'blob:', revokeObjectURL: () => {} };
    const Blob = class Blob { constructor() {} };

    // Stub AudioContext
    class AudioContext { constructor() {} }
    window.AudioContext = AudioContext;

    // Stub indexedDB
    const indexedDB = null;
    window.indexedDB = null;

    // Stub pako (compression lib)
    const pako = { deflate: (d) => d, inflate: (d) => d };

    // Stub AI_DIFFICULTY (defined in js/AI/constants.js, not loaded here)
    const AI_DIFFICULTY = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' };
""")

# The actual test suite written in JS, outputs JSON results.
TEST_SCRIPT = textwrap.dedent(r"""
    // Suppress engine console.log noise
    const _origLog = console.log;
    console.log = () => {};

    const results = [];
    let _testName = '';

    function test(name, fn) {
        _testName = name;
        try {
            fn();
            results.push({ name, pass: true });
        } catch (e) {
            results.push({ name, pass: false, error: e.message, stack: e.stack });
        }
    }

    function assert(cond, msg) {
        if (!cond) throw new Error(msg || 'Assertion failed');
    }

    function assertEqual(a, b, msg) {
        if (a !== b) throw new Error(
            (msg || 'assertEqual') + `: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`
        );
    }

    function assertTruthy(v, msg) {
        if (!v) throw new Error((msg || 'assertTruthy') + `: got ${JSON.stringify(v)}`);
    }

    function assertDeepEqual(a, b, msg) {
        if (JSON.stringify(a) !== JSON.stringify(b))
            throw new Error((msg || 'assertDeepEqual') + `: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
    }

    // Helper: make a 2-player game
    function make2p(opts) {
        return DevManager.createGame([
            { color: PLAYER_COLORS[0] },
            { color: PLAYER_COLORS[1] },
        ], opts);
    }

    // Helper: cleanup
    function cleanup() {
        DevManager.destroyAll();
    }

    // ================================================================
    // DevManager — core
    // ================================================================

    test('DevManager.createGame returns id and game', () => {
        const { id, game } = make2p();
        assert(id, 'id');
        assert(game instanceof DevGame, 'DevGame');
        cleanup();
    });

    test('DevManager.getGame retrieves by id', () => {
        const { id, game } = make2p();
        assertEqual(DevManager.getGame(id), game, 'same instance');
        cleanup();
    });

    test('DevManager.getGame returns null for unknown', () => {
        assertEqual(DevManager.getGame('nope'), null);
    });

    test('DevManager.listGames returns rich summaries', () => {
        make2p(); make2p();
        const list = DevManager.listGames();
        assert(list.length >= 2, 'count');
        assert('roundNumber' in list[0], 'has roundNumber');
        assert('pieceCount' in list[0], 'has pieceCount');
        assert('loggingEnabled' in list[0], 'has loggingEnabled');
        cleanup();
    });

    test('DevManager.destroyGame removes game', () => {
        const { id } = make2p();
        assertEqual(DevManager.destroyGame(id), true);
        assertEqual(DevManager.getGame(id), null);
        assertEqual(DevManager.destroyGame(id), false);
        cleanup();
    });

    test('DevManager.destroyAll clears all', () => {
        make2p(); make2p(); make2p();
        const count = DevManager.destroyAll();
        assertEqual(count, 3, 'destroyed 3');
        assertEqual(DevManager.getGameCount(), 0, 'count 0');
    });

    test('DevManager.getGameCount tracks', () => {
        assertEqual(DevManager.getGameCount(), 0);
        const { id } = make2p();
        assertEqual(DevManager.getGameCount(), 1);
        DevManager.destroyGame(id);
        assertEqual(DevManager.getGameCount(), 0);
    });

    // ================================================================
    // DevManager — batch create
    // ================================================================

    test('DevManager.createGames batch', () => {
        const games = DevManager.createGames(5, [
            { color: PLAYER_COLORS[0] },
            { color: PLAYER_COLORS[1] },
        ]);
        assertEqual(games.length, 5, '5 games');
        assertEqual(DevManager.getGameCount(), 5, 'count 5');
        cleanup();
    });

    test('DevManager.createGame with options', () => {
        const { game } = DevManager.createGame([
            { color: PLAYER_COLORS[0] },
            { color: PLAYER_COLORS[1] },
        ], { disableGameEnding: true, disableLogging: true, recordHistory: true });
        assertEqual(game.isGameEndingEnabled(), false, 'ending disabled');
        assertEqual(game.isLoggingEnabled(), false, 'logging disabled');
        assertEqual(game.isHistoryRecording(), true, 'history on');
        cleanup();
    });

    // ================================================================
    // DevManager — iteration
    // ================================================================

    test('DevManager.forEachGame iterates all', () => {
        make2p(); make2p();
        let count = 0;
        DevManager.forEachGame(() => count++);
        assertEqual(count, 2);
        cleanup();
    });

    test('DevManager.mapGames maps', () => {
        make2p(); make2p();
        const ids = DevManager.mapGames(g => g.id);
        assertEqual(ids.length, 2);
        cleanup();
    });

    test('DevManager.filterGames filters', () => {
        const { game: g1 } = make2p();
        make2p();
        g1.forceGameOver(0);
        assertEqual(DevManager.getActiveGames().length, 1, 'active');
        assertEqual(DevManager.getFinishedGames().length, 1, 'finished');
        cleanup();
    });

    // ================================================================
    // DevManager — batch execution
    // ================================================================

    test('DevManager.runAllTurns', () => {
        make2p(); make2p();
        DevManager.runAllTurns(4);
        DevManager.forEachGame(g => {
            assertEqual(g.engine.turnNumber, 4, 'turn 4');
        });
        cleanup();
    });

    test('DevManager.runAllRounds', () => {
        make2p(); make2p();
        DevManager.runAllRounds(2);
        DevManager.forEachGame(g => {
            assertEqual(g.engine.roundNumber, 2, 'round 2');
        });
        cleanup();
    });

    // ================================================================
    // DevManager — batch data extraction
    // ================================================================

    test('DevManager.getAllStates', () => {
        make2p(); make2p();
        const states = DevManager.getAllStates();
        assertEqual(states.length, 2);
        assert('board' in states[0]);
        cleanup();
    });

    test('DevManager.getAllCompactStates', () => {
        make2p(); make2p();
        const states = DevManager.getAllCompactStates();
        assertEqual(states.length, 2);
        assert('pieces' in states[0]);
        assert('own' in states[0]);
        cleanup();
    });

    test('DevManager.getSummary', () => {
        const { game: g1 } = make2p();
        make2p();
        g1.forceGameOver(0);
        const s = DevManager.getSummary();
        assertEqual(s.totalGames, 2);
        assertEqual(s.activeGames, 1);
        assertEqual(s.finishedGames, 1);
        cleanup();
    });

    // ================================================================
    // DevGame — Board Data
    // ================================================================

    test('getBoardData returns 10x10', () => {
        const { game } = make2p();
        const board = game.getBoardData();
        assertEqual(board.length, 10);
        assertEqual(board[0].length, 10);
        cleanup();
    });

    test('getTile valid and OOB', () => {
        const { game } = make2p();
        assertTruthy(game.getTile(0, 0));
        assertEqual(game.getTile(-1, 0), null);
        assertEqual(game.getTile(10, 0), null);
        cleanup();
    });

    test('getPieces with filters', () => {
        const { game } = make2p();
        assertEqual(game.getPieces().length, 4);
        assertEqual(game.getPieces({ ownerId: 0 }).length, 2);
        assertEqual(game.getPieces({ type: PIECE_TYPES.CITY }).length, 2);
        assertEqual(game.getPieces({ ownerId: 0, type: PIECE_TYPES.WARRIOR }).length, 1);
        cleanup();
    });

    test('getPieceById', () => {
        const { game } = make2p();
        const pieces = game.getPieces();
        const p = game.getPieceById(pieces[0].id);
        assertEqual(p.id, pieces[0].id);
        assertEqual(game.getPieceById('nonexistent'), null);
        cleanup();
    });

    test('getPlayers and getPlayer', () => {
        const { game } = make2p();
        assertEqual(game.getPlayers().length, 2);
        assertEqual(game.getPlayer(0).id, 0);
        assertEqual(game.getPlayer(99), null);
        assert('relationsChangedRound' in game.getPlayer(0), 'has relationsChangedRound');
        cleanup();
    });

    test('getCurrentPlayer and getCurrentPlayerIndex', () => {
        const { game } = make2p();
        assertEqual(game.getCurrentPlayerIndex(), 0);
        assertEqual(game.getCurrentPlayer().id, 0);
        cleanup();
    });

    test('snapshots are copies not references', () => {
        const { game } = make2p();
        const p = game.getPieces();
        p[0].hp = 999;
        assert(game.getPieces()[0].hp !== 999);
        cleanup();
    });

    // ================================================================
    // DevGame — Territory
    // ================================================================

    test('getTileOwnership returns copy', () => {
        const { game } = make2p();
        const own = game.getTileOwnership();
        assertEqual(own.length, 10);
        own[0][0] = 999;
        assert(game.getTileOwnership()[0][0] !== 999);
        cleanup();
    });

    test('setTileOwner', () => {
        const { game } = make2p();
        assertEqual(game.setTileOwner(5, 5, 0), true);
        assertEqual(game.getTile(5, 5).owner, 0);
        assertEqual(game.setTileOwner(5, 5, null), true);
        assertEqual(game.getTile(5, 5).owner, null);
        assertEqual(game.setTileOwner(-1, 0, 0), false);
        assertEqual(game.setTileOwner(0, 0, 99), false);
        cleanup();
    });

    test('getTerritoryCounts', () => {
        const { game } = make2p();
        const counts = game.getTerritoryCounts();
        assert(counts[0] >= 1, 'p0 has territory');
        assert(counts[1] >= 1, 'p1 has territory');
        assert(counts.unowned >= 0, 'unowned exists');
        cleanup();
    });

    test('fillTerritory and clearTerritory', () => {
        const { game } = make2p();
        const filled = game.fillTerritory(0, 3, 3, 5, 5);
        assertEqual(filled, 9, '3x3 = 9');
        assertEqual(game.getTile(4, 4).owner, 0);
        const cleared = game.clearTerritory(3, 3, 5, 5);
        assertEqual(cleared, 9);
        assertEqual(game.getTile(4, 4).owner, null);
        cleanup();
    });

    // ================================================================
    // DevGame — Movement queries
    // ================================================================

    test('getValidMoves for warrior', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        const moves = game.getValidMoves(5, 5);
        assert(moves.length > 0, 'has valid moves');
        cleanup();
    });

    test('getValidMoves empty tile', () => {
        const { game } = make2p();
        assertEqual(game.getValidMoves(5, 5).length, 0);
        cleanup();
    });

    test('canMoveTo', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        const can = game.canMoveTo(5, 5, 5, 6);
        assertEqual(can.valid, true);
        const cant = game.canMoveTo(5, 5, 0, 0);
        assertEqual(cant.valid, false);
        cleanup();
    });

    test('canSettleAt', () => {
        const { game } = make2p();
        game.fillTerritory(0, 5, 5, 5, 5);
        game.createSettler(0, 5, 5);
        const can = game.canSettleAt(5, 5);
        // May or may not be valid depending on city proximity
        assert('valid' in can, 'has valid field');
        cleanup();
    });

    test('canChangeRelation', () => {
        const { game } = make2p();
        const r = game.canChangeRelation(0, 1);
        assert('canChange' in r);
        assert('roundsRemaining' in r);
        cleanup();
    });

    // ================================================================
    // DevGame — Piece Creation
    // ================================================================

    test('createWarrior', () => {
        const { game } = make2p();
        const r = game.createWarrior(0, 5, 5);
        assertTruthy(r.success);
        assertEqual(r.piece.type, 'warrior');
        cleanup();
    });

    test('createSettler', () => {
        const { game } = make2p();
        const r = game.createSettler(1, 4, 4);
        assertTruthy(r.success);
        assertEqual(r.piece.type, 'settler');
        cleanup();
    });

    test('createCity', () => {
        const { game } = make2p();
        const r = game.createCity(0, 5, 5);
        assertTruthy(r.success);
        assertEqual(r.piece.type, 'city');
        assertEqual(game.getTile(5, 5).owner, 0);
        cleanup();
    });

    test('create fails on occupied', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        assertEqual(game.createWarrior(0, 5, 5).success, false);
        cleanup();
    });

    test('create fails OOB', () => {
        const { game } = make2p();
        assertEqual(game.createWarrior(0, -1, 5).success, false);
        cleanup();
    });

    test('create fails eliminated player', () => {
        const { game } = make2p();
        game.engine.players[1].eliminated = true;
        assertEqual(game.createWarrior(1, 5, 5).success, false);
        cleanup();
    });

    test('removePiece', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        assertEqual(game.removePiece(5, 5), true);
        assertEqual(game.getTile(5, 5).piece, null);
        assertEqual(game.removePiece(5, 5), false);
        assertEqual(game.removePiece(-1, 0), false);
        cleanup();
    });

    // ================================================================
    // DevGame — Piece Manipulation
    // ================================================================

    test('setPieceHp', () => {
        const { game } = make2p();
        game.createCity(0, 5, 5);
        assertEqual(game.setPieceHp(5, 5, 2), true);
        assertEqual(game.getTile(5, 5).piece.hp, 2);
        // Clamps to maxHp
        game.setPieceHp(5, 5, 999);
        assertEqual(game.getTile(5, 5).piece.hp, game.getTile(5, 5).piece.maxHp);
        assertEqual(game.setPieceHp(3, 3, 1), false);
        cleanup();
    });

    test('setPieceMaxHp', () => {
        const { game } = make2p();
        game.createCity(0, 5, 5);
        assertEqual(game.setPieceMaxHp(5, 5, 10), true);
        assertEqual(game.getTile(5, 5).piece.maxHp, 10);
        // If hp > new maxHp, clamp hp
        game.setPieceMaxHp(5, 5, 1);
        assertEqual(game.getTile(5, 5).piece.hp, 1);
        cleanup();
    });

    test('setPieceDamage', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        assertEqual(game.setPieceDamage(5, 5, 5), true);
        assertEqual(game.getTile(5, 5).piece.damage, 5);
        cleanup();
    });

    test('setPieceOwner', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        assertEqual(game.setPieceOwner(5, 5, 1), true);
        assertEqual(game.getTile(5, 5).piece.ownerId, 1);
        assertEqual(game.setPieceOwner(5, 5, 99), false);
        cleanup();
    });

    test('setPieceHasMoved', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        assertEqual(game.setPieceHasMoved(5, 5, true), true);
        assertEqual(game.getTile(5, 5).piece.hasMoved, true);
        game.setPieceHasMoved(5, 5, false);
        assertEqual(game.getTile(5, 5).piece.hasMoved, false);
        cleanup();
    });

    test('teleportPiece', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        const r = game.teleportPiece(5, 5, 7, 7);
        assertTruthy(r.success);
        assertEqual(r.piece.row, 7);
        assertEqual(r.piece.col, 7);
        assertEqual(game.getTile(5, 5).piece, null);
        assertTruthy(game.getTile(7, 7).piece);
        // Fails: no piece
        assertEqual(game.teleportPiece(5, 5, 8, 8).success, false);
        // Fails: target occupied
        game.createWarrior(0, 3, 3);
        assertEqual(game.teleportPiece(7, 7, 3, 3).success, false);
        // Fails: OOB
        assertEqual(game.teleportPiece(7, 7, -1, 0).success, false);
        cleanup();
    });

    // ================================================================
    // DevGame — Player Manipulation
    // ================================================================

    test('setPlayerTechScore', () => {
        const { game } = make2p();
        assertEqual(game.setPlayerTechScore(0, 5), true);
        assertEqual(game.getPlayer(0).techScore, 5);
        assertEqual(game.setPlayerTechScore(99, 1), false);
        cleanup();
    });

    test('setPlayerEliminated', () => {
        const { game } = make2p();
        game.setPlayerEliminated(1, true);
        assertEqual(game.getPlayer(1).eliminated, true);
        game.setPlayerEliminated(1, false);
        assertEqual(game.getPlayer(1).eliminated, false);
        cleanup();
    });

    test('setPlayerRelation one-way', () => {
        const { game } = make2p();
        assertEqual(game.setPlayerRelation(0, 1, 'war'), true);
        assertEqual(game.getPlayer(0).relations[1], 'war');
        assertEqual(game.getPlayer(1).relations[0], 'peace', 'one-way only');
        assertEqual(game.setPlayerRelation(0, 0, 'war'), false, 'same player');
        cleanup();
    });

    test('setPlayerRelationSymmetric', () => {
        const { game } = make2p();
        assertEqual(game.setPlayerRelationSymmetric(0, 1, 'war'), true);
        assertEqual(game.getPlayer(0).relations[1], 'war');
        assertEqual(game.getPlayer(1).relations[0], 'war');
        cleanup();
    });

    test('setCurrentPlayer', () => {
        const { game } = make2p();
        assertEqual(game.setCurrentPlayer(1), true);
        assertEqual(game.getCurrentPlayerIndex(), 1);
        assertEqual(game.setCurrentPlayer(99), false);
        cleanup();
    });

    // ================================================================
    // DevGame — Actions
    // ================================================================

    test('movePiece', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        const r = game.movePiece(5, 5, 5, 6);
        assertTruthy(r.success);
        assertEqual(game.movePiece(5, 5, 5, 6).success, false, 'no piece at old loc');
        cleanup();
    });

    test('movePiece hasMoved blocks second move', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        game.movePiece(5, 5, 5, 6);
        assertEqual(game.movePiece(5, 6, 5, 7).success, false);
        cleanup();
    });

    test('settleCity', () => {
        const { game } = make2p();
        assertEqual(game.settleCity(5, 5).success, false, 'no piece');
        cleanup();
    });

    test('setProduction on city', () => {
        const { game } = make2p();
        const city = game.getPieces({ ownerId: 0, type: PIECE_TYPES.CITY })[0];
        assertEqual(game.setProduction(city.row, city.col, 'WARRIOR'), true);
        assertEqual(game.getTile(city.row, city.col).piece.production, 'WARRIOR');
        assertEqual(game.setProduction(5, 5, 'WARRIOR'), false, 'empty tile');
        cleanup();
    });

    test('setRepeatProduction', () => {
        const { game } = make2p();
        const city = game.getPieces({ ownerId: 0, type: PIECE_TYPES.CITY })[0];
        assertEqual(game.setRepeatProduction(city.row, city.col, false), true);
        assertEqual(game.setRepeatProduction(5, 5, true), false, 'empty tile');
        cleanup();
    });

    test('endTurn returns info with previousPlayerIndex', () => {
        const { game } = make2p();
        const info = game.endTurn();
        assertEqual(info.previousPlayerIndex, 0);
        assertEqual(info.currentPlayerIndex, 1);
        assertEqual(info.turnNumber, 1);
        cleanup();
    });

    test('declareWar', () => {
        const { game } = make2p();
        assertEqual(game.declareWar(0, 1), true);
        assertEqual(game.getPlayer(0).relations[1], 'war');
        cleanup();
    });

    test('proposePeace and acceptPeace', () => {
        const { game } = make2p();
        game.declareWar(0, 1);
        // Advance enough rounds to allow peace
        game.setRoundNumber(100);
        game.engine.players[0].relationsChangedRound[1] = 0;
        game.engine.players[1].relationsChangedRound[0] = 0;
        assertEqual(game.proposePeace(0, 1), true);
        assertEqual(game.getPlayer(0).relations[1], 'peace_proposed');
        assertEqual(game.acceptPeace(1, 0), true);
        assertEqual(game.getPlayer(0).relations[1], 'peace');
        assertEqual(game.getPlayer(1).relations[0], 'peace');
        cleanup();
    });

    // ================================================================
    // DevGame — Simulation
    // ================================================================

    test('simulateMove valid', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        const sim = game.simulateMove(5, 5, 5, 6);
        assertEqual(sim.valid, true);
        // Piece should NOT have actually moved
        assertTruthy(game.getTile(5, 5).piece);
        cleanup();
    });

    test('simulateMove no piece', () => {
        const { game } = make2p();
        const sim = game.simulateMove(5, 5, 5, 6);
        assertEqual(sim.valid, false);
        cleanup();
    });

    // ================================================================
    // DevGame — AI Analysis
    // ================================================================

    test('getGameStateForAI', () => {
        const { game } = make2p();
        const state = game.getGameStateForAI(0);
        assertTruthy(state);
        assert('ownPieces' in state);
        assert('enemyPieces' in state);
        assert('territory' in state);
        assert('relations' in state);
        assert('gamePhase' in state);
        cleanup();
    });

    test('getGamePhase', () => {
        const { game } = make2p();
        const phase = game.getGamePhase();
        assert(['early', 'mid', 'late'].includes(phase));
        cleanup();
    });

    test('getThreatHeatmap', () => {
        const { game } = make2p();
        const hm = game.getThreatHeatmap(0);
        assertEqual(hm.length, 10);
        assertEqual(hm[0].length, 10);
        cleanup();
    });

    test('getOpportunityHeatmap', () => {
        const { game } = make2p();
        const hm = game.getOpportunityHeatmap(0);
        assertEqual(hm.length, 10);
        cleanup();
    });

    test('getTerritoryHeatmap', () => {
        const { game } = make2p();
        const hm = game.getTerritoryHeatmap(0);
        assertEqual(hm.length, 10);
        cleanup();
    });

    test('getExpansionHeatmap', () => {
        const { game } = make2p();
        const hm = game.getExpansionHeatmap(0);
        assertEqual(hm.length, 10);
        cleanup();
    });

    test('getPlayerStrength', () => {
        const { game } = make2p();
        const s = game.getPlayerStrength(0);
        assertTruthy(s);
        assert('military' in s);
        assert('economic' in s);
        assert('total' in s);
        assert('breakdown' in s);
        assertEqual(game.getPlayerStrength(99), null);
        cleanup();
    });

    test('getRelativeStrength', () => {
        const { game } = make2p();
        const r = game.getRelativeStrength(0, 1);
        assertTruthy(r);
        assert('ratio' in r);
        assert('advantage' in r);
        cleanup();
    });

    test('getStrategicPositions', () => {
        const { game } = make2p();
        const sp = game.getStrategicPositions(0);
        assert('chokepoints' in sp);
        assert('contestedBorders' in sp);
        assert('vulnerableCities' in sp);
        assert('defensivePositions' in sp);
        cleanup();
    });

    test('getPieceThreats', () => {
        const { game } = make2p();
        const threats = game.getPieceThreats(0, 0, 0);
        assert(Array.isArray(threats));
        cleanup();
    });

    // ================================================================
    // DevGame — ML State Encoding
    // ================================================================

    test('encodeStateForML', () => {
        const { game } = make2p();
        const encoded = game.encodeStateForML(0);
        assertTruthy(encoded);
        assertEqual(encoded.size, 10);
        assert(encoded.numChannels > 0);
        assert(Array.isArray(encoded.channels));
        assertEqual(encoded.channels.length, encoded.numChannels);
        // Each channel is Float32Array of size 100
        assertEqual(encoded.channels[0].length, 100);
        cleanup();
    });

    // ================================================================
    // DevGame — Game Control
    // ================================================================

    test('setGameEndingEnabled', () => {
        const { game } = make2p();
        assertEqual(game.isGameEndingEnabled(), true);
        game.setGameEndingEnabled(false);
        assertEqual(game.isGameEndingEnabled(), false);
        game.engine.checkVictory();
        assertEqual(game.engine.gameOver, false);
        game.setGameEndingEnabled(true);
        assertEqual(game.isGameEndingEnabled(), true);
        cleanup();
    });

    test('setLoggingEnabled silences console', () => {
        const { game } = make2p();
        assertEqual(game.isLoggingEnabled(), true);
        game.setLoggingEnabled(false);
        assertEqual(game.isLoggingEnabled(), false);
        // Actions still work, just no console.log
        game.createWarrior(0, 5, 5);
        assertTruthy(game.getTile(5, 5).piece);
        // Action log still records
        assert(game.engine.actionLog.length > 0, 'log still records');
        game.setLoggingEnabled(true);
        assertEqual(game.isLoggingEnabled(), true);
        cleanup();
    });

    test('forceGameOver and resetGameOver', () => {
        const { game } = make2p();
        game.forceGameOver(1);
        assertEqual(game.engine.gameOver, true);
        assertEqual(game.engine.winner, 1);
        game.resetGameOver();
        assertEqual(game.engine.gameOver, false);
        assertEqual(game.engine.winner, null);
        cleanup();
    });

    test('setTurnNumber and setRoundNumber', () => {
        const { game } = make2p();
        game.setTurnNumber(42);
        assertEqual(game.engine.turnNumber, 42);
        game.setRoundNumber(10);
        assertEqual(game.engine.roundNumber, 10);
        cleanup();
    });

    // ================================================================
    // DevGame — Action Log
    // ================================================================

    test('getActionLog returns copy', () => {
        const { game } = make2p();
        const log = game.getActionLog();
        assert(log.length > 0, 'has entries');
        const len = log.length;
        game.createWarrior(0, 5, 5);
        // Original array wasn't mutated
        assertEqual(log.length, len);
        cleanup();
    });

    test('getActionLog with count', () => {
        const { game } = make2p();
        // endTurn adds log entries reliably
        game.endTurn();
        game.endTurn();
        game.endTurn();
        const all = game.getActionLog();
        assert(all.length >= 3, 'enough entries');
        const last2 = game.getActionLog(2);
        assertEqual(last2.length, 2);
        assertEqual(last2[1], all[all.length - 1]);
        cleanup();
    });

    test('clearActionLog', () => {
        const { game } = make2p();
        assert(game.getActionLog().length > 0);
        game.clearActionLog();
        assertEqual(game.getActionLog().length, 0);
        cleanup();
    });

    // ================================================================
    // DevGame — Turn History Recording
    // ================================================================

    test('history recording off by default', () => {
        const { game } = make2p();
        assertEqual(game.isHistoryRecording(), false);
        game.endTurn();
        assertEqual(game.getTurnHistory().length, 0);
        cleanup();
    });

    test('history recording captures states', () => {
        const { game } = make2p();
        game.setHistoryRecording(true);
        game.endTurn();
        game.endTurn();
        game.endTurn();
        const h = game.getTurnHistory();
        assertEqual(h.length, 3);
        assert('pieces' in h[0]);
        assert('tileOwnership' in h[0]);
        assert('turnNumber' in h[0]);
        cleanup();
    });

    test('clearTurnHistory', () => {
        const { game } = make2p();
        game.setHistoryRecording(true);
        game.endTurn();
        game.clearTurnHistory();
        assertEqual(game.getTurnHistory().length, 0);
        cleanup();
    });

    // ================================================================
    // DevGame — Event System
    // ================================================================

    test('on/emit for turnEnd', () => {
        const { game } = make2p();
        let called = 0;
        let lastData = null;
        game.on('turnEnd', (data) => { called++; lastData = data; });
        game.endTurn();
        assertEqual(called, 1);
        assertEqual(lastData.turnNumber, 1);
        cleanup();
    });

    test('on/emit for move', () => {
        const { game } = make2p();
        let moveData = null;
        game.on('move', (data) => { moveData = data; });
        game.createWarrior(0, 5, 5);
        game.movePiece(5, 5, 5, 6);
        assertTruthy(moveData);
        assertEqual(moveData.from.row, 5);
        assertEqual(moveData.to.col, 6);
        cleanup();
    });

    test('on/emit for war', () => {
        const { game } = make2p();
        let warData = null;
        game.on('war', (data) => { warData = data; });
        game.declareWar(0, 1);
        assertTruthy(warData);
        assertEqual(warData.result, true);
        cleanup();
    });

    test('off removes listener', () => {
        const { game } = make2p();
        let called = 0;
        const cb = () => called++;
        game.on('turnEnd', cb);
        game.endTurn();
        assertEqual(called, 1);
        game.off('turnEnd', cb);
        game.endTurn();
        assertEqual(called, 1, 'not called after off');
        cleanup();
    });

    test('off without callback removes all', () => {
        const { game } = make2p();
        let called = 0;
        game.on('turnEnd', () => called++);
        game.on('turnEnd', () => called++);
        game.off('turnEnd');
        game.endTurn();
        assertEqual(called, 0);
        cleanup();
    });

    // ================================================================
    // DevGame — Batch Operations
    // ================================================================

    test('runTurns', () => {
        const { game } = make2p();
        const results = game.runTurns(6);
        assertEqual(results.length, 6);
        assertEqual(game.engine.turnNumber, 6);
        cleanup();
    });

    test('runRounds', () => {
        const { game } = make2p();
        game.runRounds(3);
        assertEqual(game.engine.roundNumber, 3);
        cleanup();
    });

    test('runTurns stops on gameOver', () => {
        const { game } = make2p();
        game.forceGameOver(0);
        const results = game.runTurns(10);
        assertEqual(results.length, 0, 'no turns when game over');
        cleanup();
    });

    // ================================================================
    // DevGame — Board Setup
    // ================================================================

    test('clearBoard', () => {
        const { game } = make2p();
        game.clearBoard();
        assertEqual(game.getPieces().length, 0);
        assertEqual(game.getTile(0, 0).piece, null);
        assertEqual(game.getTile(0, 0).owner, null);
        cleanup();
    });

    // ================================================================
    // DevGame — State export
    // ================================================================

    test('getState has all fields', () => {
        const { game, id } = make2p();
        const s = game.getState();
        assertEqual(s.id, id);
        assert('turnNumber' in s);
        assert('roundNumber' in s);
        assert('currentPlayerIndex' in s);
        assert('gameOver' in s);
        assert('winner' in s);
        assert('gameEndingEnabled' in s);
        assert('players' in s);
        assert('board' in s);
        assert('actionLogLength' in s);
        cleanup();
    });

    test('getCompactState', () => {
        const { game } = make2p();
        const s = game.getCompactState();
        assert('pieces' in s);
        assert('own' in s);
        assert('tn' in s);
        assert('rn' in s);
        assertEqual(s.own.length, 10);
        cleanup();
    });

    test('toJSON is serializable', () => {
        const { game } = make2p();
        const str = JSON.stringify(game.toJSON());
        const parsed = JSON.parse(str);
        assertEqual(parsed.board.length, 10);
        cleanup();
    });

    // ================================================================
    // DevExport
    // ================================================================

    test('DevExport.pieceToPlain has all fields', () => {
        const plain = DevExport.pieceToPlain({
            id: 'x', type: 'warrior', ownerId: 0,
            row: 1, col: 2, hp: 1, maxHp: 1, damage: 1,
            hasMoved: false, production: null, productionProgress: 0,
            productionPaused: false, repeatProduction: true, createdOnRound: null
        });
        assert('productionPaused' in plain);
        assert('repeatProduction' in plain);
        assert('createdOnRound' in plain);
    });

    test('DevExport.pieceToPlain null', () => {
        assertEqual(DevExport.pieceToPlain(null), null);
    });

    test('DevExport.playerToPlain', () => {
        const { game } = make2p();
        const p = DevExport.playerToPlain(game.engine.players[0]);
        assert('relationsChangedRound' in p);
        assert('relations' in p);
        cleanup();
    });

    test('DevExport.heatmapToPlain', () => {
        const { game } = make2p();
        const hm = game.getThreatHeatmap(0);
        const plain = DevExport.heatmapToPlain(hm);
        assertEqual(plain.length, 10);
        assert(Array.isArray(plain[0]), 'plain arrays');
    });

    test('DevExport.gameToJSON', () => {
        const { game, id } = make2p();
        const str = DevExport.gameToJSON(game);
        const parsed = JSON.parse(str);
        assertEqual(parsed.id, id);
        cleanup();
    });

    test('DevExport.gameToCompactJSON', () => {
        const { game } = make2p();
        const str = DevExport.gameToCompactJSON(game);
        assert(!str.includes('\n'), 'no newlines in compact');
        cleanup();
    });

    // ================================================================
    // Multi-player games
    // ================================================================

    test('3-player game', () => {
        const { game, id } = DevManager.createGame([
            { color: PLAYER_COLORS[0] },
            { color: PLAYER_COLORS[1] },
            { color: PLAYER_COLORS[2] },
        ]);
        assertEqual(game.getPlayers().length, 3);
        assertEqual(game.getPieces().length, 6);
        DevManager.destroyGame(id);
    });

    test('4-player game', () => {
        const { game, id } = DevManager.createGame([
            { color: PLAYER_COLORS[0] },
            { color: PLAYER_COLORS[1] },
            { color: PLAYER_COLORS[2] },
            { color: PLAYER_COLORS[3] },
        ]);
        assertEqual(game.getPlayers().length, 4);
        assertEqual(game.getPieces().length, 8);
        DevManager.destroyGame(id);
    });

    // ================================================================
    // Integration: concurrent games are independent
    // ================================================================

    test('concurrent games independent', () => {
        const { game: g1 } = make2p();
        const { game: g2 } = make2p();
        g1.createWarrior(0, 5, 5);
        assertEqual(g2.getTile(5, 5).piece, null);
        g1.endTurn();
        assertEqual(g2.engine.turnNumber, 0);
        cleanup();
    });

    // ================================================================
    // Integration: full game cycle
    // ================================================================

    test('full cycle: create, move, turn, move again', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        assertTruthy(game.movePiece(5, 5, 5, 6).success);
        game.endTurn(); // -> p1
        game.endTurn(); // -> p0, resets hasMoved
        assertTruthy(game.movePiece(5, 6, 5, 7).success);
        cleanup();
    });

    test('batch: create 10 games, run 20 turns each', () => {
        DevManager.createGames(10, [
            { color: PLAYER_COLORS[0] },
            { color: PLAYER_COLORS[1] },
        ], { disableLogging: true });
        DevManager.runAllTurns(20);
        DevManager.forEachGame(g => {
            assertEqual(g.engine.turnNumber, 20);
        });
        const summary = DevManager.getSummary();
        assertEqual(summary.totalGames, 10);
        cleanup();
    });

    // ================================================================
    // Undo/Redo System
    // ================================================================

    test('undo/redo disabled by default', () => {
        const { game } = make2p();
        assertEqual(game.getUndoStackSize(), 0);
        assertEqual(game.getRedoStackSize(), 0);
        cleanup();
    });

    test('setUndoEnabled starts capturing snapshots', () => {
        const { game } = make2p();
        game.setUndoEnabled(true);
        game.createWarrior(0, 5, 5);
        game.movePiece(5, 5, 5, 6);
        assert(game.getUndoStackSize() > 0, 'undo stack has entries after move');
        cleanup();
    });

    test('undo restores previous state', () => {
        const { game } = make2p();
        game.setUndoEnabled(true);
        const piecesBefore = game.getPieces().length;
        game.createWarrior(0, 5, 5);
        // pieceCreated event should have captured a snapshot
        assertEqual(game.getPieces().length, piecesBefore + 1);
        const undoResult = game.undo();
        assertTruthy(undoResult.success);
        // After undo the warrior should be gone (state restored to before creation event)
        // Note: createWarrior calls _placePiece which emits pieceCreated
        assertEqual(game.getPieces().length, piecesBefore);
        cleanup();
    });

    test('redo restores undone state', () => {
        const { game } = make2p();
        game.setUndoEnabled(true);
        game.createWarrior(0, 5, 5);
        const piecesAfterCreate = game.getPieces().length;
        game.undo();
        const redoResult = game.redo();
        assertTruthy(redoResult.success);
        assertEqual(game.getPieces().length, piecesAfterCreate);
        cleanup();
    });

    test('undo with nothing returns failure', () => {
        const { game } = make2p();
        game.setUndoEnabled(true);
        const r = game.undo();
        assertEqual(r.success, false);
        cleanup();
    });

    test('redo with nothing returns failure', () => {
        const { game } = make2p();
        game.setUndoEnabled(true);
        const r = game.redo();
        assertEqual(r.success, false);
        cleanup();
    });

    test('new action clears redo stack', () => {
        const { game } = make2p();
        game.setUndoEnabled(true);
        game.createWarrior(0, 5, 5);
        game.undo();
        assert(game.getRedoStackSize() > 0, 'redo available');
        // New action should clear redo
        game.createWarrior(0, 6, 6);
        assertEqual(game.getRedoStackSize(), 0, 'redo cleared after new action');
        cleanup();
    });

    test('clearUndoHistory empties both stacks', () => {
        const { game } = make2p();
        game.setUndoEnabled(true);
        game.createWarrior(0, 5, 5);
        game.undo();
        game.clearUndoHistory();
        assertEqual(game.getUndoStackSize(), 0);
        assertEqual(game.getRedoStackSize(), 0);
        cleanup();
    });

    test('undo stack respects max depth', () => {
        const { game } = make2p();
        game.setUndoEnabled(true);
        game._undoMaxDepth = 3;
        // Create more snapshots than max depth
        for (let i = 0; i < 5; i++) {
            game.endTurn();
        }
        assert(game.getUndoStackSize() <= 3, 'stack capped at max depth');
        cleanup();
    });

    // ================================================================
    // Bulk Piece Placement
    // ================================================================

    test('placePieces batch creates multiple pieces', () => {
        const { game } = make2p();
        game.clearBoard();
        const results = game.placePieces([
            { type: PIECE_TYPES.WARRIOR, ownerId: 0, row: 0, col: 0 },
            { type: PIECE_TYPES.SETTLER, ownerId: 1, row: 5, col: 5 },
            { type: PIECE_TYPES.CITY, ownerId: 0, row: 9, col: 9 },
        ]);
        assertEqual(results.length, 3);
        assertTruthy(results[0].success);
        assertTruthy(results[1].success);
        assertTruthy(results[2].success);
        assertEqual(game.getPieces().length, 3);
        cleanup();
    });

    test('placePieces with hp/maxHp overrides', () => {
        const { game } = make2p();
        game.clearBoard();
        const results = game.placePieces([
            { type: PIECE_TYPES.CITY, ownerId: 0, row: 0, col: 0, hp: 2, maxHp: 8 },
        ]);
        assertTruthy(results[0].success);
        assertEqual(results[0].piece.maxHp, 8);
        assertEqual(results[0].piece.hp, 2);
        cleanup();
    });

    test('placePieces partial failure', () => {
        const { game } = make2p();
        game.clearBoard();
        game.createWarrior(0, 5, 5);
        const results = game.placePieces([
            { type: PIECE_TYPES.WARRIOR, ownerId: 0, row: 3, col: 3 },
            { type: PIECE_TYPES.WARRIOR, ownerId: 0, row: 5, col: 5 }, // occupied
            { type: PIECE_TYPES.WARRIOR, ownerId: 0, row: 7, col: 7 },
        ]);
        assertTruthy(results[0].success);
        assertEqual(results[1].success, false);
        assertTruthy(results[2].success);
        cleanup();
    });

    test('loadBoard sets up full board from config', () => {
        const { game } = make2p();
        const result = game.loadBoard({
            pieces: [
                { type: PIECE_TYPES.CITY, ownerId: 0, row: 0, col: 0 },
                { type: PIECE_TYPES.WARRIOR, ownerId: 1, row: 9, col: 9 },
            ],
            tileOwnership: (() => {
                const own = [];
                for (let r = 0; r < 10; r++) {
                    const row = [];
                    for (let c = 0; c < 10; c++) row.push(r < 5 ? 0 : 1);
                    own.push(row);
                }
                return own;
            })(),
        });
        assertTruthy(result.success);
        assertEqual(game.getPieces().length, 2);
        assertEqual(game.getTile(0, 0).owner, 0);
        assertEqual(game.getTile(9, 9).owner, 1);
        cleanup();
    });

    test('loadBoard clears existing pieces', () => {
        const { game } = make2p();
        assert(game.getPieces().length > 0, 'has initial pieces');
        game.loadBoard({ pieces: [] });
        assertEqual(game.getPieces().length, 0);
        cleanup();
    });

    // ================================================================
    // Dry-Run Validation
    // ================================================================

    test('validateAction move valid', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        const r = game.validateAction({ type: 'move', row: 5, col: 5, targetRow: 5, targetCol: 6 });
        assertEqual(r.valid, true);
        // Piece should still be at 5,5 (no side effect)
        assertTruthy(game.getTile(5, 5).piece);
        cleanup();
    });

    test('validateAction move invalid', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        const r = game.validateAction({ type: 'move', row: 5, col: 5, targetRow: 0, targetCol: 0 });
        assertEqual(r.valid, false);
        assertTruthy(r.reason);
        cleanup();
    });

    test('validateAction move no piece', () => {
        const { game } = make2p();
        const r = game.validateAction({ type: 'move', row: 5, col: 5, targetRow: 5, targetCol: 6 });
        assertEqual(r.valid, false);
        cleanup();
    });

    test('validateAction settle', () => {
        const { game } = make2p();
        game.fillTerritory(0, 5, 5, 5, 5);
        game.createSettler(0, 5, 5);
        const r = game.validateAction({ type: 'settle', row: 5, col: 5 });
        assert('valid' in r);
        cleanup();
    });

    test('validateAction production valid', () => {
        const { game } = make2p();
        const city = game.getPieces({ ownerId: 0, type: PIECE_TYPES.CITY })[0];
        const r = game.validateAction({ type: 'production', row: city.row, col: city.col, productionType: 'WARRIOR' });
        assertEqual(r.valid, true);
        cleanup();
    });

    test('validateAction production invalid type', () => {
        const { game } = make2p();
        const city = game.getPieces({ ownerId: 0, type: PIECE_TYPES.CITY })[0];
        const r = game.validateAction({ type: 'production', row: city.row, col: city.col, productionType: 'BOGUS' });
        assertEqual(r.valid, false);
        cleanup();
    });

    test('validateAction production on non-city', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        const r = game.validateAction({ type: 'production', row: 5, col: 5, productionType: 'WARRIOR' });
        assertEqual(r.valid, false);
        cleanup();
    });

    test('validateAction declareWar', () => {
        const { game } = make2p();
        const r = game.validateAction({ type: 'declareWar', playerId: 0, targetId: 1 });
        assert('valid' in r);
        cleanup();
    });

    test('validateAction proposePeace when not at war', () => {
        const { game } = make2p();
        const r = game.validateAction({ type: 'proposePeace', playerId: 0, targetId: 1 });
        assertEqual(r.valid, false);
        assertTruthy(r.reason);
        cleanup();
    });

    test('validateAction unknown type', () => {
        const { game } = make2p();
        const r = game.validateAction({ type: 'fly' });
        assertEqual(r.valid, false);
        cleanup();
    });

    test('validateAction no type', () => {
        const { game } = make2p();
        const r = game.validateAction({});
        assertEqual(r.valid, false);
        cleanup();
    });

    // ================================================================
    // Production Queries
    // ================================================================

    test('getProduction returns null for non-city', () => {
        const { game } = make2p();
        assertEqual(game.getProduction(5, 5), null);
        cleanup();
    });

    test('getProduction returns null when no production set', () => {
        const { game } = make2p();
        const city = game.getPieces({ ownerId: 0, type: PIECE_TYPES.CITY })[0];
        // City starts with no production
        const r = game.getProduction(city.row, city.col);
        assertEqual(r, null);
        cleanup();
    });

    test('getProduction returns info when production set', () => {
        const { game } = make2p();
        const city = game.getPieces({ ownerId: 0, type: PIECE_TYPES.CITY })[0];
        game.setProduction(city.row, city.col, 'WARRIOR');
        const r = game.getProduction(city.row, city.col);
        assertTruthy(r);
        assertEqual(r.type, 'WARRIOR');
        assertEqual(r.progress, 0);
        assertEqual(r.turnsRemaining, 4);
        cleanup();
    });

    test('getAllProduction returns all active', () => {
        const { game } = make2p();
        const p0City = game.getPieces({ ownerId: 0, type: PIECE_TYPES.CITY })[0];
        const p1City = game.getPieces({ ownerId: 1, type: PIECE_TYPES.CITY })[0];
        game.setProduction(p0City.row, p0City.col, 'WARRIOR');
        // Set production on p1's city directly (setProduction may require current player)
        game.engine.board[p1City.row][p1City.col].production = 'SETTLER';
        game.engine.board[p1City.row][p1City.col].productionProgress = 0;
        const all = game.getAllProduction();
        assertEqual(all.length, 2);
        assert(all.some(p => p.type === 'WARRIOR'));
        assert(all.some(p => p.type === 'SETTLER'));
        cleanup();
    });

    test('getProductionQueue returns per-player summary', () => {
        const { game } = make2p();
        const cities = game.getPieces({ type: PIECE_TYPES.CITY });
        game.setProduction(cities[0].row, cities[0].col, 'SCIENCE');
        const queue = game.getProductionQueue();
        assert('0' in queue);
        assert('1' in queue);
        assert(queue[0].length > 0 || queue[1].length > 0, 'at least one has entries');
        cleanup();
    });

    // ================================================================
    // State Import/Export Round-Trip
    // ================================================================

    test('importState from compact state', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        game.endTurn();
        game.endTurn();
        const compact = game.getCompactState();
        const pieceCount = game.getPieces().length;
        const turnNum = game.engine.turnNumber;

        // Create a new game and import
        const { game: g2 } = make2p();
        const result = g2.importState(compact);
        assertTruthy(result.success);
        assertEqual(g2.engine.turnNumber, turnNum);
        assertEqual(g2.getPieces().length, pieceCount);
        cleanup();
    });

    test('importState from full state', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        game.endTurn();
        game.endTurn();
        const full = game.getState();
        const pieceCount = full.board.flat().filter(t => t.piece !== null).length;

        const { game: g2 } = make2p();
        const result = g2.importState(full);
        assertTruthy(result.success);
        assertEqual(g2.engine.turnNumber, full.turnNumber);
        // Verify pieces were loaded from board data
        assertEqual(g2.getPieces().length, pieceCount);
        cleanup();
    });

    test('importFromJSON parses and imports', () => {
        const { game } = make2p();
        const compact = game.getCompactState();
        const json = JSON.stringify(compact);

        const { game: g2 } = make2p();
        const result = g2.importFromJSON(json);
        assertTruthy(result.success);
        cleanup();
    });

    test('importFromJSON fails on bad JSON', () => {
        const { game } = make2p();
        const result = game.importFromJSON('not json{{{');
        assertEqual(result.success, false);
        assertTruthy(result.reason);
        cleanup();
    });

    test('importState fails on null', () => {
        const { game } = make2p();
        const result = game.importState(null);
        assertEqual(result.success, false);
        cleanup();
    });

    test('import/export round-trip preserves tile ownership', () => {
        const { game } = make2p();
        game.fillTerritory(0, 0, 0, 4, 4);
        game.fillTerritory(1, 5, 5, 9, 9);
        const compact = game.getCompactState();

        const { game: g2 } = make2p();
        g2.importState(compact);
        assertEqual(g2.getTile(2, 2).owner, 0);
        assertEqual(g2.getTile(7, 7).owner, 1);
        cleanup();
    });

    // ================================================================
    // Granular Sandbox Rules
    // ================================================================

    test('getSandboxRules defaults all false', () => {
        const { game } = make2p();
        const rules = game.getSandboxRules();
        assertEqual(rules.movement, false);
        assertEqual(rules.combat, false);
        assertEqual(rules.settling, false);
        assertEqual(rules.diplomacy, false);
        assertEqual(rules.production, false);
        cleanup();
    });

    test('setSandboxMode true sets all rules true', () => {
        const { game } = make2p();
        game.setSandboxMode(true);
        const rules = game.getSandboxRules();
        assertEqual(rules.movement, true);
        assertEqual(rules.combat, true);
        assertEqual(rules.settling, true);
        assertEqual(rules.diplomacy, true);
        assertEqual(rules.production, true);
        assertEqual(game.isSandboxMode(), true);
        cleanup();
    });

    test('setSandboxMode false sets all rules false', () => {
        const { game } = make2p();
        game.setSandboxMode(true);
        game.setSandboxMode(false);
        const rules = game.getSandboxRules();
        assertEqual(rules.movement, false);
        assertEqual(rules.settling, false);
        assertEqual(rules.diplomacy, false);
        assertEqual(game.isSandboxMode(), false);
        cleanup();
    });

    test('setSandboxRules granular movement only', () => {
        const { game } = make2p();
        game.setSandboxRules({ movement: true });
        assertEqual(game.getSandboxRules().movement, true);
        assertEqual(game.getSandboxRules().settling, false);
        assertEqual(game.isSandboxMode(), true);

        // Movement should bypass range — warrior can move far
        game.createWarrior(0, 5, 5);
        const r = game.movePiece(5, 5, 0, 0);
        assertTruthy(r.success, 'sandbox movement bypasses range');
        cleanup();
    });

    test('setSandboxRules granular settling only', () => {
        const { game } = make2p();
        game.setSandboxRules({ settling: true });
        assertEqual(game.getSandboxRules().settling, true);
        assertEqual(game.getSandboxRules().movement, false);

        // Settling should bypass distance checks
        // Place settler right next to existing city
        const city = game.getPieces({ type: PIECE_TYPES.CITY })[0];
        const sRow = city.row;
        const sCol = city.col + 1 < 10 ? city.col + 1 : city.col - 1;
        game.createSettler(0, sRow, sCol);
        const r = game.settleCity(sRow, sCol);
        assertTruthy(r.success, 'sandbox settling bypasses distance');
        cleanup();
    });

    test('setSandboxRules granular diplomacy only', () => {
        const { game } = make2p();
        game.setSandboxRules({ diplomacy: true });

        // Diplomacy should bypass cooldown
        game.declareWar(0, 1);
        // Immediately propose peace (normally blocked by cooldown)
        const r = game.proposePeace(0, 1);
        assertEqual(r, true, 'sandbox diplomacy bypasses cooldown');
        cleanup();
    });

    test('setSandboxRules partial then disable', () => {
        const { game } = make2p();
        game.setSandboxRules({ movement: true, diplomacy: true });
        assertEqual(game.isSandboxMode(), true);
        game.setSandboxRules({ movement: false, diplomacy: false });
        assertEqual(game.isSandboxMode(), false);
        cleanup();
    });

    // ================================================================
    // Expanded Event Coverage
    // ================================================================

    test('pieceCreated event fires on create', () => {
        const { game } = make2p();
        let eventData = null;
        game.on('pieceCreated', (data) => { eventData = data; });
        game.createWarrior(0, 5, 5);
        assertTruthy(eventData);
        assertEqual(eventData.type, PIECE_TYPES.WARRIOR);
        assertEqual(eventData.ownerId, 0);
        assertEqual(eventData.row, 5);
        assertEqual(eventData.col, 5);
        assertTruthy(eventData.piece);
        cleanup();
    });

    test('pieceRemoved event fires on remove', () => {
        const { game } = make2p();
        game.createWarrior(0, 5, 5);
        let eventData = null;
        game.on('pieceRemoved', (data) => { eventData = data; });
        game.removePiece(5, 5);
        assertTruthy(eventData);
        assertEqual(eventData.row, 5);
        assertEqual(eventData.col, 5);
        assertTruthy(eventData.piece);
        cleanup();
    });

    test('territoryChanged event fires on setTileOwner', () => {
        const { game } = make2p();
        let eventData = null;
        game.on('territoryChanged', (data) => { eventData = data; });
        game.setTileOwner(5, 5, 0);
        assertTruthy(eventData);
        assertEqual(eventData.row, 5);
        assertEqual(eventData.col, 5);
        assertEqual(eventData.newOwner, 0);
        cleanup();
    });

    test('boardCleared event fires on clearBoard', () => {
        const { game } = make2p();
        let called = false;
        game.on('boardCleared', () => { called = true; });
        game.clearBoard();
        assertEqual(called, true);
        cleanup();
    });

    test('productionSet event fires on setProduction', () => {
        const { game } = make2p();
        let eventData = null;
        game.on('productionSet', (data) => { eventData = data; });
        const city = game.getPieces({ ownerId: 0, type: PIECE_TYPES.CITY })[0];
        game.setProduction(city.row, city.col, 'WARRIOR');
        assertTruthy(eventData);
        assertEqual(eventData.type, 'WARRIOR');
        assertEqual(eventData.row, city.row);
        assertEqual(eventData.col, city.col);
        cleanup();
    });

    test('stateImported event fires on importState', () => {
        const { game } = make2p();
        const compact = game.getCompactState();
        let eventData = null;
        game.on('stateImported', (data) => { eventData = data; });
        game.importState(compact);
        assertTruthy(eventData);
        assertEqual(eventData.source, 'compact');
        cleanup();
    });

    test('stateImported event fires with full source', () => {
        const { game } = make2p();
        const full = game.getState();
        let eventData = null;
        game.on('stateImported', (data) => { eventData = data; });
        game.importState(full);
        assertTruthy(eventData);
        assertEqual(eventData.source, 'full');
        cleanup();
    });

    // ================================================================
    // Output results
    // ================================================================

    process.stdout.write(JSON.stringify(results));
""")


def build_js_bundle():
    """Concatenate stubs + all dependency files + test script."""
    parts = [NODE_PREAMBLE]
    for relpath in JS_DEPS:
        filepath = os.path.join(REPO, relpath)
        with open(filepath, "r") as f:
            parts.append(f"// === {relpath} ===\n")
            parts.append(f.read())
            parts.append("\n")
    parts.append(TEST_SCRIPT)
    return "\n".join(parts)


def run_tests():
    bundle = build_js_bundle()
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False)
    tmp.write(bundle)
    tmp.close()
    try:
        result = subprocess.run(
            ["node", tmp.name],
            capture_output=True,
            text=True,
            timeout=30,
        )
    finally:
        os.unlink(tmp.name)

    if result.returncode != 0 and not result.stdout.strip():
        print("FATAL: Node.js execution failed before tests could run.")
        print("--- stderr ---")
        print(result.stderr[:3000])
        sys.exit(1)

    # Parse JSON results
    try:
        results = json.loads(result.stdout)
    except json.JSONDecodeError:
        print("FATAL: Could not parse test output as JSON.")
        print("--- stdout (last 2000 chars) ---")
        print(result.stdout[-2000:])
        print("--- stderr (last 2000 chars) ---")
        print(result.stderr[-2000:])
        sys.exit(1)

    passed = 0
    failed = 0
    errors = []

    for t in results:
        if t["pass"]:
            passed += 1
            print(f"  PASS  {t['name']}")
        else:
            failed += 1
            location = ""
            if t.get("stack"):
                for line in t["stack"].split("\n"):
                    line = line.strip()
                    if line.startswith("at ") and ("<anonymous>" in line or "evalmachine" in line):
                        location = line
                        break
            print(f"  FAIL  {t['name']}")
            print(f"        Error: {t['error']}")
            if location:
                print(f"        Location: {location}")
            errors.append(t)

    print()
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")

    if result.stderr.strip() and failed > 0:
        print()
        print("--- Engine console output (last 30 lines) ---")
        stderr_lines = result.stderr.strip().split("\n")
        for line in stderr_lines[-30:]:
            print(f"  {line}")

    if failed > 0:
        print()
        print("FAILED TESTS:")
        for t in errors:
            print(f"  - {t['name']}: {t['error']}")
        sys.exit(1)
    else:
        print("\nAll tests passed.")


if __name__ == "__main__":
    run_tests()
