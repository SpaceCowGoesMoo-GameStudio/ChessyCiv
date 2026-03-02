// ============================================
// UNIT MOVEMENT
// ============================================

/**
 * Handle movement for all warriors
 */
CivChessAI.prototype.handleUnitMovement = function() {
    const actions = [];
    const warriors = this.gameState.ownPieces.warriors;

    for (const warrior of warriors) {
        const engineWarrior = this.engine.pieces.find(p => p.id === warrior.id);
        if (!engineWarrior || engineWarrior.hasMoved) continue;

        const moveAction = this.moveWarrior(engineWarrior);
        if (moveAction) {
            actions.push(moveAction);

            // Track warscore for combat actions
            if (moveAction.combat) {
                this.handleCombatWarscore(moveAction.combat);
            }
        }
    }

    return actions;
};

/**
 * Update warscore based on combat result
 */
CivChessAI.prototype.handleCombatWarscore = function(combatResult) {
    if (!combatResult) return;

    // Find which enemy this combat was against
    const defender = this.engine.pieces.find(p => p.id === combatResult.defender);
    if (!defender) return;

    const enemyId = defender.ownerId;
    if (enemyId === this.playerId) return; // Not enemy combat

    // Check if at war
    if (!this.getEnemies().includes(enemyId)) return;

    if (combatResult.defenderDestroyed) {
        this.recordWarscoreEvent(enemyId, { type: 'unit_killed' });
    }
    if (combatResult.cityFlipped) {
        this.recordWarscoreEvent(enemyId, { type: 'city_captured' });
    }
};

/**
 * Move a single warrior
 */
