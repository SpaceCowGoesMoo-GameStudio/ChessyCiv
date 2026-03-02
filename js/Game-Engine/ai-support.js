// ============================================
// GAME ENGINE - AI Support Module
// ============================================
// Functions that provide game state analysis for AI decision-making.
// Generates heatmaps, evaluates positions, and calculates strategic metrics.

/**
 * getGameStateForAI - Comprehensive snapshot of game state for AI analysis
 *
 * Returns all information an AI needs to make decisions:
 * - Own pieces and their states
 * - Enemy pieces and their positions
 * - Territory ownership
 * - Player relations and relative strengths
 * - Available actions
 *
 * @param {number} playerId - The AI player requesting the state
 * @returns {Object} Complete game state from this player's perspective
 */
GameEngine.prototype.getGameStateForAI = function(playerId) {
    const player = this.players[playerId];
    if (!player) return null;

    // Categorize all pieces by owner
    const ownPieces = {
        cities: [],
        warriors: [],
        settlers: []
    };
    const enemyPieces = {};

    this.pieces.forEach(piece => {
        const category = piece.type === PIECE_TYPES.CITY ? 'cities' :
                        piece.type === PIECE_TYPES.WARRIOR ? 'warriors' : 'settlers';

        if (piece.ownerId === playerId) {
            ownPieces[category].push({
                id: piece.id,
                row: piece.row,
                col: piece.col,
                hp: piece.hp,
                maxHp: piece.maxHp,
                damage: piece.damage,
                hasMoved: piece.hasMoved,
                production: piece.production,
                productionProgress: piece.productionProgress
            });
        } else {
            if (!enemyPieces[piece.ownerId]) {
                enemyPieces[piece.ownerId] = { cities: [], warriors: [], settlers: [] };
            }
            enemyPieces[piece.ownerId][category].push({
                id: piece.id,
                row: piece.row,
                col: piece.col,
                hp: piece.hp,
                maxHp: piece.maxHp,
                damage: piece.damage
            });
        }
    });

    // Calculate territory counts
    const territoryCounts = {};
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const owner = this.tileOwnership[r][c];
            if (owner !== null) {
                territoryCounts[owner] = (territoryCounts[owner] || 0) + 1;
            }
        }
    }

    // Get relations with all players
    const relations = {};
    this.players.forEach((p, i) => {
        if (i !== playerId) {
            relations[i] = {
                status: player.relations[i],
                theirStatus: p.relations[playerId]
            };
        }
    });

    return {
        playerId: playerId,
        turnNumber: this.turnNumber,
        ownPieces: ownPieces,
        enemyPieces: enemyPieces,
        territory: {
            owned: territoryCounts[playerId] || 0,
            byPlayer: territoryCounts
        },
        techLevel: player.techScore,
        relations: relations,
        gamePhase: this.getGamePhase()
    };
};

/**
 * getGamePhase - Determine current phase of the game
 *
 * Phases affect AI strategy selection:
 * - EARLY: Expansion and setup (turns 0-15, <3 cities average)
 * - MID: Development and positioning (turns 15-40)
 * - LATE: Decisive combat and endgame (turns 40+)
 *
 * @returns {string} 'early', 'mid', or 'late'
 */
GameEngine.prototype.getGamePhase = function() {
    const activePlayers = this.players.filter((p, i) =>
        this.getPlayerCities(i).length > 0
    ).length;
    const totalCities = this.pieces.filter(p => p.type === PIECE_TYPES.CITY).length;
    const avgCities = totalCities / Math.max(activePlayers, 1);

    if (this.turnNumber < 15 && avgCities < 3) {
        return 'early';
    } else if (this.turnNumber < 40 && activePlayers > 2) {
        return 'mid';
    } else {
        return 'late';
    }
};

/**
 * getThreatHeatmap - Generate heatmap of danger levels for a player
 *
 * Each tile gets a threat score based on:
 * - Distance to enemy warriors (closer = more threat)
 * - Enemy warrior strength (damage/hp)
 * - Number of enemies that can reach the tile
 * - Whether tile is contested or behind enemy lines
 *
 * @param {number} playerId - Player to calculate threats for
 * @returns {Array<Array<number>>} 2D array of threat values (0-1 normalized)
 */
