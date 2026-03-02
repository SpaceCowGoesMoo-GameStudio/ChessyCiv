// ============================================
// WARRIOR OBJECTIVE TRACKING
// ============================================

/**
 * Update objectives for all warriors.
 * Uses event-driven reassessment instead of blind 5-turn checks.
 */
CivChessAI.prototype.updateWarriorObjectives = function() {
    const warriors = this.gameState.ownPieces.warriors;
    const atWar = this.isAtWar();

    // First, clean up objectives for dead warriors
    const warriorIds = new Set(warriors.map(w => w.id));
    for (const [id, _] of this.warriorObjectives) {
        if (!warriorIds.has(id)) {
            this.warriorObjectives.delete(id);
        }
    }

    // Clean up blockade assignments for dead warriors
    for (const [id, _] of this.blockadeAssignments) {
        if (!warriorIds.has(id)) {
            this.blockadeAssignments.delete(id);
        }
    }

    // Clean up temporarily vacated blockade tracking for dead warriors
    for (const [id, _] of this.temporarilyVacatedBlockade) {
        if (!warriorIds.has(id)) {
            this.temporarilyVacatedBlockade.delete(id);
        }
    }

    // Clean up stale sieges
    this.cleanupStaleSieges();

    // Hard AI: free one warrior to reinforce any undersupplied siege
    if (this.difficulty === AI_DIFFICULTY.HARD) {
        this.rebalanceSiegesIfNeeded();
    }

    // Update each warrior's objective
    for (const warrior of warriors) {
        let objective = this.warriorObjectives.get(warrior.id);

        if (objective) {
            objective.turnsTracking++;

            // Check for reassessment triggers (event-driven)
            const trigger = this.detectReassessmentTrigger(warrior, objective);

            if (trigger) {
                // Check if we should break the lock
                if (this.shouldBreakLock(warrior, objective, trigger)) {
                    console.log(`[AI P${this.playerId + 1}] Reassigning warrior ${warrior.id}: ${trigger}`);
                    objective = null;
                }
            }
        }

        if (!objective) {
            // Assign new objective
            if (atWar) {
                objective = this.assignWarObjective(warrior);
            } else {
                objective = this.assignPeacetimeObjective(warrior);
            }

            if (objective) {
                this.warriorObjectives.set(warrior.id, objective);
            }
        }
    }
};

// ============================================
// TARGET LOCKING SYSTEM
// ============================================

/**
 * Calculate lock strength for a warrior's current objective.
 * Higher lock strength resists reassignment.
 *
 * @param {Object} warrior - The warrior
 * @param {Object} target - The target
 * @param {string} type - Objective type
 * @returns {number} Lock strength between 0.1 and 1.0
 */
CivChessAI.prototype.calculateLockStrength = function(warrior, target, type) {
    let strength = 0.5; // Base strength

    // Siege objectives have high lock strength
    if (type === WAR_OBJECTIVE_TYPE.SIEGE_CITY) {
        strength += 0.3;
    }

    // Closer targets have higher lock strength
    const distance = this.getDistance(warrior, target);
    if (distance <= 2) {
        strength += 0.2;
    } else if (distance <= 4) {
        strength += 0.1;
    }

    // Wounded targets have higher lock (finish the kill)
    if (target.hp !== undefined && target.hp < 4) {
        strength += 0.15;
    }

    // Reduce strength if too many warriors on same target
    const assignedCount = this.countWarriorsTargeting(target);
    if (assignedCount > 2 && type !== WAR_OBJECTIVE_TYPE.SIEGE_CITY) {
        strength -= 0.2;
    }

    // Clamp to valid range
    return Math.max(WAR_CONFIG.LOCK_STRENGTH_MIN, Math.min(WAR_CONFIG.LOCK_STRENGTH_MAX, strength));
};

/**
 * Determine if a lock should be broken for a new objective.
 *
 * @param {Object} warrior - The warrior
 * @param {Object} objective - Current objective
 * @param {string} trigger - The reassessment trigger
 * @returns {boolean} True if lock should be broken
 */