CivChessAI.prototype.moveWarrior = function(warrior) {
    // Check if warrior is on a blockade position and should stay put
    if (this.useBlockadeStrategy && this.isBlockadePosition(warrior.row, warrior.col) && !this.isBlockadePaused()) {
        // Check if a settler needs to pass through
        const settlerPassage = this.settlerNeedsBlockadePassage();
        if (settlerPassage && this.isSettlerBlockedByPosition(settlerPassage.settler, { row: warrior.row, col: warrior.col })) {
            // Temporarily vacate for settler
            const vacatePos = this.getTemporaryVacatePosition(warrior, { row: warrior.row, col: warrior.col });
            if (vacatePos) {
                const originalPos = { row: warrior.row, col: warrior.col };
                this.temporarilyVacatedBlockade.set(warrior.id, {
                    originalPos: originalPos,
                    waitingForSettler: true
                });
                const result = this.engine.movePiece(warrior, vacatePos.row, vacatePos.col);
                if (result.success) {
                    console.log(`[AI P${this.playerId + 1}] Warrior vacating blockade for settler`);
                    return {
                        type: AI_ACTION_TYPE.MOVE_UNIT,
                        pieceId: warrior.id,
                        from: originalPos,
                        to: vacatePos
                    };
                }
            }
        }
        // Attack adjacent enemies while holding the blockade position
        const blockadeEnemies = this.getAdjacentEnemies(warrior);
        if (blockadeEnemies.length > 0) {
            const target = blockadeEnemies[0];
            return this.attackTarget(warrior, target);
        }

        // Stay put on blockade position (don't move unless settler needs passage)
        return null;
    }

    // Check if warrior should return to vacated blockade position
    const vacatedInfo = this.temporarilyVacatedBlockade.get(warrior.id);
    if (vacatedInfo) {
        const settlerStillBlocking = this.settlerNeedsBlockadePassage();
        if (!settlerStillBlocking) {
            // Return to blockade position
            const targetPos = vacatedInfo.originalPos;
            const piece = this.engine.board[targetPos.row][targetPos.col];
            if (!piece) {
                const originalPos = { row: warrior.row, col: warrior.col };
                const result = this.engine.movePiece(warrior, targetPos.row, targetPos.col);
                if (result.success) {
                    this.temporarilyVacatedBlockade.delete(warrior.id);
                    console.log(`[AI P${this.playerId + 1}] Warrior returning to blockade position`);
                    return {
                        type: AI_ACTION_TYPE.MOVE_UNIT,
                        pieceId: warrior.id,
                        from: originalPos,
                        to: targetPos
                    };
                }
            }
        }
        // Still waiting for settler, stay put
        return null;
    }

    // Check for adjacent enemies — hard AI siege warriors attack 50% of the time en route,
    // all others use 1/3 chance
    const adjacentEnemies = this.getAdjacentEnemies(warrior);
    const objective = this.warriorObjectives.get(warrior.id);
    const adjAttackChance = (this.difficulty === AI_DIFFICULTY.HARD &&
        objective && objective.type === WAR_OBJECTIVE_TYPE.SIEGE_CITY) ? 0.5 : 1/3;
    if (adjacentEnemies.length > 0 && Math.random() < adjAttackChance) {
        const target = adjacentEnemies[Math.floor(Math.random() * adjacentEnemies.length)];
        return this.attackTarget(warrior, target);
    }

    // Check for diagonal blockade - treat as enemy in the way
    const blockingEnemies = this.getBlockingEnemies(warrior);
    if (blockingEnemies.length > 0) {
        const target = blockingEnemies[0];
        return this.attackTarget(warrior, target);
    }

    // Check if warrior should move out of the way for settlers (non-blockade positions)
    const settlerClearMove = this.shouldClearForSettler(warrior);
    if (settlerClearMove) {
        const originalPos = { row: warrior.row, col: warrior.col };
        const result = this.engine.movePiece(warrior, settlerClearMove.row, settlerClearMove.col);
        if (result.success) {
            return {
                type: result.combat ? AI_ACTION_TYPE.ATTACK : AI_ACTION_TYPE.MOVE_UNIT,
                pieceId: warrior.id,
                from: originalPos,
                to: settlerClearMove,
                combat: result.combat
            };
        }
    }

    // Get objective (already read above for attack-chance check)
    if (!objective) {
        // No objective - move randomly or stay
        if (this.maybeError()) {
            return this.moveRandomly(warrior);
        }
        return null;
    }

    // If objective is blockade, move toward it
    if (objective.type === 'blockade' || objective.type === 'blockade_return') {
        return this.moveTowardTarget(warrior, objective.target);
    }

    // Apply difficulty-based errors
    if (this.maybeError()) {
        return this.moveRandomly(warrior);
    }

    // Handle new war objective types
    switch (objective.type) {
        case WAR_OBJECTIVE_TYPE.SIEGE_CITY:
            return this.handleSiegeMovement(warrior, objective);

        case WAR_OBJECTIVE_TYPE.TERRITORY_RECLAIM:
            return this.handleTerritoryReclaimMovement(warrior, objective);

        case WAR_OBJECTIVE_TYPE.INTERCEPT:
            return this.handleInterceptMovement(warrior, objective);

        case WAR_OBJECTIVE_TYPE.DEFEND_CITY:
            return this.handleDefendCityMovement(warrior, objective);

        case WAR_OBJECTIVE_TYPE.ELIMINATE_WARRIOR:
        case WAR_OBJECTIVE_TYPE.CONTROL_CHOKEPOINT:
        default:
            // Move toward objective (default behavior)
            return this.moveTowardTarget(warrior, objective.target);
    }
};

/**
 * Handle movement for siege objectives.
 * Warriors move to their assigned approach position, then attack the city.
 */
CivChessAI.prototype.handleSiegeMovement = function(warrior, objective) {
    const targetCity = objective.target;
    const approachPos = objective.approachPosition;

    // Check if we're adjacent to the city - attack it
    const distToCity = this.getDistance(warrior, targetCity);
    if (distToCity <= 1) {
        const cityPiece = this.engine.board[targetCity.row][targetCity.col];
        if (cityPiece && cityPiece.type === PIECE_TYPES.CITY) {
            return this.attackTarget(warrior, cityPiece);
        }
    }

    // Move toward approach position if we have one
    if (approachPos) {
        const distToApproach = this.getDistance(warrior, approachPos);
        if (distToApproach > 0) {
            return this.moveTowardTarget(warrior, approachPos);
        }
    }

    // Fall back to moving toward city
    return this.moveTowardTarget(warrior, targetCity);
};

