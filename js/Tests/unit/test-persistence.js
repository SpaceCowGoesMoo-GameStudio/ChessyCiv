// ============================================
// UNIT TESTS - Persistence Module
// ============================================

describe('GameEngine Persistence', function() {
    it('cloneState creates deep copy of all state', function() {
        const e = createEngine(2);
        const state = e.cloneState();
        assert.ok(state.pieces.length > 0);
        assert.equal(state.players.length, 2);
        assert.equal(state.currentPlayerIndex, e.currentPlayerIndex);
        assert.equal(state.turnNumber, e.turnNumber);
        assert.equal(state.roundNumber, e.roundNumber);
        assert.equal(state.gameOver, false);
        assert.equal(state.winner, null);
    });

    it('cloneState deep copies pieces (no shared references)', function() {
        const e = createEngine(2);
        const state = e.cloneState();
        // Modify clone
        state.pieces[0].hp = 999;
        // Original should be unchanged
        assert.notEqual(e.pieces[0].hp, 999);
    });

    it('cloneState deep copies tileOwnership', function() {
        const e = createEngine(2);
        const state = e.cloneState();
        state.tileOwnership[0][0] = 99;
        assert.notEqual(e.tileOwnership[0][0], 99);
    });

    it('cloneState deep copies player relations', function() {
        const e = createEngine(2);
        const state = e.cloneState();
        state.players[0].relations[1] = 'war';
        assert.equal(e.players[0].relations[1], 'peace');
    });

    it('restoreState rebuilds board from cloned state', function() {
        const e = createEngine(2);
        const state = e.cloneState();

        // Mess up the engine
        e.pieces = [];
        e.board = e.createEmptyBoard();
        e.players = [];

        // Restore
        e.restoreState(state);

        assert.ok(e.pieces.length > 0);
        assert.equal(e.players.length, 2);
        // Board should have piece references
        let boardPieces = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (e.board[r][c] !== null) boardPieces++;
            }
        }
        assert.equal(boardPieces, e.pieces.length);
    });

    it('restoreState board references match pieces array', function() {
        const e = createEngine(2);
        const state = e.cloneState();
        e.restoreState(state);

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const piece = e.board[r][c];
                if (piece) {
                    assert.ok(e.pieces.includes(piece),
                        `Board piece at (${r},${c}) not in pieces array`);
                    assert.equal(piece.row, r);
                    assert.equal(piece.col, c);
                }
            }
        }
    });

    it('clone/restore round-trip preserves game state', function() {
        const e = createEngine(2);
        // Make some moves
        e.endTurn();
        e.endTurn();
        const state = e.cloneState();

        const e2 = new GameEngine();
        // Set up minimal player/board state, then restore
        e2.restoreState(state);

        assert.equal(e2.turnNumber, e.turnNumber);
        assert.equal(e2.roundNumber, e.roundNumber);
        assert.equal(e2.currentPlayerIndex, e.currentPlayerIndex);
        assert.equal(e2.pieces.length, e.pieces.length);
    });

    it('clone/restore preserves production state', function() {
        const e = createEngine(2);
        const cities = e.pieces.filter(p => p.type === PIECE_TYPES.CITY && p.ownerId === 0);
        cities[0].production = 'WARRIOR';
        cities[0].productionProgress = 2;

        const state = e.cloneState();
        e.restoreState(state);

        const restoredCities = e.pieces.filter(p => p.type === PIECE_TYPES.CITY && p.ownerId === 0);
        assert.equal(restoredCities[0].production, 'WARRIOR');
        assert.equal(restoredCities[0].productionProgress, 2);
    });

    it('clone/restore preserves war/peace relations', function() {
        const e = createEngine(2);
        e.declareWar(0, 1);

        const state = e.cloneState();
        e.restoreState(state);

        assert.equal(e.players[0].relations[1], 'war');
        assert.equal(e.players[1].relations[0], 'war');
    });
});

describe('GameHistory savingDisabled', function() {
    beforeEach(function() {
        // Reset static DB state so each test starts clean
        GameHistory._db = null;
        GameHistory._dbPromise = null;
    });

    it('defaults to false on a new GameHistory instance', function() {
        const h = new GameHistory();
        assert.equal(h.savingDisabled, false);
    });

    it('saveToIndexedDB returns immediately without setting saving flag', function() {
        const h = new GameHistory();
        h.savingDisabled = true;
        h.saveToIndexedDB();
        // saving is set synchronously before the first await, so if the
        // guard fired it remains false
        assert.equal(h.saving, false);
    });

    it('saveToIndexedDB sets saving flag when savingDisabled is false', function() {
        const h = new GameHistory();
        // saving is set to true synchronously before the first await, so it
        // is observable here without awaiting the full async call
        h.saveToIndexedDB();
        assert.equal(h.saving, true);
    });

    it('forceSave returns immediately without setting saving flag', function() {
        const h = new GameHistory();
        h.latestSnapshot = { test: true }; // forceSave checks for a snapshot
        h.savingDisabled = true;
        h.forceSave();
        assert.equal(h.saving, false);
    });

    it('forceSave initiates a save when savingDisabled is false', function() {
        const h = new GameHistory();
        h.latestSnapshot = { test: true };
        h.forceSave();
        assert.equal(h.saving, true);
    });

    it('captureSnapshot on engine history respects flag when save interval exceeded', function() {
        const e = createEngine(2);
        // GAME_START triggered an async save during setup; clear the in-flight
        // flag so this test is isolated from that initial save
        e.history.saving = false;
        e.history.savingDisabled = true;
        // Force conditions that would normally trigger a periodic save
        e.history.roundNumber = GameHistory.SAVE_INTERVAL + 1;
        e.history.lastSavedRound = 0;
        e.history.captureSnapshot(e, 'TURN_END', { turnNumber: 1 });
        assert.equal(e.history.saving, false);
    });

    it('captureSnapshot on engine history respects flag for GAME_START event', function() {
        const e = createEngine(2);
        // GAME_START triggered an async save during setup; clear the in-flight
        // flag so this test is isolated from that initial save
        e.history.saving = false;
        e.history.savingDisabled = true;
        // GAME_START always triggers a save regardless of interval
        e.history.captureSnapshot(e, 'GAME_START', { players: 2 });
        assert.equal(e.history.saving, false);
    });
});
