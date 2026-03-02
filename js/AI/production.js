// ============================================
// PRODUCTION HANDLING
// ============================================

/**
 * Handle production decisions for all cities
 */
CivChessAI.prototype.handleProduction = function() {
    const actions = [];
    const cities = this.gameState.ownPieces.cities;
    const atWar = this.isAtWar();

    for (const city of cities) {
        const engineCity = this.engine.pieces.find(p => p.id === city.id);
        if (!engineCity) continue;

        // Track and handle blocked (paused) production
        if (engineCity.productionPaused) {
            const blockedTurns = (this.blockedProductionTurns.get(city.id) || 0) + 1;
            this.blockedProductionTurns.set(city.id, blockedTurns);

            if (blockedTurns >= 3) {
                // Switch to diplomacy or science instead of staying blocked
                const scienceCities = this.getCitiesProducing('SCIENCE').length;
                const switchTo = scienceCities === 0 ? 'SCIENCE' : 'DIPLOMACY';
                if (this.engine.setProduction(engineCity, switchTo)) {
                    actions.push({
                        type: AI_ACTION_TYPE.SET_PRODUCTION,
                        city: city.id,
                        production: switchTo
                    });
                    this.blockedProductionTurns.delete(city.id);
                }
                continue;
            }
        } else {
            // Reset counter when not blocked
            this.blockedProductionTurns.delete(city.id);
        }

        // Only set production if city has none or just completed something
        if (engineCity.production !== null && engineCity.productionProgress > 0) {
            continue; // Already producing something
        }

        const production = this.decideProduction(city, atWar);

        if (production && this.maybeError()) {
            // On error, pick random production
            const options = ['WARRIOR', 'DIPLOMACY', 'SCIENCE', 'SETTLER'];
            const randomProd = options[Math.floor(Math.random() * options.length)];
            if (this.engine.setProduction(engineCity, randomProd)) {
                actions.push({
                    type: AI_ACTION_TYPE.SET_PRODUCTION,
                    city: city.id,
                    production: randomProd
                });
            }
        } else if (production) {
            if (this.engine.setProduction(engineCity, production)) {
                actions.push({
                    type: AI_ACTION_TYPE.SET_PRODUCTION,
                    city: city.id,
                    production: production
                });
            }
        }
    }

    return actions;
};

/**
 * Decide what a city should produce
 */
CivChessAI.prototype.decideProduction = function(city, atWar) {
    const warriors = this.gameState.ownPieces.warriors.length;
    const cities = this.gameState.ownPieces.cities.length;
    const settlers = this.gameState.ownPieces.settlers.length;

    // Check if city needs repair
    if (city.hp < city.maxHp * 0.5) {
        return 'REPAIR';
    }

    // Hard AI 1v1: specialized strategy overrides the generic logic
    if (this.difficulty === AI_DIFFICULTY.HARD && this.isOneVsOne()) {
        return this.decideProductionHardOneVsOne(city, atWar);
    }

    if (atWar) {
        // War production
        // Keep one city on science if we have 3+ cities
        if (cities >= 3 && this.getCitiesProducing('SCIENCE').length === 0) {
            return 'SCIENCE';
        }
        return 'WARRIOR';
    }

    // Peacetime production for expansionist
    // Check for valid city spots
    const validCitySpots = this.findValidCitySpots();

    // Need settlers for valid spots (one settler per spot)
    if (validCitySpots.length > settlers && settlers < 2) {
        return 'SETTLER';
    }

    // Check if preparing for war - build up military
    if (this.hasGoal(AI_GOAL_TYPE.ATTACK_BUILDUP)) {
        if (warriors < cities * 4) {
            return 'WARRIOR';
        }
    }

    // Defense Industry: 4 warriors per city
    if (warriors < cities * 4) {
        return 'WARRIOR';
    }

    // DARPA goal
    if (this.hasGoal(AI_GOAL_TYPE.DARPA)) {
        return 'SCIENCE';
    }

    // Expansion through diplomacy
    return 'DIPLOMACY';
};

/**
 * Get cities currently producing a specific type
 */
CivChessAI.prototype.getCitiesProducing = function(productionType) {
    return this.gameState.ownPieces.cities.filter(c => {
        const engineCity = this.engine.pieces.find(p => p.id === c.id);
        return engineCity && engineCity.production === productionType;
    });
};

/**
 * Find valid city spots on our territory
 */
CivChessAI.prototype.findValidCitySpots = function() {
    // Return cached result if available
    if (this._turnCache.validCitySpots !== null) {
        return this._turnCache.validCitySpots;
    }

    const spots = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (this.expansionHeatmap[r][c] > 0 &&
                this.engine.tileOwnership[r][c] === this.playerId) {
                spots.push({ row: r, col: c, value: this.expansionHeatmap[r][c] });
            }
        }
    }
    const sorted = spots.sort((a, b) => b.value - a.value);
    this._turnCache.validCitySpots = sorted;
    return sorted;
};

// ============================================
// HARD AI 1v1 PRODUCTION STRATEGY
// ============================================

/**
 * Returns true if only one other player still has cities (1v1 by setup or elimination).
 */
CivChessAI.prototype.isOneVsOne = function() {
    let activeEnemies = 0;
    for (const pieces of Object.values(this.gameState.enemyPieces)) {
        if (pieces.cities.length > 0) activeEnemies++;
    }
    return activeEnemies === 1;
};

/**
 * Returns the ID of the sole remaining adversary, or null.
 */
CivChessAI.prototype.getSoleAdversary = function() {
    for (const [id, pieces] of Object.entries(this.gameState.enemyPieces)) {
        if (pieces.cities.length > 0) return parseInt(id);
    }
    return null;
};

