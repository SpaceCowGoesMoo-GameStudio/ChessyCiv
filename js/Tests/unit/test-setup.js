// ============================================
// UNIT TESTS - Setup Module
// ============================================

describe('GameEngine Setup', function() {
    it('setupGame creates correct number of players', function() {
        const e2 = createEngine(2);
        assert.equal(e2.players.length, 2);
        const e4 = createEngine(4);
        assert.equal(e4.players.length, 4);
    });

    it('setupGame initializes all players at peace', function() {
        const e = createEngine(3);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (i !== j) {
                    assert.equal(e.players[i].relations[j], 'peace');
                }
            }
        }
    });

    it('setupGame initializes relationsChangedRound for immediate war', function() {
        const e = createEngine(2);
        // Should allow immediate war declaration (changedRound = -RELATION_MIN_TURNS)
        const result = e.canChangeRelation(0, 1);
        assert.ok(result.canChange);
    });

    it('setupGame creates starting pieces (1 city + 1 warrior per player)', function() {
        const e = createEngine(2);
        const cities = e.pieces.filter(p => p.type === PIECE_TYPES.CITY);
        const warriors = e.pieces.filter(p => p.type === PIECE_TYPES.WARRIOR);
        assert.equal(cities.length, 2);
        assert.equal(warriors.length, 2);
    });

    it('getStartingPositions returns corners', function() {
        seedRandom(42);
        const e = new GameEngine();
        // Initialize minimal state for getStartingPositions
        const positions = e.getStartingPositions(4);
        restoreRandom();
        assert.equal(positions.length, 4);
        const corners = [
            { row: 0, col: 0 }, { row: 0, col: 9 },
            { row: 9, col: 0 }, { row: 9, col: 9 }
        ];
        // Each position should be one of the four corners
        for (const pos of positions) {
            assert.ok(corners.some(c => c.row === pos.row && c.col === pos.col),
                `Position (${pos.row},${pos.col}) is not a corner`);
        }
    });

    it('createPiece city has correct base stats', function() {
        const e = createScenario(2);
        const city = e.createPiece(PIECE_TYPES.CITY, 0, 5, 5);
        assert.equal(city.hp, 4);
        assert.equal(city.maxHp, 4);
        assert.equal(city.damage, 0);
        assert.equal(city.type, PIECE_TYPES.CITY);
        assert.equal(city.hasMoved, false);
        assert.ok(city.createdOnRound !== undefined);
    });

    it('createPiece warrior has correct base stats', function() {
        const e = createScenario(2);
        const warrior = e.createPiece(PIECE_TYPES.WARRIOR, 0, 5, 5);
        assert.equal(warrior.hp, 1);
        assert.equal(warrior.maxHp, 1);
        assert.equal(warrior.damage, 1);
    });

    it('createPiece settler has correct base stats', function() {
        const e = createScenario(2);
        const settler = e.createPiece(PIECE_TYPES.SETTLER, 0, 5, 5);
        assert.equal(settler.hp, 1);
        assert.equal(settler.maxHp, 1);
        assert.equal(settler.damage, 0);
    });

    it('createPiece applies tech bonuses to warrior', function() {
        const e = createScenario(2);
        e.players[0].techScore = 2;
        const warrior = e.createPiece(PIECE_TYPES.WARRIOR, 0, 5, 5);
        assert.equal(warrior.hp, 3);     // 1 + 2
        assert.equal(warrior.maxHp, 3);  // 1 + 2
        assert.equal(warrior.damage, 3); // 1 + 2
    });

    it('createPiece applies tech bonuses to city', function() {
        const e = createScenario(2);
        e.players[0].techScore = 1;
        const city = e.createPiece(PIECE_TYPES.CITY, 0, 5, 5);
        assert.equal(city.hp, 5);     // 4 + 1
        assert.equal(city.maxHp, 5);  // 4 + 1
        assert.equal(city.damage, 0); // cities have 0 damage
    });

    it('createPiece does not apply tech bonuses to settler', function() {
        const e = createScenario(2);
        e.players[0].techScore = 3;
        const settler = e.createPiece(PIECE_TYPES.SETTLER, 0, 5, 5);
        assert.equal(settler.hp, 1);     // unchanged
        assert.equal(settler.maxHp, 1);  // unchanged
        assert.equal(settler.damage, 0); // unchanged
    });

    it('findAdjacentEmptyTile finds an empty adjacent tile', function() {
        const e = createScenario(2);
        const result = e.findAdjacentEmptyTile(5, 5);
        assert.ok(result !== null);
        const dist = Math.max(Math.abs(result.row - 5), Math.abs(result.col - 5));
        assert.equal(dist, 1);
        assert.equal(e.board[result.row][result.col], null);
    });

    it('findAdjacentEmptyTile returns null when all tiles occupied', function() {
        const e = createScenario(2);
        // Fill all adjacent tiles around (5,5)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                placePiece(e, PIECE_TYPES.WARRIOR, 0, 5 + dr, 5 + dc);
            }
        }
        const result = e.findAdjacentEmptyTile(5, 5);
        assert.equal(result, null);
    });

    it('findAdjacentEmptyTile with ownerId respects peace territory', function() {
        const e = createScenario(2);
        // Player 1 owns all adjacent tiles except one
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                e.tileOwnership[5 + dr][5 + dc] = 1; // owned by player 1
            }
        }
        // Player 0 is at peace with player 1, so can't spawn there
        const result = e.findAdjacentEmptyTile(5, 5, 0);
        assert.equal(result, null);
    });

    it('players start with 0 techScore, kills, and losses', function() {
        const e = createEngine(2);
        assert.equal(e.players[0].techScore, 0);
        assert.equal(e.players[0].warriorKills, 0);
        assert.equal(e.players[0].warriorsLost, 0);
        assert.equal(e.players[0].eliminated, false);
    });
});

