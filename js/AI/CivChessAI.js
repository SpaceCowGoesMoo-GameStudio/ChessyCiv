// Yield to the main thread to keep UI responsive during AI turns
function _yieldToMain() { return new Promise(r => setTimeout(r, 0)); }

// ============================================
// ChessyCiv AI - Individual AI Brain
// ============================================
class CivChessAI {
    constructor(engine, playerId, personality, difficulty) {
        this.engine = engine;
        this.playerId = playerId;
        this.personality = personality;
        this.difficulty = difficulty;

        // Warrior objective tracking
        this.warriorObjectives = new Map(); // pieceId -> { target, turnsTracking, initialTargetHp, initialDistance }

        // Track other players' behaviors
        this.playerProfiles = new Map(); // playerId -> { personality, threatLevel, previousWarriorCount }

        // Current strategic goals (prioritized list)
        this.activeGoals = [];

        // Track previous war declarations against us
        this.previousAggressors = new Set();

        // Target adversary for expansion comparison
        this.targetedAdversary = null;

        // Per-turn cache for expensive computations
        this._turnCache = {};

        // ========================================
        // Performance tracking
        // ========================================
        this.performanceHistory = []; // Array of { turn, cityRatio, territoryOwned, techLevel, strengthRatio }
        this.lastPerformanceUpdate = -1;

        // ========================================
        // Warscore tracking
        // ========================================
        this.warscores = new Map(); // enemyId -> { ours: number, theirs: number, lastChange: turn, startTurn: turn }

        // Track losses for warscore calculation
        this.warLosses = new Map(); // enemyId -> { citiesLost: number, unitsLost: number }
        this.warGains = new Map();  // enemyId -> { citiesTaken: number, unitsKilled: number }

        // Track initial military count at first war start (for pyrrhic calculation)
        this.initialWarMilitary = null; // Set when first war begins after peace
        this.isInAnyWar = false;        // Track if we're currently in any war

        // ========================================
        // Diagonal Blockade Strategy
        // ========================================
        this.useBlockadeStrategy = Math.random() < PERFORMANCE_THRESHOLDS.DIAGONAL_BLOCKADE_CHANCE;
        this.blockadePositions = null;  // Will be calculated based on starting corner
        this.blockadeAssignments = new Map(); // pieceId -> blockade position
        this.temporarilyVacatedBlockade = new Map(); // pieceId -> { originalPos, waitingForSettler }
        this.startingCorner = null;     // Will be detected on first turn
        this.startingCityPos = null;    // Starting city position for blockade threat detection

        // ========================================
        // War Behavior - Territory Pressure & Sieges
        // ========================================
        this.cityPressureData = [];  // Array of { cityId, pressureScore, isUnderPressure, isCritical, encroachingTiles }
        this.activeSieges = new Map(); // cityId -> { targetCity, assignedWarriors, approachPositions }

        // ========================================
        // Blocked Production Tracking
        // ========================================
        this.blockedProductionTurns = new Map(); // cityId -> number of consecutive turns blocked
    }

    /**
     * Clear per-turn caches at the start of each turn
     */
    _clearTurnCache() {
        this._turnCache = {
            validCitySpots: null,
            enemies: null
        };
    }

    // ========================================
    // MAIN TURN EXECUTION
    // ========================================
    async executeTurn() {
        const actions = [];

        // Clear per-turn cache
        this._clearTurnCache();

        // Phase 1: Board analysis
        this.analyzeBoard();
        this.analyzeTerritoryPressure();
        await _yieldToMain();

        // Phase 2: Strategic planning
        this.profilePlayers();
        this.updatePerformanceTracking();
        this.updateWarscores();
        this.determineGoals();
        await _yieldToMain();

        // Phase 3: Diplomacy + production
        actions.push(...this.handleDiplomacy());
        actions.push(...this.handlePeaceProposals());
        actions.push(...this.handleProduction());
        await _yieldToMain();

        // Phase 4: Unit movement (heaviest phase)
        this.updateWarriorObjectives();
        actions.push(...this.handleUnitMovement());
        await _yieldToMain();

        // Phase 5: Settler actions
        actions.push(...this.handleSettlerActions());

        return actions;
    }

    // ========================================
    // DIFFICULTY ERROR SYSTEM
    // ========================================
    maybeError() {
        switch (this.difficulty) {
            case AI_DIFFICULTY.NOVICE:
                // Almost random - 80% chance
                return Math.random() < 0.80;
            case AI_DIFFICULTY.BEGINNER:
                // More random than strategic - 60% chance
                return Math.random() < 0.60;
            case AI_DIFFICULTY.APPRENTICE:
                // Starting to be strategic - 45% chance
                return Math.random() < 0.45;
            case AI_DIFFICULTY.EASY:
                // Frequent errors - 30% chance
                return Math.random() < 0.30;
            case AI_DIFFICULTY.MEDIUM:
                // Occasional errors - 10% chance
                return Math.random() < 0.10;
            case AI_DIFFICULTY.HARD:
                // No errors
                return false;
            default:
                return false;
        }
    }
}
