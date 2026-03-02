// ============================================
// GAME ENGINE - Persistence Module
// ============================================
// Save and restore game state functionality.

/**
 * Restore game state from a saved game snapshot
 * @param {Object} savedGame - The saved game data from localStorage
 */
GameEngine.prototype.restoreFromSavedGame = function(savedGame) {
    this.reset();

    const latestSnapshot = savedGame.snapshots[savedGame.snapshots.length - 1];
    const metadata = savedGame.metadata;

    // Restore players from metadata (including AI information)
    metadata.players.forEach((p, index) => {
        this.players.push({
            id: p.id,
            name: p.name,
            color: p.color,
            techScore: 0,
            isHuman: !p.isAI,
            isAI: p.isAI || false,
            aiDifficulty: p.aiDifficulty || null,
            personality: p.personality || null,
            relations: {},
            relationsChangedRound: {},
            eliminated: false,
            warriorKills: p.warriorKills || 0,
            warriorsLost: p.warriorsLost || 0
        });
    });

    // Restore tech levels
    if (latestSnapshot.techLevels) {
        latestSnapshot.techLevels.forEach(tech => {
            if (this.players[tech.playerId]) {
                this.players[tech.playerId].techScore = tech.techScore;
            }
        });
    }

    // Restore player relations
    if (latestSnapshot.playerRelations) {
        latestSnapshot.playerRelations.forEach(rel => {
            if (this.players[rel.playerId]) {
                this.players[rel.playerId].relations = { ...rel.relations };
                // Restore relationsChangedRound if available, otherwise default to allowing changes
                if (rel.relationsChangedRound) {
                    this.players[rel.playerId].relationsChangedRound = { ...rel.relationsChangedRound };
                } else {
                    // For older saves without this data, allow immediate relation changes
                    Object.keys(rel.relations).forEach(otherId => {
                        this.players[rel.playerId].relationsChangedRound[otherId] = -RELATION_MIN_TURNS;
                    });
                }
            }
        });
    }

    // Restore tile ownership
    if (latestSnapshot.tileOwnership) {
        this.tileOwnership = latestSnapshot.tileOwnership.map(row => row.slice());
    }

    // Restore pieces
    if (latestSnapshot.pieces) {
        latestSnapshot.pieces.forEach(p => {
            const piece = {
                id: p.id,
                type: p.type,
                ownerId: p.ownerId,
                row: p.row,
                col: p.col,
                hp: p.hp,
                maxHp: p.maxHp,
                damage: p.type === PIECE_TYPES.WARRIOR ? 1 + (this.players[p.ownerId]?.techScore || 0) : 0,
                hasMoved: p.hasMoved || false,
                production: p.production || null,
                productionProgress: p.productionProgress || 0,
                productionPaused: p.productionPaused || false,
                repeatProduction: true
            };
            // Restore createdOnRound for cities (default to 0 for older saves)
            if (p.type === PIECE_TYPES.CITY) {
                piece.createdOnRound = p.createdOnRound ?? 0;
            }
            this.pieces.push(piece);
            this.board[piece.row][piece.col] = piece;
        });
    }

    // Compute eliminated status from restored pieces.
    // Only mark players as eliminated based on city ownership when the board
    // actually has cities.  City-less scenario levels (e.g. warriors-only)
    // should never eliminate players just because there are no cities.
    const boardHasCities = this.pieces.some(p => p.type === PIECE_TYPES.CITY);
    this.players.forEach(player => {
        player.eliminated = boardHasCities &&
            !this.pieces.some(p => p.type === PIECE_TYPES.CITY && p.ownerId === player.id);
    });

    // Recompute game over state from restored pieces
    const cityOwners = new Set(
        this.pieces
            .filter(p => p.type === PIECE_TYPES.CITY)
            .map(p => p.ownerId)
    );
    if (cityOwners.size === 1) {
        this.gameOver = true;
        this.winner = [...cityOwners][0];
    } else if (metadata.winner !== null && metadata.winner !== undefined) {
        // Restore from metadata (e.g., game ended after human defeat)
        this.gameOver = true;
        this.winner = metadata.winner;
    }

    // Restore game state
    this.currentPlayerIndex = latestSnapshot.currentPlayerIndex;
    this.turnNumber = latestSnapshot.turnNumber || 0;
    // Restore roundNumber if available, otherwise estimate from turnNumber
    this.roundNumber = latestSnapshot.roundNumber ?? Math.floor(this.turnNumber / Math.max(this.players.length, 1));

    // Restore history with existing game ID and state
    this.history.gameId = savedGame.gameId;
    this.history.metadata = { ...metadata };
    this.history.turnNumber = this.turnNumber;
    this.history.roundNumber = this.roundNumber;
    this.history.lastSavedRound = this.roundNumber;
    // Capture the current state as the latest snapshot for subsequent saves
    this.history.captureSnapshot(this, 'GAME_RESTORED');

    // Stash achievement session stats for the AchievementManager to restore
    if (latestSnapshot.achievementStats) {
        this._pendingAchievementStats = latestSnapshot.achievementStats;
    }

    this.log('GAME_RESTORED', { gameId: savedGame.gameId, turnNumber: this.turnNumber });

    return true;
};

