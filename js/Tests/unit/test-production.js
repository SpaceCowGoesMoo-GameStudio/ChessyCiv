// ============================================
// UNIT TESTS - Production Module
// ============================================

describe('GameEngine Production', function() {
    let engine;

    beforeEach(function() {
        engine = createScenario(2);
    });

    it('setProduction sets production type and resets progress', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        city.productionProgress = 3;
        const result = engine.setProduction(city, 'WARRIOR');
        assert.ok(result);
        assert.equal(city.production, 'WARRIOR');
        assert.equal(city.productionProgress, 0);
        assert.equal(city.productionPaused, false);
    });

    it('setProduction fails for non-city', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        assert.equal(engine.setProduction(w, 'WARRIOR'), false);
    });

    it('setProduction fails for wrong player', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 1, 5, 5);
        engine.currentPlayerIndex = 0;
        assert.equal(engine.setProduction(city, 'WARRIOR'), false);
    });

    it('advanceProduction increments progress', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        city.production = 'WARRIOR';
        city.productionProgress = 0;
        engine.advanceProduction(city);
        assert.equal(city.productionProgress, 1);
    });

    it('advanceProduction does nothing when paused', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        city.production = 'WARRIOR';
        city.productionPaused = true;
        engine.advanceProduction(city);
        assert.equal(city.productionProgress, 0);
    });

    it('advanceProduction does nothing without production', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        engine.advanceProduction(city);
        assert.equal(city.productionProgress, 0);
    });

    it('checkAndCompleteProduction completes at threshold', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        engine.tileOwnership[5][5] = 0;
        city.production = 'WARRIOR';
        city.productionProgress = 4; // WARRIOR takes 4 turns
        const piecesBefore = engine.pieces.length;
        engine.checkAndCompleteProduction(city);
        assert.ok(engine.pieces.length > piecesBefore);
    });

    it('checkAndCompleteProduction does not complete below threshold', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        city.production = 'WARRIOR';
        city.productionProgress = 3; // Not yet 4
        const piecesBefore = engine.pieces.length;
        engine.checkAndCompleteProduction(city);
        assert.equal(engine.pieces.length, piecesBefore);
    });

    it('spawnUnit creates warrior adjacent to city', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        engine.tileOwnership[5][5] = 0;
        const piecesBefore = engine.pieces.length;
        engine.spawnUnit(city, PIECE_TYPES.WARRIOR);
        assert.equal(engine.pieces.length, piecesBefore + 1);
        const spawned = engine.pieces[engine.pieces.length - 1];
        assert.equal(spawned.type, PIECE_TYPES.WARRIOR);
        assert.equal(spawned.ownerId, 0);
        const dist = Math.max(Math.abs(spawned.row - 5), Math.abs(spawned.col - 5));
        assert.equal(dist, 1);
    });

    it('spawnUnit pauses production when no adjacent tile', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        // Block all adjacent tiles
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5 + dr, 5 + dc);
            }
        }
        engine.spawnUnit(city, PIECE_TYPES.WARRIOR);
        assert.ok(city.productionPaused);
    });

    it('completeProduction SCIENCE increments techScore', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        city.production = 'SCIENCE';
        city.productionProgress = 10;
        engine.completeProduction(city);
        assert.equal(engine.players[0].techScore, 1);
    });

    it('completeProduction SCIENCE applies tech bonus', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        const warrior = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 4, 4);
        city.production = 'SCIENCE';
        city.productionProgress = 10;
        const hpBefore = warrior.maxHp;
        const dmgBefore = warrior.damage;
        engine.completeProduction(city);
        assert.equal(warrior.maxHp, hpBefore + 1);
        assert.equal(warrior.damage, dmgBefore + 1);
    });

    it('completeProduction DIPLOMACY expands territory', function() {
        seedRandom(42);
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        engine.tileOwnership[5][5] = 0;
        city.production = 'DIPLOMACY';
        city.productionProgress = 4;

        // Count owned tiles before
        let tilesBefore = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (engine.tileOwnership[r][c] === 0) tilesBefore++;

        engine.completeProduction(city);

        let tilesAfter = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (engine.tileOwnership[r][c] === 0) tilesAfter++;

        assert.ok(tilesAfter > tilesBefore);
        restoreRandom();
    });

    it('completeProduction REPAIR heals city by 1', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        city.hp = 2;
        city.production = 'REPAIR';
        city.productionProgress = 1;
        engine.completeProduction(city);
        assert.equal(city.hp, 3);
    });

    it('completeProduction REPAIR does not exceed maxHp', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        city.hp = 4;
        city.maxHp = 4;
        city.production = 'REPAIR';
        city.productionProgress = 1;
        engine.completeProduction(city);
        assert.equal(city.hp, 4);
    });

    it('healAdjacentWarriors heals wounded unmoved warriors', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        w.maxHp = 3;
        w.hp = 1;
        w.hasMoved = false;
        engine.healAdjacentWarriors(city);
        assert.equal(w.hp, 2); // healed by 1
    });

    it('healAdjacentWarriors does not heal moved warriors', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        w.maxHp = 3;
        w.hp = 1;
        w.hasMoved = true;
        engine.healAdjacentWarriors(city);
        assert.equal(w.hp, 1); // not healed
    });

    it('healAdjacentWarriors does not heal non-adjacent warriors', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 8);
        w.maxHp = 3;
        w.hp = 1;
        w.hasMoved = false;
        engine.healAdjacentWarriors(city);
        assert.equal(w.hp, 1); // not healed - too far
    });

    it('repeat production resets progress and continues', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        engine.tileOwnership[5][5] = 0;
        city.production = 'WARRIOR';
        city.productionProgress = 4;
        city.repeatProduction = true;
        engine.completeProduction(city);
        assert.equal(city.production, 'WARRIOR');
        assert.equal(city.productionProgress, 0);
    });

    it('non-repeat production clears after completion', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        engine.tileOwnership[5][5] = 0;
        city.production = 'WARRIOR';
        city.productionProgress = 4;
        city.repeatProduction = false;
        engine.completeProduction(city);
        assert.equal(city.production, null);
        assert.equal(city.productionProgress, 0);
    });

    it('hasWoundedAdjacentWarrior detects wounded warrior', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        w.maxHp = 3;
        w.hp = 2;
        assert.ok(engine.hasWoundedAdjacentWarrior(city));
    });

    it('hasWoundedAdjacentWarrior returns false for full HP', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        w.maxHp = 1;
        w.hp = 1;
        assert.equal(engine.hasWoundedAdjacentWarrior(city), false);
    });

    it('repeat HEAL_WARRIORS stops when no wounded adjacent', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        city.production = 'HEAL_WARRIORS';
        city.productionProgress = 2;
        city.repeatProduction = true;
        engine.completeProduction(city);
        // No wounded adjacent warriors, so production should stop
        assert.equal(city.production, null);
    });

    it('repeat REPAIR stops when city at full HP', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        city.hp = 4;
        city.maxHp = 4;
        city.production = 'REPAIR';
        city.productionProgress = 1;
        city.repeatProduction = true;
        engine.completeProduction(city);
        assert.equal(city.production, null);
    });
});