/**
 * Handle movement for territory reclaim objectives.
 * Warriors move to enemy-owned tiles to flip them back.
 */
CivChessAI.prototype.handleTerritoryReclaimMovement = function(warrior, objective) {
    const targetTile = objective.target;

    // Check if we're already on the target tile
    if (warrior.row === targetTile.row && warrior.col === targetTile.col) {
        // Tile is reclaimed by our presence, objective complete
        // Clear the objective so a new one can be assigned
        this.warriorObjectives.delete(warrior.id);

        // Find a nearby tile to move to (preferably another enemy tile)
        const pressuredCities = this.getCitiesUnderPressure();
        for (const cityData of pressuredCities) {
            for (const tile of cityData.encroachingTiles) {
                if (tile.row !== targetTile.row || tile.col !== targetTile.col) {
                    const dist = this.getDistance(warrior, tile);
                    if (dist <= 1) {
                        // Adjacent encroaching tile, move there
                        const piece = this.engine.board[tile.row][tile.col];
                        if (!piece || piece.ownerId !== this.playerId) {
                            return this.moveTowardTarget(warrior, tile);
                        }
                    }
                }
            }
        }

        // No adjacent enemy tile, stay put or move randomly
        return null;
    }

    // Check if there's an enemy on the target tile
    const piece = this.engine.board[targetTile.row][targetTile.col];
    if (piece && piece.ownerId !== this.playerId) {
        // Attack to take the tile
        return this.attackTarget(warrior, piece);
    }

    // Move toward the target tile
    return this.moveTowardTarget(warrior, targetTile);
};

/**
 * Handle movement for intercept objectives.
 * Warriors move to intercept enemies approaching our cities.
 */
CivChessAI.prototype.handleInterceptMovement = function(warrior, objective) {
    const enemyTarget = objective.target;

    // Get current position of the enemy (they may have moved)
    const currentEnemy = this.findPiece(enemyTarget.id);
    if (!currentEnemy) {
        // Target destroyed, clear objective
        return null;
    }

    // Check if we're adjacent to the enemy - attack
    const distToEnemy = this.getDistance(warrior, currentEnemy);
    if (distToEnemy <= 1) {
        return this.attackTarget(warrior, currentEnemy);
    }

    // Predict where the enemy is going (toward our nearest city)
    const ourCities = this.gameState.ownPieces.cities;
    let nearestCity = null;
    let nearestDist = Infinity;

    for (const city of ourCities) {
        const dist = this.getDistance(currentEnemy, city);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearestCity = city;
        }
    }

    // Calculate intercept point (between enemy and their target city)
    if (nearestCity) {
        const interceptRow = Math.floor((currentEnemy.row + nearestCity.row) / 2);
        const interceptCol = Math.floor((currentEnemy.col + nearestCity.col) / 2);

        // Check if we should go to intercept point or directly toward enemy
        const distToIntercept = this.getDistance(warrior, { row: interceptRow, col: interceptCol });
        if (distToIntercept < distToEnemy && distToIntercept > 0) {
            return this.moveTowardTarget(warrior, { row: interceptRow, col: interceptCol });
        }
    }

    // Move directly toward enemy
    return this.moveTowardTarget(warrior, currentEnemy);
};

/**
 * Handle movement for defend city objectives.
 * Warriors move toward cities under pressure to defend them.
 */
