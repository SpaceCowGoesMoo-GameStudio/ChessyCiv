// ============================================
// GOAL DETERMINATION
// ============================================

/**
 * Determine strategic goals based on current situation
 */
CivChessAI.prototype.determineGoals = function() {
    this.activeGoals = [];

    const atWar = this.isAtWar();

    // Diagonal blockade is highest priority if strategy is active and not complete
    if (this.useBlockadeStrategy && !this.isBlockadeComplete() && !this.isBlockadePaused()) {
        this.activeGoals.push({ type: AI_GOAL_TYPE.DIAGONAL_BLOCKADE, priority: 15 });
    }

    if (atWar) {
        // War takes priority - expansionist focuses on demilitarization then conquest
        this.activeGoals.push({ type: AI_GOAL_TYPE.WAR_DEMILITARIZE, priority: 10 });
        this.activeGoals.push({ type: AI_GOAL_TYPE.WAR_CONQUER, priority: 8 });
        this.activeGoals.push({ type: AI_GOAL_TYPE.DARPA, priority: 7 });
    } else {
        // Peacetime goals for expansionist
        this.activeGoals.push({ type: AI_GOAL_TYPE.BORDER_ESTABLISHMENT, priority: 8 });
        this.activeGoals.push({ type: AI_GOAL_TYPE.DEFENSE_INDUSTRY, priority: 7 });
        this.activeGoals.push({ type: AI_GOAL_TYPE.EXPANSION, priority: 9 });

        // Check if we need DARPA
        if (this.needsTechParity()) {
            this.activeGoals.push({ type: AI_GOAL_TYPE.DARPA, priority: 10 });
        }

        // Check posturing
        if (this.detectEnemyBuildup()) {
            this.activeGoals.push({ type: AI_GOAL_TYPE.POSTURING, priority: 9 });
        }

        // Check if we should prepare for war due to slow progress
        if (this.shouldPrepareForWar()) {
            this.activeGoals.push({ type: AI_GOAL_TYPE.ATTACK_BUILDUP, priority: 10 });
        }
    }

    // Sort by priority
    this.activeGoals.sort((a, b) => b.priority - a.priority);
};

/**
 * Determine if we should prepare for war based on performance
 */
CivChessAI.prototype.shouldPrepareForWar = function() {
    const progress = this.evaluateProgress();

    // If we're making good progress, no need for war
    if (progress.isProgressing) return false;

    // Check if adversary is relatively equal in strength
    if (!this.isAdversaryEqual()) return false;

    // Check if we have minimum force to consider war
    const warriors = this.gameState.ownPieces.warriors.length;
    const cities = this.gameState.ownPieces.cities.length;
    if (warriors < cities * 3) return false; // Need at least 3 warriors per city

    console.log(`[AI P${this.playerId + 1}] Progress stalled (${progress.reason}), preparing for war against P${this.targetedAdversary + 1}`);
    return true;
};

/**
 * Check if we are currently at war with anyone
 */
CivChessAI.prototype.isAtWar = function() {
    for (const [id, rel] of Object.entries(this.gameState.relations)) {
        if (rel.status === 'war' || rel.status === 'peace_proposed' ||
            rel.theirStatus === 'war' || rel.theirStatus === 'peace_proposed') return true;
    }
    return false;
};

/**
 * Get list of enemy player IDs we're at war with
 */
CivChessAI.prototype.getEnemies = function() {
    // Return cached result if available
    if (this._turnCache.enemies !== null) {
        return this._turnCache.enemies;
    }

    const enemies = [];
    for (const [id, rel] of Object.entries(this.gameState.relations)) {
        if (rel.status === 'war' || rel.status === 'peace_proposed' ||
            rel.theirStatus === 'war' || rel.theirStatus === 'peace_proposed') {
            enemies.push(parseInt(id));
        }
    }
    this._turnCache.enemies = enemies;
    return enemies;
};

/**
 * Check if we need tech parity with threatening players
 */
CivChessAI.prototype.needsTechParity = function() {
    for (const [id, profile] of this.playerProfiles) {
        if (profile.threatLevel > 2) {
            const theirStrength = this.engine.getPlayerStrength(id);
            if (theirStrength && theirStrength.breakdown.techLevel > this.gameState.techLevel) {
                return true;
            }
        }
    }
    return false;
};

/**
 * Check if any enemy is building up forces
 */
CivChessAI.prototype.detectEnemyBuildup = function() {
    for (const [id, profile] of this.playerProfiles) {
        if (profile.isBuilding && profile.threatLevel > 2) {
            return true;
        }
    }
    return false;
};

/**
 * Find the closest enemy city to any of our cities
 */
CivChessAI.prototype.findClosestEnemyCity = function(targetId) {
    const enemyPieces = this.gameState.enemyPieces[targetId];
    if (!enemyPieces || enemyPieces.cities.length === 0) return null;

    let closest = null;
    let minDist = Infinity;

    for (const city of enemyPieces.cities) {
        for (const myCity of this.gameState.ownPieces.cities) {
            const dist = Math.max(Math.abs(city.row - myCity.row), Math.abs(city.col - myCity.col));
            if (dist < minDist) {
                minDist = dist;
                closest = { city, distance: dist };
            }
        }
    }

    return closest;
};

/**
 * Check if we have a specific goal active
 */
CivChessAI.prototype.hasGoal = function(goalType) {
    return this.activeGoals.some(g => g.type === goalType);
};
