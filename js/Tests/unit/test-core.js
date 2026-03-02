// ============================================
// UNIT TESTS - Core GameEngine
// ============================================

describe('GameEngine Core', function() {
    let engine;

    beforeEach(function() {
        engine = createEngine(2);
    });

    it('constructor creates a 10x10 board', function() {
        assert.equal(engine.board.length, BOARD_SIZE);
        for (let r = 0; r < BOARD_SIZE; r++) {
            assert.equal(engine.board[r].length, BOARD_SIZE);
        }
    });

    it('constructor creates a 10x10 tileOwnership grid', function() {
        assert.equal(engine.tileOwnership.length, BOARD_SIZE);
        for (let r = 0; r < BOARD_SIZE; r++) {
            assert.equal(engine.tileOwnership[r].length, BOARD_SIZE);
        }
    });

    it('reset clears all state', function() {
        engine.reset();
        assert.equal(engine.players.length, 0);
        assert.equal(engine.pieces.length, 0);
        assert.equal(engine.currentPlayerIndex, 0);
        assert.equal(engine.gameOver, false);
        assert.equal(engine.winner, null);
        assert.equal(engine.turnNumber, 0);
        assert.equal(engine.roundNumber, 0);
    });

    it('isValidTile returns true for valid coordinates', function() {
        assert.ok(engine.isValidTile(0, 0));
        assert.ok(engine.isValidTile(9, 9));
        assert.ok(engine.isValidTile(5, 5));
    });

    it('isValidTile returns false for out-of-bounds', function() {
        assert.equal(engine.isValidTile(-1, 0), false);
        assert.equal(engine.isValidTile(0, -1), false);
        assert.equal(engine.isValidTile(10, 0), false);
        assert.equal(engine.isValidTile(0, 10), false);
        assert.equal(engine.isValidTile(10, 10), false);
    });

    it('getCurrentPlayer returns current player object', function() {
        const player = engine.getCurrentPlayer();
        assert.equal(player.id, 0);
        assert.equal(player.name, 'Player 1');
    });

    it('getPlayerCities filters cities by owner', function() {
        const p0Cities = engine.getPlayerCities(0);
        const p1Cities = engine.getPlayerCities(1);
        assert.ok(p0Cities.length >= 1);
        assert.ok(p1Cities.length >= 1);
        p0Cities.forEach(c => assert.equal(c.ownerId, 0));
        p1Cities.forEach(c => assert.equal(c.ownerId, 1));
    });

    it('getFirstActivePlayer returns lowest non-eliminated index', function() {
        assert.equal(engine.getFirstActivePlayer(), 0);
        engine.players[0].eliminated = true;
        assert.equal(engine.getFirstActivePlayer(), 1);
    });

    it('calculatePlayerScore computes correct formula', function() {
        const e = createScenario(2);
        const city = placePiece(e, PIECE_TYPES.CITY, 0, 0, 0);
        e.tileOwnership[0][0] = 0;
        e.tileOwnership[0][1] = 0;
        e.tileOwnership[1][0] = 0;
        e.players[0].warriorKills = 3;
        e.players[0].warriorsLost = 1;

        // 1 city * 25 + 3 tiles + 3 kills - 1 loss = 25 + 3 + 3 - 1 = 30
        assert.equal(e.calculatePlayerScore(0), 30);
    });

    it('calculatePlayerScores returns scores for all players', function() {
        const scores = engine.calculatePlayerScores();
        assert.ok(typeof scores[0] === 'number');
        assert.ok(typeof scores[1] === 'number');
    });

    it('log creates action log entry', function() {
        const initialLen = engine.actionLog.length;
        engine.log('TEST_ACTION', { foo: 'bar' });
        assert.equal(engine.actionLog.length, initialLen + 1);
        const entry = engine.actionLog[engine.actionLog.length - 1];
        assert.equal(entry.action, 'TEST_ACTION');
        assert.equal(entry.details.foo, 'bar');
    });

    it('setupGame initializes 2 players with starting pieces', function() {
        assert.equal(engine.players.length, 2);
        // Each player gets 1 city + 1 warrior = 4 pieces total
        assert.equal(engine.pieces.length, 4);
    });
});