GameEngine.prototype.getThreatHeatmap = function(playerId) {
    const heatmap = Array(BOARD_SIZE).fill(null)
        .map(() => Array(BOARD_SIZE).fill(0));

    const player = this.players[playerId];
    if (!player) return heatmap;

    // Find all enemy warriors that are at war with us
    const enemyWarriors = this.pieces.filter(p =>
        p.type === PIECE_TYPES.WARRIOR &&
        p.ownerId !== playerId &&
        player.relations[p.ownerId] === 'war'
    );

    // For each tile, calculate threat from nearby enemies
    let maxThreat = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            let threat = 0;

            enemyWarriors.forEach(warrior => {
                // Chebyshev distance (diagonal movement)
                const dist = Math.max(
                    Math.abs(warrior.row - r),
                    Math.abs(warrior.col - c)
                );

                // Threat decreases with distance, weighted by damage
                if (dist <= 5) {
                    const baseThreat = warrior.damage * (1 / (dist + 1));
                    threat += baseThreat;
                }
            });

            heatmap[r][c] = threat;
            maxThreat = Math.max(maxThreat, threat);
        }
    }

    // Normalize to 0-1
    if (maxThreat > 0) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                heatmap[r][c] /= maxThreat;
            }
        }
    }

    return heatmap;
};

/**
 * getOpportunityHeatmap - Generate heatmap of valuable targets
 *
 * Each tile gets an opportunity score based on:
 * - Proximity to enemy cities (high value targets)
 * - Proximity to undefended enemy units
 * - Unclaimed or weakly held territory
 * - Strategic chokepoints
 *
 * @param {number} playerId - Player to calculate opportunities for
 * @returns {Array<Array<number>>} 2D array of opportunity values (0-1 normalized)
 */
GameEngine.prototype.getOpportunityHeatmap = function(playerId) {
    const heatmap = Array(BOARD_SIZE).fill(null)
        .map(() => Array(BOARD_SIZE).fill(0));

    const player = this.players[playerId];
    if (!player) return heatmap;

    let maxOpp = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            let opportunity = 0;

            // Check for nearby enemy cities we're at war with
            this.pieces.forEach(piece => {
                if (piece.ownerId === playerId) return;
                if (player.relations[piece.ownerId] !== 'war') return;

                const dist = Math.max(
                    Math.abs(piece.row - r),
                    Math.abs(piece.col - c)
                );

                if (piece.type === PIECE_TYPES.CITY) {
                    // Cities are high-value targets
                    // Lower HP = more vulnerable = higher opportunity
                    const vulnerability = 1 - (piece.hp / piece.maxHp);
                    opportunity += (5 + vulnerability * 3) / (dist + 1);
                } else if (piece.type === PIECE_TYPES.SETTLER) {
                    // Settlers are vulnerable targets
                    opportunity += 3 / (dist + 1);
                } else if (piece.type === PIECE_TYPES.WARRIOR) {
                    // Warriors are moderate targets
                    opportunity += 1 / (dist + 1);
                }
            });

            // Bonus for unclaimed territory
            if (this.tileOwnership[r][c] === null) {
                opportunity += 0.5;
            }

            // Bonus for enemy territory
            const tileOwner = this.tileOwnership[r][c];
            if (tileOwner !== null && tileOwner !== playerId) {
                if (player.relations[tileOwner] === 'war') {
                    opportunity += 1;
                }
            }

            heatmap[r][c] = opportunity;
            maxOpp = Math.max(maxOpp, opportunity);
        }
    }

    // Normalize to 0-1
    if (maxOpp > 0) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                heatmap[r][c] /= maxOpp;
            }
        }
    }

    return heatmap;
};

/**
 * getTerritoryHeatmap - Generate heatmap of territorial control
 *
 * Shows how strongly each tile is controlled:
 * - Positive values = controlled by the player
 * - Negative values = controlled by enemies
 * - Values near 0 = contested
 *
 * Factors:
 * - Direct ownership
 * - Proximity to cities
 * - Proximity to warriors
 *
 * @param {number} playerId - Player perspective
 * @returns {Array<Array<number>>} 2D array (-1 to 1, player control vs enemy)
 */
