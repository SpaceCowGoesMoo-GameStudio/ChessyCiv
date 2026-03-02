// ============================================
// GAME ENGINE - Movement Module
// ============================================
// Movement validation, path checking, and piece movement execution.

GameEngine.prototype.canMoveTo = function(piece, targetRow, targetCol) {
    if (!this.isValidTile(targetRow, targetCol)) {
        return { valid: false, reason: 'Out of bounds' };
    }

    if (piece.hasMoved) {
        return { valid: false, reason: 'Piece has already moved this turn' };
    }

    if (piece.type === PIECE_TYPES.CITY) {
        return { valid: false, reason: 'Cities cannot move' };
    }

    const currentPlayer = this.players[piece.ownerId];
    const tileOwner = this.tileOwnership[targetRow][targetCol];

    // Check tile ownership restrictions
    if (tileOwner !== null && tileOwner !== piece.ownerId) {
        const relation = currentPlayer.relations[tileOwner];
        if (relation === 'peace') {
            return { valid: false, reason: 'Cannot move onto tile owned by player at peace' };
        }
    }

    // Check movement range
    const rowDiff = Math.abs(targetRow - piece.row);
    const colDiff = Math.abs(targetCol - piece.col);

    if (piece.type === PIECE_TYPES.WARRIOR) {
        // Warriors move 1 tile including diagonals
        if (rowDiff > 1 || colDiff > 1) {
            return { valid: false, reason: 'Warriors can only move 1 tile' };
        }
        if (rowDiff === 0 && colDiff === 0) {
            return { valid: false, reason: 'Must move to a different tile' };
        }
    } else if (piece.type === PIECE_TYPES.SETTLER) {
        // Settlers move up to 3 tiles orthogonally (no diagonal)
        if (rowDiff > 0 && colDiff > 0) {
            return { valid: false, reason: 'Settlers cannot move diagonally' };
        }
        if (rowDiff > 3 || colDiff > 3) {
            return { valid: false, reason: 'Settlers can only move up to 3 tiles' };
        }
        if (rowDiff === 0 && colDiff === 0) {
            return { valid: false, reason: 'Must move to a different tile' };
        }
        // Check path is clear for settler
        if (!this.isPathClear(piece.row, piece.col, targetRow, targetCol)) {
            return { valid: false, reason: 'Path is blocked' };
        }
    }

    // Check for blockade (two warriors on opposite diagonal of a 2x2 square)
    if (this.isBlockedByBlockade(piece.row, piece.col, targetRow, targetCol, piece.ownerId)) {
        return { valid: false, reason: 'Blocked by enemy blockade' };
    }

    // Check for piece collision
    const targetPiece = this.board[targetRow][targetCol];
    if (targetPiece) {
        if (piece.type === PIECE_TYPES.SETTLER) {
            return { valid: false, reason: 'Settlers cannot attack' };
        }
        if (piece.type === PIECE_TYPES.WARRIOR) {
            const relation = currentPlayer.relations[targetPiece.ownerId];
            if (relation === 'peace') {
                return { valid: false, reason: 'Cannot attack player at peace' };
            }
            if (targetPiece.ownerId === piece.ownerId) {
                return { valid: false, reason: 'Cannot attack own piece' };
            }
        }
    }

    return { valid: true };
};

GameEngine.prototype.isPathClear = function(fromRow, fromCol, toRow, toCol) {
    const rowDir = Math.sign(toRow - fromRow);
    const colDir = Math.sign(toCol - fromCol);

    let r = fromRow + rowDir;
    let c = fromCol + colDir;

    while (r !== toRow || c !== toCol) {
        if (this.board[r][c]) {
            return false;
        }
        r += rowDir;
        c += colDir;
    }

    return true;
};

/**
 * Check if movement is blocked by a blockade.
 * A blockade forms when two warriors from the same player occupy diagonal
 * corners of a 2x2 square. Pieces cannot cross between them diagonally.
 *
 * Example: Warriors at positions marked W form a blockade:
 *   W .    or    . W
 *   . W          W .
 *
 * A piece at top-right cannot move to bottom-left (and vice versa) in the first case.
 * A piece at top-left cannot move to bottom-right (and vice versa) in the second case.
 */
