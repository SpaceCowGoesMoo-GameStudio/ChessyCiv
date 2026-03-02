// ============================================
// ACHIEVEMENT MANAGER - Checks Module
// ============================================
// Event handlers that inspect game state and unlock achievements.
// Called by the integration module when game events fire.
// Add specific achievement check logic here once achievements are defined.

/**
 * Called after combat resolves.
 * @param {Object} result - Combat result from GameEngine.resolveCombat()
 * @param {Object} engine - The GameEngine instance
 */
AchievementManager.prototype.onCombat = function(result, engine) {
    if (!engine || !result) return;

    var attackerPlayer = engine.players[engine.currentPlayerIndex];
    if (!attackerPlayer) return;

    var humanId = this.getHumanPlayerId();

    // Track city losses — only when AI captured the human's city
    if (result.cityFlipped && attackerPlayer.isAI && humanId >= 0 &&
        result.defenderOwnerId === humanId) {
        this.sessionStats.citiesLost++;
    }

    // The rest only tracks the human's offensive actions
    if (attackerPlayer.isAI) {
        this._runChecks('combat', result, engine);
        return;
    }

    // Track kills (warriors only — settlers and city captures don't count)
    if (result.defenderDestroyed && !result.cityFlipped && result.defenderType === PIECE_TYPES.WARRIOR) {
        this.sessionStats.kills++;
    }

    // Track city captures
    if (result.cityFlipped) {
        this.sessionStats.citiesCaptured++;
    }

    // Run registered checks
    this._runChecks('combat', result, engine);
};

/**
 * Called when a player is eliminated.
 * @param {Object} elimination - Elimination result from GameEngine.checkPlayerElimination()
 * @param {Object} engine - The GameEngine instance
 */
AchievementManager.prototype.onElimination = function(elimination, engine) {
    if (!engine || !elimination || !elimination.eliminated) return;

    var conquerer = engine.players[elimination.conquerer];
    if (!conquerer || conquerer.isAI) return;

    this.sessionStats.playersEliminated++;

    this._runChecks('elimination', elimination, engine);
};

/**
 * Called when a unit or tech production completes.
 * @param {Object} production - { city, type, piece (if unit spawned) }
 * @param {Object} engine - The GameEngine instance
 */
AchievementManager.prototype.onProductionComplete = function(production, engine) {
    if (!engine || !production) return;

    var city = production.city;
    if (!city) return;
    var owner = engine.players[city.ownerId];
    if (!owner || owner.isAI) return;

    if (production.type === 'WARRIOR' || production.type === 'SETTLER') {
        this.sessionStats.unitsProduced++;
    }
    if (production.type === 'SCIENCE') {
        this.sessionStats.techResearched++;
    }

    this._runChecks('production', production, engine);
};

/**
 * Called when a settler founds a new city.
 * @param {Object} data - { settler, city, row, col }
 * @param {Object} engine - The GameEngine instance
 */
AchievementManager.prototype.onCityFounded = function(data, engine) {
    if (!engine || !data) return;

    var city = data.city;
    if (!city) return;
    var owner = engine.players[city.ownerId];
    if (!owner || owner.isAI) return;

    this.sessionStats.citiesFounded++;

    this._runChecks('cityFounded', data, engine);
};

/**
 * Called when diplomacy changes (war declared or peace formed).
 * @param {Object} data - { fromPlayer, toPlayer, type: 'war'|'peace'|'peace_proposed' }
 * @param {Object} engine - The GameEngine instance
 */
AchievementManager.prototype.onDiplomacy = function(data, engine) {
    if (!engine || !data) return;

    var player = engine.players[data.fromPlayer];
    if (!player || player.isAI) return;

    if (data.type === 'war') {
        this.sessionStats.warsDeclared++;
    } else if (data.type === 'peace') {
        this.sessionStats.peacesFormed++;
    }

    this._runChecks('diplomacy', data, engine);
};

/**
 * Called at the end of each turn (after endTurn processes).
 * @param {Object} data - { turnNumber, roundNumber, currentPlayerIndex }
 * @param {Object} engine - The GameEngine instance
 */
AchievementManager.prototype.onTurnEnd = function(data, engine) {
    if (!engine) return;

    this.sessionStats.turnsPlayed++;
    this.sessionStats.roundsPlayed = engine.roundNumber;

    // Count tiles owned by the human player
    var humanId = this.getHumanPlayerId();
    if (humanId >= 0) {
        var tileCount = 0;
        for (var r = 0; r < BOARD_SIZE; r++) {
            for (var c = 0; c < BOARD_SIZE; c++) {
                if (engine.tileOwnership[r][c] === humanId) tileCount++;
            }
        }
        this.sessionStats.tilesOwned = tileCount;
    }

    this._runChecks('turnEnd', data, engine);
};

/**
 * Called when the game ends in victory.
 * @param {Object} data - { winner }
 * @param {Object} engine - The GameEngine instance
 */
AchievementManager.prototype.onVictory = function(data, engine) {
    if (!engine || !data) return;

    var winner = engine.players[data.winner];
    if (!winner || winner.isAI) return;

    this._runChecks('victory', data, engine);
};

/**
 * Called when human player is defeated.
 * @param {Object} data - { playerId }
 * @param {Object} engine - The GameEngine instance
 */
AchievementManager.prototype.onDefeat = function(data, engine) {
    if (!engine || !data) return;

    this._runChecks('defeat', data, engine);
};

// ------------------------------------------
// Check Runner
// ------------------------------------------

/**
 * Register a check function for a specific event type.
 * @param {string} event - Event name (combat, elimination, production, cityFounded, diplomacy, turnEnd, victory, defeat)
 * @param {Function} fn - function(data, engine, manager)
 */
AchievementManager.prototype.addCheck = function(event, fn) {
    this._checks.push({ event: event, fn: fn });
};

/**
 * Run all registered checks for a given event type.
 */
AchievementManager.prototype._runChecks = function(event, data, engine) {
    var checks = this._checks;
    if (!checks) return;
    for (var i = 0; i < checks.length; i++) {
        if (checks[i].event === event) {
            try {
                checks[i].fn(data, engine, this);
            } catch (e) {
                console.warn('[Achievements] Check error:', e);
            }
        }
    }
};
