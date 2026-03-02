// ============================================
// ACHIEVEMENT MANAGER - Base Class
// ============================================
// Core achievement system: registry, state tracking, and event dispatch.
// Extended via prototype pattern in separate files (persistence, checks, display, integration).

class AchievementManager {
    constructor() {
        // Achievement definitions registry: id -> { id, name, description, category, icon, hidden }
        this.registry = {};

        // Unlocked achievements: id -> { unlockedAt, gameId, details }
        this.unlocked = {};

        // Whether persistence has loaded
        this.loaded = false;

        // Reference to the active game scene (set by integration)
        this.gameScene = null;

        // Reference to the active game engine (set by integration)
        this.engine = null;

        // Notification queue for sequential display
        this._notifQueue = [];
        this._activeNotif = null;
        this._batchPending = false;
        // Timestamp (ms) before which notifications should not be displayed,
        // used to wait for piece derez animations to finish before showing toasts.
        this._notifHoldUntil = 0;

        // Registered check functions: { event, fn }
        this._checks = [];

        // Per-game session tracking (reset each game)
        this.sessionStats = {};
    }

    // ------------------------------------------
    // Registry Management
    // ------------------------------------------

    /**
     * Register an achievement definition.
     * @param {Object} def - { id, name, description, category, icon, hidden }
     *   id:          Unique string identifier (e.g. 'first_blood')
     *   name:        Display name shown on unlock
     *   description: How to earn it
     *   category:    Grouping key (e.g. 'combat', 'expansion', 'diplomacy', 'production', 'mastery')
     *   icon:        Emoji or short symbol for display
     *   hidden:      If true, description is masked until unlocked
     */
    register(def) {
        if (!def || !def.id) return;
        this.registry[def.id] = {
            id: def.id,
            name: def.name || def.id,
            description: def.description || '',
            category: def.category || 'general',
            icon: def.icon || '',
            imageIcon: def.imageIcon || null,
            hidden: def.hidden || false,
            skirmishOnly: def.skirmishOnly || false
        };
    }

    /**
     * Register multiple achievement definitions at once.
     * @param {Array} defs - Array of definition objects
     */
    registerAll(defs) {
        if (!Array.isArray(defs)) return;
        for (let i = 0; i < defs.length; i++) {
            this.register(defs[i]);
        }
    }

    /**
     * Get a registered achievement definition by id.
     */
    getDef(id) {
        return this.registry[id] || null;
    }

    /**
     * Get all registered achievement definitions.
     */
    getAllDefs() {
        return Object.values(this.registry);
    }

    /**
     * Get definitions filtered by category.
     */
    getByCategory(category) {
        return Object.values(this.registry).filter(d => d.category === category);
    }

    // ------------------------------------------
    // Human Player Helpers
    // ------------------------------------------

    /**
     * Check if the current game has exactly one human player (not hot seat or AI-only).
     */
    isSingleHumanGame() {
        if (!this.engine || !this.engine.players) return false;
        var humans = 0;
        for (var i = 0; i < this.engine.players.length; i++) {
            if (!this.engine.players[i].isAI) humans++;
        }
        return humans === 1;
    }

    /**
     * Get the player index of the single human player, or -1 if none/multiple.
     */
    getHumanPlayerId() {
        if (!this.engine || !this.engine.players) return -1;
        var humanId = -1;
        var count = 0;
        for (var i = 0; i < this.engine.players.length; i++) {
            if (!this.engine.players[i].isAI) {
                humanId = i;
                count++;
            }
        }
        return count === 1 ? humanId : -1;
    }

    // ------------------------------------------
    // Unlock State
    // ------------------------------------------

    /**
     * Check if an achievement is already unlocked.
     */
    isUnlocked(id) {
        return !!this.unlocked[id];
    }

    /**
     * Unlock an achievement. No-op if already unlocked or not registered.
     * Persists immediately and queues a display notification.
     * @param {string} id - Achievement id
     * @param {Object} [details] - Optional context (e.g. { kills: 5 })
     */
    /**
     * Check if the current game is a single-player skirmish (not scenario or hotseat).
     */
    isSkirmish() {
        if (!this.gameScene) return false;
        // Scenario games have a scenarioIndex set
        if (this.gameScene.scenarioIndex != null) return false;
        return this.isSingleHumanGame();
    }

