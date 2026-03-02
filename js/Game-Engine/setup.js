// ============================================
// GAME ENGINE - Setup Module
// ============================================
// Game initialization, player setup, and piece creation.

GameEngine.prototype.setupGame = function(playerConfigs, options) {
    this.reset();

    // Create players
    playerConfigs.forEach((config, index) => {
        this.players.push({
            id: index,
            name: `Player ${index + 1}`,
            color: config.color,
            techScore: 0,
            isHuman: !config.isAI,
            isAI: config.isAI || false,
            aiDifficulty: config.aiDifficulty || AI_DIFFICULTY.MEDIUM,
            relations: {}, // will be filled with peace/war status
            relationsChangedRound: {}, // tracks which round each relation last changed
            eliminated: false,
            warriorKills: 0,
            warriorsLost: 0
        });
    });

    // Initialize all players at peace with each other
    this.players.forEach((player, i) => {
        this.players.forEach((other, j) => {
            if (i !== j) {
                player.relations[j] = 'peace';
                player.relationsChangedRound[j] = -RELATION_MIN_TURNS; // Allow immediate war declaration at game start
            }
        });
    });

    // Place starting cities for each player
    const useRandomStart = !options || options.randomStart !== false;
    this.placeStartingPieces(useRandomStart);

    this.log('GAME_START', { players: this.players.length });

    // Initialize history tracking
    this.history.initGame(this.players);
    this.history.captureSnapshot(this, 'GAME_START', { players: this.players.length });

    return true;
};

GameEngine.prototype.placeStartingPieces = function(randomStart) {
    const startingPositions = randomStart
        ? this.getRandomStartPositions(this.players.length)
        : this.getStartingPositions(this.players.length);

    startingPositions.forEach((pos, playerIndex) => {
        // Create starting city
        const city = this.createPiece(PIECE_TYPES.CITY, playerIndex, pos.row, pos.col);
        this.pieces.push(city);
        this.board[pos.row][pos.col] = city;

        // Own the tile
        this.tileOwnership[pos.row][pos.col] = playerIndex;

        // Create starting warrior — try adjacent first, then expand outward
        const warriorPos = this.findAdjacentEmptyTile(pos.row, pos.col)
            || this.findNearestEmptyTile(pos.row, pos.col);
        if (warriorPos) {
            const warrior = this.createPiece(PIECE_TYPES.WARRIOR, playerIndex, warriorPos.row, warriorPos.col);
            this.pieces.push(warrior);
            this.board[warriorPos.row][warriorPos.col] = warrior;
        }
    });
};

GameEngine.prototype.getStartingPositions = function(numPlayers) {
    const positions = [];
    const corners = [
        { row: 0, col: 0 },
        { row: 0, col: BOARD_SIZE - 1 },
        { row: BOARD_SIZE - 1, col: 0 },
        { row: BOARD_SIZE - 1, col: BOARD_SIZE - 1 }
    ];

    // Shuffle corners
    for (let i = corners.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [corners[i], corners[j]] = [corners[j], corners[i]];
    }

    for (let i = 0; i < numPlayers; i++) {
        positions.push(corners[i]);
    }

    return positions;
};

GameEngine.prototype.getRandomStartPositions = function(numPlayers) {
    const positions = [];
    const minDist = 4; // Chebyshev distance >= 4 means at least 3 tiles between any two starts
    const maxAttempts = 500;

    for (let p = 0; p < numPlayers; p++) {
        let placed = false;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const row = Math.floor(Math.random() * BOARD_SIZE);
            const col = Math.floor(Math.random() * BOARD_SIZE);
            const tooClose = positions.some(pos =>
                Math.max(Math.abs(pos.row - row), Math.abs(pos.col - col)) < minDist
            );
            if (!tooClose) {
                positions.push({ row, col });
                placed = true;
                break;
            }
        }
        if (!placed) {
            // Fallback to corners if random placement fails (edge case with many players)
            const fallbacks = this.getStartingPositions(numPlayers);
            return fallbacks;
        }
    }
    return positions;
};

GameEngine.prototype.findAdjacentEmptyTile = function(row, col, ownerId = null) {
    const directions = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;
        if (this.isValidTile(newRow, newCol) && !this.board[newRow][newCol]) {
            // If ownerId provided, check tile ownership
            if (ownerId !== null) {
                const tileOwner = this.tileOwnership[newRow][newCol];
                // Tile must be unowned, owned by same player, or owned by player at war
                if (tileOwner !== null && tileOwner !== ownerId) {
                    const player = this.players[ownerId];
                    if (!player || player.relations[tileOwner] !== 'war') {
                        continue;
                    }
                }
            }
            return { row: newRow, col: newCol };
        }
    }
    return null;
};

// BFS outward from (row, col) to find the nearest empty tile on the board.
// Used as a fallback when no adjacent tile is available.
GameEngine.prototype.findNearestEmptyTile = function(row, col) {
    const visited = new Set();
    const queue = [{ row, col }];
    visited.add(`${row},${col}`);

    const directions = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    while (queue.length > 0) {
        const { row: r, col: c } = queue.shift();
        for (const [dr, dc] of directions) {
            const nr = r + dr;
            const nc = c + dc;
            const key = `${nr},${nc}`;
            if (!visited.has(key) && this.isValidTile(nr, nc)) {
                visited.add(key);
                if (!this.board[nr][nc]) return { row: nr, col: nc };
                queue.push({ row: nr, col: nc });
            }
        }
    }
    return null; // board completely full — should never happen at game start
};

GameEngine.prototype.createPiece = function(type, ownerId, row, col) {
    const baseStats = {
        [PIECE_TYPES.CITY]: { hp: 4, maxHp: 4, damage: 0 },
        [PIECE_TYPES.WARRIOR]: { hp: 1, maxHp: 1, damage: 1 },
        [PIECE_TYPES.SETTLER]: { hp: 1, maxHp: 1, damage: 0 }
    };

    const stats = baseStats[type];
    const player = this.players[ownerId];

    // Apply tech bonuses
    if (player && player.techScore > 0) {
        if (type === PIECE_TYPES.CITY || type === PIECE_TYPES.WARRIOR) {
            stats.hp += player.techScore;
            stats.maxHp += player.techScore;
        }
        if (type === PIECE_TYPES.WARRIOR) {
            stats.damage += player.techScore;
        }
    }

    const piece = {
        id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: type,
        ownerId: ownerId,
        row: row,
        col: col,
        hp: stats.hp,
        maxHp: stats.maxHp,
        damage: stats.damage,
        hasMoved: false,
        production: null,
        productionProgress: 0,
        productionPaused: false,
        repeatProduction: true
    };

    // Track when cities are created for automatic border expansion
    if (type === PIECE_TYPES.CITY) {
        piece.createdOnRound = this.roundNumber;
    }

    return piece;
};
