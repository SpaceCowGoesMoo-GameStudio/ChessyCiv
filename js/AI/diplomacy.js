// ============================================
// DIPLOMACY HANDLING
// ============================================

/**
 * Handle diplomatic actions for this turn
 */
CivChessAI.prototype.handleDiplomacy = function() {
    const actions = [];

    if (this.isAtWar()) {
        // Handle war diplomacy (locked-on unless conditions met)
        actions.push(...this.handleWarDiplomacy());
    } else {
        // Check if we should declare war based on performance
        actions.push(...this.considerDeclaringWar());
    }

    return actions;
};

/**
 * Handle diplomacy while at war
 */
CivChessAI.prototype.handleWarDiplomacy = function() {
    const actions = [];
    const enemies = this.getEnemies();

    // Check for pyrrhic war first - if so, propose peace to ALL combatants
    if (this.isPyrrhicWar()) {
        for (const enemyId of enemies) {
            // Skip if they already proposed peace - handlePeaceProposals will accept it
            const theirRelation = this.engine.players[enemyId].relations[this.playerId];
            if (theirRelation === 'peace_proposed') continue;

            if (this.engine.proposePeace(this.playerId, enemyId)) {
                actions.push({
                    type: AI_ACTION_TYPE.PROPOSE_PEACE,
                    target: enemyId
                });
            }
        }
        return actions;
    }

    // Otherwise, check each enemy individually for peace conditions
    for (const enemyId of enemies) {
        const myRelation = this.engine.players[this.playerId].relations[enemyId];
        const theirRelation = this.engine.players[enemyId].relations[this.playerId];

        // Only consider peace if warscore conditions are met (high enemy ratio or stagnant)
        if (this.shouldConsiderPeace(enemyId)) {
            // Skip if they already proposed peace - handlePeaceProposals will accept it
            if (theirRelation === 'peace_proposed') continue;

            if (this.engine.proposePeace(this.playerId, enemyId)) {
                actions.push({
                    type: AI_ACTION_TYPE.PROPOSE_PEACE,
                    target: enemyId
                });
            }
        } else if (myRelation === 'peace_proposed') {
            // Conditions changed - rescind our peace proposal
            if (this.engine.rescindPeace(this.playerId, enemyId)) {
                actions.push({
                    type: AI_ACTION_TYPE.RESCIND_PEACE,
                    target: enemyId
                });
            }
        }
        // Otherwise, war is locked-on - no peace proposals
    }

    return actions;
};

/**
 * Consider declaring war during peacetime
 */
CivChessAI.prototype.considerDeclaringWar = function() {
    const actions = [];

    // Hard AI: Detect and respond to territory being stolen via Diplomacy production
    if (this.difficulty === AI_DIFFICULTY.HARD) {
        const territoryWar = this.considerTerritoryTheftWar();
        if (territoryWar) {
            actions.push(territoryWar);
            return actions;
        }
    }

    // First, check for opportunistic war against significantly weaker enemies (30% chance)
    const weakEnemyWar = this.considerOpportunisticWar();
    if (weakEnemyWar) {
        actions.push(weakEnemyWar);
        return actions;
    }

    // Check if we should prepare for war due to stagnant progress
    if (!this.shouldPrepareForWar()) return actions;
    if (this.targetedAdversary === null) return actions;

    // Only 8% chance per turn to actually declare war when stagnant vs equal foe
    if (Math.random() >= PERFORMANCE_THRESHOLDS.WAR_DECLARATION_CHANCE) {
        return actions;
    }

    // Check if we're ready to attack
    const relStrength = this.engine.getRelativeStrength(this.playerId, this.targetedAdversary);
    if (!relStrength) return actions;

    // Calculate required force ratio considering tech
    const targetStrength = this.engine.getPlayerStrength(this.targetedAdversary);
    const techDiff = targetStrength ? targetStrength.breakdown.techLevel - this.gameState.techLevel : 0;

    // Need at least parity, adjusted for tech disadvantage
    const requiredRatio = 1.0 + Math.max(0, techDiff * 0.2);

    if (relStrength.militaryRatio >= requiredRatio) {
        // We're ready to attack
        if (this.engine.declareWar(this.playerId, this.targetedAdversary)) {
            console.log(`[AI P${this.playerId + 1}] Declaring war on P${this.targetedAdversary + 1} (military ratio: ${relStrength.militaryRatio.toFixed(2)})`);
            actions.push({
                type: AI_ACTION_TYPE.DECLARE_WAR,
                target: this.targetedAdversary
            });
        }
    }

    return actions;
};

/**
 * Check for opportunistic war against significantly weaker enemies.
 * 30% chance per turn to declare war if an enemy is significantly weaker.
 */
