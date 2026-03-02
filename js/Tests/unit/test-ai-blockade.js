// ============================================
// UNIT TESTS - AI Blockade Strategy
// ============================================

describe('AI Blockade Strategy', function() {

    // Helper: create an AI instance with blockade enabled and a city at (row, col)
    function createBlockadeAI(row, col) {
        const engine = createScenario(2);
        placePiece(engine, PIECE_TYPES.CITY, 0, row, col);
        const ai = new CivChessAI(engine, 0, AI_PERSONALITY.EXPANSIONIST, AI_DIFFICULTY.MEDIUM);
        ai.useBlockadeStrategy = true;
        ai.gameState = {
            ownPieces: { cities: [{ row, col }], warriors: [], settlers: [] },
            enemyPieces: {},
            relations: {}
        };
        return ai;
    }

    function posKey(pos) { return `${pos.row},${pos.col}`; }
    function posSet(positions) { return new Set(positions.map(posKey)); }

    // ---- Corner detection ----

    it('upper-left corner city uses 3-position diagonal blockade', function() {
        const ai = createBlockadeAI(0, 0);
        ai.initializeBlockadePositions();
        const keys = posSet(ai.blockadePositions);
        assert.equal(ai.blockadePositions.length, 3);
        assert.ok(keys.has('0,2'), 'missing (0,2)');
        assert.ok(keys.has('1,1'), 'missing (1,1)');
        assert.ok(keys.has('2,0'), 'missing (2,0)');
        assert.equal(ai.startingCorner, 'upper-left');
    });

    it('upper-right corner city uses 3-position diagonal blockade', function() {
        const ai = createBlockadeAI(0, 9);
        ai.initializeBlockadePositions();
        const keys = posSet(ai.blockadePositions);
        assert.equal(ai.blockadePositions.length, 3);
        assert.ok(keys.has('0,7'), 'missing (0,7)');
        assert.ok(keys.has('1,8'), 'missing (1,8)');
        assert.ok(keys.has('2,9'), 'missing (2,9)');
        assert.equal(ai.startingCorner, 'upper-right');
    });

    it('lower-left corner city uses 3-position diagonal blockade', function() {
        const ai = createBlockadeAI(9, 0);
        ai.initializeBlockadePositions();
        const keys = posSet(ai.blockadePositions);
        assert.equal(ai.blockadePositions.length, 3);
        assert.ok(keys.has('7,0'), 'missing (7,0)');
        assert.ok(keys.has('8,1'), 'missing (8,1)');
        assert.ok(keys.has('9,2'), 'missing (9,2)');
        assert.equal(ai.startingCorner, 'lower-left');
    });

    it('lower-right corner city uses 3-position diagonal blockade', function() {
        const ai = createBlockadeAI(9, 9);
        ai.initializeBlockadePositions();
        const keys = posSet(ai.blockadePositions);
        assert.equal(ai.blockadePositions.length, 3);
        assert.ok(keys.has('7,9'), 'missing (7,9)');
        assert.ok(keys.has('8,8'), 'missing (8,8)');
        assert.ok(keys.has('9,7'), 'missing (9,7)');
        assert.equal(ai.startingCorner, 'lower-right');
    });

    it('city at corner boundary (2,2) still uses corner diagonal', function() {
        const ai = createBlockadeAI(2, 2);
        ai.initializeBlockadePositions();
        assert.equal(ai.startingCorner, 'upper-left');
        assert.equal(ai.blockadePositions.length, 3);
    });

    it('city just outside corner boundary (3,3) uses surround pattern', function() {
        const ai = createBlockadeAI(3, 3);
        ai.initializeBlockadePositions();
        assert.ok(ai.startingCorner.startsWith('city_'));
        assert.ok(ai.blockadePositions.length > 3);
    });

    // ---- Corner zone coverage: all positions in the 3×3 corner zones ----

    it('all upper-left corner zone positions use the same diagonal', function() {
        const expected = [{ row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 0 }];
        for (let r = 0; r <= 2; r++) {
            for (let c = 0; c <= 2; c++) {
                const ai = createBlockadeAI(r, c);
                ai.initializeBlockadePositions();
                assert.equal(ai.startingCorner, 'upper-left',
                    `city at (${r},${c}) should be upper-left`);
                assert.equal(ai.blockadePositions.length, 3,
                    `city at (${r},${c}) should have 3 positions`);
                const keys = posSet(ai.blockadePositions);
                for (const p of expected) {
                    assert.ok(keys.has(posKey(p)),
                        `city at (${r},${c}) missing blockade pos (${p.row},${p.col})`);
                }
            }
        }
    });

    it('all upper-right corner zone positions use the same diagonal', function() {
        const expected = [{ row: 0, col: 7 }, { row: 1, col: 8 }, { row: 2, col: 9 }];
        for (let r = 0; r <= 2; r++) {
            for (let c = 7; c <= 9; c++) {
                const ai = createBlockadeAI(r, c);
                ai.initializeBlockadePositions();
                assert.equal(ai.startingCorner, 'upper-right',
                    `city at (${r},${c}) should be upper-right`);
                assert.equal(ai.blockadePositions.length, 3,
                    `city at (${r},${c}) should have 3 positions`);
                const keys = posSet(ai.blockadePositions);
                for (const p of expected) {
                    assert.ok(keys.has(posKey(p)),
                        `city at (${r},${c}) missing blockade pos (${p.row},${p.col})`);
                }
            }
        }
    });

    it('all lower-left corner zone positions use the same diagonal', function() {
        const expected = [{ row: 7, col: 0 }, { row: 8, col: 1 }, { row: 9, col: 2 }];
        for (let r = 7; r <= 9; r++) {
            for (let c = 0; c <= 2; c++) {
                const ai = createBlockadeAI(r, c);
                ai.initializeBlockadePositions();
                assert.equal(ai.startingCorner, 'lower-left',
                    `city at (${r},${c}) should be lower-left`);
                assert.equal(ai.blockadePositions.length, 3,
                    `city at (${r},${c}) should have 3 positions`);
                const keys = posSet(ai.blockadePositions);
                for (const p of expected) {
                    assert.ok(keys.has(posKey(p)),
                        `city at (${r},${c}) missing blockade pos (${p.row},${p.col})`);
                }
            }
        }
    });

    it('all lower-right corner zone positions use the same diagonal', function() {
        const expected = [{ row: 7, col: 9 }, { row: 8, col: 8 }, { row: 9, col: 7 }];
        for (let r = 7; r <= 9; r++) {
            for (let c = 7; c <= 9; c++) {
                const ai = createBlockadeAI(r, c);
                ai.initializeBlockadePositions();
                assert.equal(ai.startingCorner, 'lower-right',
                    `city at (${r},${c}) should be lower-right`);
                assert.equal(ai.blockadePositions.length, 3,
                    `city at (${r},${c}) should have 3 positions`);
                const keys = posSet(ai.blockadePositions);
                for (const p of expected) {
                    assert.ok(keys.has(posKey(p)),
                        `city at (${r},${c}) missing blockade pos (${p.row},${p.col})`);
                }
            }
        }
    });

    it('first tile outside each corner zone uses surround pattern', function() {
        // (3,3) is just outside all four corner zones
        const nonCorners = [
            { row: 3, col: 3 }, { row: 3, col: 6 },
            { row: 6, col: 3 }, { row: 6, col: 6 }
        ];
        for (const { row, col } of nonCorners) {
            const ai = createBlockadeAI(row, col);
            ai.initializeBlockadePositions();
            assert.ok(ai.startingCorner.startsWith('city_'),
                `city at (${row},${col}) should use surround, not corner diagonal`);
        }
    });

    // ---- Surround pattern ----

    it('center city (5,5) produces 12 surround positions', function() {
        const ai = createBlockadeAI(5, 5);
        ai.initializeBlockadePositions();
        assert.equal(ai.blockadePositions.length, 12);
    });

    it('surround positions are all at Chebyshev distance 2 from city', function() {
        const ai = createBlockadeAI(5, 5);
        ai.initializeBlockadePositions();
        for (const pos of ai.blockadePositions) {
            const dist = Math.max(Math.abs(pos.row - 5), Math.abs(pos.col - 5));
            assert.equal(dist, 2, `Position (${pos.row},${pos.col}) not at distance 2`);
        }
    });

    it('surround pattern excludes the 4 diagonal corners of the 5x5 grid', function() {
        const ai = createBlockadeAI(5, 5);
        ai.initializeBlockadePositions();
        const keys = posSet(ai.blockadePositions);
        assert.ok(!keys.has('3,3'), 'diagonal corner (3,3) should be excluded');
        assert.ok(!keys.has('3,7'), 'diagonal corner (3,7) should be excluded');
        assert.ok(!keys.has('7,3'), 'diagonal corner (7,3) should be excluded');
        assert.ok(!keys.has('7,7'), 'diagonal corner (7,7) should be excluded');
    });

    it('surround positions near board edge are clipped to valid bounds', function() {
        const ai = createBlockadeAI(1, 5);
        ai.initializeBlockadePositions();
        for (const pos of ai.blockadePositions) {
            assert.ok(pos.row >= 0 && pos.row < BOARD_SIZE,
                `row ${pos.row} out of bounds`);
            assert.ok(pos.col >= 0 && pos.col < BOARD_SIZE,
                `col ${pos.col} out of bounds`);
        }
        // row -1 and row -2 are off-board, so fewer than 12 positions
        assert.ok(ai.blockadePositions.length < 12);
    });

    it('startingCityPos is recorded on initialization', function() {
        const ai = createBlockadeAI(4, 6);
        ai.initializeBlockadePositions();
        assert.equal(ai.startingCityPos.row, 4);
        assert.equal(ai.startingCityPos.col, 6);
    });

    // ---- isBlockadePosition ----

    it('isBlockadePosition returns true for each blockade position', function() {
        const ai = createBlockadeAI(0, 0);
        ai.initializeBlockadePositions();
        assert.ok(ai.isBlockadePosition(0, 2));
        assert.ok(ai.isBlockadePosition(1, 1));
        assert.ok(ai.isBlockadePosition(2, 0));
    });

    it('isBlockadePosition returns false for non-blockade positions', function() {
        const ai = createBlockadeAI(0, 0);
        ai.initializeBlockadePositions();
        assert.ok(!ai.isBlockadePosition(0, 0));
        assert.ok(!ai.isBlockadePosition(5, 5));
        assert.ok(!ai.isBlockadePosition(3, 3));
    });

    // ---- isBlockadeComplete ----

    it('isBlockadeComplete returns false when positions are empty', function() {
        const ai = createBlockadeAI(0, 0);
        ai.initializeBlockadePositions();
        assert.equal(ai.isBlockadeComplete(), false);
    });

    it('isBlockadeComplete returns true when all positions filled with own warriors', function() {
        const ai = createBlockadeAI(0, 0);
        ai.initializeBlockadePositions();
        for (const pos of ai.blockadePositions) {
            placePiece(ai.engine, PIECE_TYPES.WARRIOR, 0, pos.row, pos.col);
        }
        assert.equal(ai.isBlockadeComplete(), true);
    });

    it('isBlockadeComplete returns false when only some positions are filled', function() {
        const ai = createBlockadeAI(0, 0);
        ai.initializeBlockadePositions();
        placePiece(ai.engine, PIECE_TYPES.WARRIOR, 0,
            ai.blockadePositions[0].row, ai.blockadePositions[0].col);
        assert.equal(ai.isBlockadeComplete(), false);
    });

    it('isBlockadeComplete returns false when positions filled by enemy warriors', function() {
        const ai = createBlockadeAI(0, 0);
        ai.initializeBlockadePositions();
        for (const pos of ai.blockadePositions) {
            placePiece(ai.engine, PIECE_TYPES.WARRIOR, 1, pos.row, pos.col);
        }
        assert.equal(ai.isBlockadeComplete(), false);
    });

    // ---- isBlockadePaused ----

    it('isBlockadePaused returns false when peaceful and no nearby enemies', function() {
        const ai = createBlockadeAI(5, 5);
        ai.initializeBlockadePositions();
        assert.equal(ai.isBlockadePaused(), false);
    });

    it('isBlockadePaused returns true when at war', function() {
        const ai = createBlockadeAI(5, 5);
        ai.initializeBlockadePositions();
        ai.gameState.relations = { 1: { status: 'war' } };
        assert.equal(ai.isBlockadePaused(), true);
    });

    it('isBlockadePaused returns true when enemy warrior is exactly 2 tiles away', function() {
        const ai = createBlockadeAI(5, 5);
        ai.initializeBlockadePositions();
        placePiece(ai.engine, PIECE_TYPES.WARRIOR, 1, 5, 7);
        assert.equal(ai.isBlockadePaused(), true);
    });

    it('isBlockadePaused returns true when enemy warrior is within 1 tile', function() {
        const ai = createBlockadeAI(5, 5);
        ai.initializeBlockadePositions();
        placePiece(ai.engine, PIECE_TYPES.WARRIOR, 1, 5, 6);
        assert.equal(ai.isBlockadePaused(), true);
    });

    it('isBlockadePaused returns false when enemy warrior is 3 tiles away', function() {
        const ai = createBlockadeAI(5, 5);
        ai.initializeBlockadePositions();
        placePiece(ai.engine, PIECE_TYPES.WARRIOR, 1, 5, 8);
        assert.equal(ai.isBlockadePaused(), false);
    });

    it('isBlockadePaused ignores nearby enemy cities', function() {
        const ai = createBlockadeAI(5, 5);
        ai.initializeBlockadePositions();
        placePiece(ai.engine, PIECE_TYPES.CITY, 1, 5, 6);
        assert.equal(ai.isBlockadePaused(), false);
    });

    it('isBlockadePaused ignores own warriors near the city', function() {
        const ai = createBlockadeAI(5, 5);
        ai.initializeBlockadePositions();
        placePiece(ai.engine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        assert.equal(ai.isBlockadePaused(), false);
    });
});