GameEngine.prototype.getTerritoryHeatmap = function(playerId) {
    const heatmap = Array(BOARD_SIZE).fill(null)
        .map(() => Array(BOARD_SIZE).fill(0));

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            let control = 0;

            // Base ownership
            const owner = this.tileOwnership[r][c];
            if (owner === playerId) {
                control += 0.3;
            } else if (owner !== null) {
                control -= 0.3;
            }

            // Influence from nearby pieces
            this.pieces.forEach(piece => {
                const dist = Math.max(
                    Math.abs(piece.row - r),
                    Math.abs(piece.col - c)
                );

                if (dist > 4) return; // Too far to matter

                let influence = 0;
                if (piece.type === PIECE_TYPES.CITY) {
                    influence = 3 / (dist + 1);
                } else if (piece.type === PIECE_TYPES.WARRIOR) {
                    influence = 1.5 / (dist + 1);
                }

                if (piece.ownerId === playerId) {
                    control += influence;
                } else {
                    control -= influence;
                }
            });

            // Clamp to -1 to 1
            heatmap[r][c] = Math.max(-1, Math.min(1, control / 5));
        }
    }

    return heatmap;
};

/**
 * getExpansionHeatmap - Generate heatmap of good city locations
 *
 * Evaluates each tile for city-building potential:
 * - Must be >= 2 tiles from existing cities
 * - Prefers owned territory
 * - Prefers distance from enemies
 * - Prefers central positions (more expansion room)
 *
 * @param {number} playerId - Player to calculate for
 * @returns {Array<Array<number>>} 2D array of expansion values (0-1, or -1 if invalid)
 */
GameEngine.prototype.getExpansionHeatmap = function(playerId) {
    const heatmap = Array(BOARD_SIZE).fill(null)
        .map(() => Array(BOARD_SIZE).fill(0));

    const player = this.players[playerId];
    if (!player) return heatmap;

    // Pre-calculate city positions
    const cities = this.pieces.filter(p => p.type === PIECE_TYPES.CITY);
    const enemyCities = cities.filter(c => c.ownerId !== playerId);
    const ownCities = cities.filter(c => c.ownerId === playerId);

    let maxValue = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            // Check minimum distance from all cities
            let tooClose = false;
            let minDistToEnemy = Infinity;
            let minDistToOwn = Infinity;

            cities.forEach(city => {
                const dist = Math.max(
                    Math.abs(city.row - r),
                    Math.abs(city.col - c)
                );
                if (dist <= 1) {
                    tooClose = true;
                }
                if (city.ownerId !== playerId) {
                    minDistToEnemy = Math.min(minDistToEnemy, dist);
                } else {
                    minDistToOwn = Math.min(minDistToOwn, dist);
                }
            });

            if (tooClose || this.board[r][c] !== null) {
                heatmap[r][c] = -1; // Invalid location
                continue;
            }

            let value = 0;

            // Prefer owned territory
            if (this.tileOwnership[r][c] === playerId) {
                value += 3;
            } else if (this.tileOwnership[r][c] === null) {
                value += 1;
            }

            // Prefer distance from enemies (safety)
            value += Math.min(minDistToEnemy, 5) * 0.5;

            // Prefer not too far from own cities (logistics)
            if (minDistToOwn < Infinity) {
                value += Math.max(0, 5 - minDistToOwn) * 0.3;
            }

            // Prefer central positions
            const centerDist = Math.abs(r - 4.5) + Math.abs(c - 4.5);
            value += Math.max(0, 5 - centerDist) * 0.2;

            heatmap[r][c] = value;
            maxValue = Math.max(maxValue, value);
        }
    }

    // Normalize valid tiles to 0-1
    if (maxValue > 0) {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (heatmap[r][c] > 0) {
                    heatmap[r][c] /= maxValue;
                }
            }
        }
    }

    return heatmap;
};

/**
 * getPlayerStrength - Calculate overall strength of a player
 *
 * Combines multiple factors into a single strength score:
 * - Military power (warrior count and quality)
 * - Economic power (city count and health)
 * - Territory control
 * - Technology level
 *
 * @param {number} playerId - Player to evaluate
 * @returns {Object} Breakdown of strength components and total
 */
