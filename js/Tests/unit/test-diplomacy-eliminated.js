// ============================================
// UNIT TESTS - Diplomacy with Eliminated Players
// ============================================

describe('Diplomacy with eliminated players', function() {
    let engine;

    beforeEach(function() {
        engine = createScenario(3);
    });

    // ---- canChangeRelation blocks eliminated players ----

    it('canChangeRelation returns false when acting player is eliminated', function() {
        engine.players[0].eliminated = true;
        const result = engine.canChangeRelation(0, 1);
        assert.equal(result.canChange, false);
    });

    it('canChangeRelation returns false when target player is eliminated', function() {
        engine.players[1].eliminated = true;
        const result = engine.canChangeRelation(0, 1);
        assert.equal(result.canChange, false);
    });

    // ---- declareWar blocked for eliminated players ----

    it('declareWar on eliminated player returns false', function() {
        engine.players[1].eliminated = true;
        assert.equal(engine.declareWar(0, 1), false);
    });

    it('eliminated player cannot declare war', function() {
        engine.players[0].eliminated = true;
        assert.equal(engine.declareWar(0, 1), false);
    });

    // ---- proposePeace blocked for eliminated players ----

    it('proposePeace to eliminated player returns false', function() {
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        engine.players[1].eliminated = true;
        assert.equal(engine.proposePeace(0, 1), false);
    });

    it('eliminated player cannot propose peace', function() {
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        engine.players[0].eliminated = true;
        assert.equal(engine.proposePeace(0, 1), false);
    });

    // ---- rescindPeace blocked for eliminated players ----

    it('rescindPeace returns false when target is eliminated', function() {
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        engine.proposePeace(0, 1);
        engine.players[1].eliminated = true;
        assert.equal(engine.rescindPeace(0, 1), false);
    });

    it('eliminated player cannot rescind peace', function() {
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        engine.proposePeace(0, 1);
        engine.players[0].eliminated = true;
        assert.equal(engine.rescindPeace(0, 1), false);
    });

    // ---- acceptPeace blocked for eliminated players ----

    it('acceptPeace returns false when proposer is eliminated', function() {
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        engine.proposePeace(0, 1);
        engine.players[0].eliminated = true;
        assert.equal(engine.acceptPeace(1, 0), false);
    });

    it('eliminated player cannot accept peace', function() {
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        engine.proposePeace(0, 1);
        engine.players[1].eliminated = true;
        assert.equal(engine.acceptPeace(1, 0), false);
    });

    // ---- Elimination cleans up pending peace proposals ----

    it('elimination reverts outgoing peace_proposed to war', function() {
        // Player 0 proposes peace to player 1, then gets eliminated
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        engine.proposePeace(0, 1);
        assert.equal(engine.players[0].relations[1], 'peace_proposed');

        // Give player 1 a city and player 0 none so elimination triggers
        placePiece(engine, PIECE_TYPES.CITY, 1, 0, 0);
        engine.tileOwnership[0][0] = 1;
        // Trigger elimination directly
        engine.players[0].eliminated = false; // reset for checkPlayerElimination
        engine.currentPlayerIndex = 1;
        engine.checkPlayerElimination(0);

        assert.equal(engine.players[0].eliminated, true);
        assert.equal(engine.players[0].relations[1], 'war');
    });

    it('elimination reverts incoming peace_proposed to war', function() {
        // Player 1 proposes peace to player 0, then player 0 gets eliminated
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        engine.proposePeace(1, 0);
        assert.equal(engine.players[1].relations[0], 'peace_proposed');

        // Give player 1 a city and player 0 none
        placePiece(engine, PIECE_TYPES.CITY, 1, 0, 0);
        engine.tileOwnership[0][0] = 1;
        engine.currentPlayerIndex = 1;
        engine.checkPlayerElimination(0);

        assert.equal(engine.players[0].eliminated, true);
        assert.equal(engine.players[1].relations[0], 'war');
    });

    // ---- Key scenario: mutual peace after defeat is impossible ----

    it('peace proposal that became mutual after defeat cannot be accepted', function() {
        // Setup: 3 players. Player 0 proposes peace to player 1.
        // Player 2 eliminates player 0. Player 1 then tries to accept.
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        engine.proposePeace(0, 1);
        assert.equal(engine.players[0].relations[1], 'peace_proposed');

        // Player 2 eliminates player 0 (no cities left)
        placePiece(engine, PIECE_TYPES.CITY, 1, 0, 0);
        placePiece(engine, PIECE_TYPES.CITY, 2, 9, 9);
        engine.tileOwnership[0][0] = 1;
        engine.tileOwnership[9][9] = 2;
        engine.currentPlayerIndex = 2;
        engine.checkPlayerElimination(0);

        assert.equal(engine.players[0].eliminated, true);
        // The peace proposal should have been cleaned up
        assert.equal(engine.players[0].relations[1], 'war');
        // Even if somehow the relation wasn't cleaned, acceptPeace should still fail
        assert.equal(engine.acceptPeace(1, 0), false);
    });

    // ---- Relations with non-eliminated players are unaffected ----

    it('elimination only cleans up relations involving the eliminated player', function() {
        // Player 1 and player 2 are at war with a pending peace proposal
        engine.declareWar(1, 2);
        engine.roundNumber = 100;
        engine.proposePeace(1, 2);
        assert.equal(engine.players[1].relations[2], 'peace_proposed');

        // Eliminate player 0 — should not affect player 1↔2 relations
        placePiece(engine, PIECE_TYPES.CITY, 1, 0, 0);
        placePiece(engine, PIECE_TYPES.CITY, 2, 9, 9);
        engine.tileOwnership[0][0] = 1;
        engine.tileOwnership[9][9] = 2;
        engine.currentPlayerIndex = 1;
        engine.checkPlayerElimination(0);

        assert.equal(engine.players[0].eliminated, true);
        // Player 1↔2 peace proposal should be untouched
        assert.equal(engine.players[1].relations[2], 'peace_proposed');
        assert.equal(engine.players[2].relations[1], 'war');
    });
});
