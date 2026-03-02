// ============================================
// ACHIEVEMENT MANAGER - Integration Module
// ============================================
// Wires the achievement system into GameScene and GameEngine.
// Hooks into existing game events to fire achievement checks.

/**
 * Attach to a game scene. Call this from GameScene.create() after engine setup.
 * @param {GameScene} gameScene - The active game scene
 */
AchievementManager.prototype.attachToGame = function(gameScene) {
    this.gameScene = gameScene;
    this.engine = gameScene.engine;

    // Restore achievement session stats from a loaded save if available
    if (this.engine._pendingAchievementStats) {
        this.sessionStats = this.engine._pendingAchievementStats;
        delete this.engine._pendingAchievementStats;
    } else {
        this.resetSession();
    }
};

/**
 * Detach from the current game scene. Call from GameScene.destroy().
 */
AchievementManager.prototype.detachFromGame = function() {
    this._clearNotifications();
    this.gameScene = null;
    this.engine = null;
};

// ------------------------------------------
// GameScene Integration Hooks
// ------------------------------------------

// Store original methods to chain into

var _origResolveCombat = GameEngine.prototype.resolveCombat;

/**
 * Wrap GameEngine.resolveCombat to notify the achievement system.
 */
GameEngine.prototype.resolveCombat = function(attacker, defender) {
    var defenderType = defender.type;  // Capture before combat may remove piece
    var defenderOwnerId = defender.ownerId;  // Capture before city flip changes owner
    var result = _origResolveCombat.call(this, attacker, defender);

    // Annotate result with defender info for achievement checks
    result.defenderType = defenderType;
    result.defenderOwnerId = defenderOwnerId;

    // Notify achievement system
    if (typeof achievementManager !== 'undefined' && achievementManager.engine === this) {
        achievementManager.onCombat(result, this);

        // Check elimination
        if (result.elimination && result.elimination.eliminated) {
            achievementManager.onElimination(result.elimination, this);
        }
    }

    return result;
};

var _origCheckVictory = GameEngine.prototype.checkVictory;

/**
 * Wrap GameEngine.checkVictory to notify on victory.
 */
GameEngine.prototype.checkVictory = function() {
    var wasDone = this.gameOver;
    _origCheckVictory.call(this);

    // If game just ended, notify
    if (!wasDone && this.gameOver && typeof achievementManager !== 'undefined' && achievementManager.engine === this) {
        achievementManager.onVictory({ winner: this.winner }, this);
    }
};

var _origEndTurn = GameEngine.prototype.endTurn;

/**
 * Wrap GameEngine.endTurn to notify on turn end.
 */
GameEngine.prototype.endTurn = function() {
    _origEndTurn.call(this);

    if (typeof achievementManager !== 'undefined' && achievementManager.engine === this) {
        achievementManager.onTurnEnd({
            turnNumber: this.turnNumber,
            roundNumber: this.roundNumber,
            currentPlayerIndex: this.currentPlayerIndex
        }, this);
    }
};

var _origCompleteProduction = GameEngine.prototype.completeProduction;

/**
 * Wrap completeProduction to notify achievement system when production finishes.
 */
GameEngine.prototype.completeProduction = function(city) {
    var productionType = city.production;

    _origCompleteProduction.call(this, city);

    // If production was not paused (i.e. it actually completed), notify
    if (productionType && !city.productionPaused &&
        typeof achievementManager !== 'undefined' && achievementManager.engine === this) {
        achievementManager.onProductionComplete({
            city: city,
            type: productionType
        }, this);
    }
};

// ------------------------------------------
// Diplomacy Hooks
// ------------------------------------------

var _origDeclareWar = GameEngine.prototype.declareWar;

GameEngine.prototype.declareWar = function(playerId, targetId) {
    var result = _origDeclareWar.call(this, playerId, targetId);

    if (result && typeof achievementManager !== 'undefined' && achievementManager.engine === this) {
        achievementManager.onDiplomacy({
            fromPlayer: playerId,
            toPlayer: targetId,
            type: 'war'
        }, this);
    }

    return result;
};

