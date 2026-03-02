// ============================================
// INTEGRATION TESTS - Production Flow
// ============================================

describe('Integration: Production Flow', function() {
    it('warrior produced after 4 end-turns in 2-player game', function() {
        const e = createEngine(2);
        const cities = e.pieces.filter(p =>
            p.type === PIECE_TYPES.CITY && p.ownerId === 0
        );
        const city = cities[0];
        e.tileOwnership[city.row][city.col] = 0;
        e.setProduction(city, 'WARRIOR');

        const piecesBefore = e.pieces.length;

        // Each round = 2 endTurns (2 players)
        // Production advances on player 0's endTurn
        // Completes at start of player 0's next turn
        for (let i = 0; i < 8; i++) { // 4 rounds
            e.endTurn();
        }

        // After 4 rounds, warrior should be spawned
        const newWarriors = e.pieces.filter(p =>
            p.type === PIECE_TYPES.WARRIOR && p.ownerId === 0
        );
        assert.ok(newWarriors.length >= 2); // original + spawned
    });

    it('settler produced after 6 end-turns cycles', function() {
        const e = createEngine(2);
        const cities = e.pieces.filter(p =>
            p.type === PIECE_TYPES.CITY && p.ownerId === 0
        );
        const city = cities[0];
        e.tileOwnership[city.row][city.col] = 0;
        e.setProduction(city, 'SETTLER');

        // 6 rounds * 2 players = 12 endTurns
        for (let i = 0; i < 12; i++) {
            e.endTurn();
        }

        const settlers = e.pieces.filter(p =>
            p.type === PIECE_TYPES.SETTLER && p.ownerId === 0
        );
        assert.ok(settlers.length >= 1);
    });

    it('science production increments tech and boosts pieces', function() {
        const e = createEngine(2);
        const cities = e.pieces.filter(p =>
            p.type === PIECE_TYPES.CITY && p.ownerId === 0
        );
        const city = cities[0];
        e.setProduction(city, 'SCIENCE');

        const warriors = e.pieces.filter(p =>
            p.type === PIECE_TYPES.WARRIOR && p.ownerId === 0
        );
        const dmgBefore = warriors[0].damage;

        // 10 rounds * 2 players = 20 endTurns
        for (let i = 0; i < 20; i++) {
            e.endTurn();
        }

        assert.equal(e.players[0].techScore, 1);
        assert.equal(warriors[0].damage, dmgBefore + 1);
    });

    it('repeat production produces continuously', function() {
        const e = createEngine(2);
        const cities = e.pieces.filter(p =>
            p.type === PIECE_TYPES.CITY && p.ownerId === 0
        );
        const city = cities[0];
        e.tileOwnership[city.row][city.col] = 0;
        e.setProduction(city, 'WARRIOR');
        city.repeatProduction = true;

        // Run 16 endTurns (8 rounds) - should produce 2 warriors
        for (let i = 0; i < 16; i++) {
            e.endTurn();
        }

        const warriors = e.pieces.filter(p =>
            p.type === PIECE_TYPES.WARRIOR && p.ownerId === 0
        );
        assert.ok(warriors.length >= 3); // original + 2 produced
    });

    it('multi-city simultaneous production', function() {
        const e = createScenario(2);
        // Two cities for player 0
        const city1 = placePiece(e, PIECE_TYPES.CITY, 0, 0, 0);
        const city2 = placePiece(e, PIECE_TYPES.CITY, 0, 5, 5);
        e.tileOwnership[0][0] = 0;
        e.tileOwnership[5][5] = 0;
        // City for player 1
        placePiece(e, PIECE_TYPES.CITY, 1, 9, 9);
        e.tileOwnership[9][9] = 1;

        e.setProduction(city1, 'WARRIOR');
        e.setProduction(city2, 'WARRIOR');

        // 8 endTurns = 4 rounds
        for (let i = 0; i < 8; i++) {
            e.endTurn();
        }

        const warriors = e.pieces.filter(p =>
            p.type === PIECE_TYPES.WARRIOR && p.ownerId === 0
        );
        assert.ok(warriors.length >= 2, `Expected 2+ warriors, got ${warriors.length}`);
    });
});
