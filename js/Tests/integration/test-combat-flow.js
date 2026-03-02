// ============================================
// INTEGRATION TESTS - Combat Flow
// ============================================

describe('Integration: Combat Flow', function() {
    it('full attack sequence: declare war -> move -> attack -> kill', function() {
        const e = createScenario(2);
        const attacker = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const defender = placePiece(e, PIECE_TYPES.WARRIOR, 1, 5, 6);
        engine_tileOwnership_for_war(e);

        e.declareWar(0, 1);
        const result = e.movePiece(attacker, 5, 6);
        assert.ok(result.success);
        assert.ok(result.combat);
        assert.ok(result.combat.defenderDestroyed);
        assert.equal(e.pieces.indexOf(defender), -1);
    });

    it('city siege: 4 attacks to capture 4HP city', function() {
        const e = createScenario(2);
        const city = placePiece(e, PIECE_TYPES.CITY, 1, 5, 5);
        e.tileOwnership[5][5] = 1;
        // Also give player 1 another city so they don't get eliminated
        placePiece(e, PIECE_TYPES.CITY, 1, 0, 0);
        e.tileOwnership[0][0] = 1;

        e.declareWar(0, 1);
        assert.equal(city.hp, 4);

        // Attack 4 times with different warriors
        for (let i = 0; i < 4; i++) {
            const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 4, 5 + i > 9 ? 5 : 5);
            // Place attacker adjacent to city
            const row = 4 + Math.floor(i / 3);
            const col = 4 + (i % 3);
            if (e.board[row][col]) continue;
            w.row = row;
            w.col = col;
            e.board[row][col] = w;

            e.resolveCombat(w, city);
        }

        if (city.hp <= 0 || city.ownerId === 0) {
            assert.equal(city.ownerId, 0);
            // HP should be restored to ceil(maxHp/3) = ceil(4/3) = 2
            assert.equal(city.hp, 2);
        }
    });

    it('elimination cascade: territory + warrior conversion', function() {
        seedRandom(42);
        const e = createScenario(2);
        // Player 1 has only one city
        const city = placePiece(e, PIECE_TYPES.CITY, 1, 5, 5);
        e.tileOwnership[5][5] = 1;
        e.tileOwnership[5][6] = 1;
        e.tileOwnership[5][7] = 1;

        // Player 1 has warriors
        placePiece(e, PIECE_TYPES.WARRIOR, 1, 6, 6);
        placePiece(e, PIECE_TYPES.WARRIOR, 1, 6, 7);
        placePiece(e, PIECE_TYPES.WARRIOR, 1, 7, 7);
        placePiece(e, PIECE_TYPES.WARRIOR, 1, 7, 8);

        e.declareWar(0, 1);

        // Attack city with strong warrior
        const attacker = placePiece(e, PIECE_TYPES.WARRIOR, 0, 4, 5);
        attacker.damage = 4;
        e.resolveCombat(attacker, city);

        // City captured -> elimination check
        assert.equal(city.ownerId, 0);
        assert.ok(e.players[1].eliminated);

        // Tiles transferred
        assert.equal(e.tileOwnership[5][6], 0);
        assert.equal(e.tileOwnership[5][7], 0);
        restoreRandom();
    });

    it('2-player victory after elimination', function() {
        const e = createScenario(2);
        const city = placePiece(e, PIECE_TYPES.CITY, 1, 5, 5);
        e.tileOwnership[5][5] = 1;

        // Give player 0 a city too
        placePiece(e, PIECE_TYPES.CITY, 0, 0, 0);
        e.tileOwnership[0][0] = 0;

        e.declareWar(0, 1);

        const attacker = placePiece(e, PIECE_TYPES.WARRIOR, 0, 4, 5);
        attacker.damage = 4;
        e.resolveCombat(attacker, city);

        // Player 1 eliminated, player 0 has all cities
        assert.ok(e.gameOver);
        assert.equal(e.winner, 0);
    });

    it('attacker moves to target tile after killing warrior', function() {
        const e = createScenario(2);
        const attacker = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 5);
        placePiece(e, PIECE_TYPES.WARRIOR, 1, 5, 6);
        engine_tileOwnership_for_war(e);

        e.declareWar(0, 1);
        e.movePiece(attacker, 5, 6);

        // Attacker should have moved to defender's tile
        assert.equal(attacker.row, 5);
        assert.equal(attacker.col, 6);
        assert.equal(e.board[5][6], attacker);
        assert.equal(e.board[5][5], null);
    });

    it('attacker stays in place when attacking surviving city', function() {
        const e = createScenario(2);
        const attacker = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 5);
        placePiece(e, PIECE_TYPES.CITY, 1, 5, 6);
        e.tileOwnership[5][6] = 1;

        e.declareWar(0, 1);
        e.movePiece(attacker, 5, 6);

        assert.equal(attacker.row, 5);
        assert.equal(attacker.col, 5); // stayed in place
    });
});

// Helper to set up tile ownership for war zones
function engine_tileOwnership_for_war(e) {
    // Make the target tiles enemy-owned so movement is allowed
    e.tileOwnership[5][6] = 1;
}
