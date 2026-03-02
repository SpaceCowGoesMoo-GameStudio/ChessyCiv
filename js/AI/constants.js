// ============================================
// AI CONSTANTS
// ============================================

const AI_DIFFICULTY = {
    NOVICE: 'novice',
    BEGINNER: 'beginner',
    APPRENTICE: 'apprentice',
    EASY: 'easy',
    MEDIUM: 'medium',
    HARD: 'hard'
};

const AI_PERSONALITY = {
    EXPANSIONIST: 'expansionist'
};

const AI_ACTION_TYPE = {
    MOVE_UNIT: 'move_unit',
    ATTACK: 'attack',
    BUILD_CITY: 'build_city',
    DECLARE_WAR: 'declare_war',
    PROPOSE_PEACE: 'propose_peace',
    ACCEPT_PEACE: 'accept_peace',
    RESCIND_PEACE: 'rescind_peace',
    SET_PRODUCTION: 'set_production'
};

const AI_GOAL_TYPE = {
    BORDER_ESTABLISHMENT: 'border_establishment',
    DEFENSE_INDUSTRY: 'defense_industry',
    DARPA: 'darpa',
    POSTURING: 'posturing',
    WAR_DEMILITARIZE: 'war_demilitarize',
    WAR_CONQUER: 'war_conquer',
    EXPANSION: 'expansion',
    ATTACK_BUILDUP: 'attack_buildup',
    DIAGONAL_BLOCKADE: 'diagonal_blockade'
};

// Warscore thresholds for peace decisions
const WARSCORE_THRESHOLDS = {
    HIGH_ENEMY_RATIO: 2.0,      // Enemy has 2x our warscore - consider peace
    STAGNATION_TURNS: 8,        // Turns without significant warscore change
    STAGNATION_DELTA: 3,        // Minimum warscore change to not be stagnant
    PYRRHIC_MILITARY_LOSS: 0.5  // Lost >= 50% of military since war started
};

// Performance tracking thresholds
const PERFORMANCE_THRESHOLDS = {
    HISTORY_LENGTH: 10,         // How many turns to track for trends
    SLOW_PROGRESS_TURNS: 6,     // Turns without improvement before considering war
    CITY_RATIO_TRIGGER: 0.9,    // If city ratio drops below this, worry
    TERRITORY_GROWTH_MIN: 0.5,  // Minimum territory growth rate vs enemy
    STRENGTH_PARITY: 0.8,       // Consider adversary "equal" if within this ratio
    WAR_DECLARATION_CHANCE: 0.08, // 8% chance per turn to declare war when stagnant vs equal foe
    WEAK_ENEMY_WAR_CHANCE: 0.30,  // 30% chance per turn to declare war on significantly weaker enemy
    WEAK_ENEMY_THRESHOLD: 0.5,    // Enemy is "significantly weaker" if their strength is <= 50% of ours
    DIAGONAL_BLOCKADE_CHANCE: 0.60 // 60% chance to use diagonal blockade strategy
};

// War objective types with priority values
const WAR_OBJECTIVE_TYPE = {
    DEFEND_CITY: 'defend_city',               // Priority 100 - Highest priority
    TERRITORY_RECLAIM: 'territory_reclaim',   // Priority 85
    INTERCEPT: 'intercept',                   // Priority 80
    SIEGE_CITY: 'siege_city',                 // Priority 70
    ELIMINATE_WARRIOR: 'eliminate_warrior',   // Priority 60
    CONTROL_CHOKEPOINT: 'control_chokepoint'  // Priority 50
};

// Priority values for war objectives
const WAR_OBJECTIVE_PRIORITY = {
    [WAR_OBJECTIVE_TYPE.DEFEND_CITY]: 100,
    [WAR_OBJECTIVE_TYPE.TERRITORY_RECLAIM]: 85,
    [WAR_OBJECTIVE_TYPE.INTERCEPT]: 80,
    [WAR_OBJECTIVE_TYPE.SIEGE_CITY]: 70,
    [WAR_OBJECTIVE_TYPE.ELIMINATE_WARRIOR]: 60,
    [WAR_OBJECTIVE_TYPE.CONTROL_CHOKEPOINT]: 50
};

// Event-driven reassessment triggers (replaces blind 5-turn check)
const REASSESSMENT_TRIGGER = {
    TARGET_DESTROYED: 'target_destroyed',
    TARGET_MOVED_FAR: 'target_moved_far',
    CITY_UNDER_ATTACK: 'city_under_attack',
    PATH_BLOCKED: 'path_blocked',
    STALE_OBJECTIVE: 'stale_objective'
};

// War behavior configuration
const WAR_CONFIG = {
    STALE_THRESHOLD: 4,           // Turns without progress before objective is stale
    TARGET_MOVED_THRESHOLD: 3,    // Distance target must move to trigger reassessment
    MIN_TURNS_BEFORE_REASSESS: 2, // Minimum turns before allowing reassessment
    PRESSURE_RADIUS: 3,           // Radius around city to check for pressure
    PRESSURE_THRESHOLD: 30,       // Pressure score threshold for "under pressure"
    CRITICAL_THRESHOLD: 60,       // Pressure score threshold for "critical"
    ADJACENT_ENEMY_CRITICAL: 3,   // Number of adjacent enemy tiles for critical status
    INTERCEPT_RANGE: 4,           // Range to detect approaching enemies for interception
    MAX_WARRIORS_PER_TARGET: 3,   // Max warriors to assign to same non-siege target
    SIEGE_MIN_WARRIORS: 2,        // Minimum warriors needed for siege
    LOCK_STRENGTH_MIN: 0.1,       // Minimum lock strength
    LOCK_STRENGTH_MAX: 1.0        // Maximum lock strength
};
