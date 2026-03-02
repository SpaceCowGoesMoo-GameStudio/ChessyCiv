// ============================================
// UNIT TESTS - Movement Module
// ============================================

describe('GameEngine Movement', function() {
    let engine;

    beforeEach(function() {
        engine = createScenario(2);
    });

    // --- canMoveTo ---

    it('warrior can move 1 tile in any direction', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        // All 8 directions
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dr, dc] of dirs) {
            const result = engine.canMoveTo(w, 5 + dr, 5 + dc);
            assert.ok(result.valid, `Direction (${dr},${dc}) should be valid`);
        }
    });

    it('warrior cannot move more than 1 tile', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        assert.equal(engine.canMoveTo(w, 5, 7).valid, false);
        assert.equal(engine.canMoveTo(w, 7, 5).valid, false);
    });

    it('warrior cannot stay on same tile', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        assert.equal(engine.canMoveTo(w, 5, 5).valid, false);
    });

    it('settler moves up to 3 tiles orthogonally', function() {
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        assert.ok(engine.canMoveTo(s, 5, 6).valid);
        assert.ok(engine.canMoveTo(s, 5, 7).valid);
        assert.ok(engine.canMoveTo(s, 5, 8).valid);
        assert.ok(engine.canMoveTo(s, 3, 5).valid);
    });

    it('settler cannot move more than 3 tiles', function() {
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        assert.equal(engine.canMoveTo(s, 5, 9).valid, false);
        assert.equal(engine.canMoveTo(s, 1, 5).valid, false);
    });

    it('settler cannot move diagonally', function() {
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        assert.equal(engine.canMoveTo(s, 6, 6).valid, false);
        assert.equal(engine.canMoveTo(s, 4, 4).valid, false);
    });

    it('city cannot move', function() {
        const c = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        assert.equal(engine.canMoveTo(c, 5, 6).valid, false);
    });

    it('piece that already moved is rejected', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        w.hasMoved = true;
        assert.equal(engine.canMoveTo(w, 5, 6).valid, false);
    });

    it('cannot move into peace territory', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        engine.tileOwnership[5][6] = 1; // player 1's tile
        // Players 0 and 1 are at peace by default
        assert.equal(engine.canMoveTo(w, 5, 6).valid, false);
    });

    it('can move into war territory', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        engine.tileOwnership[5][6] = 1;
        engine.players[0].relations[1] = 'war';
        engine.players[1].relations[0] = 'war';
        assert.ok(engine.canMoveTo(w, 5, 6).valid);
    });

    it('settler cannot attack', function() {
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        placePiece(engine, PIECE_TYPES.WARRIOR, 1, 5, 6);
        engine.players[0].relations[1] = 'war';
        engine.players[1].relations[0] = 'war';
        assert.equal(engine.canMoveTo(s, 5, 6).valid, false);
    });

    it('warrior cannot attack own piece', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        assert.equal(engine.canMoveTo(w, 5, 6).valid, false);
    });

    it('warrior cannot attack piece at peace', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        placePiece(engine, PIECE_TYPES.WARRIOR, 1, 5, 6);
        // At peace by default
        assert.equal(engine.canMoveTo(w, 5, 6).valid, false);
    });

    it('out of bounds is rejected', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 0, 0);
        assert.equal(engine.canMoveTo(w, -1, 0).valid, false);
        assert.equal(engine.canMoveTo(w, 0, -1).valid, false);
    });

    // --- isPathClear ---

    it('isPathClear returns true for clear path', function() {
        assert.ok(engine.isPathClear(5, 5, 5, 8));
    });

    it('isPathClear returns false when path blocked', function() {
        placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        assert.equal(engine.isPathClear(5, 5, 5, 8), false);
    });

    it('settler path blocked by intermediate piece', function() {
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 7);
        assert.equal(engine.canMoveTo(s, 5, 8).valid, false);
    });

    // --- isBlockedByBlockade ---

    it('blockade blocks diagonal movement', function() {
        // Enemy warriors on opposite diagonal corners of 2x2 square
        placePiece(engine, PIECE_TYPES.WARRIOR, 1, 5, 6); // (fromRow, toCol)
        placePiece(engine, PIECE_TYPES.WARRIOR, 1, 6, 5); // (toRow, fromCol)
        // Moving from (5,5) to (6,6) should be blocked
        assert.ok(engine.isBlockedByBlockade(5, 5, 6, 6, 0));
    });

    it('own blockade does not block own pieces', function() {
        placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        placePiece(engine, PIECE_TYPES.WARRIOR, 0, 6, 5);
        assert.equal(engine.isBlockedByBlockade(5, 5, 6, 6, 0), false);
    });

    it('blockade does not block orthogonal movement', function() {
        placePiece(engine, PIECE_TYPES.WARRIOR, 1, 5, 6);
        placePiece(engine, PIECE_TYPES.WARRIOR, 1, 6, 5);
        // Orthogonal movement not affected
        assert.equal(engine.isBlockedByBlockade(5, 5, 5, 6, 0), false);
    });

    it('blockade requires both warriors from same player', function() {
        placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        placePiece(engine, PIECE_TYPES.WARRIOR, 1, 6, 5);
        // Different owners - no blockade
        assert.equal(engine.isBlockedByBlockade(5, 5, 6, 6, 0), false);
    });

    // --- getValidMoves ---

    it('getValidMoves for warrior returns up to 8 moves', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const moves = engine.getValidMoves(w);
        assert.equal(moves.length, 8);
    });

    it('getValidMoves for corner warrior returns 3 moves', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 0, 0);
        const moves = engine.getValidMoves(w);
        assert.equal(moves.length, 3);
    });

    it('getValidMoves returns empty for city', function() {
        const c = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        assert.equal(engine.getValidMoves(c).length, 0);
    });

    it('getValidMoves returns empty for already-moved piece', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        w.hasMoved = true;
        assert.equal(engine.getValidMoves(w).length, 0);
    });

    it('getValidMoves for settler includes orthogonal tiles', function() {
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        const moves = engine.getValidMoves(s);
        // 4 directions * up to 3 tiles each, minus edges
        assert.ok(moves.length > 0);
        // All moves should be orthogonal
        for (const m of moves) {
            const rowDiff = Math.abs(m.row - 5);
            const colDiff = Math.abs(m.col - 5);
            assert.ok(rowDiff === 0 || colDiff === 0, 'Settler moves must be orthogonal');
        }
    });

    // --- movePiece ---

    it('movePiece updates board state', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const result = engine.movePiece(w, 5, 6);
        assert.ok(result.success);
        assert.equal(engine.board[5][5], null);
        assert.equal(engine.board[5][6], w);
        assert.equal(w.row, 5);
        assert.equal(w.col, 6);
        assert.equal(w.hasMoved, true);
    });

    it('movePiece warrior flips enemy tile ownership during war', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        engine.tileOwnership[5][6] = 1;
        engine.players[0].relations[1] = 'war';
        engine.players[1].relations[0] = 'war';
        engine.movePiece(w, 5, 6);
        assert.equal(engine.tileOwnership[5][6], 0);
    });

    it('movePiece warrior does not flip own tile', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        engine.tileOwnership[5][6] = 0; // already own it
        engine.movePiece(w, 5, 6);
        assert.equal(engine.tileOwnership[5][6], 0);
    });

    it('movePiece denied returns success false', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        w.hasMoved = true;
        const result = engine.movePiece(w, 5, 6);
        assert.equal(result.success, false);
    });
});
