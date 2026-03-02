// ============================================
// DEV CONTROLS - State Module
// ============================================
// Read-only state access, queries, and serialization.

DevGame.prototype.getBoardData = function() {
    const board = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        const row = [];
        for (let c = 0; c < BOARD_SIZE; c++) {
            row.push({
                row: r,
                col: c,
                owner: this.engine.tileOwnership[r][c],
                piece: DevExport.pieceToPlain(this.engine.board[r][c])
            });
        }
        board.push(row);
    }
    return board;
};

DevGame.prototype.getTile = function(row, col) {
    if (!this.engine.isValidTile(row, col)) return null;
    return {
        row,
        col,
        owner: this.engine.tileOwnership[row][col],
        piece: DevExport.pieceToPlain(this.engine.board[row][col])
    };
};

DevGame.prototype.getPieces = function(filter) {
    let pieces = this.engine.pieces;
    if (filter) {
        if (filter.ownerId !== undefined) {
            pieces = pieces.filter(p => p.ownerId === filter.ownerId);
        }
        if (filter.type !== undefined) {
            pieces = pieces.filter(p => p.type === filter.type);
        }
    }
    return pieces.map(DevExport.pieceToPlain);
};

DevGame.prototype.getPieceById = function(pieceId) {
    const piece = this.engine.pieces.find(p => p.id === pieceId);
    return piece ? DevExport.pieceToPlain(piece) : null;
};

DevGame.prototype.getPlayers = function() {
    return this.engine.players.map(DevExport.playerToPlain);
};

DevGame.prototype.getPlayer = function(playerId) {
    const p = this.engine.players[playerId];
    return p ? DevExport.playerToPlain(p) : null;
};

DevGame.prototype.getCurrentPlayer = function() {
    return DevExport.playerToPlain(this.engine.getCurrentPlayer());
};

DevGame.prototype.getCurrentPlayerIndex = function() {
    return this.engine.currentPlayerIndex;
};

// ================================================================
// Ownership & Territory queries
// ================================================================

DevGame.prototype.getTileOwnership = function() {
    return this.engine.tileOwnership.map(row => row.slice());
};

DevGame.prototype.getTerritoryCounts = function() {
    const counts = {};
    for (let i = 0; i < this.engine.players.length; i++) {
        counts[i] = 0;
    }
    counts.unowned = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const owner = this.engine.tileOwnership[r][c];
            if (owner === null) {
                counts.unowned++;
            } else {
                counts[owner] = (counts[owner] || 0) + 1;
            }
        }
    }
    return counts;
};

// ================================================================
// Scoring queries
// ================================================================

DevGame.prototype.getPlayerScores = function() {
    return this.engine.calculatePlayerScores();
};

DevGame.prototype.getPlayerScore = function(playerId) {
    return this.engine.calculatePlayerScore(playerId);
};

// ================================================================
// Movement queries
// ================================================================

DevGame.prototype.getValidMoves = function(row, col) {
    const piece = this.engine.board[row][col];
    if (!piece) return [];
    return this.engine.getValidMoves(piece);
};

DevGame.prototype.canMoveTo = function(row, col, targetRow, targetCol) {
    const piece = this.engine.board[row][col];
    if (!piece) return { valid: false, reason: 'No piece at tile' };
    return this.engine.canMoveTo(piece, targetRow, targetCol);
};

DevGame.prototype.canSettleAt = function(row, col) {
    const piece = this.engine.board[row][col];
    if (!piece) return { valid: false, reason: 'No piece at tile' };
    return this.engine.canSettlerBuildCity(piece);
};

DevGame.prototype.canChangeRelation = function(playerId, targetId) {
    return this.engine.canChangeRelation(playerId, targetId);
};

// ================================================================
// State Snapshots — full serializable state
// ================================================================

DevGame.prototype.getState = function() {
    return {
        id: this.id,
        turnNumber: this.engine.turnNumber,
        roundNumber: this.engine.roundNumber,
        currentPlayerIndex: this.engine.currentPlayerIndex,
        gameOver: this.engine.gameOver,
        winner: this.engine.winner,
        gameEndingEnabled: this._gameEndingEnabled,
        players: this.getPlayers(),
        board: this.getBoardData(),
        scores: this.getPlayerScores(),
        actionLogLength: this.engine.actionLog.length
    };
};

