// ============================================
// UNIT TESTS - AI A* Pathfinding
// Tests whether findWarriorPathAStar and findSettlerPathAStar
// successfully find paths (non-null) or unnecessarily fall back
// to the greedy fallback in movement.js.
// ============================================

describe('CivChessAI A* Pathfinding', function() {
    function createAI(engine, playerId) {
        if (playerId === undefined) playerId = 0;
        return new CivChessAI(engine, playerId, AI_PERSONALITY.EXPANSIONIST, AI_DIFFICULTY.HARD);
    }

    // ============================================
    // findWarriorPathAStar
    // ============================================

    it('warrior: returns non-null on open board (A* is used, not greedy fallback)', function() {
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 0, 0);
        const ai = createAI(e);
        assert.ok(ai.findWarriorPathAStar(w, { row: 9, col: 9 }) !== null,
            'A* should find a path — null would mean greedy fallback is triggered');
    });

    it('warrior: returns null when already at target', function() {
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const ai = createAI(e);
        assert.equal(ai.findWarriorPathAStar(w, { row: 5, col: 5 }), null);
    });

    it('warrior: returns direct move when target is 1 step away', function() {
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const ai = createAI(e);
        const move = ai.findWarriorPathAStar(w, { row: 5, col: 6 });
        assert.ok(move !== null);
        assert.equal(move.row, 5);
        assert.equal(move.col, 6);
    });

    it('warrior: first step is the optimal diagonal toward a diagonal target', function() {
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 0, 0);
        const ai = createAI(e);
        // Target at (9,9): optimal first step from corner is (1,1)
        const move = ai.findWarriorPathAStar(w, { row: 9, col: 9 });
        assert.ok(move !== null);
        assert.equal(move.row, 1, 'Should step diagonally toward (9,9)');
        assert.equal(move.col, 1, 'Should step diagonally toward (9,9)');
    });

    it('warrior: first step reduces Chebyshev distance to target', function() {
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 2, 3);
        const ai = createAI(e);
        const target = { row: 8, col: 7 };
        const startDist = ai.getDistance(w, target);
        const move = ai.findWarriorPathAStar(w, target);
        assert.ok(move !== null);
        assert.ok(ai.getDistance(move, target) < startDist,
            'First A* step should bring warrior closer to target');
    });

    it('warrior: finds paths to all 4 corners from center — no greedy fallback needed', function() {
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 4, 5);
        const ai = createAI(e);
        const corners = [
            { row: 0, col: 0 }, { row: 0, col: 9 },
            { row: 9, col: 0 }, { row: 9, col: 9 }
        ];
        for (const target of corners) {
            assert.ok(ai.findWarriorPathAStar(w, target) !== null,
                `A* should find path to corner (${target.row},${target.col}) without greedy fallback`);
        }
    });

    it('warrior: returns null when completely surrounded by friendly pieces', function() {
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 5);
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                placePiece(e, PIECE_TYPES.WARRIOR, 0, 5 + dr, 5 + dc);
            }
        }
        const ai = createAI(e);
        assert.equal(ai.findWarriorPathAStar(w, { row: 0, col: 0 }), null,
            'Completely surrounded warrior should return null (greedy fallback is appropriate here)');
    });

    it('warrior: navigates around a vertical friendly wall (returns non-null)', function() {
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 0, 0);
        // Col 5 rows 0–8 blocked; only gap is row 9 — forces detour
        for (let r = 0; r <= 8; r++) {
            placePiece(e, PIECE_TYPES.WARRIOR, 0, r, 5);
        }
        const ai = createAI(e);
        assert.ok(ai.findWarriorPathAStar(w, { row: 0, col: 9 }) !== null,
            'A* should find path around the vertical wall via row 9 gap');
    });

    it('warrior: first step of wall-bypass moves toward the gap (not directly blocked)', function() {
        const e = createScenario(2);
        // Warrior at (5,0), target at (5,9)
        // Block rows 4, 5, 6 at cols 1–8: forces warrior to detour via row 3 or row 7
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 0);
        for (let c = 1; c <= 8; c++) {
            placePiece(e, PIECE_TYPES.WARRIOR, 0, 4, c);
            placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, c);
            placePiece(e, PIECE_TYPES.WARRIOR, 0, 6, c);
        }
        const ai = createAI(e);
        const move = ai.findWarriorPathAStar(w, { row: 5, col: 9 });
        assert.ok(move !== null, 'A* should find path when rows 4–6 cols 1–8 are blocked');
        // Only valid first steps from (5,0) with this wall are (4,0) and (6,0)
        assert.equal(move.col, 0, 'First step must stay in col 0 to get around the wall');
        assert.ok(move.row === 4 || move.row === 6, 'First step must go to row 4 or row 6');
    });

    it('warrior: 100-iteration limit — still finds path on a moderately dense board', function() {
        // Right half of board filled with friendlies; path must go through left half
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 0, 0);
        for (let r = 0; r <= 9; r++) {
            for (let c = 6; c <= 9; c++) {
                if (r === 0 && c === 0) continue;
                placePiece(e, PIECE_TYPES.WARRIOR, 0, r, c);
            }
        }
        const ai = createAI(e);
        // Target is in the right half but accessible through the open left section
        // Should still find path without hitting the 100-iteration cap
        const move = ai.findWarriorPathAStar(w, { row: 9, col: 5 });
        assert.ok(move !== null,
            'A* should find path to edge of dense region within 100 iterations');
    });

    // ============================================
    // findSettlerPathAStar
    // ============================================

    it('settler: returns non-null on open board', function() {
        const e = createScenario(2);
        const s = placePiece(e, PIECE_TYPES.SETTLER, 0, 0, 0);
        const ai = createAI(e);
        assert.ok(ai.findSettlerPathAStar(s, { row: 9, col: 0 }) !== null);
    });

    it('settler: returns null when already at target', function() {
        const e = createScenario(2);
        const s = placePiece(e, PIECE_TYPES.SETTLER, 0, 5, 5);
        const ai = createAI(e);
        assert.equal(ai.findSettlerPathAStar(s, { row: 5, col: 5 }), null);
    });

    it('settler: returns direct move when target is within 3-tile reach', function() {
        const e = createScenario(2);
        const s = placePiece(e, PIECE_TYPES.SETTLER, 0, 5, 5);
        const ai = createAI(e);
        // 3 tiles right — directly reachable in one settler step
        const move = ai.findSettlerPathAStar(s, { row: 5, col: 8 });
        assert.ok(move !== null);
        assert.equal(move.row, 5);
        assert.equal(move.col, 8);
    });

    it('settler: first step is orthogonal (no diagonal)', function() {
        const e = createScenario(2);
        const s = placePiece(e, PIECE_TYPES.SETTLER, 0, 5, 5);
        const ai = createAI(e);
        // Target requires changes in both row and col
        const move = ai.findSettlerPathAStar(s, { row: 9, col: 9 });
        assert.ok(move !== null);
        // Must share row or col with start (5,5) — settlers are orthogonal only
        assert.ok(move.row === 5 || move.col === 5,
            'Settler first step must be orthogonal from (5,5)');
    });

    it('settler: first step reduces Manhattan distance to target', function() {
        const e = createScenario(2);
        const s = placePiece(e, PIECE_TYPES.SETTLER, 0, 0, 0);
        const ai = createAI(e);
        const target = { row: 9, col: 6 };
        const startDist = ai.getManhattanDistance(s, target);
        const move = ai.findSettlerPathAStar(s, target);
        assert.ok(move !== null);
        assert.ok(ai.getManhattanDistance(move, target) < startDist,
            'First settler A* step should reduce Manhattan distance to target');
    });

    it('settler: returns null when all orthogonal routes from corner are blocked', function() {
        const e = createScenario(2);
        const s = placePiece(e, PIECE_TYPES.SETTLER, 0, 0, 0);
        // Block all tiles within 3 steps right and 3 steps down from (0,0)
        for (let c = 1; c <= 3; c++) placePiece(e, PIECE_TYPES.WARRIOR, 0, 0, c);
        for (let r = 1; r <= 3; r++) placePiece(e, PIECE_TYPES.WARRIOR, 0, r, 0);
        const ai = createAI(e);
        assert.equal(ai.findSettlerPathAStar(s, { row: 9, col: 9 }), null,
            'Settler with no valid initial moves should return null');
    });

    it('settler: navigates around a blocked column (first step goes right)', function() {
        const e = createScenario(2);
        const s = placePiece(e, PIECE_TYPES.SETTLER, 0, 0, 0);
        // Block col 0 rows 1–8: direct path down is cut off
        for (let r = 1; r <= 8; r++) {
            placePiece(e, PIECE_TYPES.WARRIOR, 0, r, 0);
        }
        const ai = createAI(e);
        // Must reach (9,0) by going right first, then down col 1+, then back left
        const move = ai.findSettlerPathAStar(s, { row: 9, col: 0 });
        assert.ok(move !== null, 'Settler A* should navigate around blocked col 0');
        assert.equal(move.row, 0, 'First step must stay in row 0 (going right)');
        assert.ok(move.col > 0, 'First step must go right since col 0 is blocked below');
    });
});
