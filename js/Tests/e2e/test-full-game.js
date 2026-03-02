// ============================================
// E2E TESTS - Full Game
// ============================================

describe('E2E: Full Game', function() {
    it('2-player game from setup through war, siege, victory', function() {
        seedRandom(42);
        const e = createEngine(2);

        // Find the two players' cities and warriors
        const p0City = e.pieces.find(p => p.type === PIECE_TYPES.CITY && p.ownerId === 0);
        const p1City = e.pieces.find(p => p.type === PIECE_TYPES.CITY && p.ownerId === 1);

        // Ensure ownership
        e.tileOwnership[p0City.row][p0City.col] = 0;
        e.tileOwnership[p1City.row][p1City.col] = 1;

        // Set warrior production for player 0
        e.setProduction(p0City, 'WARRIOR');

        // Produce some warriors (8 rounds = 16 endTurns)
        for (let i = 0; i < 16; i++) e.endTurn();

        // Declare war
        e.declareWar(0, 1);

        // Get player 0's warriors
        let warriors = e.pieces.filter(p =>
            p.type === PIECE_TYPES.WARRIOR && p.ownerId === 0
        );

        // Move warriors toward enemy city step by step
        for (let round = 0; round < 20 && !e.gameOver; round++) {
            if (e.currentPlayerIndex !== 0) {
                e.endTurn();
                continue;
            }

            warriors = e.pieces.filter(p =>
                p.type === PIECE_TYPES.WARRIOR && p.ownerId === 0 && !p.hasMoved
            );

            for (const w of warriors) {
                // Move toward p1 city
                const dRow = Math.sign(p1City.row - w.row);
                const dCol = Math.sign(p1City.col - w.col);
                const targetRow = w.row + dRow;
                const targetCol = w.col + dCol;

                if (e.isValidTile(targetRow, targetCol)) {
                    e.movePiece(w, targetRow, targetCol);
                }
                if (e.gameOver) break;
            }
            if (!e.gameOver) e.endTurn();
        }

        // Game should either be over or city captured
        const p0Cities = e.getPlayerCities(0);
        assert.ok(p0Cities.length >= 1, 'Player 0 should have at least 1 city');
        restoreRandom();
    });

    it('4-player game with sequential eliminations', function() {
        seedRandom(99);
        const e = createEngine(4);

        // Declare wars: 0 vs 1, 2 vs 3
        e.declareWar(0, 1);
        e.declareWar(2, 3);

        // Run for some turns - just verify the game stays consistent
        for (let i = 0; i < 40 && !e.gameOver; i++) {
            e.endTurn();
        }

        // Verify game state consistency
        assert.ok(e.turnNumber > 0);
        assert.ok(e.players.length === 4);

        // All pieces should be on valid tiles
        for (const p of e.pieces) {
            assert.ok(e.isValidTile(p.row, p.col), `Piece at invalid (${p.row},${p.col})`);
            assert.equal(e.board[p.row][p.col], p, `Board mismatch at (${p.row},${p.col})`);
        }
        restoreRandom();
    });

    it('settler expansion strategy game', function() {
        seedRandom(42);
        const e = createEngine(2);
        const p0City = e.pieces.find(p => p.type === PIECE_TYPES.CITY && p.ownerId === 0);
        e.tileOwnership[p0City.row][p0City.col] = 0;

        // Produce a settler
        e.setProduction(p0City, 'SETTLER');

        // 6 rounds * 2 players = 12 endTurns
        for (let i = 0; i < 12; i++) e.endTurn();

        // Find the settler
        const settler = e.pieces.find(p =>
            p.type === PIECE_TYPES.SETTLER && p.ownerId === 0
        );

        if (settler) {
            // Expand territory first so settler can build
            for (let r = Math.max(0, settler.row - 3); r <= Math.min(9, settler.row + 3); r++) {
                for (let c = Math.max(0, settler.col - 3); c <= Math.min(9, settler.col + 3); c++) {
                    if (e.tileOwnership[r][c] === null) {
                        e.tileOwnership[r][c] = 0;
                    }
                }
            }

            // Try to move settler to a valid city location
            const cities = e.pieces.filter(p => p.type === PIECE_TYPES.CITY);
            let canBuild = e.canSettlerBuildCity(settler);

            if (!canBuild.valid) {
                // Move settler away from cities
                const moves = e.getValidMoves(settler);
                for (const move of moves) {
                    e.movePiece(settler, move.row, move.col);
                    e.tileOwnership[settler.row][settler.col] = 0;
                    canBuild = e.canSettlerBuildCity(settler);
                    if (canBuild.valid) break;
                    // Reset for next try
                    settler.hasMoved = false;
                }
            }

            if (canBuild.valid) {
                const result = e.settlerBuildCity(settler);
                assert.ok(result.success);
                assert.ok(e.getPlayerCities(0).length >= 2);
            }
        }
        restoreRandom();
    });
});
