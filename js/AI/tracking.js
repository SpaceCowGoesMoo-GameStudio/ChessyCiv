// ============================================
// PERFORMANCE & WARSCORE TRACKING
// ============================================

/**
 * Update performance tracking metrics
 */
CivChessAI.prototype.updatePerformanceTracking = function() {
    const currentTurn = this.engine.turnNumber;
    if (currentTurn === this.lastPerformanceUpdate) return;
    this.lastPerformanceUpdate = currentTurn;

    // Calculate current metrics
    const myCities = this.gameState.ownPieces.cities.length;
    const myTerritory = this.gameState.territory.owned;
    const myTech = this.gameState.techLevel;

    // Calculate metrics relative to all enemies
    let totalEnemyCities = 0;
    let totalEnemyTerritory = 0;
    let strongestEnemy = null;
    let strongestEnemyStrength = 0;

    for (const [enemyId, pieces] of Object.entries(this.gameState.enemyPieces)) {
        const enemyIdNum = parseInt(enemyId);
        totalEnemyCities += pieces.cities.length;
        totalEnemyTerritory += this.gameState.territory.byPlayer[enemyIdNum] || 0;

        const enemyStrength = this.engine.getPlayerStrength(enemyIdNum);
        if (enemyStrength && enemyStrength.total > strongestEnemyStrength) {
            strongestEnemyStrength = enemyStrength.total;
            strongestEnemy = enemyIdNum;
        }
    }

    // Calculate ratios
    const cityRatio = totalEnemyCities > 0 ? myCities / totalEnemyCities : 999;
    const territoryRatio = totalEnemyTerritory > 0 ? myTerritory / totalEnemyTerritory : 999;
    const strengthRatio = this.myStrength && strongestEnemyStrength > 0 ?
        this.myStrength.total / strongestEnemyStrength : 1;

    // Update targeted adversary (strongest enemy or closest threat)
    this.targetedAdversary = this.selectTargetedAdversary(strongestEnemy);

    // Store performance snapshot
    this.performanceHistory.push({
        turn: currentTurn,
        cityRatio: cityRatio,
        territoryOwned: myTerritory,
        techLevel: myTech,
        strengthRatio: strengthRatio,
        myCities: myCities,
        enemyCities: totalEnemyCities
    });

    // Keep only recent history
    if (this.performanceHistory.length > PERFORMANCE_THRESHOLDS.HISTORY_LENGTH) {
        this.performanceHistory.shift();
    }
};

/**
 * Select the targeted adversary based on strength and proximity
 */
CivChessAI.prototype.selectTargetedAdversary = function(strongestEnemy) {
    // If already at war, target that enemy
    const enemies = this.getEnemies();
    if (enemies.length > 0) {
        return enemies[0];
    }

    // Otherwise, target the player who is closest and strongest
    let bestTarget = strongestEnemy;
    let bestScore = -Infinity;

    for (const [targetId, pieces] of Object.entries(this.gameState.enemyPieces)) {
        const targetIdNum = parseInt(targetId);
        const targetStrength = this.engine.getPlayerStrength(targetIdNum);
        if (!targetStrength) continue;

        // Score based on proximity and threat
        const closestCity = this.findClosestEnemyCity(targetIdNum);
        const proximity = closestCity ? (10 - closestCity.distance) : 0;
        const threat = this.playerProfiles.get(targetIdNum)?.threatLevel || 0;

        const score = proximity * 2 + threat + targetStrength.total * 0.1;
        if (score > bestScore) {
            bestScore = score;
            bestTarget = targetIdNum;
        }
    }

    return bestTarget;
};

/**
 * Evaluate if we're making progress toward our goals
 * Returns: { isProgressing: boolean, reason: string }
 */
CivChessAI.prototype.evaluateProgress = function() {
    if (this.performanceHistory.length < 3) {
        return { isProgressing: true, reason: 'insufficient_data' };
    }

    const recent = this.performanceHistory.slice(-3);
    const older = this.performanceHistory.slice(0, Math.max(1, this.performanceHistory.length - 3));

    // Calculate averages
    const recentAvgCityRatio = recent.reduce((s, p) => s + p.cityRatio, 0) / recent.length;
    const olderAvgCityRatio = older.reduce((s, p) => s + p.cityRatio, 0) / older.length;

    const recentAvgTerritory = recent.reduce((s, p) => s + p.territoryOwned, 0) / recent.length;
    const olderAvgTerritory = older.reduce((s, p) => s + p.territoryOwned, 0) / older.length;

    const recentAvgStrength = recent.reduce((s, p) => s + p.strengthRatio, 0) / recent.length;
    const olderAvgStrength = older.reduce((s, p) => s + p.strengthRatio, 0) / older.length;

    // Check for declining city ratio
    if (recentAvgCityRatio < olderAvgCityRatio * PERFORMANCE_THRESHOLDS.CITY_RATIO_TRIGGER) {
        return { isProgressing: false, reason: 'city_ratio_declining' };
    }

    // Check for stagnant territory growth
    const territoryGrowth = recentAvgTerritory - olderAvgTerritory;
    if (territoryGrowth < PERFORMANCE_THRESHOLDS.TERRITORY_GROWTH_MIN && this.performanceHistory.length >= PERFORMANCE_THRESHOLDS.SLOW_PROGRESS_TURNS) {
        return { isProgressing: false, reason: 'territory_stagnant' };
    }

    // Check for declining strength ratio
    if (recentAvgStrength < olderAvgStrength * 0.9) {
        return { isProgressing: false, reason: 'strength_declining' };
    }

    return { isProgressing: true, reason: 'ok' };
};

/**
 * Check if targeted adversary is relatively equal in strength
 */
