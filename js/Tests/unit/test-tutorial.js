// ============================================
// UNIT TESTS - Tutorial hint positioning
// ============================================
// Tests for _adjustTutorialToastForPiece and _getHumanPiece.
// _adjustTutorialToastForPiece shifts hint toasts up or down to avoid
// covering the highlighted board piece, staying within the board grid.

describe('Tutorial > _adjustTutorialToastForPiece', function() {
    // Recompute geometry the same way the method does, so tests stay correct
    // if the test environment's TILE_SIZE / BOARD_OFFSET ever change.
    const TS      = TILE_SIZE;                               // 60 at 1920px viewport
    const BO      = BOARD_OFFSET;                            // 40
    const BS      = BOARD_SIZE;                              // 10
    const defaultY = BO + Math.floor(BS * TS * 0.38);       // 268
    const toastH   = Math.ceil(TS * 1.5);                   // 90
    const gap      = Math.ceil(TS * 0.35);                  // 21
    const boardTop = BO;                                     // 40
    const boardBot = BO + BS * TS;                           // 640

    function makeToast() {
        // _normalTop starts at the default; style.top matches
        return { _normalTop: defaultY, style: { top: defaultY + 'px' } };
    }

    function makePiece(row) {
        return { type: PIECE_TYPES.CITY, ownerId: 0, row: row, col: 2 };
    }

    // Convenience: adjust and return the new _normalTop
    function adjust(toast, piece) {
        GameScene.prototype._adjustTutorialToastForPiece.call({}, toast, piece);
        return toast._normalTop;
    }

    // ── Guard cases ────────────────────────────────────────────────────────

    it('returns early without throwing when toast is null', function() {
        GameScene.prototype._adjustTutorialToastForPiece.call({}, null, makePiece(3));
        assert.ok(true);
    });

    it('resets toast to default position when piece is null', function() {
        // Simulate a toast that was previously moved
        const toast = makeToast();
        toast._normalTop = 999;
        toast.style.top = '999px';
        adjust(toast, null);
        assert.equal(toast._normalTop, defaultY,
            'toast should reset to default Y when no piece is given');
    });

    // ── No-overlap rows — toast should not move from default ───────────────

    it('does not reposition when piece is in the top rows (no overlap)', function() {
        for (const row of [0, 1, 2]) {
            const toast = makeToast();
            const newY = adjust(toast, makePiece(row));
            assert.equal(newY, defaultY, `row ${row}: toast should not move`);
        }
    });

    it('does not reposition when piece is in the bottom rows (no overlap)', function() {
        for (const row of [6, 7, 8, 9]) {
            const toast = makeToast();
            const newY = adjust(toast, makePiece(row));
            assert.equal(newY, defaultY, `row ${row}: toast should not move`);
        }
    });

    // ── Overlap rows — toast must move ─────────────────────────────────────

    it('pushes toast below piece when piece is in the upper half', function() {
        // Rows 3 and 4 overlap the default toast and are < BOARD_SIZE/2
        for (const row of [3, 4]) {
            const newY = adjust(makeToast(), makePiece(row));
            assert.greaterThan(newY, defaultY, `row ${row}: toast should move down`);
        }
    });

    it('pushes toast above piece when piece is in the lower half', function() {
        // Row 5 overlaps and is >= BOARD_SIZE/2
        const newY = adjust(makeToast(), makePiece(5));
        assert.lessThan(newY, defaultY, 'row 5: toast should move up');
    });

    it('repositioned toast no longer overlaps the piece tile', function() {
        for (const row of [3, 4, 5]) {
            const toast = makeToast();
            const newY = adjust(toast, makePiece(row));
            const pieceTop    = BO + row * TS;
            const pieceBottom = pieceTop + TS;
            const toastBottom = newY + toastH;
            const overlaps = newY < pieceBottom + gap && toastBottom > pieceTop - gap;
            assert.equal(overlaps, false,
                `row ${row}: repositioned toast still overlaps piece`);
        }
    });

    it('repositioned toast stays within the board grid', function() {
        for (const row of [3, 4, 5]) {
            const toast = makeToast();
            const newY = adjust(toast, makePiece(row));
            assert.ok(newY >= boardTop,
                `row ${row}: toast top (${newY}) is above board top (${boardTop})`);
            assert.ok(newY + toastH <= boardBot,
                `row ${row}: toast bottom (${newY + toastH}) exceeds board bottom (${boardBot})`);
        }
    });

    it('keeps _normalTop and style.top in sync after repositioning', function() {
        for (const row of [3, 4, 5]) {
            const toast = makeToast();
            adjust(toast, makePiece(row));
            assert.equal(toast.style.top, toast._normalTop + 'px',
                `row ${row}: style.top and _normalTop should match`);
        }
    });

    it('always starts from the default Y regardless of prior adjustment', function() {
        // Adjust for a row-3 piece (will move toast down), then adjust for a row-0
        // piece (no overlap) — the toast must return to defaultY, not stay shifted.
        const toast = makeToast();
        adjust(toast, makePiece(3));
        assert.notEqual(toast._normalTop, defaultY, 'sanity: row-3 should have moved toast');
        adjust(toast, makePiece(0));
        assert.equal(toast._normalTop, defaultY,
            'toast should reset to defaultY when new piece has no overlap');
    });

    // ── Exact position checks ──────────────────────────────────────────────
    // These pin the precise pixel values for the default test-env constants
    // (TILE_SIZE=60, BOARD_OFFSET=40) so any accidental regression is caught.

    it('places toast exactly below row-3 piece', function() {
        const pieceBottom = BO + 4 * TS;                        // 280
        const expected    = Math.min(pieceBottom + gap, boardBot - toastH); // 301
        assert.equal(adjust(makeToast(), makePiece(3)), expected);
    });

    it('places toast exactly below row-4 piece', function() {
        const pieceBottom = BO + 5 * TS;                        // 340
        const expected    = Math.min(pieceBottom + gap, boardBot - toastH); // 361
        assert.equal(adjust(makeToast(), makePiece(4)), expected);
    });

    it('places toast exactly above row-5 piece', function() {
        const pieceTop = BO + 5 * TS;                           // 340
        const expected = Math.max(pieceTop - gap - toastH, boardTop); // 229
        assert.equal(adjust(makeToast(), makePiece(5)), expected);
    });

    // ── Warrior pieces (step 3 uses WARRIOR, not CITY) ────────────────────

    it('works equally for warrior pieces at overlapping rows', function() {
        const warrior = { type: PIECE_TYPES.WARRIOR, ownerId: 0, row: 4, col: 3 };
        const newY = adjust(makeToast(), warrior);
        assert.greaterThan(newY, defaultY, 'warrior at row 4 should push toast down');
    });

    // ── offsetHeight is used when available ────────────────────────────────
    // On narrow/small screens the toast wraps to more lines and becomes taller
    // than the TILE_SIZE * 1.5 estimate.  The method must use the live
    // offsetHeight so those extra-tall toasts are also repositioned correctly.

    it('uses offsetHeight when available instead of the fixed estimate', function() {
        // With the estimate (toastH = 90), a piece at row 6 does NOT overlap:
        //   toastBottom = 268 + 90 = 358 <= pieceTop - gap = 400 - 21 = 379  ✓ no overlap
        // With a taller toast (offsetHeight = 150), it DOES overlap:
        //   toastBottom = 268 + 150 = 418 > 379  → overlap detected → toast must move
        const tallToast = {
            _normalTop: defaultY,
            offsetHeight: toastH + 60,      // simulates text-wrapping on a narrow screen
            style: { top: defaultY + 'px' }
        };
        const pieceAtRow6 = { type: PIECE_TYPES.CITY, ownerId: 0, row: 6, col: 0 };

        // Sanity: estimated-height path says no overlap for row 6
        const shortToast = makeToast(); // no offsetHeight property
        assert.equal(adjust(shortToast, pieceAtRow6), defaultY,
            'sanity: fixed estimate should report no overlap for row 6');

        // Actual: taller toast must be repositioned
        const newY = adjust(tallToast, pieceAtRow6);
        assert.notEqual(newY, defaultY,
            'tall toast (offsetHeight) should detect overlap that the estimate misses');
        assert.lessThan(newY, defaultY,
            'row 6 is in lower half so toast should move up');
    });
});