CivChessAI.prototype.shouldBreakLock = function(warrior, objective, trigger) {
    // Always break for destroyed targets
    if (trigger === REASSESSMENT_TRIGGER.TARGET_DESTROYED) {
        return true;
    }

    // Always break for critical city defense
    if (trigger === REASSESSMENT_TRIGGER.CITY_UNDER_ATTACK) {
        const criticalCities = this.getCriticalCities();
        if (criticalCities.length > 0) {
            return true;
        }
    }

    // Check minimum turns before reassessment
    if (objective.turnsTracking < WAR_CONFIG.MIN_TURNS_BEFORE_REASSESS) {
        return false;
    }

    // Calculate lock strength
    const lockStrength = this.calculateLockStrength(warrior, objective.target, objective.type);

    // Higher lock strength requires stronger triggers to break
    if (lockStrength >= 0.8) {
        // Only break for target destroyed or critical city
        return trigger === REASSESSMENT_TRIGGER.TARGET_DESTROYED ||
               trigger === REASSESSMENT_TRIGGER.CITY_UNDER_ATTACK;
    }

    if (lockStrength >= 0.6) {
        // Break for stale objectives too
        return trigger === REASSESSMENT_TRIGGER.TARGET_DESTROYED ||
               trigger === REASSESSMENT_TRIGGER.CITY_UNDER_ATTACK ||
               trigger === REASSESSMENT_TRIGGER.STALE_OBJECTIVE;
    }

    // Lower lock strength - break for most triggers
    return true;
};

/**
 * Count how many warriors are targeting the same target.
 *
 * @param {Object} target - The target to check
 * @returns {number} Number of warriors targeting this
 */
CivChessAI.prototype.countWarriorsTargeting = function(target) {
    let count = 0;
    for (const [_, objective] of this.warriorObjectives) {
        if (objective.target && objective.target.id === target.id) {
            count++;
        }
    }
    return count;
};

// ============================================
// EVENT-DRIVEN REASSESSMENT
// ============================================

/**
 * Detect if a warrior's objective needs reassessment.
 *
 * @param {Object} warrior - The warrior
 * @param {Object} objective - Current objective
 * @returns {string|null} The trigger type or null if no reassessment needed
 */
CivChessAI.prototype.detectReassessmentTrigger = function(warrior, objective) {
    if (!objective || !objective.target) {
        return REASSESSMENT_TRIGGER.TARGET_DESTROYED;
    }

    // Check if target was destroyed
    if (objective.target.id) {
        const target = this.findPiece(objective.target.id);
        if (!target) {
            return REASSESSMENT_TRIGGER.TARGET_DESTROYED;
        }

        // Check if target moved far away
        if (objective.lastKnownTargetPos) {
            const movedDist = this.getDistance(objective.lastKnownTargetPos, target);
            if (movedDist >= WAR_CONFIG.TARGET_MOVED_THRESHOLD) {
                // Update last known position
                objective.lastKnownTargetPos = { row: target.row, col: target.col };
                return REASSESSMENT_TRIGGER.TARGET_MOVED_FAR;
            }
        }
    }

    // Check if any of our cities became critical
    const criticalCities = this.getCriticalCities();
    if (criticalCities.length > 0 && objective.type !== WAR_OBJECTIVE_TYPE.DEFEND_CITY) {
        return REASSESSMENT_TRIGGER.CITY_UNDER_ATTACK;
    }

    // Check for stale objective (no progress in several turns)
    if (objective.turnsTracking >= WAR_CONFIG.STALE_THRESHOLD) {
        const progress = this.evaluateObjectiveProgress(warrior, objective);
        if (!progress) {
            return REASSESSMENT_TRIGGER.STALE_OBJECTIVE;
        } else {
            // Reset tracking since we made progress
            objective.turnsTracking = 0;
            objective.initialDistance = this.getDistance(warrior, objective.target);
            if (objective.target.hp !== undefined) {
                const currentTarget = this.findPiece(objective.target.id);
                if (currentTarget) {
                    objective.initialTargetHp = currentTarget.hp;
                }
            }
        }
    }

    // Check if path is blocked (for non-adjacent targets)
    const distance = this.getDistance(warrior, objective.target);
    if (distance > 1) {
        const path = this.findWarriorPathAStar(warrior, objective.target);
        if (!path) {
            return REASSESSMENT_TRIGGER.PATH_BLOCKED;
        }
    }

    return null;
};