var _origAcceptPeace = GameEngine.prototype.acceptPeace;

GameEngine.prototype.acceptPeace = function(playerId, targetId) {
    var result = _origAcceptPeace.call(this, playerId, targetId);

    if (result && typeof achievementManager !== 'undefined' && achievementManager.engine === this) {
        achievementManager.onDiplomacy({
            fromPlayer: playerId,
            toPlayer: targetId,
            type: 'peace'
        }, this);
    }

    return result;
};

// ------------------------------------------
// Settler / City Founding Hook
// ------------------------------------------

var _origSettlerBuildCity = GameEngine.prototype.settlerBuildCity;

GameEngine.prototype.settlerBuildCity = function(settler) {
    var settlerRow = settler.row;
    var settlerCol = settler.col;
    var settlerOwner = settler.ownerId;
    var result = _origSettlerBuildCity.call(this, settler);

    // If a city was successfully founded, notify
    if (result && result.success && typeof achievementManager !== 'undefined' && achievementManager.engine === this) {
        achievementManager.onCityFounded({
            city: result.city,
            row: settlerRow,
            col: settlerCol,
            ownerId: settlerOwner
        }, this);
    }

    return result;
};

// ------------------------------------------
// Human Defeat Hook (extends GameScene)
// ------------------------------------------

var _origCheckHumanDefeat = GameScene.prototype.checkHumanDefeat;

GameScene.prototype.checkHumanDefeat = function(eliminationResult) {
    // Notify achievement system before showing defeat screen
    if (eliminationResult && eliminationResult.eliminated &&
        typeof achievementManager !== 'undefined' && achievementManager.engine === this.engine) {
        var player = this.engine.players[eliminationResult.playerId];
        if (player && !player.isAI) {
            achievementManager.onDefeat({ playerId: eliminationResult.playerId }, this.engine);
        }
    }

    _origCheckHumanDefeat.call(this, eliminationResult);
};

// ------------------------------------------
// Scene Lifecycle Hooks
// ------------------------------------------

var _origGameSceneCreate = GameScene.prototype.create;

/**
 * Extend GameScene.create to attach the achievement system.
 */
GameScene.prototype.create = async function() {
    await _origGameSceneCreate.call(this);

    // Attach achievement manager to this game
    if (typeof achievementManager !== 'undefined') {
        achievementManager.attachToGame(this);
    }
};

var _origGameSceneDestroy = GameScene.prototype.destroy;

/**
 * Extend GameScene.destroy to detach the achievement system.
 */
if (typeof GameScene.prototype.destroy === 'function') {
    GameScene.prototype.destroy = function() {
        if (typeof achievementManager !== 'undefined') {
            achievementManager.detachFromGame();
        }
        _origGameSceneDestroy.call(this);
    };
}

// ------------------------------------------
// Completionist check — fires after every unlock
// ------------------------------------------

var _origUnlock = AchievementManager.prototype.unlock;

AchievementManager.prototype.unlock = function(id, details) {
    _origUnlock.call(this, id, details);

    // After unlocking anything (except completionist itself), check if all
    // other achievements are now done. Dynamic — works as new ones are added.
    if (id === 'completionist' || !this.isUnlocked(id)) return;

    var defs = this.getAllDefs();
    for (var i = 0; i < defs.length; i++) {
        if (defs[i].id !== 'completionist' && !this.isUnlocked(defs[i].id)) return;
    }

    this.unlock('completionist');
};

// ------------------------------------------
// Startup: Load saved achievements
// ------------------------------------------

(function() {
    if (typeof achievementManager !== 'undefined') {
        achievementManager.loadUnlocked().then(function() {
            console.log('[Achievements] Loaded ' + achievementManager.getUnlockedCount() + ' unlocked achievements');
        });
    }
})();