CivChessAI.prototype.handleDefendCityMovement = function(warrior, objective) {
    const targetCity = objective.target;

    // Get pressure data for this city
    const pressureData = this.getCityPressureData(targetCity.id);

    // Check if there are adjacent enemies to the city we should attack
    const adjacentEnemies = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;

            const r = targetCity.row + dr;
            const c = targetCity.col + dc;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;

            const piece = this.engine.board[r][c];
            if (piece && piece.type === PIECE_TYPES.WARRIOR && this.getEnemies().includes(piece.ownerId)) {
                adjacentEnemies.push(piece);
            }
        }
    }

    // If there are adjacent enemies to the city, prioritize attacking them
    if (adjacentEnemies.length > 0) {
        const closest = this.findClosestTarget(warrior, adjacentEnemies);
        if (closest) {
            const dist = this.getDistance(warrior, closest);
            if (dist <= 1) {
                return this.attackTarget(warrior, closest);
            }
            return this.moveTowardTarget(warrior, closest);
        }
    }

    // If there are encroaching tiles, move to reclaim the closest one
    if (pressureData && pressureData.encroachingTiles.length > 0) {
        const closestTile = this.findClosestTarget(warrior, pressureData.encroachingTiles);
        if (closestTile) {
            const piece = this.engine.board[closestTile.row][closestTile.col];
            if (piece && piece.ownerId !== this.playerId) {
                const dist = this.getDistance(warrior, closestTile);
                if (dist <= 1) {
                    return this.attackTarget(warrior, piece);
                }
            }
            return this.moveTowardTarget(warrior, closestTile);
        }
    }

    // Move toward the city to form a defensive perimeter
    const distToCity = this.getDistance(warrior, targetCity);
    if (distToCity > 2) {
        return this.moveTowardTarget(warrior, targetCity);
    }

    // Already close, stay in position
    return null;
}

/**
 * Check if warrior should move to clear the way for settlers.
 * Returns a move that clears the path, or null if not needed.
 */
CivChessAI.prototype.shouldClearForSettler = function(warrior) {
    const settlers = this.getActiveSettlers();
    if (settlers.length === 0) return null;

    const onSettleableTile = this.isSettleableTile(warrior.row, warrior.col);
    const blockingPath = this.isBlockingSettlerPath(warrior);

    // Only move if actually in the way
    if (!onSettleableTile && !blockingPath) return null;

    const validMoves = this.engine.getValidMoves(warrior);
    if (validMoves.length === 0) return null;

    // Find a move that:
    // 1. Is not on a settleable tile
    // 2. Doesn't block settler paths
    // 3. Preferably moves toward the warrior's objective
    const objective = this.warriorObjectives.get(warrior.id);

    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of validMoves) {
        // Skip if this move puts us on another settleable tile
        if (this.isSettleableTile(move.row, move.col)) continue;

        // Skip if move would still block a settler path
        const wouldBlock = this.wouldBlockSettlerPath(move, settlers);
        if (wouldBlock) continue;

        let score = 0;

        // Bonus if moving toward objective
        if (objective) {
            const currentDist = this.getDistance(warrior, objective.target);
            const newDist = this.getDistance(move, objective.target);
            score += (currentDist - newDist) * 2;
        }

        // Bonus for positions with good wall/defense value
        score += this.calculateWallScore(move.row, move.col) * 0.5;

        // Slight bonus for not moving too far from current position
        // (prefer smaller adjustments)
        score -= this.getDistance(warrior, move) * 0.2;

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    return bestMove;
};

/**
 * Check if a potential move would block any settler's path
 */
CivChessAI.prototype.wouldBlockSettlerPath = function(pos, settlers) {
    for (const settler of settlers) {
        const validSpots = this.findValidCitySpots();
        const engineSettler = this.engine.pieces.find(p => p.id === settler.id);
        if (!engineSettler) continue;

        for (const spot of validSpots) {
            if (this.isInOrthogonalPath(pos, engineSettler, spot)) {
                return true;
            }
        }
    }
    return false;
};

/**
 * Get adjacent enemies we're at war with
 */
CivChessAI.prototype.getAdjacentEnemies = function(warrior) {
    const enemies = [];
    const atWarWith = this.getEnemies();

    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;

            const r = warrior.row + dr;
            const c = warrior.col + dc;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;

            const piece = this.engine.board[r][c];
            if (piece && piece.ownerId !== this.playerId && atWarWith.includes(piece.ownerId)) {
                enemies.push(piece);
            }
        }
    }

    return enemies;
};

/**
 * Get enemies blocking diagonal path to objective
 */