/**
 * Evaluate if a warrior is making progress on their objective
 */
CivChessAI.prototype.evaluateObjectiveProgress = function(warrior, objective) {
    const currentDist = this.getDistance(warrior, objective.target);

    // Check if we're closer
    if (currentDist < objective.initialDistance) {
        return true;
    }

    // Check if target has taken damage (for enemy targets)
    if (objective.target.hp !== undefined && objective.initialTargetHp !== undefined) {
        const currentTarget = this.findPiece(objective.target.id);
        if (currentTarget && currentTarget.hp < objective.initialTargetHp) {
            return true;
        }
    }

    return false;
};

// ============================================
// WAR OBJECTIVE ASSIGNMENT
// ============================================

/**
 * Assign a war objective to a warrior using the new priority system.
 *
 * @param {Object} warrior - The warrior to assign objective to
 * @returns {Object|null} The assigned objective
 */
CivChessAI.prototype.assignWarObjective = function(warrior) {
    const candidates = [];

    // 1. DEFEND_CITY - Critical cities (highest priority)
    const criticalCities = this.getCriticalCities();
    for (const cityData of criticalCities) {
        candidates.push({
            target: cityData.city,
            type: WAR_OBJECTIVE_TYPE.DEFEND_CITY,
            priority: WAR_OBJECTIVE_PRIORITY[WAR_OBJECTIVE_TYPE.DEFEND_CITY],
            cityData: cityData
        });
    }

    // 2. TERRITORY_RECLAIM - Encroaching tiles on pressured cities
    const pressuredCities = this.getCitiesUnderPressure();
    for (const cityData of pressuredCities) {
        for (const tile of cityData.encroachingTiles) {
            // Only consider tiles we can reclaim (not occupied by enemy city)
            const piece = this.engine.board[tile.row][tile.col];
            if (piece && piece.type === PIECE_TYPES.CITY) continue;

            candidates.push({
                target: { row: tile.row, col: tile.col, id: `tile_${tile.row}_${tile.col}` },
                type: WAR_OBJECTIVE_TYPE.TERRITORY_RECLAIM,
                priority: WAR_OBJECTIVE_PRIORITY[WAR_OBJECTIVE_TYPE.TERRITORY_RECLAIM],
                isAdjacent: tile.isAdjacent
            });
        }
    }

    // 3. INTERCEPT - Enemy warriors approaching our cities
    const interceptTargets = this.findInterceptTargets();
    for (const target of interceptTargets) {
        candidates.push({
            target: target.enemy,
            type: WAR_OBJECTIVE_TYPE.INTERCEPT,
            priority: WAR_OBJECTIVE_PRIORITY[WAR_OBJECTIVE_TYPE.INTERCEPT],
            threatenedCity: target.city
        });
    }

    // 4. SIEGE_CITY - Vulnerable enemy cities (coordinated)
    const vulnerableCities = this.strategicPositions.vulnerableCities || [];
    for (const city of vulnerableCities) {
        candidates.push({
            target: { row: city.row, col: city.col, id: city.id || `city_${city.row}_${city.col}` },
            type: WAR_OBJECTIVE_TYPE.SIEGE_CITY,
            priority: WAR_OBJECTIVE_PRIORITY[WAR_OBJECTIVE_TYPE.SIEGE_CITY]
        });
    }

    // 5. ELIMINATE_WARRIOR - Enemy warriors
    const enemies = this.getEnemies();
    const enemyWarriors = this.getAllEnemyWarriors(enemies);
    for (const enemyWarrior of enemyWarriors) {
        candidates.push({
            target: enemyWarrior,
            type: WAR_OBJECTIVE_TYPE.ELIMINATE_WARRIOR,
            priority: WAR_OBJECTIVE_PRIORITY[WAR_OBJECTIVE_TYPE.ELIMINATE_WARRIOR]
        });
    }

    // 6. CONTROL_CHOKEPOINT - Strategic positions (if available)
    const chokepoints = this.findChokepoints();
    for (const pos of chokepoints) {
        candidates.push({
            target: { row: pos.row, col: pos.col, id: `chokepoint_${pos.row}_${pos.col}` },
            type: WAR_OBJECTIVE_TYPE.CONTROL_CHOKEPOINT,
            priority: WAR_OBJECTIVE_PRIORITY[WAR_OBJECTIVE_TYPE.CONTROL_CHOKEPOINT]
        });
    }

    // Score all candidates and pick the best
    if (candidates.length === 0) {
        return null;
    }

    let bestCandidate = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
        const score = this.scoreObjectiveCandidate(warrior, candidate);
        if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
        }
    }

    if (!bestCandidate) {
        return null;
    }

    // Handle siege coordination
    if (bestCandidate.type === WAR_OBJECTIVE_TYPE.SIEGE_CITY) {
        return this.createSiegeObjective(warrior, bestCandidate.target);
    }

    // Create the objective
    return {
        target: bestCandidate.target,
        type: bestCandidate.type,
        turnsTracking: 0,
        initialDistance: this.getDistance(warrior, bestCandidate.target),
        initialTargetHp: bestCandidate.target.hp,
        lastKnownTargetPos: bestCandidate.target.id ?
            { row: bestCandidate.target.row, col: bestCandidate.target.col } : null
    };
};