CivChessAI.prototype.isAdversaryEqual = function() {
    if (this.targetedAdversary === null) return false;

    const relStrength = this.engine.getRelativeStrength(this.playerId, this.targetedAdversary);
    if (!relStrength) return false;

    // Consider "equal" if within threshold
    return relStrength.ratio >= PERFORMANCE_THRESHOLDS.STRENGTH_PARITY &&
           relStrength.ratio <= (1 / PERFORMANCE_THRESHOLDS.STRENGTH_PARITY);
};

// ========================================
// WARSCORE TRACKING
// ========================================

/**
 * Update warscore tracking for current wars
 */
CivChessAI.prototype.updateWarscores = function() {
    const enemies = this.getEnemies();
    const currentTurn = this.engine.turnNumber;
    const wasInWar = this.isInAnyWar;
    this.isInAnyWar = enemies.length > 0;

    // Track initial military when first war starts after peace
    if (this.isInAnyWar && !wasInWar) {
        // Just entered war - record initial military count
        this.initialWarMilitary = this.gameState.ownPieces.warriors.length;
        console.log(`[AI P${this.playerId + 1}] War started. Initial military: ${this.initialWarMilitary}`);
    } else if (!this.isInAnyWar && wasInWar) {
        // All wars ended - reset initial military for next war period
        this.initialWarMilitary = null;
        console.log(`[AI P${this.playerId + 1}] All wars ended. Resetting military tracking.`);
    }

    for (const enemyId of enemies) {
        if (!this.warscores.has(enemyId)) {
            // Initialize warscore for new war
            this.warscores.set(enemyId, {
                ours: 0,
                theirs: 0,
                lastChangeTurn: currentTurn,
                startTurn: currentTurn
            });
            this.warLosses.set(enemyId, { citiesLost: 0, unitsLost: 0 });
            this.warGains.set(enemyId, { citiesTaken: 0, unitsKilled: 0 });
        }
    }

    // Clean up warscores for players we're no longer at war with
    for (const [enemyId, _] of this.warscores) {
        if (!enemies.includes(enemyId)) {
            this.warscores.delete(enemyId);
            this.warLosses.delete(enemyId);
            this.warGains.delete(enemyId);
        }
    }
};

/**
 * Record a warscore event (called when combat happens)
 */
CivChessAI.prototype.recordWarscoreEvent = function(enemyId, event) {
    const warscore = this.warscores.get(enemyId);
    if (!warscore) return;

    const currentTurn = this.engine.turnNumber;
    const gains = this.warGains.get(enemyId);
    const losses = this.warLosses.get(enemyId);

    switch (event.type) {
        case 'city_captured':
            warscore.ours += 5;
            gains.citiesTaken++;
            warscore.lastChangeTurn = currentTurn;
            break;
        case 'city_lost':
            warscore.theirs += 5;
            losses.citiesLost++;
            warscore.lastChangeTurn = currentTurn;
            break;
        case 'unit_killed':
            warscore.ours += 1;
            gains.unitsKilled++;
            warscore.lastChangeTurn = currentTurn;
            break;
        case 'unit_lost':
            warscore.theirs += 1;
            losses.unitsLost++;
            warscore.lastChangeTurn = currentTurn;
            break;
    }
};

/**
 * Check if we've suffered pyrrhic losses (lost >= 50% of military since war started)
 * Uses initial military count from when first war began after peace
 */
CivChessAI.prototype.isPyrrhicWar = function() {
    if (this.initialWarMilitary === null || this.initialWarMilitary === 0) {
        return false;
    }

    const currentMilitary = this.gameState.ownPieces.warriors.length;
    const militaryLossRatio = 1 - (currentMilitary / this.initialWarMilitary);

    if (militaryLossRatio >= WARSCORE_THRESHOLDS.PYRRHIC_MILITARY_LOSS) {
        console.log(`[AI P${this.playerId + 1}] Pyrrhic war detected! Lost ${(militaryLossRatio * 100).toFixed(0)}% of military (${this.initialWarMilitary} -> ${currentMilitary})`);
        return true;
    }

    return false;
};

/**
 * Check if we should consider peace based on warscore analysis
 */
CivChessAI.prototype.shouldConsiderPeace = function(enemyId) {
    // Hard AI: refuse peace while positioned to capture a damaged enemy city
    if (this.difficulty === AI_DIFFICULTY.HARD && this.isEnemyRipeForCapture(enemyId)) {
        return false;
    }

    const warscore = this.warscores.get(enemyId);
    if (!warscore) return false;

    const currentTurn = this.engine.turnNumber;

    // Condition 1: Enemy has high warscore ratio against us
    const warscoreRatio = warscore.theirs > 0 ? warscore.theirs / Math.max(warscore.ours, 1) : 0;
    if (warscoreRatio >= WARSCORE_THRESHOLDS.HIGH_ENEMY_RATIO) {
        console.log(`[AI P${this.playerId + 1}] Considering peace with P${enemyId + 1}: high enemy warscore ratio (${warscoreRatio.toFixed(2)})`);
        return true;
    }

    // Condition 2: War is stagnant (no significant changes)
    const turnsSinceChange = currentTurn - warscore.lastChangeTurn;
    if (turnsSinceChange >= WARSCORE_THRESHOLDS.STAGNATION_TURNS) {
        const totalChange = warscore.ours + warscore.theirs;
        if (totalChange < WARSCORE_THRESHOLDS.STAGNATION_DELTA) {
            console.log(`[AI P${this.playerId + 1}] Considering peace with P${enemyId + 1}: stagnant war`);
            return true;
        }
    }

    // Condition 3: Pyrrhic war (lost >= 50% of military since war started)
    // This applies to ALL enemies when triggered
    if (this.isPyrrhicWar()) {
        return true;
    }

    // War is locked-on - no peace
    return false;
};
