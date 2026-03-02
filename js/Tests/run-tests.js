#!/usr/bin/env node
// ============================================
// TEST RUNNER
// ============================================
// Entry point: shims, file loader, test discovery, CLI, reporter.
// Usage: node js/Tests/run-tests.js [--filter <pattern>] [--verbose]

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============================================
// BROWSER SHIMS (must run before any game files)
// ============================================
globalThis.window = globalThis;
globalThis.window.addEventListener = globalThis.window.addEventListener || function() {};
globalThis.window.removeEventListener = globalThis.window.removeEventListener || function() {};
globalThis.navigator = { maxTouchPoints: 0 };
globalThis.document = {
    createElement: () => ({ click() {}, href: '', download: '', style: {} }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    head: { appendChild: () => {} }
};
globalThis.URL = { createObjectURL: () => 'blob:', revokeObjectURL: () => {} };
globalThis.Blob = class Blob { constructor() {} };

// AudioContext stub (SoundManager creates singleton on load)
class AudioContext {
    constructor() { this.state = 'suspended'; }
    resume() { return Promise.resolve(); }
    createBufferSource() {
        return { connect() {}, start() {}, stop() {}, buffer: null, onended: null };
    }
    createGain() {
        return { connect() {}, gain: { value: 1 } };
    }
    get destination() { return {}; }
    decodeAudioData() { return Promise.resolve({}); }
}
globalThis.window.AudioContext = AudioContext;
globalThis.window.webkitAudioContext = AudioContext;

// fetch stub
globalThis.fetch = () => Promise.resolve({ ok: false });

// indexedDB stub (GameHistory uses it)
globalThis.indexedDB = null;
globalThis.window.indexedDB = null;

// pako stub (compression lib) - return Uint8Array to match real pako API
globalThis.pako = {
    deflate: d => {
        const str = typeof d === 'string' ? d : JSON.stringify(d);
        return new Uint8Array(Buffer.from(str));
    },
    inflate: (d, opts) => {
        if (opts && opts.to === 'string') {
            return Buffer.from(d).toString();
        }
        return Buffer.from(d);
    }
};

// AI constants stubs (AI_DIFFICULTY referenced in setup.js; others needed by CivChessAI)
globalThis.AI_DIFFICULTY = {
    NOVICE: 'novice', BEGINNER: 'beginner', APPRENTICE: 'apprentice',
    EASY: 'easy', MEDIUM: 'medium', HARD: 'hard'
};
globalThis.AI_PERSONALITY = { EXPANSIONIST: 'expansionist' };
globalThis.AI_ACTION_TYPE = {
    MOVE_UNIT: 'move_unit', ATTACK: 'attack', BUILD_CITY: 'build_city',
    DECLARE_WAR: 'declare_war', PROPOSE_PEACE: 'propose_peace',
    ACCEPT_PEACE: 'accept_peace', RESCIND_PEACE: 'rescind_peace',
    SET_PRODUCTION: 'set_production'
};
globalThis.PERFORMANCE_THRESHOLDS = {
    HISTORY_LENGTH: 10, SLOW_PROGRESS_TURNS: 6, CITY_RATIO_TRIGGER: 0.9,
    TERRITORY_GROWTH_MIN: 0.5, STRENGTH_PARITY: 0.8,
    WAR_DECLARATION_CHANCE: 0.08, WEAK_ENEMY_WAR_CHANCE: 0.30,
    WEAK_ENEMY_THRESHOLD: 0.5, DIAGONAL_BLOCKADE_CHANCE: 0.60
};

// Layout needs window dimensions at load time
globalThis.window.innerWidth = 1920;
globalThis.window.innerHeight = 1080;
globalThis.window.devicePixelRatio = 1;

// btoa/atob for GameHistory compression
globalThis.btoa = globalThis.btoa || (s => Buffer.from(s, 'binary').toString('base64'));
globalThis.atob = globalThis.atob || (s => Buffer.from(s, 'base64').toString('binary'));

// localStorage stub
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// setTimeout/clearTimeout should already exist in Node, but ensure they're on window
globalThis.window.setTimeout = globalThis.setTimeout;
globalThis.window.clearTimeout = globalThis.clearTimeout;

// Map and Set should already exist but ensure they're available
globalThis.window.Map = globalThis.Map;
globalThis.window.Set = globalThis.Set;

// Suppress console.log and console.warn from game engine during tests
const _origLog = console.log;
const _origWarn = console.warn;
let _suppressLog = true;
console.log = function(...args) {
    if (!_suppressLog) _origLog.apply(console, args);
};
console.warn = function(...args) {
    if (!_suppressLog) _origWarn.apply(console, args);
};

// ============================================
// FILE LOADING
// ============================================
const ROOT = path.resolve(__dirname, '..', '..');

function loadFile(relPath) {
    const fullPath = path.join(ROOT, relPath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInThisContext(code, { filename: fullPath });
}

// Load game engine files in correct order
const engineFiles = [
    'js/SoundManager.js',
    'js/constants.js',
    'js/GameHistory.js',
    'js/Game-Engine/GameEngine.js',
    'js/Game-Engine/setup.js',
    'js/Game-Engine/movement.js',
    'js/Game-Engine/combat.js',
    'js/Game-Engine/production.js',
    'js/Game-Engine/territory.js',
    'js/Game-Engine/diplomacy.js',
    'js/Game-Engine/settlers.js',
    'js/Game-Engine/turns.js',
    'js/Game-Engine/ai-support.js',
    'js/Game-Engine/persistence.js',
    'js/Game-Engine/ml-state-encoder.js'
];

for (const f of engineFiles) {
    loadFile(f);
}

// GameScene stub (needed for achievement integration hooks and tutorial methods)
globalThis.GameScene = function() {};
GameScene.prototype.create = async function() {};
GameScene.prototype.destroy = function() {};
GameScene.prototype.checkHumanDefeat = function() {};

// Load tutorial module so its prototype methods are available for unit tests
loadFile('js/scenes/Game-Scene/tutorial.js');

// Load achievement system files
const achievementFiles = [
    'js/Achievements/AchievementManager.js',
    'js/Achievements/achievement-persistence.js',
    'js/Achievements/achievement-checks.js',
    'js/Achievements/achievement-definitions.js',
    'js/Achievements/achievement-integration.js'
];
for (const f of achievementFiles) {
    loadFile(f);
}

// Load AI files needed for AI unit tests
const aiFiles = [
    'js/AI/CivChessAI.js',
    'js/AI/objectives.js',   // defines getDistance / getManhattanDistance
    'js/AI/pathfinding.js',  // defines findWarriorPathAStar / findSettlerPathAStar
    'js/AI/analysis.js',     // defines initializeBlockadePositions / isBlockadePaused
    'js/AI/goals.js'         // defines isAtWar (used by isBlockadePaused)
];
for (const f of aiFiles) {
    loadFile(f);
}

// Load test framework and helpers
loadFile('js/Tests/test-framework.js');
loadFile('js/Tests/test-helpers.js');

// ============================================
// TEST FILE DISCOVERY
// ============================================
function discoverTests(dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...discoverTests(full));
        } else if (entry.name.startsWith('test-') && entry.name.endsWith('.js')) {
            files.push(full);
        }
    }
    return files.sort();
}

