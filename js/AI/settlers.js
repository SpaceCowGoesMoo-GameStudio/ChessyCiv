// ============================================
// SETTLER ACTIONS
// ============================================

/**
 * Handle actions for all settlers
 */
CivChessAI.prototype.handleSettlerActions = function() {
    const actions = [];
    const settlers = this.gameState.ownPieces.settlers;

    for (const settler of settlers) {
        const engineSettler = this.engine.pieces.find(p => p.id === settler.id);
        if (!engineSettler || engineSettler.hasMoved) continue;

        // Check if we can build a city here
        const canBuild = this.engine.canSettlerBuildCity(engineSettler);
        if (canBuild.valid) {
            const buildResult = this.engine.settlerBuildCity(engineSettler);
            if (buildResult.success) {
                actions.push({
                    type: AI_ACTION_TYPE.BUILD_CITY,
                    settlerId: settler.id,
                    location: { row: settler.row, col: settler.col }
                });
                continue;
            }
        }

        // Move toward best city location
        const moveAction = this.moveSettler(engineSettler);
        if (moveAction) {
            actions.push(moveAction);
        }
    }

    return actions;
};

/**
 * Move a settler toward the best city location
 */
CivChessAI.prototype.moveSettler = function(settler) {
    // Find best city spot
    const validSpots = this.findValidCitySpots();
    if (validSpots.length === 0) {
        // No valid spots on owned territory - find unowned territory to expand to
        return this.moveSettlerToExpand(settler);
    }

    // Sort spots by a combination of distance and value
    // Prioritize closer spots but also consider high-value locations
    const scoredSpots = validSpots.map(spot => ({
        ...spot,
        distance: this.getManhattanDistance(settler, spot),
        score: spot.value / (this.getManhattanDistance(settler, spot) + 1)
    })).sort((a, b) => b.score - a.score);

    // Try A* pathfinding for top spots until we find one with a valid path
    // Limit to top 5 spots to avoid excessive pathfinding calls
    const spotsToTry = scoredSpots.slice(0, 5);
    for (const spot of spotsToTry) {
        const bestMove = this.findSettlerPathAStar(settler, spot);
        if (bestMove) {
            const originalPos = { row: settler.row, col: settler.col };
            const result = this.engine.movePiece(settler, bestMove.row, bestMove.col);
            if (result.success) {
                return {
                    type: AI_ACTION_TYPE.MOVE_UNIT,
                    pieceId: settler.id,
                    from: originalPos,
                    to: bestMove
                };
            }
        }
    }

    // Fallback: greedy approach if BFS fails (shouldn't happen often)
    const validMoves = this.engine.getValidMoves(settler);
    if (validMoves.length === 0) return null;

    // Try any move that makes progress toward any valid spot
    let bestMove = null;
    let bestProgress = -Infinity;

    for (const move of validMoves) {
        for (const spot of validSpots) {
            const currentDist = this.getManhattanDistance(settler, spot);
            const newDist = this.getManhattanDistance(move, spot);
            const progress = currentDist - newDist;

            if (progress > bestProgress) {
                bestProgress = progress;
                bestMove = move;
            }
        }
    }

    if (bestMove && bestProgress > 0) {
        const originalPos = { row: settler.row, col: settler.col };
        const result = this.engine.movePiece(settler, bestMove.row, bestMove.col);
        if (result.success) {
            return {
                type: AI_ACTION_TYPE.MOVE_UNIT,
                pieceId: settler.id,
                from: originalPos,
                to: bestMove
            };
        }
    }

    return null;
};

/**
 * Move settler toward unowned territory for expansion
 */
CivChessAI.prototype.moveSettlerToExpand = function(settler) {
    // Move toward territory we could build a city on once we expand
    const potentialSpots = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (this.expansionHeatmap[r][c] > 0 &&
                this.engine.tileOwnership[r][c] === null) {
                potentialSpots.push({ row: r, col: c, value: this.expansionHeatmap[r][c] });
            }
        }
    }

    if (potentialSpots.length === 0) return null;

    // Score spots by value and distance
    const scoredSpots = potentialSpots.map(spot => ({
        ...spot,
        distance: this.getManhattanDistance(settler, spot),
        score: spot.value / (this.getManhattanDistance(settler, spot) + 1)
    })).sort((a, b) => b.score - a.score);

    // Try A* pathfinding for top potential spots (limit to 5 for efficiency)
    const spotsToTry = scoredSpots.slice(0, 5);
    for (const spot of spotsToTry) {
        const bestMove = this.findSettlerPathAStar(settler, spot);
        if (bestMove) {
            const originalPos = { row: settler.row, col: settler.col };
            const result = this.engine.movePiece(settler, bestMove.row, bestMove.col);
            if (result.success) {
                return {
                    type: AI_ACTION_TYPE.MOVE_UNIT,
                    pieceId: settler.id,
                    from: originalPos,
                    to: bestMove
                };
            }
        }
    }

    // Fallback: greedy move toward best spot
    const validMoves = this.engine.getValidMoves(settler);
    if (validMoves.length === 0) return null;

    let bestMove = null;
    let bestProgress = -Infinity;

    for (const move of validMoves) {
        for (const spot of scoredSpots.slice(0, 3)) { // Check top 3 spots
            const currentDist = this.getManhattanDistance(settler, spot);
            const newDist = this.getManhattanDistance(move, spot);
            const progress = currentDist - newDist;

            if (progress > bestProgress) {
                bestProgress = progress;
                bestMove = move;
            }
        }
    }

    if (bestMove && bestProgress > 0) {
        const originalPos = { row: settler.row, col: settler.col };
        const result = this.engine.movePiece(settler, bestMove.row, bestMove.col);
        if (result.success) {
            return {
                type: AI_ACTION_TYPE.MOVE_UNIT,
                pieceId: settler.id,
                from: originalPos,
                to: bestMove
            };
        }
    }

    return null;
};
