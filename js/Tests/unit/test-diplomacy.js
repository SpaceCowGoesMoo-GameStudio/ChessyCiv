// ============================================
// UNIT TESTS - Diplomacy Module
// ============================================

describe('GameEngine Diplomacy', function() {
    let engine;

    beforeEach(function() {
        engine = createScenario(2);
    });

    it('canChangeRelation allows change after cooldown', function() {
        const result = engine.canChangeRelation(0, 1);
        assert.ok(result.canChange);
        assert.equal(result.roundsRemaining, 0);
    });

    it('canChangeRelation blocks during cooldown', function() {
        engine.players[0].relationsChangedRound[1] = 0;
        engine.roundNumber = 3;
        const result = engine.canChangeRelation(0, 1);
        assert.equal(result.canChange, false);
        assert.equal(result.roundsRemaining, 4); // 7 - 3
    });

    it('canChangeRelation exact boundary (7 rounds)', function() {
        engine.players[0].relationsChangedRound[1] = 0;
        engine.roundNumber = 7;
        const result = engine.canChangeRelation(0, 1);
        assert.ok(result.canChange);
        assert.equal(result.roundsRemaining, 0);
    });

    it('declareWar sets symmetric war status', function() {
        const result = engine.declareWar(0, 1);
        assert.ok(result);
        assert.equal(engine.players[0].relations[1], 'war');
        assert.equal(engine.players[1].relations[0], 'war');
    });

    it('declareWar updates relationsChangedRound', function() {
        engine.roundNumber = 5;
        engine.declareWar(0, 1);
        assert.equal(engine.players[0].relationsChangedRound[1], 5);
        assert.equal(engine.players[1].relationsChangedRound[0], 5);
    });

    it('declareWar on self returns false', function() {
        assert.equal(engine.declareWar(0, 0), false);
    });

    it('declareWar blocked by cooldown returns false', function() {
        engine.players[0].relationsChangedRound[1] = 0;
        engine.roundNumber = 3;
        assert.equal(engine.declareWar(0, 1), false);
    });

    it('proposePeace sets one-sided peace_proposed', function() {
        engine.declareWar(0, 1);
        engine.roundNumber = 100; // skip cooldown
        const result = engine.proposePeace(0, 1);
        assert.ok(result);
        assert.equal(engine.players[0].relations[1], 'peace_proposed');
        assert.equal(engine.players[1].relations[0], 'war'); // unchanged
    });

    it('proposePeace on self returns false', function() {
        assert.equal(engine.proposePeace(0, 0), false);
    });

    it('acceptPeace requires proposal', function() {
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        // Player 1 tries to accept without proposal
        assert.equal(engine.acceptPeace(1, 0), false);
    });

    it('acceptPeace sets symmetric peace', function() {
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        engine.proposePeace(0, 1);
        const result = engine.acceptPeace(1, 0);
        assert.ok(result);
        assert.equal(engine.players[0].relations[1], 'peace');
        assert.equal(engine.players[1].relations[0], 'peace');
    });

    it('acceptPeace updates relationsChangedRound', function() {
        engine.declareWar(0, 1);
        engine.roundNumber = 100;
        engine.proposePeace(0, 1);
        engine.acceptPeace(1, 0);
        assert.equal(engine.players[0].relationsChangedRound[1], 100);
        assert.equal(engine.players[1].relationsChangedRound[0], 100);
    });

    it('displacePiecesAfterPeace moves warriors out of enemy territory', function() {
        seedRandom(42);
        engine.players[0].relations[1] = 'war';
        engine.players[1].relations[0] = 'war';

        // Place player 0's warrior in player 1's territory
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 3, 3);
        engine.tileOwnership[3][3] = 1;

        engine.displacePiecesAfterPeace(0, 1);

        // Warrior should be displaced or destroyed
        if (engine.pieces.indexOf(w) !== -1) {
            // If still alive, should not be on player 1's territory
            assert.notEqual(engine.tileOwnership[w.row][w.col], 1);
        }
        restoreRandom();
    });

    it('displacePiecesAfterPeace moves settlers too', function() {
        seedRandom(42);
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 3, 3);
        engine.tileOwnership[3][3] = 1;

        engine.displacePiecesAfterPeace(0, 1);

        // Settler should be displaced or destroyed
        if (engine.pieces.indexOf(s) !== -1) {
            assert.notEqual(engine.tileOwnership[s.row][s.col], 1);
        }
        restoreRandom();
    });
});