const testDir = __dirname;
const testFiles = [
    ...discoverTests(path.join(testDir, 'unit')),
    ...discoverTests(path.join(testDir, 'integration')),
    ...discoverTests(path.join(testDir, 'e2e'))
];

for (const f of testFiles) {
    const code = fs.readFileSync(f, 'utf8');
    vm.runInThisContext(code, { filename: f });
}

// ============================================
// CLI PARSING
// ============================================
const args = process.argv.slice(2);
let filter = null;
let verbose = false;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--filter' && args[i + 1]) {
        filter = args[++i];
    } else if (args[i] === '--verbose') {
        verbose = true;
    }
}

// ============================================
// RUN
// ============================================
console.log = _origLog; // Restore for header output
console.warn = _origWarn;

console.log('ChessyCiv Game Engine Test Suite');
console.log(`Loaded ${testFiles.length} test files`);
if (filter) console.log(`Filter: "${filter}"`);

// Suppress game engine logging during test execution (always suppress engine logs)
const _gameLog = console.log;
const _gameWarn = console.warn;
console.log = function(...args) {
    // Only suppress game engine [Player] logs
    if (args.length > 0 && typeof args[0] === 'string' && args[0].startsWith('[')) return;
    _gameLog.apply(console, args);
};
console.warn = function() {}; // suppress all warns during tests

const result = runAllTests(filter, verbose);

// Restore logging for report
console.log = _gameLog;
console.warn = _gameWarn;
const exitCode = reportResults(result);
process.exit(exitCode);