GameEngine.prototype.isBlockedByBlockade = function(fromRow, fromCol, toRow, toCol, movingOwnerId) {
    const rowDiff = toRow - fromRow;
    const colDiff = toCol - fromCol;

    // Only diagonal movements (1 step) can be blocked by a blockade
    if (Math.abs(rowDiff) !== 1 || Math.abs(colDiff) !== 1) {
        return false;
    }

    // For diagonal movement, check if the opposite diagonal of the 2x2 square
    // has two warriors from the same player (forming a blockade)
    // The opposite diagonal positions are: (fromRow, toCol) and (toRow, fromCol)
    const pos1Row = fromRow;
    const pos1Col = toCol;
    const pos2Row = toRow;
    const pos2Col = fromCol;

    const piece1 = this.board[pos1Row]?.[pos1Col];
    const piece2 = this.board[pos2Row]?.[pos2Col];

    // Both positions must have warriors from the same player
    if (!piece1 || !piece2) return false;
    if (piece1.type !== PIECE_TYPES.WARRIOR || piece2.type !== PIECE_TYPES.WARRIOR) return false;
    if (piece1.ownerId !== piece2.ownerId) return false;

    // A player's own blockade does not block their own pieces
    if (piece1.ownerId === movingOwnerId) return false;

    return true;
};

GameEngine.prototype.getValidMoves = function(piece) {
    const moves = [];

    if (piece.type === PIECE_TYPES.CITY || piece.hasMoved) {
        return moves;
    }

    if (piece.type === PIECE_TYPES.WARRIOR) {
        // Check all 8 adjacent tiles
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const newRow = piece.row + dr;
                const newCol = piece.col + dc;
                if (this.canMoveTo(piece, newRow, newCol).valid) {
                    moves.push({ row: newRow, col: newCol });
                }
            }
        }
    } else if (piece.type === PIECE_TYPES.SETTLER) {
        // Check orthogonal moves up to 3 tiles
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of directions) {
            for (let dist = 1; dist <= 3; dist++) {
                const newRow = piece.row + dr * dist;
                const newCol = piece.col + dc * dist;
                if (this.canMoveTo(piece, newRow, newCol).valid) {
                    moves.push({ row: newRow, col: newCol });
                } else {
                    break; // Can't go further in this direction
                }
            }
        }
    }

    return moves;
};

GameEngine.prototype.movePiece = function(piece, targetRow, targetCol) {
    const canMove = this.canMoveTo(piece, targetRow, targetCol);
    if (!canMove.valid) {
        this.log('MOVE_DENIED', { piece: piece.id, reason: canMove.reason });
        return { success: false, reason: canMove.reason };
    }

    const targetPiece = this.board[targetRow][targetCol];
    let combatResult = null;

    // Handle combat
    if (targetPiece && piece.type === PIECE_TYPES.WARRIOR) {
        combatResult = this.resolveCombat(piece, targetPiece);
        if (!combatResult.attackerSurvived) {
            return { success: true, combat: combatResult };
        }
        // If defender survived OR city was captured, attacker stays at original position
        if (!combatResult.defenderDestroyed || combatResult.cityFlipped) {
            piece.hasMoved = true;
            return {
                success: true,
                combat: combatResult,
                blocked: true,
                originalPos: { row: piece.row, col: piece.col },
                targetPos: { row: targetRow, col: targetCol }
            };
        }
    }

    // Move the piece
    this.board[piece.row][piece.col] = null;
    piece.row = targetRow;
    piece.col = targetCol;
    this.board[targetRow][targetCol] = piece;
    piece.hasMoved = true;

    // Warriors flip tile ownership only if owned by enemy at war
    if (piece.type === PIECE_TYPES.WARRIOR) {
        const tileOwner = this.tileOwnership[targetRow][targetCol];
        if (tileOwner !== null && tileOwner !== piece.ownerId) {
            const relation = this.players[piece.ownerId].relations[tileOwner];
            if (relation === 'war' || relation === 'peace_proposed') {
                this.tileOwnership[targetRow][targetCol] = piece.ownerId;
            }
        }
    }

    this.log('MOVE', { piece: piece.id, to: { row: targetRow, col: targetCol } });

    // Capture history snapshot after move
    this.history.captureSnapshot(this, 'MOVE', {
        piece: piece.id,
        to: { row: targetRow, col: targetCol },
        combat: combatResult
    });

    const result = { success: true };
    if (combatResult) {
        result.combat = combatResult;
    }
    return result;
};

/**
 * Validate a move by piece ID (used by ML StateEncoder).
 * Returns { valid, isAttack } for compatibility with agent/browser (ML Player Controller).
 */
GameEngine.prototype.validateMove = function(pieceId, targetRow, targetCol) {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!piece) return { valid: false };
    const result = this.canMoveTo(piece, targetRow, targetCol);
    if (!result.valid) return { valid: false };
    const targetPiece = this.board[targetRow][targetCol];
    return {
        valid: true,
        isAttack: !!(targetPiece && targetPiece.ownerId !== piece.ownerId)
    };
};
