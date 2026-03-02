// ============================================
// POSITION FINDING
// ============================================

/**
 * Find a good border position for a warrior
 */
CivChessAI.prototype.findBorderPosition = function(warrior) {
    // Find good border positions
    // Ideal: diagonal walls >= 25% of board, or surrounding enemy heat maps
    const positions = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            // Skip occupied tiles
            if (this.engine.board[r][c]) continue;

            // Check if this is a good border position
            const isEdge = r === 0 || r === BOARD_SIZE - 1 || c === 0 || c === BOARD_SIZE - 1;
            const controlValue = this.territoryHeatmap[r][c];

            // Good border: on our side but close to contested
            if (controlValue > -0.2 && controlValue < 0.5) {
                // Check if it forms part of a diagonal/orthogonal wall
                const wallScore = this.calculateWallScore(r, c);
                positions.push({ row: r, col: c, score: wallScore });
            }
        }
    }

    if (positions.length === 0) return null;

    // Sort by score and distance
    positions.sort((a, b) => {
        const distA = this.getDistance(warrior, a);
        const distB = this.getDistance(warrior, b);
        return (b.score - distA * 0.1) - (a.score - distB * 0.1);
    });

    return positions[0];
};

/**
 * Calculate wall formation score for a position
 */
CivChessAI.prototype.calculateWallScore = function(row, col) {
    let score = 0;

    // Check for nearby friendly warriors that could form a wall
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

    for (const [dr, dc] of directions) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;

        const piece = this.engine.board[nr][nc];
        if (piece && piece.type === PIECE_TYPES.WARRIOR && piece.ownerId === this.playerId) {
            // Adjacent friendly warrior - good for wall
            if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
                score += 3; // Diagonal - forms blockade
            } else {
                score += 2; // Orthogonal - solid wall
            }
        }
    }

    // Bonus for positions that block enemy approaches
    const threatValue = this.threatHeatmap[row][col];
    if (threatValue > 0.3) {
        score += threatValue * 2; // Good to block high-threat approaches
    }

    return score;
};

/**
 * Find a defensive position near our cities
 */
CivChessAI.prototype.findDefensePosition = function(warrior) {
    // Find positions that defend our cities
    // Ideal: 4 warriors per city in orthogonal positions
    const defensePositions = this.strategicPositions.defensivePositions;

    if (defensePositions.length === 0) return null;

    // Check which positions are unoccupied and not already assigned
    const availablePositions = defensePositions.filter(pos => {
        const piece = this.engine.board[pos.row][pos.col];
        return !piece;
    });

    if (availablePositions.length === 0) return null;

    // Find closest available position
    return this.findClosestTarget(warrior, availablePositions);
};

/**
 * Find a posturing position facing enemy buildup
 */
CivChessAI.prototype.findPosturePosition = function(warrior) {
    // Find position near enemy buildup
    const builderIds = [];
    for (const [id, profile] of this.playerProfiles) {
        if (profile.isBuilding) {
            builderIds.push(id);
        }
    }

    if (builderIds.length === 0) return null;

    // Find positions facing the buildup
    const positions = [];
    for (const builderId of builderIds) {
        const enemyPieces = this.gameState.enemyPieces[builderId];
        if (!enemyPieces) continue;

        // Find center of enemy forces
        let avgRow = 0, avgCol = 0, count = 0;
        for (const w of enemyPieces.warriors) {
            avgRow += w.row;
            avgCol += w.col;
            count++;
        }
        if (count === 0) continue;

        avgRow = Math.round(avgRow / count);
        avgCol = Math.round(avgCol / count);

        // Find positions between us and them
        for (const city of this.gameState.ownPieces.cities) {
            const midRow = Math.round((city.row + avgRow) / 2);
            const midCol = Math.round((city.col + avgCol) / 2);

            // Find empty tiles near midpoint
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const r = midRow + dr;
                    const c = midCol + dc;
                    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
                    if (this.engine.board[r][c]) continue;

                    positions.push({ row: r, col: c });
                }
            }
        }
    }

    if (positions.length === 0) return null;

    return this.findClosestTarget(warrior, positions);
};