/**
 * Score an objective candidate for a warrior.
 *
 * @param {Object} warrior - The warrior
 * @param {Object} candidate - The candidate objective
 * @returns {number} Score for this candidate
 */
CivChessAI.prototype.scoreObjectiveCandidate = function(warrior, candidate) {
    const distance = this.getDistance(warrior, candidate.target);

    // Base score is priority minus distance penalty
    let score = candidate.priority - (distance * 2);

    // Continuity bonus - if warrior was already targeting this
    const currentObjective = this.warriorObjectives.get(warrior.id);
    if (currentObjective && currentObjective.target &&
        currentObjective.target.id === candidate.target.id) {
        score += 15;
    }

    // Wounded target bonus
    if (candidate.target.hp !== undefined && candidate.target.hp < 4) {
        score += 20;
    }

    // Proximity bonus - very close targets get bonus
    if (distance <= 2) {
        score += 10;
    }

    // Adjacent tile bonus for territory reclaim
    if (candidate.type === WAR_OBJECTIVE_TYPE.TERRITORY_RECLAIM && candidate.isAdjacent) {
        score += 10;
    }

    // Hard AI: siege gets a strong pull when it hasn't got enough damage assigned yet
    if (this.difficulty === AI_DIFFICULTY.HARD && candidate.type === WAR_OBJECTIVE_TYPE.SIEGE_CITY) {
        const cityKey = candidate.target.id || `${candidate.target.row}_${candidate.target.col}`;
        const siege = this.activeSieges.get(cityKey);
        if (siege && siege.requiredDamage !== undefined) {
            const assigned = this.getSiegeAssignedDamage(siege);
            if (assigned < siege.requiredDamage) {
                score += 35; // Undersupplied — urgently needs warriors
            } else {
                score -= 20; // Already has enough damage; prefer other tasks
            }
        }
    }

    // Hard AI: threat-based scoring for anti-warrior objectives, with double-team incentive
    if (this.difficulty === AI_DIFFICULTY.HARD &&
        (candidate.type === WAR_OBJECTIVE_TYPE.ELIMINATE_WARRIOR ||
         candidate.type === WAR_OBJECTIVE_TYPE.INTERCEPT)) {
        // Score threat by proximity of the enemy warrior to our nearest city
        let minCityDist = Infinity;
        for (const city of this.gameState.ownPieces.cities) {
            const d = this.getDistance(candidate.target, city);
            if (d < minCityDist) minCityDist = d;
        }
        score += Math.max(0, BOARD_SIZE - minCityDist) * 2.5;

        // Double-team: bonus for the 2nd attacker, heavy penalty for 3rd+
        const assignedCount = this.countWarriorsTargeting(candidate.target);
        if (assignedCount === 1) {
            score += 10; // Encourage pairing up
        } else if (assignedCount >= 2) {
            score -= 25; // Move on to the next threat
        }
        return score;
    }

    // Penalty for too many warriors on same non-siege target
    if (candidate.type !== WAR_OBJECTIVE_TYPE.SIEGE_CITY) {
        const assignedCount = this.countWarriorsTargeting(candidate.target);
        if (assignedCount >= WAR_CONFIG.MAX_WARRIORS_PER_TARGET) {
            score -= 30;
        } else if (assignedCount >= 2) {
            score -= 15;
        }
    }

    return score;
};