/**
 * Returns true when all board tiles are claimed AND our territory is adjacent to the
 * enemy's — meaning there is no free space left to expand into peacefully.
 * Single board scan: bails out immediately on any unclaimed tile.
 */
CivChessAI.prototype.isBordersLocked = function(enemyId) {
    let bordersTouching = false;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const owner = this.engine.tileOwnership[r][c];

            // Any unclaimed tile means borders aren't locked
            if (owner === null) return false;

            // While scanning, also detect whether our territory touches the enemy's
            if (!bordersTouching && owner === this.playerId) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const ar = r + dr, ac = c + dc;
                        if (ar < 0 || ar >= BOARD_SIZE || ac < 0 || ac >= BOARD_SIZE) continue;
                        if (this.engine.tileOwnership[ar][ac] === enemyId) {
                            bordersTouching = true;
                        }
                    }
                }
            }
        }
    }

    return bordersTouching;
};

/**
 * Returns true if both sides have a similar number of warriors (within 25%).
 */
CivChessAI.prototype.isArmyRoughlyEqual = function(enemyId) {
    const mine = this.gameState.ownPieces.warriors.length;
    const enemyPieces = this.gameState.enemyPieces[enemyId];
    const theirs = enemyPieces ? enemyPieces.warriors.length : 0;
    if (mine === 0 && theirs === 0) return true;
    const larger = Math.max(mine, theirs);
    return larger === 0 || Math.min(mine, theirs) / larger >= 0.75;
};

/**
 * Returns true if at least one tile adjacent to the city has no piece on it
 * (i.e. a warrior could spawn there).
 */
CivChessAI.prototype.cityHasAdjacentFreeSpace = function(city) {
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const ar = city.row + dr, ac = city.col + dc;
            if (ar < 0 || ar >= BOARD_SIZE || ac < 0 || ac >= BOARD_SIZE) continue;
            if (!this.engine.board[ar][ac]) return true;
        }
    }
    return false;
};

/**
 * Pick a weighted-random production type given unnormalised weights.
 */
CivChessAI.prototype._weightedPick = function(options) {
    const total = options.reduce((s, o) => s + o.w, 0);
    let roll = Math.random() * total;
    for (const o of options) {
        roll -= o.w;
        if (roll <= 0) return o.v;
    }
    return options[options.length - 1].v;
};

/**
 * Production strategy for hard AI in a 1v1 game.
 *
 * Uses weighted-random choices so the AI isn't perfectly predictable:
 *
 * At war: both SCIENCE and WARRIOR are valid. Weights shift based on the tech gap —
 *   behind in tech favours SCIENCE but warriors remain a real option, and vice versa.
 *
 * At peace, borders locked (no free tiles, territories touching), armies roughly equal:
 *   - Strong bias toward DIPLOMACY (steals border tiles)
 *   - 10% chance per city to produce WARRIOR if a warrior could spawn there
 *
 * At peace, open map: weighted across SCIENCE / WARRIOR / DIPLOMACY based on
 *   relative tech and warrior counts. Being behind in tech or warriors raises
 *   those weights but never locks out the other options.
 */
CivChessAI.prototype.decideProductionHardOneVsOne = function(city, atWar) {
    const enemyId = this.getSoleAdversary();
    if (enemyId === null) return 'WARRIOR';

    const enemyPieces = this.gameState.enemyPieces[enemyId];
    const myWarriors = this.gameState.ownPieces.warriors.length;
    const theirWarriors = enemyPieces ? enemyPieces.warriors.length : 0;
    const enemyStrength = this.engine.getPlayerStrength(enemyId);
    const theirTech = enemyStrength ? enemyStrength.breakdown.techLevel : 0;
    const myTech = this.gameState.techLevel;

    const techDelta = myTech - theirTech;       // positive = we're ahead
    const warriorDelta = myWarriors - theirWarriors; // positive = we're ahead

    if (atWar) {
        // Behind in tech: favour SCIENCE but warriors still meaningful
        // Equal tech: slight warrior lean (need to fight)
        // Ahead in tech: mostly warriors
        let sciW = 1 + Math.max(0, -techDelta) * 2; // +2 per tech level behind
        let warW = 1 + Math.max(0,  techDelta) * 2; // +2 per tech level ahead
        // Always keep a floor so neither is completely excluded
        sciW = Math.max(sciW, 1);
        warW = Math.max(warW, 1);
        return this._weightedPick([{ v: 'SCIENCE', w: sciW }, { v: 'WARRIOR', w: warW }]);
    }

    // Peacetime — border-locked stalemate: steal tiles via diplomacy
    if (this.isBordersLocked(enemyId) && this.isArmyRoughlyEqual(enemyId)) {
        if (this.cityHasAdjacentFreeSpace(city) && Math.random() < 0.10) {
            return 'WARRIOR';
        }
        return 'DIPLOMACY';
    }

    // Open map: weighted across SCIENCE / WARRIOR / DIPLOMACY
    let sciW = 1;
    let warW = 1;
    let dipW = 1;

    // Tech gap contribution
    if (techDelta < 0) {
        sciW += Math.min(-techDelta * 2, 4); // Up to +4 for being behind
    } else if (techDelta > 0) {
        dipW += 1;
        warW += 1;
    } else {
        // Equal tech — both science and warriors are valid paths forward
        sciW += 1;
        warW += 1;
    }

    // Warrior gap contribution
    if (warriorDelta < 0) {
        warW += Math.min(-warriorDelta * 1.5, 4); // Up to +4 for being behind
    } else if (warriorDelta > 0) {
        dipW += 1;
    }

    return this._weightedPick([
        { v: 'SCIENCE',   w: sciW },
        { v: 'WARRIOR',   w: warW },
        { v: 'DIPLOMACY', w: dipW }
    ]);
};