// ── _getHumanPiece helper ─────────────────────────────────────────────────────

describe('Tutorial > _getHumanPiece', function() {
    function makeEngineWithPieces(pieces, playerIsAI) {
        return {
            players: [{ isAI: playerIsAI === true }],
            pieces: pieces
        };
    }

    function get(engine, type) {
        return GameScene.prototype._getHumanPiece.call({ engine: engine }, type);
    }

    it('returns the city piece owned by the first human player', function() {
        const city = { type: PIECE_TYPES.CITY, ownerId: 0, row: 2, col: 2 };
        const engine = makeEngineWithPieces([city], false);
        const result = get(engine, PIECE_TYPES.CITY);
        assert.ok(result === city, 'should return the city piece');
    });

    it('returns null when the only player is AI', function() {
        const city = { type: PIECE_TYPES.CITY, ownerId: 0, row: 2, col: 2 };
        const engine = makeEngineWithPieces([city], true);
        const result = get(engine, PIECE_TYPES.CITY);
        assert.equal(result, null);
    });

    it('returns null when no piece of the requested type exists', function() {
        const engine = makeEngineWithPieces([], false);
        const result = get(engine, PIECE_TYPES.CITY);
        assert.equal(result, null);
    });

    it('returns null when engine is absent', function() {
        const result = GameScene.prototype._getHumanPiece.call({ engine: null }, PIECE_TYPES.CITY);
        assert.equal(result, null);
    });

    it('finds warrior independently of city', function() {
        const warrior = { type: PIECE_TYPES.WARRIOR, ownerId: 0, row: 3, col: 3 };
        const city    = { type: PIECE_TYPES.CITY,    ownerId: 0, row: 0, col: 0 };
        const engine  = makeEngineWithPieces([city, warrior], false);
        const result  = get(engine, PIECE_TYPES.WARRIOR);
        assert.ok(result === warrior, 'should return the warrior piece');
    });
});