/**
 * Assign a peacetime objective to a warrior.
 * Preserves existing blockade and other peacetime behavior.
 *
 * @param {Object} warrior - The warrior to assign objective to
 * @returns {Object|null} The assigned objective
 */
CivChessAI.prototype.assignPeacetimeObjective = function(warrior) {
    // Check if this warrior should return to a vacated blockade position
    const vacatedInfo = this.temporarilyVacatedBlockade.get(warrior.id);
    if (vacatedInfo) {
        const settlerStillBlocking = this.settlerNeedsBlockadePassage();
        if (!settlerStillBlocking) {
            this.temporarilyVacatedBlockade.delete(warrior.id);
            return {
                target: vacatedInfo.originalPos,
                type: 'blockade_return',
                turnsTracking: 0,
                initialDistance: this.getDistance(warrior, vacatedInfo.originalPos)
            };
        }
    }

    // HIGHEST PRIORITY: Diagonal blockade (if strategy active)
    if (this.hasGoal(AI_GOAL_TYPE.DIAGONAL_BLOCKADE)) {
        const blockadePos = this.getAvailableBlockadePosition(warrior);
        if (blockadePos) {
            this.blockadeAssignments.set(warrior.id, blockadePos);
            return {
                target: blockadePos,
                type: 'blockade',
                turnsTracking: 0,
                initialDistance: this.getDistance(warrior, blockadePos)
            };
        }
    }

    // Other peacetime objectives
    if (this.hasGoal(AI_GOAL_TYPE.BORDER_ESTABLISHMENT)) {
        const borderPos = this.findBorderPosition(warrior);
        if (borderPos) {
            return {
                target: borderPos,
                type: 'border',
                turnsTracking: 0,
                initialDistance: this.getDistance(warrior, borderPos)
            };
        }
    }

    if (this.hasGoal(AI_GOAL_TYPE.DEFENSE_INDUSTRY)) {
        const defensePos = this.findDefensePosition(warrior);
        if (defensePos) {
            return {
                target: defensePos,
                type: 'defense',
                turnsTracking: 0,
                initialDistance: this.getDistance(warrior, defensePos)
            };
        }
    }

    if (this.hasGoal(AI_GOAL_TYPE.POSTURING)) {
        const posturePos = this.findPosturePosition(warrior);
        if (posturePos) {
            return {
                target: posturePos,
                type: 'posture',
                turnsTracking: 0,
                initialDistance: this.getDistance(warrior, posturePos)
            };
        }
    }

    return null;
};

// ============================================
// HARD AI SIEGE DAMAGE MANAGEMENT
// ============================================

/**
 * Damage per round needed to capture a city in approximately 3 rounds of attacks.
 * Returns slightly more than city.hp/3 so the city falls within the window.
 */
CivChessAI.prototype.getSiegeRequiredDamage = function(cityHp) {
    return Math.ceil(cityHp / 3) + 1;
};

/**
 * Sum the damage values of all currently-alive warriors assigned to a siege.
 */
CivChessAI.prototype.getSiegeAssignedDamage = function(siege) {
    let total = 0;
    for (const warriorId of siege.assignedWarriors) {
        const piece = this.engine.pieces.find(p => p.id === warriorId);
        if (piece) total += piece.damage || 1;
    }
    return total;
};

/**
 * For each active siege that is undersupplied in damage, free the warrior with the
 * lowest lock strength (excluding city defenders and other siege warriors) so that
 * the next assignment round can redirect them to the siege.
 * Hard AI only — called each turn after cleanupStaleSieges.
 */
