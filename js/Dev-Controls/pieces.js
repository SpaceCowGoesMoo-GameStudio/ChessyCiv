// ============================================
// DEV CONTROLS - Pieces Module
// ============================================
// Piece CRUD and stat manipulation.

DevGame.prototype._validatePlacement = function(row, col) {
    if (!this.engine.isValidTile(row, col)) {
        return { success: false, reason: 'Out of bounds' };
    }
    if (this.engine.board[row][col]) {
        return { success: false, reason: 'Tile is occupied' };
    }
    return null;
};

DevGame.prototype._validateOwner = function(ownerId) {
    if (!this.engine.players[ownerId] || this.engine.players[ownerId].eliminated) {
        return { success: false, reason: 'Invalid or eliminated player' };
    }
    return null;
};

DevGame.prototype._placePiece = function(type, ownerId, row, col, hp, maxHp) {
    const ownerErr = this._validateOwner(ownerId);
    if (ownerErr) return ownerErr;
    const placeErr = this._validatePlacement(row, col);
    if (placeErr) return placeErr;

    this._captureUndoSnapshot();
    const piece = this.engine.createPiece(type, ownerId, row, col);
    if (maxHp !== undefined) piece.maxHp = Math.max(1, maxHp);
    if (hp !== undefined) piece.hp = Math.max(0, Math.min(hp, piece.maxHp));
    this.engine.pieces.push(piece);
    this.engine.board[row][col] = piece;
    this.engine.tileOwnership[row][col] = ownerId;
    this._emit('pieceCreated', { type, ownerId, row, col, piece: DevExport.pieceToPlain(piece) });
    return { success: true, piece: DevExport.pieceToPlain(piece) };
};

DevGame.prototype.createWarrior = function(ownerId, row, col) {
    return this._placePiece(PIECE_TYPES.WARRIOR, ownerId, row, col);
};

DevGame.prototype.createSettler = function(ownerId, row, col) {
    return this._placePiece(PIECE_TYPES.SETTLER, ownerId, row, col);
};

DevGame.prototype.createCity = function(ownerId, row, col) {
    return this._placePiece(PIECE_TYPES.CITY, ownerId, row, col);
};

DevGame.prototype.removePiece = function(row, col) {
    if (!this.engine.isValidTile(row, col)) return false;
    const piece = this.engine.board[row][col];
    if (!piece) return false;
    this._captureUndoSnapshot();
    const plain = DevExport.pieceToPlain(piece);
    this.engine.removePiece(piece);
    this._emit('pieceRemoved', { row, col, piece: plain });
    return true;
};

// ================================================================
// Bulk Piece Placement
// ================================================================

DevGame.prototype.placePieces = function(pieceConfigs) {
    if (!Array.isArray(pieceConfigs)) return { success: false, reason: 'Expected array' };
    const results = [];
    for (let i = 0; i < pieceConfigs.length; i++) {
        const cfg = pieceConfigs[i];
        results.push(this._placePiece(cfg.type, cfg.ownerId, cfg.row, cfg.col, cfg.hp, cfg.maxHp));
    }
    return results;
};

DevGame.prototype.loadBoard = function(config) {
    if (!config || !Array.isArray(config.pieces)) {
        return { success: false, reason: 'Config must have a pieces array' };
    }
    this.clearBoard();
    this._emit('boardCleared', {});

    // Set tile ownership if provided
    if (config.tileOwnership) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (config.tileOwnership[r] && config.tileOwnership[r][c] !== undefined) {
                    this.engine.tileOwnership[r][c] = config.tileOwnership[r][c];
                }
            }
        }
    }

    // Set up players if provided
    if (config.players) {
        for (let i = 0; i < config.players.length; i++) {
            const pcfg = config.players[i];
            const player = this.engine.players[pcfg.id !== undefined ? pcfg.id : i];
            if (player && pcfg.techScore !== undefined) player.techScore = pcfg.techScore;
            if (player && pcfg.eliminated !== undefined) player.eliminated = pcfg.eliminated;
            if (player && pcfg.relations) {
                for (const tid in pcfg.relations) {
                    player.relations[tid] = pcfg.relations[tid];
                }
            }
        }
    }

    const results = this.placePieces(config.pieces);
    return { success: true, piecesPlaced: results };
};

// ================================================================
// Piece Manipulation — direct stat modification
// ================================================================

DevGame.prototype.setPieceHp = function(row, col, hp) {
    const piece = this.engine.board[row][col];
    if (!piece) return false;
    piece.hp = Math.max(0, Math.min(hp, piece.maxHp));
    return true;
};

DevGame.prototype.setPieceMaxHp = function(row, col, maxHp) {
    const piece = this.engine.board[row][col];
    if (!piece) return false;
    piece.maxHp = Math.max(1, maxHp);
    if (piece.hp > piece.maxHp) piece.hp = piece.maxHp;
    return true;
};

DevGame.prototype.setPieceDamage = function(row, col, damage) {
    const piece = this.engine.board[row][col];
    if (!piece) return false;
    piece.damage = Math.max(0, damage);
    return true;
};

DevGame.prototype.setPieceOwner = function(row, col, newOwnerId) {
    const piece = this.engine.board[row][col];
    if (!piece) return false;
    if (!this.engine.players[newOwnerId]) return false;
    piece.ownerId = newOwnerId;
    return true;
};

DevGame.prototype.setPieceHasMoved = function(row, col, hasMoved) {
    const piece = this.engine.board[row][col];
    if (!piece) return false;
    piece.hasMoved = hasMoved;
    return true;
};

DevGame.prototype.teleportPiece = function(fromRow, fromCol, toRow, toCol) {
    if (!this.engine.isValidTile(fromRow, fromCol)) return { success: false, reason: 'Source out of bounds' };
    if (!this.engine.isValidTile(toRow, toCol)) return { success: false, reason: 'Target out of bounds' };
    const piece = this.engine.board[fromRow][fromCol];
    if (!piece) return { success: false, reason: 'No piece at source' };
    if (this.engine.board[toRow][toCol]) return { success: false, reason: 'Target occupied' };
    this.engine.board[fromRow][fromCol] = null;
    piece.row = toRow;
    piece.col = toCol;
    this.engine.board[toRow][toCol] = piece;
    return { success: true, piece: DevExport.pieceToPlain(piece) };
};
