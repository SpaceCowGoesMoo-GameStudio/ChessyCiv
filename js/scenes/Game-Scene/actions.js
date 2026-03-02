// ============================================
// GAME SCENE - Actions Module
// ============================================
// Game actions: production, settle, diplomacy, end turn.

GameScene.prototype.getPlayerWarriorCount = function(playerID) {
    const numPieces = new Set(
        this.engine.pieces
            .filter(p => p.type === PIECE_TYPES.WARRIOR && p.ownerId === playerID)
    );

    return numPieces.size;
};

GameScene.prototype.selectProduction = function(type) {
    if (!this.selectedPiece || this.selectedPiece.pieceData.type !== PIECE_TYPES.CITY) {
        return;
    }

    const piece = this.selectedPiece.pieceData;

    // Don't allow repair if at full health
    if (type === 'REPAIR' && piece.hp >= piece.maxHp) {
        return;
    }

    // Don't allow heal warriors if no wounded adjacent warriors
    if (type === 'HEAL_WARRIORS' && !this.engine.hasWoundedAdjacentWarrior(piece)) {
        return;
    }

    // Don't allow scenario-blocked production types
    if (this.blockedProductions && this.blockedProductions.indexOf(type) !== -1) {
        return;
    }

    this.engine.setProduction(piece, type);
    this.updatePieceSprite(piece);
    this.updateSelectedInfo();
};

GameScene.prototype.toggleRepeat = function(enabled) {
    if (!this.selectedPiece || this.selectedPiece.pieceData.type !== PIECE_TYPES.CITY) {
        return;
    }

    const piece = this.selectedPiece.pieceData;
    piece.repeatProduction = enabled;
};

GameScene.prototype.settleCity = function() {
    if (!this.selectedPiece || this.selectedPiece.pieceData.type !== PIECE_TYPES.SETTLER) {
        return;
    }

    const settler = this.selectedPiece.pieceData;
    const result = this.engine.settlerBuildCity(settler);

    if (result.success) {
        this.removePieceSprite(settler.id);
        this.createPieceSprite(result.city);
        this.drawOwnership();
        this.deselectPiece();
        this.updateUI();
        this.playCitySettle();
    }
};

GameScene.prototype.toggleDiplomacy = function(targetIndex) {
    const currentPlayer = this.engine.getCurrentPlayer();
    const targetPlayer = this.engine.players[targetIndex];
    const myRelation = currentPlayer.relations[targetIndex];
    const theirRelation = targetPlayer.relations[this.engine.currentPlayerIndex];

    // Check if relation can be changed (minimum turns requirement)
    const canChange = this.engine.canChangeRelation(this.engine.currentPlayerIndex, targetIndex);

    if (myRelation === 'peace' && theirRelation === 'peace') {
        // At peace - declare war
        if (!canChange.canChange) {
            this.showDiplomacyToast(`Peace treaty: ${canChange.roundsRemaining} round${canChange.roundsRemaining !== 1 ? 's' : ''} left`);
            return;
        }
        this.engine.declareWar(this.engine.currentPlayerIndex, targetIndex);
        // Clear stale peace proposal tracking
        if (this._seenPeaceProposals) {
            this._seenPeaceProposals.delete(this.engine.currentPlayerIndex + '-' + targetIndex);
            this._seenPeaceProposals.delete(targetIndex + '-' + this.engine.currentPlayerIndex);
        }
        // Log war declaration in dev mode
        if (typeof uiController !== 'undefined' && uiController.settings.devMode) {
            uiController.log(`WAR: ${currentPlayer.name} declared war on ${targetPlayer.name}!`, 'error');
        }
    } else if (theirRelation === 'peace_proposed') {
        // They proposed peace - accept it
        if (!canChange.canChange) {
            this.showDiplomacyToast(`War continues: ${canChange.roundsRemaining} round${canChange.roundsRemaining !== 1 ? 's' : ''} left`);
            return;
        }
        this.engine.acceptPeace(this.engine.currentPlayerIndex, targetIndex);
        // Clear peace proposal tracking
        if (this._seenPeaceProposals) {
            this._seenPeaceProposals.delete(targetIndex + '-' + this.engine.currentPlayerIndex);
            this._seenPeaceProposals.delete(this.engine.currentPlayerIndex + '-' + targetIndex);
        }
        // Log peace acceptance in dev mode
        if (typeof uiController !== 'undefined' && uiController.settings.devMode) {
            uiController.log(`PEACE: ${currentPlayer.name} accepted peace with ${targetPlayer.name}`, 'success');
        }
    } else if (myRelation === 'peace_proposed') {
        // We already proposed - rescind the offer
        this.engine.rescindPeace(this.engine.currentPlayerIndex, targetIndex);
        // Clear peace proposal tracking
        if (this._seenPeaceProposals) {
            this._seenPeaceProposals.delete(this.engine.currentPlayerIndex + '-' + targetIndex);
        }
        // Log rescind in dev mode
        if (typeof uiController !== 'undefined' && uiController.settings.devMode) {
            uiController.log(`DIPLOMACY: ${currentPlayer.name} rescinded peace offer to ${targetPlayer.name}`, 'warning');
        }
    } else {
        // At war - propose peace
        if (!canChange.canChange) {
            this.showDiplomacyToast(`War continues: ${canChange.roundsRemaining} round${canChange.roundsRemaining !== 1 ? 's' : ''} left`);
            return;
        }
        this.engine.proposePeace(this.engine.currentPlayerIndex, targetIndex);
        // Log peace proposal in dev mode
        if (typeof uiController !== 'undefined' && uiController.settings.devMode) {
            uiController.log(`DIPLOMACY: ${currentPlayer.name} proposed peace to ${targetPlayer.name}`, 'info');
        }
    }

    this.updateUI();

    // Validate queued movements — diplomacy changes may invalidate paths
    this.validateQueues();
};

GameScene.prototype.endTurn = function() {
    // Don't allow turn advancement once the game is over
    if (this.engine.gameOver) return;
    // Prevent rapid clicks from skipping turns in multi-human games
    if (this.isAITurnInProgress) return;
    var now = Date.now();
    if (this._lastTurnEndTime && now - this._lastTurnEndTime < 350) return;
    this._lastTurnEndTime = now;

    this.deselectPiece();

    // Fade out queue lines at end of turn (they fade back in on next human turn)
    this._queueLineAlpha = 0;

    // Execute queued movements for pieces that weren't manually moved
    const queuedMoveResults = this.executeQueuedMoves();

    if (queuedMoveResults.length > 0) {
        // Batched move sounds replace the click sound
        this.drawOwnership();
        this._animateQueuedMoveResults(queuedMoveResults, () => {
            this._proceedWithEndTurn();
        });
    } else {
        this.playClickSound();
        this._proceedWithEndTurn();
    }
};

GameScene.prototype._proceedWithEndTurn = function() {
    const prevPlayer = this.engine.getCurrentPlayer();
    this.engine.endTurn();

    // Log turn end in dev mode
    if (typeof uiController !== 'undefined' && uiController.settings.devMode) {
        const nextPlayer = this.engine.getCurrentPlayer();
        uiController.log(`Turn ${this.engine.turnNumber}: ${prevPlayer.name} -> ${nextPlayer.name}`, 'info');
    }

    // Refresh pieces (some may have spawned)
    this.refreshPieceSprites();

    this.drawOwnership();
    this.updateUI();

    // Validate queued movements after turn transition (board state may have changed)
    this.validateQueues();

    // Check if next player is AI
    this.checkAndExecuteAITurn();
};
