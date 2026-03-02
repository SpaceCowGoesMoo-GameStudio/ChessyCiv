// ============================================
// DEV CONTROLS - AI Control Module
// ============================================
// AI registration, execution, auto-AI, stepToHuman.

DevGame.prototype.setPlayerAI = function(playerId, enabled, difficulty) {
    const player = this.engine.players[playerId];
    if (!player) return { success: false, reason: 'Invalid player' };
    if (player.eliminated) return { success: false, reason: 'Player is eliminated' };

    const diff = difficulty || player.aiDifficulty || AI_DIFFICULTY.MEDIUM;

    if (enabled) {
        player.isAI = true;
        player.isHuman = false;
        player.aiDifficulty = diff;
        if (this._aiManager) {
            this._aiManager.registerAIPlayer(playerId, diff);
        }
    } else {
        player.isAI = false;
        player.isHuman = true;
        if (this._aiManager && this._aiManager.isAIPlayer(playerId)) {
            this._aiManager.aiPlayers.delete(playerId);
        }
    }

    return { success: true, player: DevExport.playerToPlain(player) };
};

DevGame.prototype.executeAITurn = function(playerId) {
    if (!this._aiManager) return { success: false, reason: 'AI system not available' };
    if (!this._aiManager.isAIPlayer(playerId)) return { success: false, reason: 'Player is not AI' };
    const actions = this._aiManager.executeAITurn(playerId);
    return { success: true, actions };
};

DevGame.prototype.setAutoAI = function(enabled) {
    this._autoAI = !!enabled;
};

DevGame.prototype.isAutoAI = function() {
    return this._autoAI;
};

DevGame.prototype.runAITurn = function() {
    const pid = this.engine.currentPlayerIndex;
    const player = this.engine.players[pid];
    if (!player) return { success: false, reason: 'No current player' };
    if (!this._aiManager || !this._aiManager.isAIPlayer(pid)) {
        return { success: false, reason: 'Current player is not AI' };
    }
    const actions = this._aiManager.executeAITurn(pid);
    const turnInfo = this.endTurn();
    return { success: true, actions, turnInfo };
};

DevGame.prototype.stepToHuman = function() {
    const aiResults = [];
    // End the current turn first
    this.engine.endTurn();
    this._emit('turnEnd', this._currentTurnInfo());

    // Now run through AI players
    let safety = this.engine.players.length * 2;
    while (!this.engine.gameOver && safety-- > 0) {
        const pid = this.engine.currentPlayerIndex;
        if (!this._aiManager || !this._aiManager.isAIPlayer(pid)) break;
        const actions = this._aiManager.executeAITurn(pid);
        aiResults.push({ playerId: pid, actions });

        if (this._recordHistory) {
            this._turnHistory.push(this._captureMinimalState());
        }
        this.engine.endTurn();
        this._emit('turnEnd', this._currentTurnInfo());
    }

    return {
        aiTurnsPlayed: aiResults.length,
        aiResults,
        turnInfo: this._currentTurnInfo()
    };
};

DevGame.prototype._runPendingAITurns = function() {
    let safety = this.engine.players.length * 2;
    while (!this.engine.gameOver && safety-- > 0) {
        const pid = this.engine.currentPlayerIndex;
        if (!this._aiManager || !this._aiManager.isAIPlayer(pid)) break;
        const actions = this._aiManager.executeAITurn(pid);
        this._emit('aiTurn', { playerId: pid, actions });

        if (this._recordHistory) {
            this._turnHistory.push(this._captureMinimalState());
        }
        this.engine.endTurn();
        this._emit('turnEnd', this._currentTurnInfo());
    }
};

DevGame.prototype._currentTurnInfo = function() {
    return {
        turnNumber: this.engine.turnNumber,
        roundNumber: this.engine.roundNumber,
        currentPlayerIndex: this.engine.currentPlayerIndex,
        gameOver: this.engine.gameOver,
        winner: this.engine.winner
    };
};
