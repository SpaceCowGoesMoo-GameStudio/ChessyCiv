// ============================================
// INTEGRATION TESTS - Territory Flow
// ============================================

describe('Integration: Territory Flow', function() {
    it('auto-expansion at rounds 6, 12, 18', function() {
        seedRandom(42);
        const e = createScenario(2);
        const city = placePiece(e, PIECE_TYPES.CITY, 0, 5, 5);
        city.createdOnRound = 0;
        e.tileOwnership[5][5] = 0;
        // Need a second player city for endTurn
        placePiece(e, PIECE_TYPES.CITY, 1, 0, 0);
        e.tileOwnership[0][0] = 1;

        function countTiles() {
            let count = 0;
            for (let r = 0; r < BOARD_SIZE; r++)
                for (let c = 0; c < BOARD_SIZE; c++)
                    if (e.tileOwnership[r][c] === 0) count++;
            return count;
        }

        const initial = countTiles();

        // Advance to round 6 (12 endTurns for 2 players)
        for (let i = 0; i < 12; i++) e.endTurn();
        assert.equal(e.roundNumber, 6);
        const afterR6 = countTiles();
        assert.equal(afterR6, initial + 1);

        // Advance to round 12
        for (let i = 0; i < 12; i++) e.endTurn();
        assert.equal(e.roundNumber, 12);
        const afterR12 = countTiles();
        assert.equal(afterR12, afterR6 + 1);

        // Advance to round 18
        for (let i = 0; i < 12; i++) e.endTurn();
        assert.equal(e.roundNumber, 18);
        const afterR18 = countTiles();
        assert.equal(afterR18, afterR12 + 1);
        restoreRandom();
    });

    it('new city starts its own expansion schedule', function() {
        seedRandom(42);
        const e = createScenario(2);
        const city1 = placePiece(e, PIECE_TYPES.CITY, 0, 0, 0);
        city1.createdOnRound = 0;
        e.tileOwnership[0][0] = 0;
        placePiece(e, PIECE_TYPES.CITY, 1, 9, 9);
        e.tileOwnership[9][9] = 1;

        // Create a second city at round 6
        e.roundNumber = 6;
        const city2 = placePiece(e, PIECE_TYPES.CITY, 0, 5, 5);
        city2.createdOnRound = 6;
        e.tileOwnership[5][5] = 0;

        // At round 12, city1 expands (age=12, 12%6=0) and city2 expands (age=6, 6%6=0)
        e.roundNumber = 12;

        function countTiles() {
            let count = 0;
            for (let r = 0; r < BOARD_SIZE; r++)
                for (let c = 0; c < BOARD_SIZE; c++)
                    if (e.tileOwnership[r][c] === 0) count++;
            return count;
        }

        const before = countTiles();
        e.processAutomaticBorderExpansion();
        const after = countTiles();
        // Both cities should expand
        assert.equal(after, before + 2);
        restoreRandom();
    });

    it('diplomacy production claims territory from contiguous border', function() {
        seedRandom(42);
        const e = createScenario(2);
        const city = placePiece(e, PIECE_TYPES.CITY, 0, 5, 5);
        e.tileOwnership[5][5] = 0;

        function countTiles() {
            let count = 0;
            for (let r = 0; r < BOARD_SIZE; r++)
                for (let c = 0; c < BOARD_SIZE; c++)
                    if (e.tileOwnership[r][c] === 0) count++;
            return count;
        }

        const before = countTiles();
        e.expandTerritoryWithConquest(0, city);
        const after = countTiles();
        assert.equal(after, before + 1);
        restoreRandom();
    });

    it('city founding triggers territory ownership', function() {
        const e = createScenario(2);
        const s = placePiece(e, PIECE_TYPES.SETTLER, 0, 5, 5);
        e.tileOwnership[5][5] = 0;

        const result = e.settlerBuildCity(s);
        assert.ok(result.success);
        assert.equal(e.tileOwnership[5][5], 0);
        assert.equal(e.board[5][5].type, PIECE_TYPES.CITY);
    });
});
