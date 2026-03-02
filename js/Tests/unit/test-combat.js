// ============================================
// UNIT TESTS - Combat Module
// ============================================

describe('GameEngine Combat', function() {
    let engine;

    beforeEach(function() {
        engine = createScenario(2);
        engine.players[0].relations[1] = 'war';
        engine.players[1].relations[0] = 'war';
    });

    it('resolveCombat deals attacker damage to defender', function() {
        const attacker = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const defender = placePiece(engine, PIECE_TYPES.WARRIOR, 1, 5, 6);
        const result = engine.resolveCombat(attacker, defender);
        assert.equal(result.damageDealt, 1);
    });

    it('resolveCombat destroys warrior at 0 HP', function() {
        const attacker = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const defender = placePiece(engine, PIECE_TYPES.WARRIOR, 1, 5, 6);
        const result = engine.resolveCombat(attacker, defender);
        assert.ok(result.defenderDestroyed);
        assert.equal(engine.board[5][6], null);
    });

    it('resolveCombat captures city at 0 HP', function() {
        const attacker = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        attacker.damage = 4;
        const city = placePiece(engine, PIECE_TYPES.CITY, 1, 5, 6);
        engine.tileOwnership[5][6] = 1;

        const result = engine.resolveCombat(attacker, city);
        assert.ok(result.cityFlipped);
        assert.equal(result.defenderDestroyed, false); // city is captured, not destroyed
        assert.equal(city.ownerId, 0);
        assert.equal(city.hp, Math.ceil(city.maxHp / 3));
        assert.equal(engine.tileOwnership[5][6], 0);
        assert.equal(city.production, null);
        assert.equal(city.productionProgress, 0);
    });

    it('resolveCombat does not capture city above 0 HP', function() {
        const attacker = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const city = placePiece(engine, PIECE_TYPES.CITY, 1, 5, 6);
        const result = engine.resolveCombat(attacker, city);
        assert.equal(result.cityFlipped, false);
        assert.equal(city.ownerId, 1);
        assert.equal(city.hp, 3); // 4 - 1
    });

    it('resolveCombat tracks warrior kills and losses', function() {
        const attacker = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const defender = placePiece(engine, PIECE_TYPES.WARRIOR, 1, 5, 6);
        engine.resolveCombat(attacker, defender);
        assert.equal(engine.players[0].warriorKills, 1);
        assert.equal(engine.players[1].warriorsLost, 1);
    });

    it('resolveCombat does not track kills for city capture', function() {
        const attacker = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        attacker.damage = 4;
        placePiece(engine, PIECE_TYPES.CITY, 1, 5, 6);
        engine.resolveCombat(attacker, engine.board[5][6]);
        assert.equal(engine.players[0].warriorKills, 0);
    });

    it('removePiece removes from board and pieces array', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        engine.removePiece(w);
        assert.equal(engine.board[5][5], null);
        assert.equal(engine.pieces.indexOf(w), -1);
    });

    it('checkPlayerElimination marks player eliminated when no cities', function() {
        // Player 1 has no cities
        const result = engine.checkPlayerElimination(1);
        assert.ok(result.eliminated);
        assert.ok(engine.players[1].eliminated);
    });

    it('checkPlayerElimination does not eliminate player with cities', function() {
        placePiece(engine, PIECE_TYPES.CITY, 1, 0, 0);
        const result = engine.checkPlayerElimination(1);
        assert.equal(result.eliminated, false);
    });

    it('checkPlayerElimination converts 25% warriors', function() {
        seedRandom(42);
        // Place 4 warriors for player 1
        placePiece(engine, PIECE_TYPES.WARRIOR, 1, 0, 0);
        placePiece(engine, PIECE_TYPES.WARRIOR, 1, 0, 1);
        placePiece(engine, PIECE_TYPES.WARRIOR, 1, 0, 2);
        placePiece(engine, PIECE_TYPES.WARRIOR, 1, 0, 3);
        // No cities for player 1
        const result = engine.checkPlayerElimination(1);
        assert.ok(result.eliminated);
        // 25% of 4 = 1 converted
        assert.equal(result.convertedUnits.length, 1);
        assert.equal(result.destroyedUnits.length, 3);
        restoreRandom();
    });

    it('checkPlayerElimination destroys all settlers', function() {
        placePiece(engine, PIECE_TYPES.SETTLER, 1, 0, 0);
        placePiece(engine, PIECE_TYPES.SETTLER, 1, 0, 1);
        const result = engine.checkPlayerElimination(1);
        assert.ok(result.eliminated);
        // Both settlers should be destroyed
        const settlerDestroyed = result.destroyedUnits.filter(u => u.type === PIECE_TYPES.SETTLER);
        assert.equal(settlerDestroyed.length, 2);
    });

    it('checkPlayerElimination transfers tiles to conquerer', function() {
        engine.tileOwnership[0][0] = 1;
        engine.tileOwnership[0][1] = 1;
        engine.tileOwnership[0][2] = 1;
        const result = engine.checkPlayerElimination(1);
        assert.ok(result.eliminated);
        assert.equal(result.tilesTransferred, 3);
        assert.equal(engine.tileOwnership[0][0], 0);
        assert.equal(engine.tileOwnership[0][1], 0);
    });

    it('checkVictory detects single city owner', function() {
        placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        // Only player 0 has cities
        engine.checkVictory();
        assert.ok(engine.gameOver);
        assert.equal(engine.winner, 0);
    });

    it('checkVictory does not trigger with multiple owners', function() {
        placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        placePiece(engine, PIECE_TYPES.CITY, 1, 0, 0);
        engine.checkVictory();
        assert.equal(engine.gameOver, false);
    });

    it('movePiece triggers combat on attack', function() {
        const attacker = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const defender = placePiece(engine, PIECE_TYPES.WARRIOR, 1, 5, 6);
        engine.tileOwnership[5][6] = 1;
        const result = engine.movePiece(attacker, 5, 6);
        assert.ok(result.success);
        assert.ok(result.combat);
        assert.ok(result.combat.defenderDestroyed);
    });

    it('attacker stays at original position after attacking city', function() {
        const attacker = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const city = placePiece(engine, PIECE_TYPES.CITY, 1, 5, 6);
        engine.tileOwnership[5][6] = 1;
        const result = engine.movePiece(attacker, 5, 6);
        assert.ok(result.success);
        assert.ok(result.blocked);
        assert.equal(attacker.row, 5);
        assert.equal(attacker.col, 5);
    });
});