GameEngine.prototype.getPlayerStrength = function(playerId) {
    const player = this.players[playerId];
    if (!player) return null;

    const cities = this.pieces.filter(p =>
        p.type === PIECE_TYPES.CITY && p.ownerId === playerId
    );
    const warriors = this.pieces.filter(p =>
        p.type === PIECE_TYPES.WARRIOR && p.ownerId === playerId
    );
    const settlers = this.pieces.filter(p =>
        p.type === PIECE_TYPES.SETTLER && p.ownerId === playerId
    );

    // Territory count
    let territory = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (this.tileOwnership[r][c] === playerId) territory++;
        }
    }

    // Calculate sub-scores
    const militaryPower = warriors.reduce((sum, w) =>
        sum + w.hp + w.damage * 2, 0
    );
    const economicPower = cities.reduce((sum, c) =>
        sum + c.hp + 5, 0
    );
    const expansionPotential = settlers.length * 10;
    const techPower = player.techScore * 5;
    const territorialPower = territory * 0.5;

    const total = militaryPower + economicPower + expansionPotential +
                  techPower + territorialPower;

    return {
        playerId: playerId,
        military: militaryPower,
        economic: economicPower,
        expansion: expansionPotential,
        technology: techPower,
        territory: territorialPower,
        total: total,
        breakdown: {
            cities: cities.length,
            warriors: warriors.length,
            settlers: settlers.length,
            techLevel: player.techScore,
            tiles: territory
        }
    };
};

/**
 * getRelativeStrength - Compare strength between two players
 *
 * @param {number} playerId - First player
 * @param {number} targetId - Second player to compare against
 * @returns {Object} Comparison metrics
 */
GameEngine.prototype.getRelativeStrength = function(playerId, targetId) {
    const ownStrength = this.getPlayerStrength(playerId);
    const targetStrength = this.getPlayerStrength(targetId);

    if (!ownStrength || !targetStrength) return null;

    const ratio = ownStrength.total / Math.max(targetStrength.total, 1);

    return {
        ownTotal: ownStrength.total,
        targetTotal: targetStrength.total,
        ratio: ratio,
        advantage: ratio > 1.2 ? 'strong' :
                   ratio > 0.8 ? 'even' : 'weak',
        militaryRatio: ownStrength.military / Math.max(targetStrength.military, 1),
        economicRatio: ownStrength.economic / Math.max(targetStrength.economic, 1),
        techRatio: ownStrength.technology / Math.max(targetStrength.technology, 1)
    };
};

/**
 * getStrategicPositions - Identify key positions on the board
 *
 * Returns positions that have strategic importance:
 * - Chokepoints (tiles that control movement)
 * - Contested borders between players
 * - Vulnerable enemy cities
 * - Good defensive positions
 *
 * @param {number} playerId - Player perspective
 * @returns {Object} Categorized strategic positions
 */
GameEngine.prototype.getStrategicPositions = function(playerId) {
    const positions = {
        chokepoints: [],
        contestedBorders: [],
        vulnerableCities: [],
        defensivePositions: []
    };

    const player = this.players[playerId];
    if (!player) return positions;

    // Find contested border tiles (adjacent to both own and enemy territory)
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const owner = this.tileOwnership[r][c];
            let touchesOwn = owner === playerId;
            let touchesEnemy = owner !== null && owner !== playerId;

            // Check adjacent tiles
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr;
                    const nc = c + dc;
                    if (!this.isValidTile(nr, nc)) continue;

                    const adjOwner = this.tileOwnership[nr][nc];
                    if (adjOwner === playerId) touchesOwn = true;
                    if (adjOwner !== null && adjOwner !== playerId) touchesEnemy = true;
                }
            }

            if (touchesOwn && touchesEnemy) {
                positions.contestedBorders.push({ row: r, col: c, owner: owner });
            }
        }
    }

    // Find vulnerable enemy cities
    this.pieces.forEach(piece => {
        if (piece.type !== PIECE_TYPES.CITY) return;
        if (piece.ownerId === playerId) return;
        if (player.relations[piece.ownerId] !== 'war') return;

        // Check if city is low HP or undefended
        const defenders = this.pieces.filter(p =>
            p.type === PIECE_TYPES.WARRIOR &&
            p.ownerId === piece.ownerId &&
            Math.max(Math.abs(p.row - piece.row), Math.abs(p.col - piece.col)) <= 2
        );

        const vulnerability = (1 - piece.hp / piece.maxHp) +
                              (defenders.length === 0 ? 0.5 : 0);

        if (vulnerability > 0.3) {
            positions.vulnerableCities.push({
                row: piece.row,
                col: piece.col,
                hp: piece.hp,
                maxHp: piece.maxHp,
                defenders: defenders.length,
                vulnerability: vulnerability
            });
        }
    });

    // Find good defensive positions for own cities
    this.pieces.forEach(piece => {
        if (piece.type !== PIECE_TYPES.CITY) return;
        if (piece.ownerId !== playerId) return;

        // Find tiles around city that would be good for defenders
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = piece.row + dr;
                const nc = piece.col + dc;
                if (!this.isValidTile(nr, nc)) continue;
                if (this.board[nr][nc]) continue; // Occupied

                // Score based on coverage of approaches
                positions.defensivePositions.push({
                    row: nr,
                    col: nc,
                    protects: piece.id,
                    cityPos: { row: piece.row, col: piece.col }
                });
            }
        }
    });

    // Sort vulnerable cities by vulnerability
    positions.vulnerableCities.sort((a, b) => b.vulnerability - a.vulnerability);

    return positions;
};