// ============================================
// Board Instantiation Tests
// ============================================

describe('Board Instantiation - Corner Start', function() {
    function createCornerEngine(numPlayers, seed) {
        if (seed === undefined) seed = 42;
        seedRandom(seed);
        const engine = new GameEngine();
        const configs = [];
        for (let i = 0; i < numPlayers; i++) {
            configs.push({ color: PLAYER_COLORS[i], isAI: false });
        }
        engine.setupGame(configs, { randomStart: false });
        restoreRandom();
        return engine;
    }

    it('every player gets exactly 1 city in corner mode (2 players)', function() {
        const e = createCornerEngine(2);
        for (let p = 0; p < 2; p++) {
            const cities = e.pieces.filter(pc => pc.type === PIECE_TYPES.CITY && pc.ownerId === p);
            assert.equal(cities.length, 1, `Player ${p} should have exactly 1 city`);
        }
    });

    it('every player gets exactly 1 warrior in corner mode (2 players)', function() {
        const e = createCornerEngine(2);
        for (let p = 0; p < 2; p++) {
            const warriors = e.pieces.filter(pc => pc.type === PIECE_TYPES.WARRIOR && pc.ownerId === p);
            assert.equal(warriors.length, 1, `Player ${p} should have exactly 1 warrior`);
        }
    });

    it('every player gets exactly 1 city and 1 warrior in corner mode (4 players)', function() {
        const e = createCornerEngine(4);
        for (let p = 0; p < 4; p++) {
            const cities = e.pieces.filter(pc => pc.type === PIECE_TYPES.CITY && pc.ownerId === p);
            const warriors = e.pieces.filter(pc => pc.type === PIECE_TYPES.WARRIOR && pc.ownerId === p);
            assert.equal(cities.length, 1, `Player ${p} should have exactly 1 city`);
            assert.equal(warriors.length, 1, `Player ${p} should have exactly 1 warrior`);
        }
    });

    it('all pieces are within board bounds in corner mode', function() {
        const e = createCornerEngine(4);
        for (const pc of e.pieces) {
            assert.ok(pc.row >= 0 && pc.row < BOARD_SIZE, `Piece row ${pc.row} out of bounds`);
            assert.ok(pc.col >= 0 && pc.col < BOARD_SIZE, `Piece col ${pc.col} out of bounds`);
        }
    });

    it('all pieces are registered in the board array in corner mode', function() {
        const e = createCornerEngine(4);
        for (const pc of e.pieces) {
            assert.ok(e.board[pc.row][pc.col] === pc, `Piece at (${pc.row},${pc.col}) not in board array`);
        }
    });

    it('cities start at board corners in corner mode', function() {
        const e = createCornerEngine(4);
        const corners = new Set(['0,0', '0,9', '9,0', '9,9']);
        const cities = e.pieces.filter(pc => pc.type === PIECE_TYPES.CITY);
        for (const city of cities) {
            assert.ok(corners.has(`${city.row},${city.col}`), `City at (${city.row},${city.col}) is not a corner`);
        }
    });

    it('warriors are adjacent to their city in corner mode', function() {
        const e = createCornerEngine(4);
        for (let p = 0; p < 4; p++) {
            const city = e.pieces.find(pc => pc.type === PIECE_TYPES.CITY && pc.ownerId === p);
            const warrior = e.pieces.find(pc => pc.type === PIECE_TYPES.WARRIOR && pc.ownerId === p);
            const dist = Math.max(Math.abs(city.row - warrior.row), Math.abs(city.col - warrior.col));
            assert.equal(dist, 1, `Player ${p} warrior is not adjacent to city`);
        }
    });

    it('corner mode produces valid boards across 10 different seeds', function() {
        for (let seed = 1; seed <= 10; seed++) {
            const e = createCornerEngine(4, seed);
            for (let p = 0; p < 4; p++) {
                const cities = e.pieces.filter(pc => pc.type === PIECE_TYPES.CITY && pc.ownerId === p);
                const warriors = e.pieces.filter(pc => pc.type === PIECE_TYPES.WARRIOR && pc.ownerId === p);
                assert.equal(cities.length, 1, `Seed ${seed}: player ${p} missing city`);
                assert.equal(warriors.length, 1, `Seed ${seed}: player ${p} missing warrior`);
            }
        }
    });
});

