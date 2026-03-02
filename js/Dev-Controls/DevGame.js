// ============================================
// DEV CONTROLS - DevGame
// ============================================
// Per-game wrapper around a GameEngine instance.
// Provides maximal programmatic control for data extraction,
// testing, and running concurrent headless games.
//
// This is the base class. Methods are added via prototype
// extensions in separate files (same pattern as GameEngine).

class DevGame {
    constructor(id, playerConfigs) {
        this.id = id;
        this.engine = new GameEngine();
        this.engine.setupGame(playerConfigs);
        this._gameEndingEnabled = true;
        this._originalCheckVictory = null;
        this._loggingEnabled = true;
        this._originalLog = null;
        this._sandboxMode = false;
        this._savedEngineMethods = null;
        this._eventCallbacks = {};
        this._turnHistory = [];
        this._recordHistory = false;
        // AIManager — available if AI scripts are loaded
        this._aiManager = (typeof AIManager !== 'undefined') ? new AIManager(this.engine) : null;
        this._autoAI = false;
        // Undo/Redo system
        this._undoEnabled = false;
        this._undoStack = [];
        this._redoStack = [];
        this._undoMaxDepth = 50;
        this._undoRestoring = false;
        // Granular sandbox rules
        this._sandboxRules = null;
    }
}
