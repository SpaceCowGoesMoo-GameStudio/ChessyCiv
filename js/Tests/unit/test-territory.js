// ============================================
// UNIT TESTS - Territory Module
// ============================================

describe('GameEngine Territory', function() {
    let engine;

    beforeEach(function() {
        engine = createScenario(2);
    });

    it('expandTerritoryWithConquest claims unowned tile from city border', function() {
        seedRandom(42);
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        engine.tileOwnership[5][5] = 0;

        let tilesBefore = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (engine.tileOwnership[r][c] === 0) tilesBefore++;

        engine.expandTerritoryWithConquest(0, city);

        let tilesAfter = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (engine.tileOwnership[r][c] === 0) tilesAfter++;

        assert.equal(tilesAfter, tilesBefore + 1);
        restoreRandom();
    });

    it('expandTerritoryWithConquest prefers unowned over enemy tiles', function() {
        seedRandom(42);
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 0, 0);
        engine.tileOwnership[0][0] = 0;
        // Surround with mix of unowned and enemy tiles
        engine.tileOwnership[0][1] = 1;
        engine.tileOwnership[1][0] = 1;
        // (1,1) is unowned

        engine.expandTerritoryWithConquest(0, city);

        // Should claim (1,1) which is unowned
        assert.equal(engine.tileOwnership[1][1], 0);
        restoreRandom();
    });

    it('expandTerritoryRadial expands outward from city', function() {
        seedRandom(42);
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        engine.tileOwnership[5][5] = 0;

        engine.expandTerritoryRadial(0, city);

        let tilesOwned = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (engine.tileOwnership[r][c] === 0) tilesOwned++;

        assert.equal(tilesOwned, 2); // original + 1 new
        restoreRandom();
    });

    it('claimTile sets tile ownership', function() {
        engine.claimTile(0, 5, 5);
        assert.equal(engine.tileOwnership[5][5], 0);
    });

    it('claimTile displaces enemy warrior at peace', function() {
        seedRandom(42);
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 1, 5, 5);
        // At peace - should displace
        engine.claimTile(0, 5, 5);
        // Warrior should have been displaced or destroyed
        assert.equal(engine.tileOwnership[5][5], 0);
        restoreRandom();
    });

    it('claimTile does not displace enemy warrior at war', function() {
        engine.players[0].relations[1] = 'war';
        engine.players[1].relations[0] = 'war';
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 1, 5, 5);
        engine.claimTile(0, 5, 5);
        // Warrior stays (not displaced during war)
        assert.equal(engine.board[5][5], w);
    });

    it('claimTile captures enemy city', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 1, 5, 5);
        engine.claimTile(0, 5, 5);
        assert.equal(city.ownerId, 0);
        assert.equal(engine.tileOwnership[5][5], 0);
    });

    it('handlePieceDisplacement moves piece to nearest valid tile', function() {
        seedRandom(100);
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 1, 5, 5);
        engine.tileOwnership[5][5] = 1;
        // Some adjacent tiles are unowned
        engine.handlePieceDisplacement(w, 0);
        // Warrior should have moved to a new position
        assert.ok(w.row !== 5 || w.col !== 5 || engine.pieces.indexOf(w) === -1);
        restoreRandom();
    });

    it('findNearestDisplacementTile finds unowned empty tile', function() {
        // Place piece at (5,5), surround with player 0's territory
        engine.tileOwnership[4][5] = 0;
        engine.tileOwnership[5][4] = 0;
        engine.tileOwnership[5][6] = 0;
        engine.tileOwnership[6][5] = 0;
        // But (4,4) is unowned and empty
        const result = engine.findNearestDisplacementTile(5, 5, 1);
        assert.ok(result !== null);
        const tOwner = engine.tileOwnership[result.row][result.col];
        assert.ok(tOwner === null || tOwner === 1);
    });

    it('findNearestDisplacementTile returns null when no valid tile', function() {
        // Fill entire board with player 0's territory and pieces
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                engine.tileOwnership[r][c] = 0;
                if (r !== 5 || c !== 5) {
                    placePiece(engine, PIECE_TYPES.WARRIOR, 0, r, c);
                }
            }
        }
        const result = engine.findNearestDisplacementTile(5, 5, 1);
        assert.equal(result, null);
    });

    it('isValidDisplacementTile checks empty and ownership', function() {
        assert.ok(engine.isValidDisplacementTile(5, 5, 0)); // unowned, empty
        engine.tileOwnership[5][5] = 0;
        assert.ok(engine.isValidDisplacementTile(5, 5, 0)); // own territory, empty
        engine.tileOwnership[5][5] = 1;
        assert.equal(engine.isValidDisplacementTile(5, 5, 0), false); // enemy territory
        placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        assert.equal(engine.isValidDisplacementTile(5, 6, 0), false); // occupied
    });

    it('applyTechBonus increases warrior maxHp, hp, and damage', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const hpBefore = w.hp;
        const maxBefore = w.maxHp;
        const dmgBefore = w.damage;
        engine.applyTechBonus(0);
        assert.equal(w.hp, hpBefore + 1);
        assert.equal(w.maxHp, maxBefore + 1);
        assert.equal(w.damage, dmgBefore + 1);
    });

    it('applyTechBonus increases city maxHp and hp but not damage', function() {
        const c = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        const hpBefore = c.hp;
        const dmgBefore = c.damage;
        engine.applyTechBonus(0);
        assert.equal(c.hp, hpBefore + 1);
        assert.equal(c.maxHp, c.hp);
        assert.equal(c.damage, dmgBefore); // unchanged
    });

    it('applyTechBonus does not affect other players pieces', function() {
        const w0 = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const w1 = placePiece(engine, PIECE_TYPES.WARRIOR, 1, 3, 3);
        const dmg1 = w1.damage;
        engine.applyTechBonus(0);
        assert.equal(w1.damage, dmg1); // unchanged
    });
});
