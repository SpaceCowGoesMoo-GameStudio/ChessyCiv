// ============================================
// DEV CONTROLS - Events Module
// ============================================
// Event system, history recording, action log, batch ops.

DevGame.prototype.on = function(event, callback) {
    if (!this._eventCallbacks[event]) {
        this._eventCallbacks[event] = [];
    }
    this._eventCallbacks[event].push(callback);
};

DevGame.prototype.off = function(event, callback) {
    if (!this._eventCallbacks[event]) return;
    if (callback) {
        this._eventCallbacks[event] = this._eventCallbacks[event].filter(cb => cb !== callback);
    } else {
        delete this._eventCallbacks[event];
    }
};

DevGame.prototype._emit = function(event, data) {
    const cbs = this._eventCallbacks[event];
    if (cbs) {
        for (let i = 0; i < cbs.length; i++) {
            cbs[i](data);
        }
    }
};

/**
 * Capture an undo snapshot (call BEFORE making the state change).
 */
DevGame.prototype._captureUndoSnapshot = function() {
    if (!this._undoEnabled || this._undoRestoring) return;
    const snapshot = this.cloneState();
    this._undoStack.push(snapshot);
    if (this._undoStack.length > this._undoMaxDepth) {
        this._undoStack.shift();
    }
    this._redoStack.length = 0;
};

// ================================================================
// Undo/Redo System
// ================================================================

DevGame.prototype.setUndoEnabled = function(enabled) {
    this._undoEnabled = !!enabled;
    if (!this._undoStack) this._undoStack = [];
    if (!this._redoStack) this._redoStack = [];
    if (!this._undoMaxDepth) this._undoMaxDepth = 50;
    this._undoRestoring = false;
};

DevGame.prototype.undo = function() {
    if (!this._undoStack || this._undoStack.length === 0) {
        return { success: false, reason: 'Nothing to undo' };
    }
    const currentSnapshot = this.cloneState();
    this._redoStack.push(currentSnapshot);
    const prevState = this._undoStack.pop();
    this._undoRestoring = true;
    this.restoreState(prevState);
    this._undoRestoring = false;
    return { success: true, undoRemaining: this._undoStack.length };
};

DevGame.prototype.redo = function() {
    if (!this._redoStack || this._redoStack.length === 0) {
        return { success: false, reason: 'Nothing to redo' };
    }
    const currentSnapshot = this.cloneState();
    this._undoStack.push(currentSnapshot);
    const nextState = this._redoStack.pop();
    this._undoRestoring = true;
    this.restoreState(nextState);
    this._undoRestoring = false;
    return { success: true, redoRemaining: this._redoStack.length };
};

DevGame.prototype.getUndoStackSize = function() {
    return this._undoStack ? this._undoStack.length : 0;
};

DevGame.prototype.getRedoStackSize = function() {
    return this._redoStack ? this._redoStack.length : 0;
};

DevGame.prototype.clearUndoHistory = function() {
    this._undoStack = [];
    this._redoStack = [];
};

// ================================================================
// Turn History Recording
// ================================================================

DevGame.prototype.setHistoryRecording = function(enabled) {
    this._recordHistory = enabled;
};

DevGame.prototype.isHistoryRecording = function() {
    return this._recordHistory;
};

DevGame.prototype.getTurnHistory = function() {
    return this._turnHistory;
};

DevGame.prototype.clearTurnHistory = function() {
    this._turnHistory = [];
};

DevGame.prototype._captureMinimalState = function() {
    const pieces = this.engine.pieces.map(p => ({
        id: p.id,
        type: p.type,
        ownerId: p.ownerId,
        row: p.row,
        col: p.col,
        hp: p.hp,
        maxHp: p.maxHp,
        damage: p.damage,
        production: p.production,
        productionProgress: p.productionProgress
    }));
    const ownership = this.engine.tileOwnership.map(row => row.slice());
    return {
        turnNumber: this.engine.turnNumber,
        roundNumber: this.engine.roundNumber,
        currentPlayerIndex: this.engine.currentPlayerIndex,
        pieces,
        tileOwnership: ownership,
        gameOver: this.engine.gameOver,
        winner: this.engine.winner
    };
};

// ================================================================
// Action Log
// ================================================================

DevGame.prototype.getActionLog = function(count) {
    if (count) {
        return this.engine.actionLog.slice(-count);
    }
    return this.engine.actionLog.slice();
};

DevGame.prototype.clearActionLog = function() {
    this.engine.actionLog.length = 0;
};

// ================================================================
// Batch Operations
// ================================================================

DevGame.prototype.runTurns = function(count) {
    const results = [];
    for (let i = 0; i < count; i++) {
        if (this.engine.gameOver) break;
        results.push(this.endTurn());
    }
    return results;
};

DevGame.prototype.runRounds = function(count) {
    const targetRound = this.engine.roundNumber + count;
    const results = [];
    while (this.engine.roundNumber < targetRound && !this.engine.gameOver) {
        results.push(this.endTurn());
    }
    return results;
};

DevGame.prototype.runUntilGameOver = function(maxTurns) {
    const limit = maxTurns || 10000;
    let turns = 0;
    while (!this.engine.gameOver && turns < limit) {
        this.endTurn();
        turns++;
    }
    return {
        gameOver: this.engine.gameOver,
        winner: this.engine.winner,
        turnsPlayed: turns,
        turnNumber: this.engine.turnNumber,
        roundNumber: this.engine.roundNumber
    };
};
