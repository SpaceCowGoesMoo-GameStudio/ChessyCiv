// ============================================
// E2E TESTS - State Round-trip
// ============================================

describe('E2E: State Round-trip', function() {
    it('clone/restore after 20 turns yields identical getValidMoves', function() {
        seedRandom(42);
        const e = createEngine(2);

        // Run 20 turns
        for (let i = 0; i < 20; i++) e.endTurn();

        // Clone state
        const state = e.cloneState();

        // Get valid moves for all pieces
        const movesBefore = {};
        for (const p of e.pieces) {
            movesBefore[p.id] = e.getValidMoves(p).map(m => `${m.row},${m.col}`).sort();
        }

        // Mess up engine
        e.pieces.forEach(p => { p.hp = 999; });

        // Restore
        e.restoreState(state);

        // Get valid moves again
        for (const p of e.pieces) {
            const moves = e.getValidMoves(p).map(m => `${m.row},${m.col}`).sort();
            if (movesBefore[p.id]) {
                assert.deepEqual(moves, movesBefore[p.id],
                    `Moves mismatch for piece ${p.id}`);
            }
        }
        restoreRandom();
    });

    it('two clones from same state produce identical outcomes', function() {
        seedRandom(42);
        const e = createEngine(2);

        // Run 10 turns
        for (let i = 0; i < 10; i++) e.endTurn();

        // Clone twice
        const state1 = e.cloneState();
        const state2 = e.cloneState();

        // Verify deep equality
        assert.equal(state1.pieces.length, state2.pieces.length);
        assert.equal(state1.turnNumber, state2.turnNumber);
        assert.equal(state1.roundNumber, state2.roundNumber);
        assert.equal(state1.currentPlayerIndex, state2.currentPlayerIndex);

        for (let i = 0; i < state1.pieces.length; i++) {
            assert.equal(state1.pieces[i].hp, state2.pieces[i].hp);
            assert.equal(state1.pieces[i].row, state2.pieces[i].row);
            assert.equal(state1.pieces[i].col, state2.pieces[i].col);
            assert.equal(state1.pieces[i].type, state2.pieces[i].type);
        }
        restoreRandom();
    });

    it('clone after combat preserves kill/loss stats', function() {
        const e = createScenario(2);
        placePiece(e, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(e, PIECE_TYPES.CITY, 1, 9, 9);

        const attacker = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 5);
        placePiece(e, PIECE_TYPES.WARRIOR, 1, 5, 6);
        e.tileOwnership[5][6] = 1;

        e.declareWar(0, 1);
        e.movePiece(attacker, 5, 6);

        assert.equal(e.players[0].warriorKills, 1);
        assert.equal(e.players[1].warriorsLost, 1);

        const state = e.cloneState();
        e.restoreState(state);

        assert.equal(e.players[0].warriorKills, 1);
        assert.equal(e.players[1].warriorsLost, 1);
    });
});
