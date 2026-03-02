// ============================================
// GAME ENGINE - Production Module
// ============================================
// City production management: setting, advancing, and completing production.

GameEngine.prototype.setProduction = function(city, productionType) {
    if (city.type !== PIECE_TYPES.CITY) {
        this.log('PRODUCTION_DENIED', { reason: 'Not a city' });
        return false;
    }

    if (city.ownerId !== this.currentPlayerIndex) {
        this.log('PRODUCTION_DENIED', { reason: 'Not your city' });
        return false;
    }

    if (!PRODUCTION_TYPES[productionType]) {
        this.log('PRODUCTION_DENIED', { reason: 'Invalid production type', type: productionType });
        return false;
    }

    if (productionType === 'REPAIR' && city.hp >= city.maxHp) {
        this.log('PRODUCTION_DENIED', { reason: 'City already at full HP', city: city.id });
        return false;
    }

    if (productionType === 'HEAL_WARRIORS' && !this.hasWoundedAdjacentWarrior(city)) {
        this.log('PRODUCTION_DENIED', { reason: 'No wounded adjacent warriors', city: city.id });
        return false;
    }

    city.production = productionType;
    city.productionProgress = 0;
    city.productionPaused = false;
    this.log('PRODUCTION_SET', { city: city.id, production: productionType });

    // Capture history snapshot for production set
    this.history.captureSnapshot(this, 'PRODUCTION_SET', {
        city: city.id,
        production: productionType,
        owner: city.ownerId
    });

    return true;
};

/**
 * Advance production progress for a city (called at end of turn)
 * Does NOT complete production - that happens at start of next turn
 */
GameEngine.prototype.advanceProduction = function(city) {
    if (!city.production || city.productionPaused) {
        return;
    }

    city.productionProgress++;
};

/**
 * Check if production is ready and complete it (called at start of turn)
 */
GameEngine.prototype.checkAndCompleteProduction = function(city) {
    if (!city.production) {
        return;
    }

    const prodType = PRODUCTION_TYPES[city.production];

    if (city.productionProgress >= prodType.turns) {
        this.completeProduction(city);
    }
};

// Legacy wrapper for backwards compatibility
GameEngine.prototype.processProduction = function(city) {
    this.advanceProduction(city);
};

GameEngine.prototype.completeProduction = function(city) {
    const production = city.production;
    city.productionPaused = false;

    switch (production) {
        case 'DIPLOMACY':
            this.expandTerritoryWithConquest(city.ownerId, city);
            break;
        case 'SCIENCE':
            this.players[city.ownerId].techScore++;
            this.applyTechBonus(city.ownerId);
            this.log('TECH_COMPLETE', { player: city.ownerId, newScore: this.players[city.ownerId].techScore });

            // Capture history snapshot for tech advancement
            this.history.captureSnapshot(this, 'TECH_COMPLETE', {
                player: city.ownerId,
                newScore: this.players[city.ownerId].techScore
            });
            break;
        case 'WARRIOR':
            this.spawnUnit(city, PIECE_TYPES.WARRIOR);
            break;
        case 'SETTLER':
            this.spawnUnit(city, PIECE_TYPES.SETTLER);
            break;
        case 'REPAIR':
            if (city.hp < city.maxHp) {
                city.hp++;
            }
            break;
        case 'HEAL_WARRIORS':
            this.healAdjacentWarriors(city);
            break;
    }

    // If spawn was blocked, keep production at max progress and wait for retry
    if (city.productionPaused) {
        return;
    }

    this.log('PRODUCTION_COMPLETE', { city: city.id, production: production });

    // Handle repeat production
    if (city.repeatProduction) {
        // Don't repeat repair if at full health, or heal if no wounded adjacent warriors
        if (production === 'HEAL_WARRIORS' && !this.hasWoundedAdjacentWarrior(city)) {
            city.production = null;
            city.productionProgress = 0;
        } else if (production === 'REPAIR' && city.hp >= city.maxHp) {
            city.production = null;
            city.productionProgress = 0;
        } else {
            city.productionProgress = 0;
            // Keep production the same - it will continue next turn
        }
    } else {
        city.production = null;
        city.productionProgress = 0;
    }
};

GameEngine.prototype.spawnUnit = function(city, unitType) {
    const spawnTile = this.findAdjacentEmptyTile(city.row, city.col, city.ownerId);

    if (spawnTile) {
        const unit = this.createPiece(unitType, city.ownerId, spawnTile.row, spawnTile.col);
        this.pieces.push(unit);
        this.board[spawnTile.row][spawnTile.col] = unit;

        // Warriors flip enemy tile ownership when spawning
        if (unitType === PIECE_TYPES.WARRIOR) {
            const tileOwner = this.tileOwnership[spawnTile.row][spawnTile.col];
            if (tileOwner !== null && tileOwner !== city.ownerId) {
                this.tileOwnership[spawnTile.row][spawnTile.col] = city.ownerId;
            }
        }

        this.log('UNIT_SPAWNED', { type: unitType, location: spawnTile });

        // Capture history snapshot for unit spawned
        this.history.captureSnapshot(this, 'UNIT_SPAWNED', {
            type: unitType,
            location: spawnTile,
            owner: city.ownerId
        });
    } else {
        // No valid tile - pause production, will retry next turn
        city.productionPaused = true;
        this.log('SPAWN_BLOCKED', { city: city.id });
    }
};

GameEngine.prototype.hasWoundedAdjacentWarrior = function(city) {
    return this.pieces.some(p =>
        p.type === PIECE_TYPES.WARRIOR &&
        p.ownerId === city.ownerId &&
        p.hp < p.maxHp &&
        Math.abs(p.row - city.row) <= 1 &&
        Math.abs(p.col - city.col) <= 1
    );
};

GameEngine.prototype.healAdjacentWarriors = function(city) {
    this.pieces.forEach(piece => {
        if (piece.type === PIECE_TYPES.WARRIOR &&
            piece.ownerId === city.ownerId &&
            piece.hp < piece.maxHp &&
            !piece.hasMoved &&
            Math.abs(piece.row - city.row) <= 1 &&
            Math.abs(piece.col - city.col) <= 1) {
            piece.hp = Math.min(piece.hp + 1, piece.maxHp);
            this.log('WARRIOR_HEALED', { pieceId: piece.id, hp: piece.hp, maxHp: piece.maxHp });
        }
    });
};
