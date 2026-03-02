// ============================================
// INTEGRATION TESTS - Diplomacy Flow
// ============================================

describe('Integration: Diplomacy Flow', function() {
    it('complete diplomatic cycle: peace -> war -> propose -> accept -> peace', function() {
        const e = createEngine(2);
        // Start at peace
        assert.equal(getPlayerRelation(e, 0, 1), 'peace');

        // Declare war
        e.declareWar(0, 1);
        assert.equal(getPlayerRelation(e, 0, 1), 'war');
        assert.equal(getPlayerRelation(e, 1, 0), 'war');

        // Cannot immediately propose peace (cooldown)
        assert.equal(e.proposePeace(0, 1), false);

        // Advance 7 complete rounds
        advanceRounds(e, 7);

        // Now propose peace
        assert.ok(e.proposePeace(0, 1));
        assert.equal(getPlayerRelation(e, 0, 1), 'peace_proposed');
        assert.equal(getPlayerRelation(e, 1, 0), 'war'); // still war from their side

        // Player 1 accepts
        assert.ok(e.acceptPeace(1, 0));
        assert.equal(getPlayerRelation(e, 0, 1), 'peace');
        assert.equal(getPlayerRelation(e, 1, 0), 'peace');
    });

    it('multi-player independent relations', function() {
        const e = createEngine(3);
        // Player 0 declares war on player 1 only
        e.declareWar(0, 1);

        assert.equal(getPlayerRelation(e, 0, 1), 'war');
        assert.equal(getPlayerRelation(e, 0, 2), 'peace');
        assert.equal(getPlayerRelation(e, 1, 2), 'peace');
    });

    it('piece displacement on peace after war', function() {
        seedRandom(42);
        const e = createScenario(2);
        placePiece(e, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(e, PIECE_TYPES.CITY, 1, 9, 9);
        e.tileOwnership[0][0] = 0;
        e.tileOwnership[9][9] = 1;

        // War
        e.declareWar(0, 1);

        // Place player 0's warrior in player 1's territory
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 9, 8);
        e.tileOwnership[9][8] = 1;

        // Skip cooldown
        e.roundNumber = 100;
        e.players[0].relationsChangedRound[1] = 0;
        e.players[1].relationsChangedRound[0] = 0;

        // Propose and accept peace
        e.proposePeace(0, 1);
        e.acceptPeace(1, 0);

        // Warrior should be displaced
        if (e.pieces.indexOf(w) !== -1) {
            assert.notEqual(e.tileOwnership[w.row][w.col], 1,
                'Warrior should not be on enemy territory after peace');
        }
        restoreRandom();
    });

    it('cannot declare war during cooldown after peace', function() {
        const e = createEngine(2);
        e.declareWar(0, 1);
        e.roundNumber = 100;
        e.players[0].relationsChangedRound[1] = 0;
        e.players[1].relationsChangedRound[0] = 0;

        // Make peace
        e.proposePeace(0, 1);
        e.acceptPeace(1, 0);

        // Try to declare war immediately
        assert.equal(e.declareWar(0, 1), false);

        // Advance 7 rounds from peace
        e.roundNumber += 7;
        assert.ok(e.declareWar(0, 1));
    });
});