CivChessAI.prototype.considerOpportunisticWar = function() {
    // 30% chance to even consider this
    if (Math.random() >= PERFORMANCE_THRESHOLDS.WEAK_ENEMY_WAR_CHANCE) {
        return null;
    }

    // Find significantly weaker enemies (not already at war with)
    for (const [enemyId, pieces] of Object.entries(this.gameState.enemyPieces)) {
        const enemyIdNum = parseInt(enemyId);
        const relation = this.gameState.relations[enemyIdNum];

        // Skip if already at war (including pending peace proposals)
        if (relation && (relation.status === 'war' || relation.status === 'peace_proposed' ||
            relation.theirStatus === 'war' || relation.theirStatus === 'peace_proposed')) continue;

        const enemyStrength = this.engine.getPlayerStrength(enemyIdNum);
        if (!enemyStrength || !this.myStrength) continue;

        // Calculate relative strength considering military (unit count) and tech
        const myMilitary = this.myStrength.breakdown.warriors;
        const theirMilitary = enemyStrength.breakdown.warriors;
        const myTech = this.gameState.techLevel;
        const theirTech = enemyStrength.breakdown.techLevel;

        // Effective military = warriors * (1 + tech * 0.5)
        const myEffectiveMilitary = myMilitary * (1 + myTech * 0.5);
        const theirEffectiveMilitary = theirMilitary * (1 + theirTech * 0.5);

        // Check if enemy is significantly weaker (their strength <= 50% of ours)
        if (theirEffectiveMilitary <= myEffectiveMilitary * PERFORMANCE_THRESHOLDS.WEAK_ENEMY_THRESHOLD) {
            // Found a weak target!
            if (this.engine.declareWar(this.playerId, enemyIdNum)) {
                console.log(`[AI P${this.playerId + 1}] Opportunistic war on weak P${enemyIdNum + 1} (their effective military: ${theirEffectiveMilitary.toFixed(1)}, ours: ${myEffectiveMilitary.toFixed(1)})`);
                return {
                    type: AI_ACTION_TYPE.DECLARE_WAR,
                    target: enemyIdNum
                };
            }
        }
    }

    return null;
};

/**
 * Handle incoming peace proposals
 */
CivChessAI.prototype.handlePeaceProposals = function() {
    const actions = [];

    // Check for pyrrhic war - if so, accept ALL peace proposals
    const pyrrhic = this.isPyrrhicWar();

    for (const [id, rel] of Object.entries(this.gameState.relations)) {
        const targetId = parseInt(id);

        if (rel.theirStatus === 'peace_proposed') {
            // Accept peace if pyrrhic, or if warscore conditions suggest we should
            if (pyrrhic || this.shouldConsiderPeace(targetId)) {
                if (this.engine.acceptPeace(this.playerId, targetId)) {
                    actions.push({
                        type: AI_ACTION_TYPE.ACCEPT_PEACE,
                        target: targetId
                    });
                }
            }
            // Otherwise, reject (locked-on to war)
        }
    }

    return actions;
};

/**
 * Check if an enemy player has damaged cities that our warriors are close enough to capture.
 * Used by hard AI to stay at war when victory is within reach.
 */
CivChessAI.prototype.isEnemyRipeForCapture = function(enemyId) {
    const enemyPieces = this.gameState.enemyPieces[enemyId];
    if (!enemyPieces) return false;

    const enemyCities = enemyPieces.cities;
    if (enemyCities.length === 0) return false;

    for (const city of enemyCities) {
        // Sum the damage of all our warriors within 3 tiles of this city
        let nearbyDamage = 0;
        for (const warrior of this.gameState.ownPieces.warriors) {
            if (this.getDistance(warrior, city) <= 3) {
                nearbyDamage += warrior.damage || 1;
            }
        }

        // City is ripe if our nearby warriors can collectively deal enough damage to take it
        if (nearbyDamage >= city.hp) {
            // Don't override peace if we're losing the war badly
            const warscore = this.warscores.get(enemyId);
            if (warscore) {
                const ratio = warscore.theirs > 0 ? warscore.theirs / Math.max(warscore.ours, 1) : 0;
                if (ratio > WARSCORE_THRESHOLDS.HIGH_ENEMY_RATIO) return false;
            }
            return true;
        }
    }

    return false;
};

/**
 * Detect when a peaceful player has taken one of our tiles via Diplomacy production
 * and respond with a war declaration (hard AI only).
 *
 * Snapshots the exact set of tiles we own each turn. Any tile that was ours last turn
 * but is now owned by a player we're at peace with can only have changed hands through
 * expandTerritoryWithConquest (Diplomacy production) — warriors cannot enter our
 * territory during peacetime.
 */
CivChessAI.prototype.considerTerritoryTheftWar = function() {
    // Build the current set of tiles we own
    const ourTiles = new Set();
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (this.engine.tileOwnership[r][c] === this.playerId) {
                ourTiles.add(r * BOARD_SIZE + c);
            }
        }
    }

    // Lazy-init: nothing to compare against on the first call
    if (!this.prevOwnedTiles) {
        this.prevOwnedTiles = ourTiles;
        return null;
    }

    // Find tiles that were ours last turn but are now owned by a peaceful player
    const stolenBy = new Map(); // enemyId -> stolen tile count
    for (const key of this.prevOwnedTiles) {
        const r = (key / BOARD_SIZE) | 0;
        const c = key % BOARD_SIZE;
        const newOwner = this.engine.tileOwnership[r][c];

        if (newOwner === this.playerId || newOwner === null) continue;

        const relation = this.gameState.relations[newOwner];
        if (!relation || relation.status !== 'peace' || relation.theirStatus !== 'peace') continue;

        stolenBy.set(newOwner, (stolenBy.get(newOwner) || 0) + 1);
    }

    let result = null;
    for (const [enemyId, count] of stolenBy) {
        if (Math.random() < 0.85 && this.engine.declareWar(this.playerId, enemyId)) {
            console.log(`[AI P${this.playerId + 1}] Declaring war on P${enemyId + 1}: stole ${count} tile(s) via Diplomacy production`);
            result = { type: AI_ACTION_TYPE.DECLARE_WAR, target: enemyId };
            break;
        }
    }

    this.prevOwnedTiles = ourTiles;
    return result;
};