describe('Board Instantiation - Random Start', function() {
    function createRandomEngine(numPlayers, seed) {
        if (seed === undefined) seed = 42;
        seedRandom(seed);
        const engine = new GameEngine();
        const configs = [];
        for (let i = 0; i < numPlayers; i++) {
            configs.push({ color: PLAYER_COLORS[i], isAI: false });
        }
        engine.setupGame(configs, { randomStart: true });
        restoreRandom();
        return engine;
    }

    it('every player gets exactly 1 city in random start mode (2 players)', function() {
        const e = createRandomEngine(2);
        for (let p = 0; p < 2; p++) {
            const cities = e.pieces.filter(pc => pc.type === PIECE_TYPES.CITY && pc.ownerId === p);
            assert.equal(cities.length, 1, `Player ${p} should have exactly 1 city`);
        }
    });

    it('every player gets exactly 1 warrior in random start mode (2 players)', function() {
        const e = createRandomEngine(2);
        for (let p = 0; p < 2; p++) {
            const warriors = e.pieces.filter(pc => pc.type === PIECE_TYPES.WARRIOR && pc.ownerId === p);
            assert.equal(warriors.length, 1, `Player ${p} should have exactly 1 warrior`);
        }
    });

    it('every player gets exactly 1 city and 1 warrior in random start mode (4 players)', function() {
        const e = createRandomEngine(4);
        for (let p = 0; p < 4; p++) {
            const cities = e.pieces.filter(pc => pc.type === PIECE_TYPES.CITY && pc.ownerId === p);
            const warriors = e.pieces.filter(pc => pc.type === PIECE_TYPES.WARRIOR && pc.ownerId === p);
            assert.equal(cities.length, 1, `Player ${p} should have exactly 1 city`);
            assert.equal(warriors.length, 1, `Player ${p} should have exactly 1 warrior`);
        }
    });

    it('all pieces are within board bounds in random start mode', function() {
        const e = createRandomEngine(4);
        for (const pc of e.pieces) {
            assert.ok(pc.row >= 0 && pc.row < BOARD_SIZE, `Piece row ${pc.row} out of bounds`);
            assert.ok(pc.col >= 0 && pc.col < BOARD_SIZE, `Piece col ${pc.col} out of bounds`);
        }
    });

    it('all pieces are registered in the board array in random start mode', function() {
        const e = createRandomEngine(4);
        for (const pc of e.pieces) {
            assert.ok(e.board[pc.row][pc.col] === pc, `Piece at (${pc.row},${pc.col}) not in board array`);
        }
    });

    it('getRandomStartPositions returns correct count and valid positions', function() {
        seedRandom(42);
        const e = new GameEngine();
        const positions = e.getRandomStartPositions(4);
        restoreRandom();
        assert.equal(positions.length, 4);
        for (const pos of positions) {
            assert.ok(pos.row >= 0 && pos.row < BOARD_SIZE, `Row ${pos.row} out of bounds`);
            assert.ok(pos.col >= 0 && pos.col < BOARD_SIZE, `Col ${pos.col} out of bounds`);
        }
    });

    it('random start positions are at least 3 tiles apart (Chebyshev >= 4)', function() {
        seedRandom(42);
        const e = new GameEngine();
        const positions = e.getRandomStartPositions(4);
        restoreRandom();
        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                const dist = Math.max(
                    Math.abs(positions[i].row - positions[j].row),
                    Math.abs(positions[i].col - positions[j].col)
                );
                assert.ok(dist >= 4, `Positions ${i} and ${j} are only ${dist} tiles apart`);
            }
        }
    });

    it('no two pieces share the same tile in random start mode', function() {
        const e = createRandomEngine(4);
        for (let i = 0; i < e.pieces.length; i++) {
            for (let j = i + 1; j < e.pieces.length; j++) {
                const a = e.pieces[i], b = e.pieces[j];
                assert.ok(
                    !(a.row === b.row && a.col === b.col),
                    `Two pieces occupy (${a.row},${a.col})`
                );
            }
        }
    });

    it('random start produces valid boards across 20 different seeds', function() {
        for (let seed = 1; seed <= 20; seed++) {
            const e = createRandomEngine(4, seed);
            for (let p = 0; p < 4; p++) {
                const cities = e.pieces.filter(pc => pc.type === PIECE_TYPES.CITY && pc.ownerId === p);
                const warriors = e.pieces.filter(pc => pc.type === PIECE_TYPES.WARRIOR && pc.ownerId === p);
                assert.equal(cities.length, 1, `Seed ${seed}: player ${p} missing city`);
                assert.equal(warriors.length, 1, `Seed ${seed}: player ${p} missing warrior`);
                assert.ok(warriors[0].row >= 0 && warriors[0].row < BOARD_SIZE, `Seed ${seed}: warrior row out of bounds`);
                assert.ok(warriors[0].col >= 0 && warriors[0].col < BOARD_SIZE, `Seed ${seed}: warrior col out of bounds`);
            }
        }
    });
});

