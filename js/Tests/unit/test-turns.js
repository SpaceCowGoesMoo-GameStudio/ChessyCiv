// ============================================
// UNIT TESTS - Turns Module
// ============================================

describe('GameEngine Turns', function() {
    let engine;

    beforeEach(function() {
        engine = createEngine(2);
    });

    it('endTurn advances to next player', function() {
        assert.equal(engine.currentPlayerIndex, 0);
        engine.endTurn();
        assert.equal(engine.currentPlayerIndex, 1);
    });

    it('endTurn wraps around to first player', function() {
        engine.endTurn(); // 0 -> 1
        engine.endTurn(); // 1 -> 0
        assert.equal(engine.currentPlayerIndex, 0);
    });

    it('endTurn increments turnNumber', function() {
        const before = engine.turnNumber;
        engine.endTurn();
        assert.equal(engine.turnNumber, before + 1);
    });

    it('endTurn increments roundNumber after full round', function() {
        assert.equal(engine.roundNumber, 0);
        engine.endTurn(); // player 0 -> 1
        assert.equal(engine.roundNumber, 0);
        engine.endTurn(); // player 1 -> 0, completes round
        assert.equal(engine.roundNumber, 1);
    });

    it('endTurn skips eliminated players', function() {
        const e = createEngine(3);
        e.players[1].eliminated = true;
        assert.equal(e.currentPlayerIndex, 0);
        e.endTurn(); // should skip player 1
        assert.equal(e.currentPlayerIndex, 2);
    });

    it('endTurn advances production for current player cities', function() {
        const cities = engine.pieces.filter(p =>
            p.type === PIECE_TYPES.CITY && p.ownerId === 0
        );
        cities[0].production = 'WARRIOR';
        cities[0].productionProgress = 0;
        engine.endTurn();
        assert.equal(cities[0].productionProgress, 1);
    });

    it('endTurn resets hasMoved for current player', function() {
        const warriors = engine.pieces.filter(p =>
            p.type === PIECE_TYPES.WARRIOR && p.ownerId === 0
        );
        warriors[0].hasMoved = true;
        engine.endTurn();
        assert.equal(warriors[0].hasMoved, false);
    });

    it('endTurn completes production at start of next turn', function() {
        // Set up city with completed production for player 1
        const p1Cities = engine.pieces.filter(p =>
            p.type === PIECE_TYPES.CITY && p.ownerId === 1
        );
        p1Cities[0].production = 'WARRIOR';
        p1Cities[0].productionProgress = 4; // already at threshold
        engine.tileOwnership[p1Cities[0].row][p1Cities[0].col] = 1;

        const piecesBefore = engine.pieces.length;
        // End player 0's turn -> now player 1's turn -> production completes
        engine.endTurn();
        // Player 1 should have had production completed (spawn warrior)
        assert.ok(engine.pieces.length > piecesBefore);
    });

    it('processAutomaticBorderExpansion expands every 6 rounds', function() {
        seedRandom(42);
        const e = createScenario(2);
        const city = placePiece(e, PIECE_TYPES.CITY, 0, 5, 5);
        city.createdOnRound = 0;
        e.tileOwnership[5][5] = 0;
        e.roundNumber = 6;

        let before = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (e.tileOwnership[r][c] === 0) before++;

        e.processAutomaticBorderExpansion();

        let after = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (e.tileOwnership[r][c] === 0) after++;

        assert.equal(after, before + 1);
        restoreRandom();
    });

    it('processAutomaticBorderExpansion does not expand on non-6-round', function() {
        const e = createScenario(2);
        const city = placePiece(e, PIECE_TYPES.CITY, 0, 5, 5);
        city.createdOnRound = 0;
        e.tileOwnership[5][5] = 0;
        e.roundNumber = 5; // not 6

        let before = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (e.tileOwnership[r][c] === 0) before++;

        e.processAutomaticBorderExpansion();

        let after = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (e.tileOwnership[r][c] === 0) after++;

        assert.equal(after, before);
    });

    it('round tracking works correctly in 4-player game', function() {
        const e = createEngine(4);
        assert.equal(e.roundNumber, 0);
        e.endTurn(); // p0->p1
        e.endTurn(); // p1->p2
        e.endTurn(); // p2->p3
        assert.equal(e.roundNumber, 0);
        e.endTurn(); // p3->p0, completes round
        assert.equal(e.roundNumber, 1);
    });

    it('round tracking correct with eliminated player', function() {
        const e = createEngine(3);
        e.players[1].eliminated = true;
        assert.equal(e.roundNumber, 0);
        e.endTurn(); // p0 -> p2 (skips p1)
        assert.equal(e.roundNumber, 0);
        e.endTurn(); // p2 -> p0, completes round
        assert.equal(e.roundNumber, 1);
    });
});
