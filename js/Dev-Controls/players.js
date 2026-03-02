// ============================================
// DEV CONTROLS - Players Module
// ============================================
// Player management, territory ops, board setup.

DevGame.prototype.setPlayerTechScore = function(playerId, score) {
    const player = this.engine.players[playerId];
    if (!player) return false;
    player.techScore = Math.max(0, score);
    return true;
};

DevGame.prototype.setPlayerEliminated = function(playerId, eliminated) {
    const player = this.engine.players[playerId];
    if (!player) return false;
    player.eliminated = eliminated;
    return true;
};

DevGame.prototype.setPlayerRelation = function(playerId, targetId, relation) {
    const player = this.engine.players[playerId];
    const target = this.engine.players[targetId];
    if (!player || !target || playerId === targetId) return false;
    player.relations[targetId] = relation;
    return true;
};

DevGame.prototype.setPlayerRelationSymmetric = function(playerId, targetId, relation) {
    if (!this.setPlayerRelation(playerId, targetId, relation)) return false;
    this.setPlayerRelation(targetId, playerId, relation);
    return true;
};

DevGame.prototype.setCurrentPlayer = function(playerId) {
    if (!this.engine.players[playerId]) return false;
    this.engine.currentPlayerIndex = playerId;
    return true;
};

// ================================================================
// Player Management — add, remove, and convert players
// ================================================================

DevGame.prototype.addPlayer = function(options) {
    const id = this.engine.players.length;
    if (id >= PLAYER_COLORS.length) {
        return { success: false, reason: 'Maximum player count reached (' + PLAYER_COLORS.length + ')' };
    }
    const opts = options || {};
    const player = {
        id: id,
        name: opts.name || ('Player ' + (id + 1)),
        color: PLAYER_COLORS[id],
        techScore: opts.techScore || 0,
        isHuman: !opts.isAI,
        isAI: opts.isAI || false,
        aiDifficulty: opts.aiDifficulty || AI_DIFFICULTY.MEDIUM,
        relations: {},
        relationsChangedRound: {},
        eliminated: false,
        warriorKills: 0,
        warriorsLost: 0
    };

    // Initialize relations with all existing players
    for (let i = 0; i < this.engine.players.length; i++) {
        player.relations[i] = 'peace';
        player.relationsChangedRound[i] = -RELATION_MIN_TURNS;
        this.engine.players[i].relations[id] = 'peace';
        this.engine.players[i].relationsChangedRound[id] = -RELATION_MIN_TURNS;
    }

    this.engine.players.push(player);

    // Register AI if requested
    if (opts.isAI && this._aiManager) {
        this._aiManager.registerAIPlayer(id, player.aiDifficulty);
    }

    return { success: true, player: DevExport.playerToPlain(player) };
};

DevGame.prototype.removePlayer = function(playerId) {
    const player = this.engine.players[playerId];
    if (!player) return { success: false, reason: 'Invalid player' };
    if (player.eliminated) return { success: false, reason: 'Already eliminated' };

    // Remove all pieces belonging to this player
    const toRemove = this.engine.pieces.filter(p => p.ownerId === playerId);
    for (const piece of toRemove) {
        this.engine.board[piece.row][piece.col] = null;
    }
    this.engine.pieces = this.engine.pieces.filter(p => p.ownerId !== playerId);

    // Clear territory
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (this.engine.tileOwnership[r][c] === playerId) {
                this.engine.tileOwnership[r][c] = null;
            }
        }
    }

    // Mark eliminated
    player.eliminated = true;

    // Unregister AI
    if (this._aiManager && this._aiManager.isAIPlayer(playerId)) {
        this._aiManager.aiPlayers.delete(playerId);
    }

    // If current player was removed, advance turn
    if (this.engine.currentPlayerIndex === playerId) {
        this._advanceToNextActive();
    }

    return { success: true };
};

DevGame.prototype._advanceToNextActive = function() {
    const players = this.engine.players;
    let next = (this.engine.currentPlayerIndex + 1) % players.length;
    let tries = 0;
    while (players[next].eliminated && tries < players.length) {
        next = (next + 1) % players.length;
        tries++;
    }
    this.engine.currentPlayerIndex = next;
};

// ================================================================
// Territory Operations
// ================================================================

DevGame.prototype.setTileOwner = function(row, col, ownerId) {
    if (!this.engine.isValidTile(row, col)) return false;
    this._captureUndoSnapshot();
    const oldOwner = this.engine.tileOwnership[row][col];
    // Treat null, -1, or any negative as "unowned"
    if (ownerId === null || ownerId < 0) {
        this.engine.tileOwnership[row][col] = null;
        this._emit('territoryChanged', { row, col, oldOwner, newOwner: null });
        return true;
    }
    if (!this.engine.players[ownerId]) return false;
    this.engine.tileOwnership[row][col] = ownerId;
    this._emit('territoryChanged', { row, col, oldOwner, newOwner: ownerId });
    return true;
};

DevGame.prototype.fillTerritory = function(playerId, r1, c1, r2, c2) {
    let count = 0;
    const minR = Math.max(0, Math.min(r1, r2));
    const maxR = Math.min(BOARD_SIZE - 1, Math.max(r1, r2));
    const minC = Math.max(0, Math.min(c1, c2));
    const maxC = Math.min(BOARD_SIZE - 1, Math.max(c1, c2));
    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            this.engine.tileOwnership[r][c] = playerId;
            count++;
        }
    }
    return count;
};

DevGame.prototype.clearTerritory = function(r1, c1, r2, c2) {
    return this.fillTerritory(null, r1, c1, r2, c2);
};

// ================================================================
// Board Setup Utilities
// ================================================================

DevGame.prototype.clearBoard = function() {
    this._captureUndoSnapshot();
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            this.engine.board[r][c] = null;
            this.engine.tileOwnership[r][c] = null;
        }
    }
    this.engine.pieces.length = 0;
    this._emit('boardCleared', {});
};