    unlock(id, details) {
        if (this.isUnlocked(id)) return;
        if (!this.registry[id]) return;

        // Block all achievements outside single-human games (blocks hot seat and AI-only)
        if (!this.isSingleHumanGame()) return;

        // Block skirmish-only achievements outside single-player skirmish
        if (this.registry[id].skirmishOnly && !this.isSkirmish()) return;

        var gameId = null;
        if (this.engine && this.engine.history) {
            gameId = this.engine.history.gameId;
        }

        this.unlocked[id] = {
            unlockedAt: Date.now(),
            gameId: gameId,
            details: details || null
        };

        // Persist to IndexedDB
        this.saveUnlocked();

        // Queue display notification
        this._queueNotification(id);
    }

    /**
     * Get unlock info for an achievement (or null if locked).
     */
    getUnlockInfo(id) {
        return this.unlocked[id] || null;
    }

    /**
     * Get count of unlocked achievements.
     */
    getUnlockedCount() {
        return Object.keys(this.unlocked).length;
    }

    /**
     * Get total registered achievements.
     */
    getTotalCount() {
        return Object.keys(this.registry).length;
    }

    /**
     * Get progress string (e.g. "3 / 12").
     */
    getProgressString() {
        return this.getUnlockedCount() + ' / ' + this.getTotalCount();
    }

    // ------------------------------------------
    // Session Stats (per-game tracking)
    // ------------------------------------------

    /**
     * Reset session stats for a new game.
     */
    resetSession() {
        this.sessionStats = {
            kills: 0,
            losses: 0,
            citiesCaptured: 0,
            citiesLost: 0,
            citiesFounded: 0,
            playersEliminated: 0,
            warsDeclared: 0,
            peacesFormed: 0,
            unitsProduced: 0,
            techResearched: 0,
            tilesOwned: 0,
            turnsPlayed: 0,
            roundsPlayed: 0
        };
    }

    // ------------------------------------------
    // Notification Queue (delegated to display extension)
    // ------------------------------------------

    /**
     * Queue a notification for display. Actual rendering is in achievement-display.js.
     * @param {string} id - Achievement id
     */
    _queueNotification(id) {
        this._notifQueue.push(id);
        // Defer display so all synchronous unlocks from the same event
        // accumulate in the queue before the first batch is shown.
        // If _notifHoldUntil is set (e.g. a derez animation is in progress),
        // keep rescheduling until the hold expires before displaying.
        if (!this._activeNotif && !this._batchPending) {
            this._batchPending = true;
            var self = this;
            var initialDelay = Math.max(0, (this._notifHoldUntil || 0) - Date.now());
            function checkAndShow() {
                var now = Date.now();
                if (self._notifHoldUntil && now < self._notifHoldUntil) {
                    // Hold still active — reschedule for when it expires
                    setTimeout(checkAndShow, self._notifHoldUntil - now);
                    return;
                }
                self._batchPending = false;
                if (!self._activeNotif) {
                    self._showNextNotification();
                }
            }
            setTimeout(checkAndShow, initialDelay);
        }
    }

    /**
     * Cancel any animation hold and show queued notifications immediately.
     * Call when a victory or defeat screen appears so achievements aren't buried
     * behind or shown after the player has already clicked away.
     */
    _cancelNotifHold() {
        if (!this._notifHoldUntil) return;
        this._notifHoldUntil = 0;
        // If a batch is waiting for the hold to expire, bypass it and show now.
        if (this._batchPending && !this._activeNotif) {
            this._batchPending = false;
            this._showNextNotification();
        }
    }

    /**
     * Show the next queued notification. Overridden by achievement-display.js.
     */
    _showNextNotification() {
        // Stub — replaced by achievement-display.js
        if (this._notifQueue.length > 0) {
            this._notifQueue.shift();
        }
    }

    /**
     * Clear all pending notifications.
     */
    _clearNotifications() {
        if (this._activeNotif) {
            this._activeNotif = null;
        }
        this._notifQueue.length = 0;
        this._batchPending = false;
    }
}

// IndexedDB configuration (separate from game saves)
AchievementManager.DB_NAME = 'civchess_achievements';
AchievementManager.DB_VERSION = 1;
AchievementManager.STORE_NAME = 'achievements';

// Cached database connection
AchievementManager._db = null;
AchievementManager._dbPromise = null;

// Global singleton
var achievementManager = new AchievementManager();