DevGame.prototype.getCompactState = function() {
    const pieces = this.engine.pieces.map(p => ({
        id: p.id, t: p.type, o: p.ownerId,
        r: p.row, c: p.col,
        hp: p.hp, mhp: p.maxHp, d: p.damage,
        pr: p.production, pp: p.productionProgress
    }));
    return {
        id: this.id,
        tn: this.engine.turnNumber,
        rn: this.engine.roundNumber,
        cp: this.engine.currentPlayerIndex,
        go: this.engine.gameOver,
        w: this.engine.winner,
        pieces,
        own: this.engine.tileOwnership.map(row => row.slice()),
        players: this.engine.players.map(p => ({
            id: p.id, ts: p.techScore, el: p.eliminated,
            rel: { ...p.relations },
            wk: p.warriorKills || 0,
            wl: p.warriorsLost || 0
        })),
        scores: this.getPlayerScores()
    };
};

DevGame.prototype.toJSON = function() {
    return this.getState();
};

DevGame.prototype.exportToFile = function(filename) {
    const json = DevExport.gameToJSON(this);
    if (typeof document !== 'undefined') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `civchess-${this.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return true;
    }
    return json;
};

// ================================================================
// Production Queries
// ================================================================

DevGame.prototype.getProduction = function(row, col) {
    const piece = this.engine.board[row] && this.engine.board[row][col];
    if (!piece || piece.type !== PIECE_TYPES.CITY) return null;
    if (!piece.production) return null;
    const prodDef = PRODUCTION_TYPES[piece.production];
    const totalTurns = prodDef ? prodDef.turns : 0;
    const progress = piece.productionProgress || 0;
    return {
        type: piece.production,
        progress: progress,
        turnsRemaining: Math.max(0, totalTurns - progress),
        paused: !piece.production,
        repeat: piece.repeatProduction || false
    };
};

DevGame.prototype.getAllProduction = function() {
    const results = [];
    for (let i = 0; i < this.engine.pieces.length; i++) {
        const p = this.engine.pieces[i];
        if (p.type === PIECE_TYPES.CITY && p.production) {
            const prodDef = PRODUCTION_TYPES[p.production];
            const totalTurns = prodDef ? prodDef.turns : 0;
            const progress = p.productionProgress || 0;
            results.push({
                row: p.row,
                col: p.col,
                ownerId: p.ownerId,
                type: p.production,
                progress: progress,
                turnsRemaining: Math.max(0, totalTurns - progress),
                repeat: p.repeatProduction || false
            });
        }
    }
    return results;
};

DevGame.prototype.getProductionQueue = function() {
    const byPlayer = {};
    for (let i = 0; i < this.engine.players.length; i++) {
        byPlayer[i] = [];
    }
    for (let i = 0; i < this.engine.pieces.length; i++) {
        const p = this.engine.pieces[i];
        if (p.type === PIECE_TYPES.CITY) {
            const entry = {
                row: p.row,
                col: p.col,
                production: p.production || null,
                progress: p.productionProgress || 0,
                repeat: p.repeatProduction || false
            };
            if (p.production) {
                const prodDef = PRODUCTION_TYPES[p.production];
                entry.turnsRemaining = prodDef ? Math.max(0, prodDef.turns - entry.progress) : 0;
            }
            if (byPlayer[p.ownerId]) {
                byPlayer[p.ownerId].push(entry);
            }
        }
    }
    return byPlayer;
};

// ================================================================
// State Import
// ================================================================

DevGame.prototype.importState = function(stateObj) {
    if (!stateObj) return { success: false, reason: 'No state provided' };

    this._captureUndoSnapshot();

    // Determine format (full getState or compact getCompactState)
    const isCompact = stateObj.tn !== undefined;

    // Clear board
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            this.engine.board[r][c] = null;
            this.engine.tileOwnership[r][c] = null;
        }
    }
    this.engine.pieces.length = 0;

    // Restore scalars
    if (isCompact) {
        this.engine.turnNumber = stateObj.tn || 1;
        this.engine.roundNumber = stateObj.rn || 1;
        this.engine.currentPlayerIndex = stateObj.cp || 0;
        this.engine.gameOver = stateObj.go || false;
        this.engine.winner = stateObj.w !== undefined ? stateObj.w : null;
    } else {
        this.engine.turnNumber = stateObj.turnNumber || 1;
        this.engine.roundNumber = stateObj.roundNumber || 1;
        this.engine.currentPlayerIndex = stateObj.currentPlayerIndex || 0;
        this.engine.gameOver = stateObj.gameOver || false;
        this.engine.winner = stateObj.winner !== undefined ? stateObj.winner : null;
    }

    // Restore players
    const playerData = stateObj.players || [];
    for (let i = 0; i < playerData.length && i < this.engine.players.length; i++) {
        const src = playerData[i];
        const dst = this.engine.players[i];
        if (isCompact) {
            if (src.ts !== undefined) dst.techScore = src.ts;
            if (src.el !== undefined) dst.eliminated = src.el;
            if (src.wk !== undefined) dst.warriorKills = src.wk;
            if (src.wl !== undefined) dst.warriorsLost = src.wl;
            if (src.rel) {
                for (const k in src.rel) dst.relations[k] = src.rel[k];
            }
        } else {
            if (src.techScore !== undefined) dst.techScore = src.techScore;
            if (src.eliminated !== undefined) dst.eliminated = src.eliminated;
            if (src.warriorKills !== undefined) dst.warriorKills = src.warriorKills;
            if (src.warriorsLost !== undefined) dst.warriorsLost = src.warriorsLost;
            if (src.relations) {
                for (const k in src.relations) dst.relations[k] = src.relations[k];
            }
        }
    }

    // Restore tile ownership
    const ownership = isCompact ? stateObj.own : null;
    if (ownership) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (ownership[r]) this.engine.tileOwnership[r][c] = ownership[r][c];
            }
        }
    }

    // Restore pieces
    const pieces = isCompact ? stateObj.pieces : null;
    if (pieces) {
        for (let i = 0; i < pieces.length; i++) {
            const src = pieces[i];
            const type = isCompact ? src.t : src.type;
            const ownerId = isCompact ? src.o : src.ownerId;
            const row = isCompact ? src.r : src.row;
            const col = isCompact ? src.c : src.col;
            const piece = this.engine.createPiece(type, ownerId, row, col);
            piece.hp = src.hp !== undefined ? src.hp : piece.hp;
            piece.maxHp = (isCompact ? src.mhp : src.maxHp) || piece.maxHp;
            piece.damage = (isCompact ? src.d : src.damage) || piece.damage;
            piece.production = (isCompact ? src.pr : src.production) || null;
            piece.productionProgress = (isCompact ? src.pp : src.productionProgress) || 0;
            this.engine.pieces.push(piece);
            this.engine.board[row][col] = piece;
        }
    }

    // If full format with board data but no compact pieces, extract from board
    if (!isCompact && stateObj.board && !pieces) {
        for (let r = 0; r < stateObj.board.length; r++) {
            for (let c = 0; c < stateObj.board[r].length; c++) {
                const tile = stateObj.board[r][c];
                if (tile.owner !== undefined && tile.owner !== null) {
                    this.engine.tileOwnership[r][c] = tile.owner;
                }
                if (tile.piece) {
                    const src = tile.piece;
                    const piece = this.engine.createPiece(src.type, src.ownerId, r, c);
                    if (src.hp !== undefined) piece.hp = src.hp;
                    if (src.maxHp !== undefined) piece.maxHp = src.maxHp;
                    if (src.damage !== undefined) piece.damage = src.damage;
                    if (src.production) piece.production = src.production;
                    if (src.productionProgress) piece.productionProgress = src.productionProgress;
                    this.engine.pieces.push(piece);
                    this.engine.board[r][c] = piece;
                }
            }
        }
    }

    this._emit('stateImported', { source: isCompact ? 'compact' : 'full' });
    return { success: true };
};

DevGame.prototype.importFromJSON = function(jsonString) {
    try {
        const obj = JSON.parse(jsonString);
        return this.importState(obj);
    } catch (e) {
        return { success: false, reason: 'Invalid JSON: ' + e.message };
    }
};

// ================================================================
// ML State Encoding
// ================================================================

DevGame.prototype.encodeStateForML = function(playerId) {
    if (typeof this.engine.encodeStateForML !== 'function') return null;
    return this.engine.encodeStateForML(playerId);
};