describe('findNearestEmptyTile', function() {
    it('returns a valid tile when all adjacent tiles are occupied', function() {
        const e = createScenario(2);
        // Fill all 8 tiles adjacent to (5,5)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                placePiece(e, PIECE_TYPES.WARRIOR, 0, 5 + dr, 5 + dc);
            }
        }
        const result = e.findNearestEmptyTile(5, 5);
        assert.ok(result !== null, 'Should find a tile when adjacents are blocked');
        assert.ok(result.row >= 0 && result.row < BOARD_SIZE);
        assert.ok(result.col >= 0 && result.col < BOARD_SIZE);
        assert.ok(!e.board[result.row][result.col], 'Returned tile must be empty');
    });

    it('returned tile is the nearest available (distance 2) when ring-1 is full', function() {
        const e = createScenario(2);
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                placePiece(e, PIECE_TYPES.WARRIOR, 0, 5 + dr, 5 + dc);
            }
        }
        const result = e.findNearestEmptyTile(5, 5);
        const dist = Math.max(Math.abs(result.row - 5), Math.abs(result.col - 5));
        assert.equal(dist, 2, 'Should return a ring-2 tile when ring-1 is full');
    });

    it('warrior is always placed even when all adjacent tiles are blocked', function() {
        // Simulate the placeStartingPieces scenario: city placed, all adjacents occupied
        const e = createScenario(2);
        // Place a city for player 0 at (5,5)
        const city = e.createPiece(PIECE_TYPES.CITY, 0, 5, 5);
        e.pieces.push(city);
        e.board[5][5] = city;
        e.tileOwnership[5][5] = 0;
        // Block all adjacent tiles
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                placePiece(e, PIECE_TYPES.WARRIOR, 1, 5 + dr, 5 + dc);
            }
        }
        // findAdjacentEmptyTile should return null
        const adj = e.findAdjacentEmptyTile(5, 5);
        assert.equal(adj, null, 'Adjacent search should return null when all blocked');
        // findNearestEmptyTile should still find a spot
        const nearest = e.findNearestEmptyTile(5, 5);
        assert.ok(nearest !== null, 'BFS fallback must find a tile');
        assert.ok(!e.board[nearest.row][nearest.col], 'BFS result must be an empty tile');
    });

    it('returns null only when board is completely full', function() {
        const e = createScenario(2);
        // Fill the entire board
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (r === 0 && c === 0) continue; // leave origin, it's the search start
                placePiece(e, PIECE_TYPES.WARRIOR, 0, r, c);
            }
        }
        // (0,0) is empty but is the search origin — BFS skips the origin itself
        // so only (0,0) is free; it should still be found via a neighbor's neighbor path
        // Actually the BFS starts by visiting neighbors of origin, so (0,0) itself is
        // the origin and is never checked as an empty candidate.
        // Fill (0,0) too to make the board truly full:
        placePiece(e, PIECE_TYPES.WARRIOR, 0, 0, 0);
        const result = e.findNearestEmptyTile(0, 0);
        assert.equal(result, null, 'Should return null when board is completely full');
    });
});
