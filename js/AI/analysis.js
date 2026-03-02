// ============================================
// BOARD ANALYSIS & BLOCKADE STRATEGY
// ============================================

/**
 * Analyze the current board state
 */
CivChessAI.prototype.analyzeBoard = function() {
    this.gameState = this.engine.getGameStateForAI(this.playerId);
    this.threatHeatmap = this.engine.getThreatHeatmap(this.playerId);
    this.opportunityHeatmap = this.engine.getOpportunityHeatmap(this.playerId);
    this.territoryHeatmap = this.engine.getTerritoryHeatmap(this.playerId);
    this.expansionHeatmap = this.engine.getExpansionHeatmap(this.playerId);
    this.strategicPositions = this.engine.getStrategicPositions(this.playerId);
    this.myStrength = this.engine.getPlayerStrength(this.playerId);

    // Initialize blockade positions on first turn
    if (this.useBlockadeStrategy && this.blockadePositions === null) {
        this.initializeBlockadePositions();
    }
};

/**
 * Calculate blockade positions for the starting city.
 * If the city is within 2 tiles of a board corner, uses the classic diagonal
 * line along that corner edge. Otherwise surrounds the city with a 1-tile gap:
 *   0 W W W 0
 *   W 0 0 0 W
 *   W 0 C 0 W
 *   W 0 0 0 W
 *   0 W W W 0
 */
CivChessAI.prototype.initializeBlockadePositions = function() {
    const cities = this.gameState.ownPieces.cities;
    if (cities.length === 0) return;

    const city = cities[0];
    const maxIdx = BOARD_SIZE - 1;

    this.startingCityPos = { row: city.row, col: city.col };

    // Corner detection: city within 2 tiles of a board corner
    const nearTop    = city.row <= 2;
    const nearBottom = city.row >= maxIdx - 2;
    const nearLeft   = city.col <= 2;
    const nearRight  = city.col >= maxIdx - 2;

    if (nearTop && nearLeft) {
        this.startingCorner = 'upper-left';
        this.blockadePositions = [
            { row: 0, col: 2 },
            { row: 1, col: 1 },
            { row: 2, col: 0 }
        ];
    } else if (nearTop && nearRight) {
        this.startingCorner = 'upper-right';
        this.blockadePositions = [
            { row: 0, col: maxIdx - 2 },
            { row: 1, col: maxIdx - 1 },
            { row: 2, col: maxIdx }
        ];
    } else if (nearBottom && nearLeft) {
        this.startingCorner = 'lower-left';
        this.blockadePositions = [
            { row: maxIdx - 2, col: 0 },
            { row: maxIdx - 1, col: 1 },
            { row: maxIdx,     col: 2 }
        ];
    } else if (nearBottom && nearRight) {
        this.startingCorner = 'lower-right';
        this.blockadePositions = [
            { row: maxIdx - 2, col: maxIdx },
            { row: maxIdx - 1, col: maxIdx - 1 },
            { row: maxIdx,     col: maxIdx - 2 }
        ];
    } else {
        // Non-corner: surround the city with a 1-tile gap
        this.startingCorner = `city_${city.row}_${city.col}`;
        const positions = [];
        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                if (Math.abs(dr) < 2 && Math.abs(dc) < 2) continue;
                if (Math.abs(dr) === 2 && Math.abs(dc) === 2) continue;
                const r = city.row + dr;
                const c = city.col + dc;
                if (r < 0 || r > maxIdx || c < 0 || c > maxIdx) continue;
                const piece = this.engine.board[r][c];
                if (piece && piece.type === PIECE_TYPES.CITY) continue;
                positions.push({ row: r, col: c });
            }
        }
        this.blockadePositions = positions;
    }

    console.log(`[AI P${this.playerId + 1}] Using blockade strategy (${this.startingCorner}) around (${city.row}, ${city.col})`);
    console.log(`[AI P${this.playerId + 1}] Blockade positions:`, this.blockadePositions);
};

/**
 * Check if the blockade should be paused.
 * Pauses when at war or when any enemy warrior is within 2 tiles of the starting city.
 */
CivChessAI.prototype.isBlockadePaused = function() {
    if (this.isAtWar()) return true;
    if (!this.startingCityPos) return false;

    for (const piece of this.engine.pieces) {
        if (piece.ownerId === this.playerId) continue;
        if (piece.type !== PIECE_TYPES.WARRIOR) continue;
        if (this.getDistance(piece, this.startingCityPos) <= 2) return true;
    }
    return false;
};

/**
 * Check if a position is a blockade position
 */
CivChessAI.prototype.isBlockadePosition = function(row, col) {
    if (!this.blockadePositions) return false;
    return this.blockadePositions.some(pos => pos.row === row && pos.col === col);
};

/**
 * Get unoccupied blockade positions that need warriors
 */