CivChessAI.prototype.rebalanceSiegesIfNeeded = function() {
    for (const [, siege] of this.activeSieges) {
        if (siege.requiredDamage === undefined) continue;

        const cityPiece = this.engine.board[siege.targetCity.row][siege.targetCity.col];
        if (!cityPiece) continue;

        // Refresh required damage against current city HP
        siege.requiredDamage = this.getSiegeRequiredDamage(cityPiece.hp);

        if (this.getSiegeAssignedDamage(siege) >= siege.requiredDamage) continue;

        // Siege is short on damage — find the softest-locked warrior to redirect
        let lowestLock = Infinity;
        let candidateId = null;

        for (const [warriorId, objective] of this.warriorObjectives) {
            if (objective.type === WAR_OBJECTIVE_TYPE.DEFEND_CITY) continue;
            if (objective.type === WAR_OBJECTIVE_TYPE.SIEGE_CITY) continue;
            if (objective.turnsTracking < WAR_CONFIG.MIN_TURNS_BEFORE_REASSESS) continue;

            const piece = this.engine.pieces.find(p => p.id === warriorId);
            if (!piece) continue;

            const lock = this.calculateLockStrength(piece, objective.target, objective.type);
            if (lock < lowestLock) {
                lowestLock = lock;
                candidateId = warriorId;
            }
        }

        if (candidateId !== null) {
            this.warriorObjectives.delete(candidateId);
        }
    }
};

// ============================================
// SIEGE COORDINATION
// ============================================

/**
 * Create a siege objective for a warrior targeting a city.
 *
 * @param {Object} warrior - The warrior
 * @param {Object} targetCity - The city to siege
 * @returns {Object} The siege objective
 */
CivChessAI.prototype.createSiegeObjective = function(warrior, targetCity) {
    const cityKey = targetCity.id || `${targetCity.row}_${targetCity.col}`;

    // Get or create siege tracking
    let siege = this.activeSieges.get(cityKey);
    if (!siege) {
        siege = {
            targetCity: targetCity,
            assignedWarriors: new Set(),
            approachPositions: this.calculateApproachPositions(targetCity)
        };
        // Hard AI: record how much damage is needed to take this city in ~3 rounds
        if (this.difficulty === AI_DIFFICULTY.HARD) {
            const cityPiece = this.engine.board[targetCity.row][targetCity.col];
            siege.requiredDamage = cityPiece ? this.getSiegeRequiredDamage(cityPiece.hp) : 2;
        }
        this.activeSieges.set(cityKey, siege);
    } else if (this.difficulty === AI_DIFFICULTY.HARD) {
        // Refresh required damage as city HP changes
        const cityPiece = this.engine.board[targetCity.row][targetCity.col];
        if (cityPiece) siege.requiredDamage = this.getSiegeRequiredDamage(cityPiece.hp);
    }

    // Add warrior to siege
    siege.assignedWarriors.add(warrior.id);

    // Assign approach position
    const approachPos = this.getAvailableApproachPosition(siege, warrior);

    return {
        target: targetCity,
        type: WAR_OBJECTIVE_TYPE.SIEGE_CITY,
        turnsTracking: 0,
        initialDistance: this.getDistance(warrior, targetCity),
        siegeKey: cityKey,
        approachPosition: approachPos
    };
};

/**
 * Calculate approach positions for sieging a city.
 * Returns positions around the city that warriors can approach from.
 *
 * @param {Object} city - The city to siege
 * @returns {Array} Array of approach positions
 */
CivChessAI.prototype.calculateApproachPositions = function(city) {
    const positions = [];
    const directions = [
        { dr: -1, dc: 0, name: 'north' },
        { dr: 1, dc: 0, name: 'south' },
        { dr: 0, dc: -1, name: 'west' },
        { dr: 0, dc: 1, name: 'east' },
        { dr: -1, dc: -1, name: 'northwest' },
        { dr: -1, dc: 1, name: 'northeast' },
        { dr: 1, dc: -1, name: 'southwest' },
        { dr: 1, dc: 1, name: 'southeast' }
    ];

    for (const dir of directions) {
        const r = city.row + dir.dr;
        const c = city.col + dir.dc;

        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            const piece = this.engine.board[r][c];
            // Position is valid if empty or has enemy (can attack)
            if (!piece || piece.ownerId !== this.playerId) {
                positions.push({
                    row: r,
                    col: c,
                    direction: dir.name,
                    assigned: null
                });
            }
        }
    }

    return positions;
};