/**
 * getPieceThreats - Get all pieces that threaten a specific tile or piece
 *
 * @param {number} row - Target row
 * @param {number} col - Target column
 * @param {number} defenderId - Owner of tile/piece being threatened
 * @returns {Array<Object>} List of threatening pieces with threat details
 */
GameEngine.prototype.getPieceThreats = function(row, col, defenderId) {
    const threats = [];

    this.pieces.forEach(piece => {
        if (piece.type !== PIECE_TYPES.WARRIOR) return;
        if (piece.ownerId === defenderId) return;

        const defender = this.players[defenderId];
        if (defender.relations[piece.ownerId] !== 'war') return;

        const dist = Math.max(
            Math.abs(piece.row - row),
            Math.abs(piece.col - col)
        );

        if (dist <= 3) { // Within threatening range
            threats.push({
                piece: piece,
                distance: dist,
                canReachThisTurn: dist === 1,
                turnsToReach: dist,
                damage: piece.damage
            });
        }
    });

    // Sort by distance (immediate threats first)
    threats.sort((a, b) => a.distance - b.distance);

    return threats;
};

/**
 * simulateMove - Simulate a move without executing it
 *
 * Useful for AI lookahead to evaluate consequences of moves.
 * Returns the expected game state after the move.
 *
 * @param {Object} piece - Piece to move
 * @param {number} targetRow - Target row
 * @param {number} targetCol - Target column
 * @returns {Object} Simulated result including combat outcomes
 */
GameEngine.prototype.simulateMove = function(piece, targetRow, targetCol) {
    const result = {
        valid: false,
        combat: null,
        territoryGained: false,
        pieceDestroyed: null,
        ownPieceLost: false
    };

    const canMove = this.canMoveTo(piece, targetRow, targetCol);
    if (!canMove.valid) {
        return result;
    }

    result.valid = true;

    // Check for combat
    const targetPiece = this.board[targetRow][targetCol];
    if (targetPiece && piece.type === PIECE_TYPES.WARRIOR) {
        result.combat = {
            defender: targetPiece,
            defenderHpAfter: targetPiece.hp - piece.damage,
            defenderDestroyed: targetPiece.hp <= piece.damage
        };

        if (targetPiece.type === PIECE_TYPES.CITY && result.combat.defenderDestroyed) {
            result.combat.cityCapture = true;
            result.combat.defenderDestroyed = false;
        }

        result.pieceDestroyed = result.combat.defenderDestroyed ? targetPiece : null;
    }

    // Check territory change
    const tileOwner = this.tileOwnership[targetRow][targetCol];
    if (piece.type === PIECE_TYPES.WARRIOR && tileOwner !== piece.ownerId) {
        result.territoryGained = true;
    }

    return result;
};

// Legacy AI placeholder functions (kept for backwards compatibility)
GameEngine.prototype.getAIMove = function(playerId) {
    // Placeholder for AI - returns null (no AI implemented yet)
    return null;
};

GameEngine.prototype.executeAITurn = function(playerId) {
    // Placeholder for AI turn execution
    this.log('AI_TURN_SKIP', { player: playerId, reason: 'AI not implemented' });
};
