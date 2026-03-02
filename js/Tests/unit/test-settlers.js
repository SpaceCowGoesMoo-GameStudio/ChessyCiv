// ============================================
// UNIT TESTS - Settlers Module
// ============================================

describe('GameEngine Settlers', function() {
    let engine;

    beforeEach(function() {
        engine = createScenario(2);
    });

    it('canSettlerBuildCity valid on owned tile far from cities', function() {
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        engine.tileOwnership[5][5] = 0;
        const result = engine.canSettlerBuildCity(s);
        assert.ok(result.valid);
    });

    it('canSettlerBuildCity rejects non-settler', function() {
        const w = placePiece(engine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        engine.tileOwnership[5][5] = 0;
        const result = engine.canSettlerBuildCity(w);
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Not a settler');
    });

    it('canSettlerBuildCity rejects unowned tile', function() {
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        // tileOwnership[5][5] is null (unowned)
        const result = engine.canSettlerBuildCity(s);
        assert.equal(result.valid, false);
    });

    it('canSettlerBuildCity rejects tile owned by other player', function() {
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        engine.tileOwnership[5][5] = 1; // owned by player 1
        const result = engine.canSettlerBuildCity(s);
        assert.equal(result.valid, false);
    });

    it('canSettlerBuildCity rejects too close to city (Chebyshev <= 1)', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 6);
        engine.tileOwnership[5][6] = 0;
        const result = engine.canSettlerBuildCity(s);
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Too close to another city');
    });

    it('canSettlerBuildCity rejects diagonal adjacent to city', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 6, 6);
        engine.tileOwnership[6][6] = 0;
        const result = engine.canSettlerBuildCity(s);
        assert.equal(result.valid, false);
    });

    it('canSettlerBuildCity allows 2+ tiles from city', function() {
        const city = placePiece(engine, PIECE_TYPES.CITY, 0, 5, 5);
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 7);
        engine.tileOwnership[5][7] = 0;
        const result = engine.canSettlerBuildCity(s);
        assert.ok(result.valid);
    });

    it('settlerBuildCity removes settler and creates city', function() {
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        engine.tileOwnership[5][5] = 0;
        const piecesBefore = engine.pieces.length;
        const result = engine.settlerBuildCity(s);
        assert.ok(result.success);
        assert.ok(result.city);
        assert.equal(result.city.type, PIECE_TYPES.CITY);
        assert.equal(result.city.ownerId, 0);
        assert.equal(result.city.row, 5);
        assert.equal(result.city.col, 5);
        assert.equal(engine.board[5][5], result.city);
        // Settler removed, city added - same count
        assert.equal(engine.pieces.length, piecesBefore);
        // Settler should not be in pieces array
        assert.equal(engine.pieces.indexOf(s), -1);
    });

    it('settlerBuildCity inherits tech bonus', function() {
        engine.players[0].techScore = 2;
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        engine.tileOwnership[5][5] = 0;
        const result = engine.settlerBuildCity(s);
        assert.equal(result.city.hp, 6);     // 4 + 2
        assert.equal(result.city.maxHp, 6);
    });

    it('settlerBuildCity fails when invalid', function() {
        const s = placePiece(engine, PIECE_TYPES.SETTLER, 0, 5, 5);
        // Tile not owned
        const result = engine.settlerBuildCity(s);
        assert.equal(result.success, false);
    });
});