/**
 * Get an available approach position for a warrior in a siege.
 *
 * @param {Object} siege - The siege object
 * @param {Object} warrior - The warrior
 * @returns {Object|null} The approach position or null
 */
CivChessAI.prototype.getAvailableApproachPosition = function(siege, warrior) {
    // Check if warrior already has an assigned position
    for (const pos of siege.approachPositions) {
        if (pos.assigned === warrior.id) {
            return pos;
        }
    }

    // Find closest unassigned position
    let bestPos = null;
    let bestDist = Infinity;

    for (const pos of siege.approachPositions) {
        if (pos.assigned) continue;

        const dist = this.getDistance(warrior, pos);
        if (dist < bestDist) {
            bestDist = dist;
            bestPos = pos;
        }
    }

    if (bestPos) {
        bestPos.assigned = warrior.id;
    }

    return bestPos;
};

/**
 * Get ideal siege size based on city defenders and HP.
 *
 * @param {Object} city - The city
 * @returns {number} Ideal number of warriors for siege
 */
CivChessAI.prototype.getIdealSiegeSize = function(city) {
    let size = WAR_CONFIG.SIEGE_MIN_WARRIORS;

    // Add for city HP
    const cityPiece = this.findPiece(city.id);
    if (cityPiece && cityPiece.hp > 2) {
        size++;
    }

    // Add for defenders
    const defenders = this.countDefendersNearCity(city);
    size += Math.floor(defenders / 2);

    return Math.min(size, 5); // Cap at 5 warriors
};

/**
 * Count enemy defenders near a city.
 *
 * @param {Object} city - The city
 * @returns {number} Number of defenders
 */
CivChessAI.prototype.countDefendersNearCity = function(city) {
    let count = 0;
    for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
            const r = city.row + dr;
            const c = city.col + dc;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;

            const piece = this.engine.board[r][c];
            if (piece && piece.type === PIECE_TYPES.WARRIOR && piece.ownerId !== this.playerId) {
                count++;
            }
        }
    }
    return count;
};

/**
 * Clean up stale siege assignments.
 */
CivChessAI.prototype.cleanupStaleSieges = function() {
    const warriorIds = new Set(this.gameState.ownPieces.warriors.map(w => w.id));

    for (const [cityKey, siege] of this.activeSieges) {
        // Remove dead warriors from siege
        for (const warriorId of siege.assignedWarriors) {
            if (!warriorIds.has(warriorId)) {
                siege.assignedWarriors.delete(warriorId);
                // Free up their approach position
                for (const pos of siege.approachPositions) {
                    if (pos.assigned === warriorId) {
                        pos.assigned = null;
                    }
                }
            }
        }

        // Remove siege if no warriors assigned
        if (siege.assignedWarriors.size === 0) {
            this.activeSieges.delete(cityKey);
            continue;
        }

        // Check if city still exists
        const cityPiece = this.engine.board[siege.targetCity.row][siege.targetCity.col];
        if (!cityPiece || cityPiece.type !== PIECE_TYPES.CITY) {
            this.activeSieges.delete(cityKey);
        }
    }
};

// ============================================
// INTERCEPT & CHOKEPOINT DETECTION
// ============================================

/**
 * Find enemy warriors that are approaching our cities.
 *
 * @returns {Array} Array of { enemy, city, distance }
 */
CivChessAI.prototype.findInterceptTargets = function() {
    const targets = [];
    const enemies = this.getEnemies();
    const ourCities = this.gameState.ownPieces.cities;

    for (const enemyId of enemies) {
        const enemyPieces = this.gameState.enemyPieces[enemyId];
        if (!enemyPieces) continue;

        for (const enemyWarrior of enemyPieces.warriors) {
            // Check distance to each of our cities
            for (const city of ourCities) {
                const dist = this.getDistance(enemyWarrior, city);
                if (dist <= WAR_CONFIG.INTERCEPT_RANGE) {
                    targets.push({
                        enemy: enemyWarrior,
                        city: city,
                        distance: dist
                    });
                }
            }
        }
    }

    // Sort by distance (closest threats first)
    targets.sort((a, b) => a.distance - b.distance);

    return targets;
};

