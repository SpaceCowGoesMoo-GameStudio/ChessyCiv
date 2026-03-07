// ============================================
// GAME ENGINE - Settlers Module
// ============================================
// Settler-specific actions: city founding validation and execution.

GameEngine.prototype.canSettlerBuildCity = function(settler) {
    if (settler.type !== PIECE_TYPES.SETTLER) {
        return { valid: false, reason: 'Not a settler' };
    }

    // Cannot settle after having moved this turn
    if (settler.hasMoved) {
        return { valid: false, reason: 'Cannot settle after moving' };
    }

    // Check if tile is owned by settler's owner (per game rules: "tile is owned")
    const tileOwner = this.tileOwnership[settler.row][settler.col];
    if (tileOwner !== settler.ownerId) {
        return { valid: false, reason: 'Must be on owned tile' };
    }

    // Check distance from other cities (at least 2 tiles)
    for (const piece of this.pieces) {
        if (piece.type === PIECE_TYPES.CITY) {
            const rowDiff = Math.abs(piece.row - settler.row);
            const colDiff = Math.abs(piece.col - settler.col);
            if (rowDiff <= 1 && colDiff <= 1) {
                return { valid: false, reason: 'Too close to another city' };
            }
        }
    }

    return { valid: true };
};

GameEngine.prototype.settlerBuildCity = function(settler) {
    const canBuild = this.canSettlerBuildCity(settler);
    if (!canBuild.valid) {
        this.log('BUILD_CITY_DENIED', { reason: canBuild.reason });
        return { success: false, reason: canBuild.reason };
    }

    // Remove settler
    this.removePiece(settler);

    // Create city
    const city = this.createPiece(PIECE_TYPES.CITY, settler.ownerId, settler.row, settler.col);
    this.pieces.push(city);
    this.board[settler.row][settler.col] = city;
    this.tileOwnership[settler.row][settler.col] = settler.ownerId;

    this.log('CITY_BUILT', { city: city.id, location: { row: settler.row, col: settler.col } });

    // Capture history snapshot for city built
    this.history.captureSnapshot(this, 'CITY_BUILT', {
        city: city.id,
        location: { row: settler.row, col: settler.col },
        owner: settler.ownerId
    });

    return { success: true, city: city };
};
