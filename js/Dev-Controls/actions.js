// ============================================
// DEV CONTROLS - Actions Module
// ============================================
// Game actions: move, settle, produce, diplomacy, endTurn, simulation.

DevGame.prototype._findPieceAt = function(row, col) {
    return this.engine.board[row][col] || null;
};

DevGame.prototype.movePiece = function(row, col, targetRow, targetCol) {
    const piece = this._findPieceAt(row, col);
    if (!piece) return { success: false, reason: 'No piece at source tile' };
    this._captureUndoSnapshot();
    const result = this.engine.movePiece(piece, targetRow, targetCol);
    this._emit('move', { from: { row, col }, to: { row: targetRow, col: targetCol }, result });
    return result;
};

DevGame.prototype.settleCity = function(row, col) {
    const piece = this._findPieceAt(row, col);
    if (!piece) return { success: false, reason: 'No piece at tile' };
    this._captureUndoSnapshot();
    const result = this.engine.settlerBuildCity(piece);
    this._emit('settle', { row, col, result });
    return result;
};

DevGame.prototype.setProduction = function(row, col, type, repeat) {
    const piece = this._findPieceAt(row, col);
    if (!piece) return false;
    this._captureUndoSnapshot();
    const result = this.engine.setProduction(piece, type);
    if (result) {
        if (repeat !== undefined) piece.repeatProduction = repeat;
        this._emit('productionSet', { row, col, type, repeat: piece.repeatProduction || false });
    }
    return result;
};

DevGame.prototype.setRepeatProduction = function(row, col, repeat) {
    const piece = this._findPieceAt(row, col);
    if (!piece || piece.type !== PIECE_TYPES.CITY) return false;
    piece.repeatProduction = repeat;
    return true;
};

DevGame.prototype.endTurn = function() {
    const prevPlayer = this.engine.currentPlayerIndex;

    if (this._recordHistory) {
        this._turnHistory.push(this._captureMinimalState());
    }

    this._captureUndoSnapshot();

    // Snapshot production state before endTurn to detect completions
    const prodBefore = {};
    for (let i = 0; i < this.engine.pieces.length; i++) {
        const p = this.engine.pieces[i];
        if (p.type === PIECE_TYPES.CITY && p.production) {
            prodBefore[p.id] = { type: p.production, row: p.row, col: p.col };
        }
    }

    this.engine.endTurn();

    // Detect production completions
    for (const id in prodBefore) {
        const before = prodBefore[id];
        const piece = this.engine.pieces.find(p => p.id === id);
        // Production completed if it changed or was cleared
        if (!piece || piece.production !== before.type || piece.productionProgress === 0) {
            this._emit('productionComplete', { row: before.row, col: before.col, type: before.type });
        }
    }

    const info = {
        turnNumber: this.engine.turnNumber,
        roundNumber: this.engine.roundNumber,
        currentPlayerIndex: this.engine.currentPlayerIndex,
        previousPlayerIndex: prevPlayer,
        gameOver: this.engine.gameOver,
        winner: this.engine.winner
    };
    this._emit('turnEnd', info);

    // Auto-play through AI turns if enabled
    if (this._autoAI) {
        this._runPendingAITurns();
    }

    info.currentPlayerIndex = this.engine.currentPlayerIndex;
    info.turnNumber = this.engine.turnNumber;
    info.roundNumber = this.engine.roundNumber;
    info.gameOver = this.engine.gameOver;
    info.winner = this.engine.winner;
    return info;
};

DevGame.prototype.declareWar = function(playerId, targetId) {
    this._captureUndoSnapshot();
    const result = this.engine.declareWar(playerId, targetId);
    this._emit('war', { playerId, targetId, result });
    return result;
};

DevGame.prototype.proposePeace = function(playerId, targetId) {
    this._captureUndoSnapshot();
    const result = this.engine.proposePeace(playerId, targetId);
    this._emit('peaceProposal', { playerId, targetId, result });
    return result;
};

DevGame.prototype.acceptPeace = function(playerId, targetId) {
    this._captureUndoSnapshot();
    const result = this.engine.acceptPeace(playerId, targetId);
    this._emit('peaceAccepted', { playerId, targetId, result });
    return result;
};

// ================================================================
// Simulation — evaluate without executing
// ================================================================

DevGame.prototype.simulateMove = function(row, col, targetRow, targetCol) {
    const piece = this.engine.board[row][col];
    if (!piece) return { valid: false };
    return this.engine.simulateMove(piece, targetRow, targetCol);
};

// ================================================================
// Dry-Run Validation — check without executing
// ================================================================

DevGame.prototype.validateAction = function(action) {
    if (!action || !action.type) {
        return { valid: false, reason: 'Action must have a type' };
    }

    switch (action.type) {
        case 'move': {
            const piece = this.engine.board[action.row] && this.engine.board[action.row][action.col];
            if (!piece) return { valid: false, reason: 'No piece at source tile' };
            const result = this.engine.canMoveTo(piece, action.targetRow, action.targetCol);
            return { valid: !!result.valid, reason: result.reason || null, isAttack: result.isAttack || false };
        }
        case 'settle': {
            const piece = this.engine.board[action.row] && this.engine.board[action.row][action.col];
            if (!piece) return { valid: false, reason: 'No piece at tile' };
            const result = this.engine.canSettlerBuildCity(piece);
            return { valid: !!result.valid, reason: result.reason || null };
        }
        case 'production': {
            const piece = this.engine.board[action.row] && this.engine.board[action.row][action.col];
            if (!piece) return { valid: false, reason: 'No piece at tile' };
            if (piece.type !== PIECE_TYPES.CITY) return { valid: false, reason: 'Not a city' };
            const prodType = action.productionType || action.production;
            if (!prodType) return { valid: false, reason: 'No production type specified' };
            if (!PRODUCTION_TYPES[prodType]) return { valid: false, reason: 'Invalid production type: ' + prodType };
            return { valid: true, reason: null };
        }
        case 'declareWar': {
            const canChange = this.engine.canChangeRelation(action.playerId, action.targetId);
            if (!canChange) return { valid: false, reason: 'Cannot change relation (cooldown or invalid players)' };
            const player = this.engine.players[action.playerId];
            if (!player) return { valid: false, reason: 'Invalid player' };
            if (player.relations[action.targetId] === 'war') return { valid: false, reason: 'Already at war' };
            return { valid: true, reason: null };
        }
        case 'proposePeace': {
            const canChange = this.engine.canChangeRelation(action.playerId, action.targetId);
            if (!canChange) return { valid: false, reason: 'Cannot change relation (cooldown or invalid players)' };
            const player = this.engine.players[action.playerId];
            if (!player) return { valid: false, reason: 'Invalid player' };
            if (player.relations[action.targetId] !== 'war') return { valid: false, reason: 'Not at war' };
            return { valid: true, reason: null };
        }
        default:
            return { valid: false, reason: 'Unknown action type: ' + action.type };
    }
};