/**
 * Find strategic chokepoints to control.
 *
 * @returns {Array} Array of chokepoint positions
 */
CivChessAI.prototype.findChokepoints = function() {
    // Use existing strategic positions if available
    if (this.strategicPositions && this.strategicPositions.chokepoints) {
        return this.strategicPositions.chokepoints;
    }

    // Simple chokepoint detection - positions between our cities and enemy cities
    const chokepoints = [];
    const ourCities = this.gameState.ownPieces.cities;
    const enemies = this.getEnemies();

    for (const enemyId of enemies) {
        const enemyPieces = this.gameState.enemyPieces[enemyId];
        if (!enemyPieces || enemyPieces.cities.length === 0) continue;

        for (const ourCity of ourCities) {
            for (const enemyCity of enemyPieces.cities) {
                // Find midpoint
                const midRow = Math.floor((ourCity.row + enemyCity.row) / 2);
                const midCol = Math.floor((ourCity.col + enemyCity.col) / 2);

                // Check if position is valid
                const piece = this.engine.board[midRow][midCol];
                if (!piece || piece.ownerId !== this.playerId) {
                    chokepoints.push({
                        row: midRow,
                        col: midCol,
                        id: `chokepoint_${midRow}_${midCol}`
                    });
                }
            }
        }
    }

    return chokepoints;
};

// ============================================
// UTILITY FUNCTIONS (PRESERVED)
// ============================================

/**
 * Get an available blockade position for a warrior
 */
CivChessAI.prototype.getAvailableBlockadePosition = function(warrior) {
    if (!this.blockadePositions) return null;

    // Check if warrior is already assigned to a blockade position
    const existingAssignment = this.blockadeAssignments.get(warrior.id);
    if (existingAssignment) {
        // Check if still valid (not taken by another)
        const piece = this.engine.board[existingAssignment.row][existingAssignment.col];
        if (!piece || (piece.id === warrior.id)) {
            return existingAssignment;
        }
    }

    // Collect all unassigned, available blockade positions
    const assignedPositions = new Set(
        [...this.blockadeAssignments.values()].map(p => `${p.row},${p.col}`)
    );

    const available = [];
    for (const pos of this.blockadePositions) {
        const posKey = `${pos.row},${pos.col}`;
        if (assignedPositions.has(posKey)) continue;

        const piece = this.engine.board[pos.row][pos.col];
        // Position available if empty or has enemy (can attack to take it)
        if (!piece || piece.ownerId !== this.playerId) {
            available.push(pos);
        }
    }

    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
};

/**
 * Get all enemy warriors from specified enemy IDs
 */
CivChessAI.prototype.getAllEnemyWarriors = function(enemies) {
    const warriors = [];
    for (const enemyId of enemies) {
        const enemyPieces = this.gameState.enemyPieces[enemyId];
        if (enemyPieces) {
            warriors.push(...enemyPieces.warriors);
        }
    }
    return warriors;
};

/**
 * Find closest target from a list
 */
CivChessAI.prototype.findClosestTarget = function(warrior, targets) {
    let closest = null;
    let minDist = Infinity;

    for (const target of targets) {
        const dist = this.getDistance(warrior, target);
        if (dist < minDist) {
            minDist = dist;
            closest = target;
        }
    }

    return closest;
};

/**
 * Calculate Chebyshev distance (8-directional movement)
 */
CivChessAI.prototype.getDistance = function(from, to) {
    return Math.max(Math.abs(from.row - to.row), Math.abs(from.col - to.col));
};

/**
 * Calculate Manhattan distance (orthogonal movement only)
 */
CivChessAI.prototype.getManhattanDistance = function(from, to) {
    return Math.abs(from.row - to.row) + Math.abs(from.col - to.col);
};

/**
 * Find a piece by ID
 */
CivChessAI.prototype.findPiece = function(pieceId) {
    return this.engine.pieces.find(p => p.id === pieceId);
};