/**
 * Deep-clone the current engine state for rollback/simulation.
 * Returns a plain object that can be passed to restoreState().
 */
GameEngine.prototype.cloneState = function() {
    // Deep copy pieces as plain objects
    const pieces = this.pieces.map(p => ({
        id: p.id,
        type: p.type,
        ownerId: p.ownerId,
        row: p.row,
        col: p.col,
        hp: p.hp,
        maxHp: p.maxHp,
        damage: p.damage,
        hasMoved: p.hasMoved,
        production: p.production,
        productionProgress: p.productionProgress,
        productionPaused: p.productionPaused || false,
        repeatProduction: p.repeatProduction || false,
        createdOnRound: p.createdOnRound ?? null,
        removed: p.removed || false
    }));

    // Deep copy tile ownership
    const tileOwnership = this.tileOwnership.map(row => row.slice());

    // Deep copy players with relation clones
    const players = this.players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        techScore: p.techScore,
        isHuman: p.isHuman,
        isAI: p.isAI,
        aiDifficulty: p.aiDifficulty,
        personality: p.personality || null,
        relations: { ...p.relations },
        relationsChangedRound: { ...p.relationsChangedRound },
        eliminated: p.eliminated,
        warriorKills: p.warriorKills || 0,
        warriorsLost: p.warriorsLost || 0
    }));

    // Board stores piece-index references (index into pieces array)
    const board = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        const row = [];
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = this.board[r][c];
            if (piece) {
                // Store the index of this piece in the pieces array
                const idx = this.pieces.indexOf(piece);
                row.push(idx);
            } else {
                row.push(-1);
            }
        }
        board.push(row);
    }

    return {
        pieces,
        tileOwnership,
        players,
        board,
        currentPlayerIndex: this.currentPlayerIndex,
        turnNumber: this.turnNumber,
        roundNumber: this.roundNumber,
        gameOver: this.gameOver,
        winner: this.winner
    };
};

/**
 * Restore engine state from a previous cloneState() result.
 * Maps board piece indices back to object references.
 */
GameEngine.prototype.restoreState = function(state) {
    // Restore pieces
    this.pieces = state.pieces.map(p => ({ ...p }));

    // Restore tile ownership
    this.tileOwnership = state.tileOwnership.map(row => row.slice());

    // Restore players with deep-copied relations
    this.players = state.players.map(p => ({
        ...p,
        relations: { ...p.relations },
        relationsChangedRound: { ...p.relationsChangedRound }
    }));

    // Restore board — map piece indices back to object refs
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const idx = state.board[r][c];
            this.board[r][c] = idx >= 0 ? this.pieces[idx] : null;
        }
    }

    // Restore scalars
    this.currentPlayerIndex = state.currentPlayerIndex;
    this.turnNumber = state.turnNumber;
    this.roundNumber = state.roundNumber;
    this.gameOver = state.gameOver;
    this.winner = state.winner;
};