CivChessAI.prototype.getUnoccupiedBlockadePositions = function() {
    if (!this.blockadePositions) return [];

    return this.blockadePositions.filter(pos => {
        const piece = this.engine.board[pos.row][pos.col];
        // Position is available if empty or occupied by enemy (we can attack)
        if (!piece) return true;
        // Don't count as unoccupied if our warrior is there
        if (piece.ownerId === this.playerId && piece.type === PIECE_TYPES.WARRIOR) return false;
        return true;
    });
};

/**
 * Check if all blockade positions are filled by our warriors
 */
CivChessAI.prototype.isBlockadeComplete = function() {
    if (!this.blockadePositions) return false;

    for (const pos of this.blockadePositions) {
        const piece = this.engine.board[pos.row][pos.col];
        if (!piece || piece.ownerId !== this.playerId || piece.type !== PIECE_TYPES.WARRIOR) {
            return false;
        }
    }
    return true;
};

/**
 * Check if any of our settlers need to pass through the blockade
 */
CivChessAI.prototype.settlerNeedsBlockadePassage = function() {
    const settlers = this.gameState.ownPieces.settlers;
    if (settlers.length === 0) return null;

    for (const settler of settlers) {
        // Check if settler needs to cross the blockade line
        for (const blockadePos of this.blockadePositions) {
            // Check if settler is on one side and needs to get to the other
            if (this.isSettlerBlockedByPosition(settler, blockadePos)) {
                return { settler, blockadePos };
            }
        }
    }
    return null;
};

/**
 * Check if a settler's path is blocked by a specific blockade position
 */
CivChessAI.prototype.isSettlerBlockedByPosition = function(settler, blockadePos) {
    const validSpots = this.findValidCitySpots();
    if (validSpots.length === 0) return false;

    for (const spot of validSpots) {
        // Check if the blockade position is in the path
        if (this.isInOrthogonalPath(blockadePos, settler, spot)) {
            return true;
        }
    }
    return false;
};

/**
 * Get a safe position for a warrior to temporarily move to while settler passes
 */
CivChessAI.prototype.getTemporaryVacatePosition = function(warrior, blockadePos) {
    const validMoves = this.engine.getValidMoves(warrior);

    // Find a move that:
    // 1. Is not a blockade position
    // 2. Is not blocking a settler path
    // 3. Preferably stays close to the blockade
    let bestMove = null;
    let bestDist = Infinity;

    for (const move of validMoves) {
        if (this.isBlockadePosition(move.row, move.col)) continue;

        const dist = this.getDistance(move, blockadePos);
        if (dist < bestDist) {
            bestDist = dist;
            bestMove = move;
        }
    }

    return bestMove;
};

/**
 * Profile other players' behaviors and threat levels
 */
CivChessAI.prototype.profilePlayers = function() {
    for (const [targetId, pieces] of Object.entries(this.gameState.enemyPieces)) {
        const targetIdNum = parseInt(targetId);
        const targetStrength = this.engine.getPlayerStrength(targetIdNum);

        let profile = this.playerProfiles.get(targetIdNum) || {
            personality: null,
            threatLevel: 0,
            previousWarriorCount: 0,
            isBuilding: false,
            hasDeclaredWar: false
        };

        // Check if they're building up forces
        const currentWarriorCount = pieces.warriors.length;
        profile.isBuilding = currentWarriorCount > profile.previousWarriorCount;
        profile.previousWarriorCount = currentWarriorCount;

        // Determine their personality based on behavior
        const hasSettlers = pieces.settlers.length > 0;
        const hasManyWarriors = currentWarriorCount > pieces.cities.length * 3;

        if (hasManyWarriors && !hasSettlers) {
            profile.personality = 'militaristic';
        } else if (hasSettlers || pieces.cities.length > 1) {
            profile.personality = 'expansionist';
        }

        // Calculate threat level
        const relativeStrength = this.engine.getRelativeStrength(this.playerId, targetIdNum);
        const relation = this.gameState.relations[targetIdNum];

        profile.threatLevel = 0;
        const atWarWith = relation && (relation.status === 'war' || relation.status === 'peace_proposed' ||
            relation.theirStatus === 'war' || relation.theirStatus === 'peace_proposed');
        if (atWarWith) {
            profile.threatLevel += 5;
            profile.hasDeclaredWar = true;
            this.previousAggressors.add(targetIdNum);
        }
        if (profile.isBuilding) {
            profile.threatLevel += 2;
        }
        if (relativeStrength && relativeStrength.ratio < 1) {
            profile.threatLevel += 3 * (1 - relativeStrength.ratio);
        }
        if (this.previousAggressors.has(targetIdNum)) {
            profile.threatLevel += 2;
        }

        // Apply human scrutiny for hard difficulty
        if (this.difficulty === AI_DIFFICULTY.HARD) {
            const player = this.engine.players[targetIdNum];
            if (player && player.isHuman) {
                profile.threatLevel *= 1.5;
            }
        } else if (this.difficulty === AI_DIFFICULTY.MEDIUM) {
            const player = this.engine.players[targetIdNum];
            if (player && player.isHuman) {
                profile.threatLevel *= 1.2;
            }
        }

        this.playerProfiles.set(targetIdNum, profile);
    }
};