CivChessAI.prototype.getBlockingEnemies = function(warrior) {
    // Check if there are enemies forming a diagonal blockade
    const objective = this.warriorObjectives.get(warrior.id);
    if (!objective) return [];

    const target = objective.target;
    const rowDir = Math.sign(target.row - warrior.row);
    const colDir = Math.sign(target.col - warrior.col);

    // If moving diagonally and blocked
    if (rowDir !== 0 && colDir !== 0) {
        const pos1 = this.engine.board[warrior.row][warrior.col + colDir];
        const pos2 = this.engine.board[warrior.row + rowDir][warrior.col];

        const blockers = [];
        if (pos1 && pos1.type === PIECE_TYPES.WARRIOR && pos1.ownerId !== this.playerId) {
            blockers.push(pos1);
        }
        if (pos2 && pos2.type === PIECE_TYPES.WARRIOR && pos2.ownerId !== this.playerId) {
            blockers.push(pos2);
        }

        // Check if both form a blockade (same owner, diagonal)
        if (blockers.length === 2 && blockers[0].ownerId === blockers[1].ownerId) {
            return blockers;
        }
    }

    return [];
};

/**
 * Attack a target
 */
CivChessAI.prototype.attackTarget = function(warrior, target) {
    const originalPos = { row: warrior.row, col: warrior.col };
    const result = this.engine.movePiece(warrior, target.row, target.col);
    if (result.success) {
        return {
            type: result.combat ? AI_ACTION_TYPE.ATTACK : AI_ACTION_TYPE.MOVE_UNIT,
            pieceId: warrior.id,
            from: originalPos,
            to: { row: target.row, col: target.col },
            combat: result.combat
        };
    }
    return null;
};

/**
 * Move toward a target position
 */
CivChessAI.prototype.moveTowardTarget = function(warrior, target) {
    const validMoves = this.engine.getValidMoves(warrior);
    if (validMoves.length === 0) return null;

    // First check if we can attack an adjacent enemy (high priority)
    for (const move of validMoves) {
        const movePiece = this.engine.board[move.row][move.col];
        if (movePiece && movePiece.ownerId !== this.playerId) {
            const isEnemy = this.getEnemies().includes(movePiece.ownerId);
            if (isEnemy) {
                const originalPos = { row: warrior.row, col: warrior.col };
                const result = this.engine.movePiece(warrior, move.row, move.col);
                if (result.success) {
                    return {
                        type: result.combat ? AI_ACTION_TYPE.ATTACK : AI_ACTION_TYPE.MOVE_UNIT,
                        pieceId: warrior.id,
                        from: originalPos,
                        to: move,
                        combat: result.combat
                    };
                }
            }
        }
    }

    // Use A* to find optimal path to target.
    // Hard difficulty uses formation pathfinding that strongly prefers tiles
    // adjacent to friendly warriors, causing warriors to travel in groups.
    let bestMove = this.difficulty === AI_DIFFICULTY.HARD
        ? this.findWarriorPathAStarFormation(warrior, target)
        : this.findWarriorPathAStar(warrior, target);

    // Fallback to greedy if A* fails (e.g., blocked paths)
    if (!bestMove) {
        let bestDist = Infinity;
        for (const move of validMoves) {
            const dist = this.getDistance(move, target);
            if (dist < bestDist) {
                bestDist = dist;
                bestMove = move;
            }
        }
    }

    if (!bestMove) return null;

    const originalPos = { row: warrior.row, col: warrior.col };
    const result = this.engine.movePiece(warrior, bestMove.row, bestMove.col);
    if (result.success) {
        return {
            type: result.combat ? AI_ACTION_TYPE.ATTACK : AI_ACTION_TYPE.MOVE_UNIT,
            pieceId: warrior.id,
            from: originalPos,
            to: bestMove,
            combat: result.combat
        };
    }

    return null;
};

/**
 * Move randomly (for difficulty-based errors)
 */
CivChessAI.prototype.moveRandomly = function(warrior) {
    const validMoves = this.engine.getValidMoves(warrior);
    if (validMoves.length === 0) return null;

    const originalPos = { row: warrior.row, col: warrior.col };
    const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
    const result = this.engine.movePiece(warrior, randomMove.row, randomMove.col);

    if (result.success) {
        return {
            type: result.combat ? AI_ACTION_TYPE.ATTACK : AI_ACTION_TYPE.MOVE_UNIT,
            pieceId: warrior.id,
            from: originalPos,
            to: randomMove,
            combat: result.combat
        };
    }

    return null;
};