// ============================================
// TERRITORY PRESSURE DETECTION
// ============================================

/**
 * Analyze territory pressure on all of our cities.
 * Called each turn to identify cities under enemy pressure.
 */
CivChessAI.prototype.analyzeTerritoryPressure = function() {
    this.cityPressureData = [];

    const cities = this.gameState.ownPieces.cities;
    const enemies = this.getEnemies();

    for (const city of cities) {
        const pressureData = this.calculateCityPressure(city, enemies);
        this.cityPressureData.push(pressureData);
    }
};

/**
 * Calculate pressure score for a single city.
 * Pressure is based on enemy tiles, enemy warriors, and adjacency.
 *
 * @param {Object} city - The city to analyze
 * @param {Array} enemies - Array of enemy player IDs we're at war with
 * @returns {Object} Pressure data for the city
 */
CivChessAI.prototype.calculateCityPressure = function(city, enemies) {
    const radius = WAR_CONFIG.PRESSURE_RADIUS;
    let enemyTiles = 0;
    let ownTiles = 0;
    let adjacentEnemyTiles = 0;
    let enemyWarriors = 0;
    const encroachingTiles = [];

    // Check all tiles within radius of city
    for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
            const r = city.row + dr;
            const c = city.col + dc;

            // Skip out of bounds
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;

            // Skip the city tile itself
            if (dr === 0 && dc === 0) continue;

            // Check tile ownership
            const tileOwner = this.engine.tileOwnership[r][c];
            const isAdjacent = Math.abs(dr) <= 1 && Math.abs(dc) <= 1;

            if (tileOwner !== null && tileOwner !== this.playerId) {
                // Enemy-owned tile
                enemyTiles++;
                if (isAdjacent) {
                    adjacentEnemyTiles++;
                    // Track this tile as encroaching (high priority for reclaim)
                    encroachingTiles.push({ row: r, col: c, isAdjacent: true });
                } else {
                    // Still track non-adjacent enemy tiles within radius
                    encroachingTiles.push({ row: r, col: c, isAdjacent: false });
                }
            } else if (tileOwner === this.playerId) {
                ownTiles++;
            }

            // Check for enemy warriors in the area
            const piece = this.engine.board[r][c];
            if (piece && piece.type === PIECE_TYPES.WARRIOR && enemies.includes(piece.ownerId)) {
                enemyWarriors++;
            }
        }
    }

    // Calculate pressure score
    // Formula: enemyRatio * 50 + adjacentEnemyTiles * 15 + enemyWarriors * 20
    const totalTiles = enemyTiles + ownTiles;
    const enemyRatio = totalTiles > 0 ? enemyTiles / totalTiles : 0;
    const pressureScore = (enemyRatio * 50) + (adjacentEnemyTiles * 15) + (enemyWarriors * 20);

    // Determine pressure status
    const isUnderPressure = pressureScore > WAR_CONFIG.PRESSURE_THRESHOLD;
    const isCritical = pressureScore > WAR_CONFIG.CRITICAL_THRESHOLD ||
                       adjacentEnemyTiles >= WAR_CONFIG.ADJACENT_ENEMY_CRITICAL;

    return {
        cityId: city.id,
        city: city,
        pressureScore: Math.round(pressureScore),
        isUnderPressure,
        isCritical,
        enemyTiles,
        ownTiles,
        adjacentEnemyTiles,
        enemyWarriors,
        encroachingTiles: encroachingTiles.sort((a, b) => {
            // Sort by priority: adjacent tiles first, then by distance
            if (a.isAdjacent !== b.isAdjacent) return b.isAdjacent - a.isAdjacent;
            const distA = this.getDistance(city, a);
            const distB = this.getDistance(city, b);
            return distA - distB;
        })
    };
};

/**
 * Get cities that are under pressure (pressureScore > threshold)
 */
CivChessAI.prototype.getCitiesUnderPressure = function() {
    return this.cityPressureData.filter(data => data.isUnderPressure);
};

/**
 * Get cities that are in critical condition
 */
CivChessAI.prototype.getCriticalCities = function() {
    return this.cityPressureData.filter(data => data.isCritical);
};

/**
 * Get pressure data for a specific city
 */
CivChessAI.prototype.getCityPressureData = function(cityId) {
    return this.cityPressureData.find(data => data.cityId === cityId);
};
