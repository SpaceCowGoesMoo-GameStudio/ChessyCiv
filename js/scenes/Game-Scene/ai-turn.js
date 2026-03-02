// ============================================
// GAME SCENE - AI Turn Module
// ============================================
// AI turn execution and AI-specific animations.

/**
 * Check if an AI player's turn was interrupted (loaded mid-turn with pieces already moved)
 * If so, end their turn immediately to allow the game to continue.
 * Only applies to AI players - human players may want to continue their interrupted turn.
 */
GameScene.prototype.handleLoadedMidTurn = function() {
    if (this.engine.gameOver) return false;

    const currentPlayer = this.engine.getCurrentPlayer();
    if (!currentPlayer) return false;

    // Only auto-complete interrupted turns for AI players
    // Human players may want to continue their turn after loading
    if (!currentPlayer.isAI) return false;

    // Check if any of the current player's movable pieces have already moved
    const currentPlayerPieces = this.engine.pieces.filter(p =>
        p.ownerId === this.engine.currentPlayerIndex &&
        (p.type === PIECE_TYPES.WARRIOR || p.type === PIECE_TYPES.SETTLER)
    );

    // If there are movable pieces and any have moved, the turn was interrupted
    const hasMovedPieces = currentPlayerPieces.some(p => p.hasMoved);

    if (hasMovedPieces) {
        console.log('[GameScene] Detected mid-turn load state for AI, completing interrupted turn');

        // End the interrupted turn to advance to next player
        this.engine.endTurn();
        this.refreshPieceSprites();
        this.drawOwnership();
        this.updateUI();

        return true; // Indicate that we handled a mid-turn state
    }

    return false;
};

GameScene.prototype.checkAndExecuteAITurn = function() {
    if (this.engine.gameOver) return;
    if (this.isAITurnInProgress) return;

    const currentPlayer = this.engine.getCurrentPlayer();
    if (currentPlayer.isAI && this.aiManager.isAIPlayer(this.engine.currentPlayerIndex)) {
        this.isAITurnInProgress = true;

        // Start AI turn music if not already playing
        if (!this.aiTurnMusicPlaying) {
            this.aiTurnMusicPlaying = true;
            this.startAITurnMusic();
        }

        // Small delay before AI starts to make it feel more natural
        this.delayedCall(500, () => {
            this.executeAITurn();
        });
    } else {
        // Human player's turn - stop AI music if it was playing
        if (this.aiTurnMusicPlaying) {
            this.aiTurnMusicPlaying = false;
            this.stopAITurnMusic();
        }

        // Recompute queued paths — board state may have changed during AI turns
        this.validateQueues();

        // Show attack hint once, if the human player is now at war
        this._checkAttackHint();

        // Re-notify the human of any still-pending AI peace proposals every 8 rounds
        this._checkPeaceProposalReminder();
    }
};

GameScene.prototype.executeAITurn = function() {
    const playerId = this.engine.currentPlayerIndex;
    const player = this.engine.players[playerId];
    console.log(`[GameScene] Executing AI turn for player ${playerId}`);

    // Log AI turn start in dev mode
    if (typeof uiController !== 'undefined' && uiController.settings.devMode) {
        uiController.log(`AI (${player.name}) starting turn...`, 'info');
    }

    // Standard AI path
    this.aiManager.executeAITurn(playerId).then((actions) => {
        // Log actions in dev mode
        if (typeof uiController !== 'undefined' && uiController.settings.devMode) {
            uiController.log(`AI (${player.name}) planned ${actions.length} actions`, 'info');
            actions.forEach((action, i) => {
                let detail = action.type;
                if (action.to) detail += ` to (${action.to.row},${action.to.col})`;
                uiController.log(`  ${i + 1}. ${detail}`, 'info');
            });
        }

        // Animate the actions with delays
        this.animateAIActions(actions, 0, () => {
            // After all actions are animated, end the turn
            this.delayedCall(300, () => {
                this._finishAITurn();
            });
        });
    });
};

GameScene.prototype._finishAITurn = function() {
    this.isAITurnInProgress = false;

    // Refresh visuals
    this.refreshPieceSprites();
    this.drawOwnership();

    // Stop AI music before updateUI so victory screen doesn't overlap
    if (this.engine.gameOver && this.aiTurnMusicPlaying) {
        this.aiTurnMusicPlaying = false;
        this.stopAITurnMusic();
    }

    this.updateUI();

    // End turn and check for next AI
    if (!this.engine.gameOver) {
        this.engine.endTurn();
        this.refreshPieceSprites();
        this.drawOwnership();
        this.updateUI();

        // Check if next player is also AI
        this.checkAndExecuteAITurn();
    }
};

GameScene.prototype.animateAIActions = function(actions, index, onComplete) {
    if (index >= actions.length) {
        onComplete();
        return;
    }

    // Separate movement actions from non-movement actions
    const movementActions = [];
    const nonMovementActions = [];

    // Collect the next batch of actions (up to 8 movement actions)
    let currentIndex = index;
    while (currentIndex < actions.length && movementActions.length < 8) {
        const action = actions[currentIndex];
        if (action.type === AI_ACTION_TYPE.MOVE_UNIT || action.type === AI_ACTION_TYPE.ATTACK) {
            movementActions.push(action);
        } else {
            nonMovementActions.push(action);
        }
        currentIndex++;

        // If we hit a movement action after non-movement actions, break to process non-movement first
        if (nonMovementActions.length > 0 && movementActions.length > 0) {
            // Put the movement action back for the next batch
            movementActions.pop();
            currentIndex--;
            break;
        }
    }

    // If we have non-movement actions, process them instantly and continue
    if (nonMovementActions.length > 0 && movementActions.length === 0) {
        // Queue diplomacy notifications for any diplomacy actions
        for (var i = 0; i < nonMovementActions.length; i++) {
            this._handleAIDiplomacyNotification(nonMovementActions[i]);
        }
        this.animateAIActions(actions, currentIndex, onComplete);
        return;
    }

    // Animate the batch of movement actions simultaneously
    if (movementActions.length > 0) {
        this.animateAIMovementBatch(movementActions, () => {
            // After batch animation completes, continue to next batch
            this.delayedCall(30, () => {
                this.animateAIActions(actions, currentIndex, onComplete);
            });
        });
    } else {
        onComplete();
    }
};

GameScene.prototype.animateAIMovementBatch = function(movementActions, onComplete) {
    if (movementActions.length === 0) {
        onComplete();
        return;
    }

    let completedAnimations = 0;
    const totalAnimations = movementActions.length;

    const checkAllComplete = () => {
        completedAnimations++;
        if (completedAnimations >= totalAnimations) {
            // Update ownership and UI after all animations complete
            this.drawOwnership();
            this.updateUI();
            // Play sound based on batch size (number of pieces that moved together)
            this.playPieceDropSoundAI(totalAnimations);
            onComplete();
        }
    };

    for (const action of movementActions) {
        this.animateSingleAIMovement(action, checkAllComplete);
    }
};

GameScene.prototype.animateSingleAIMovement = function(action, onComplete) {
    const piece = this.engine.pieces.find(p => p.id === action.pieceId);
    if (!piece) {
        onComplete();
        return;
    }

    const sprite = this.pieceSprites.get(action.pieceId);
    if (!sprite) {
        onComplete();
        return;
    }

    // Calculate positions using action.from and action.to for reliable animation
    const fromX = action.from ? BOARD_OFFSET + action.from.col * TILE_SIZE + TILE_SIZE / 2 : sprite.x;
    const fromY = action.from ? BOARD_OFFSET + action.from.row * TILE_SIZE + TILE_SIZE / 2 : sprite.y;
    const targetX = BOARD_OFFSET + action.to.col * TILE_SIZE + TILE_SIZE / 2;
    const targetY = BOARD_OFFSET + action.to.row * TILE_SIZE + TILE_SIZE / 2;

    // Check if this was a blocked attack (bump animation)
    if (action.blocked && action.from) {
        // Blocked attack - do bump animation
        const bumpX = (fromX + targetX) / 2;
        const bumpY = (fromY + targetY) / 2;

        // Ensure sprite starts at the from position
        sprite.x = fromX;
        sprite.y = fromY;

        this.tweens.add({
            targets: sprite,
            x: bumpX,
            y: bumpY,
            duration: 100,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.tweens.add({
                    targets: sprite,
                    x: fromX,
                    y: fromY,
                    duration: 150,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        this.updatePieceSprite(piece);
                        onComplete();
                    }
                });
            }
        });
        return;
    }

    // Regular movement animation - ensure sprite starts at the from position
    sprite.x = fromX;
    sprite.y = fromY;

    this.tweens.add({
        targets: sprite,
        x: targetX,
        y: targetY,
        duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => {
            // Handle combat results
            if (action.combat) {
                if (action.combat.defenderDestroyed && !action.combat.cityFlipped) {
                    this.removePieceSprite(action.combat.defender);
                } else if (action.combat.cityFlipped) {
                    // City was captured - recreate sprite with new owner color
                    const cityPiece = this.engine.pieces.find(p => p.id === action.combat.defender);
                    if (cityPiece) {
                        const oldSprite = this.pieceSprites.get(cityPiece.id);
                        if (oldSprite) {
                            oldSprite.destroy();
                            this.pieceSprites.delete(cityPiece.id);
                        }
                        this.createPieceSprite(cityPiece);
                    }

                    // Check if a player was eliminated and if it was a human
                    if (action.combat.elimination && action.combat.elimination.eliminated) {
                        this.handleEliminationAnimation(action.combat.elimination);
                    }
                }
            }

            this.updatePieceSprite(piece);
            onComplete();
        }
    });
};

/**
 * Check an AI action for diplomacy events and queue center-screen notifications.
 * Shows war declarations, peace agreements, and peace proposals targeting human players.
 */
GameScene.prototype._handleAIDiplomacyNotification = function(action) {
    var playerId = this.engine.currentPlayerIndex;
    var actorHtml = this._coloredPlayerName(playerId);

    if (action.type === AI_ACTION_TYPE.DECLARE_WAR) {
        var warTargetHtml = this._coloredPlayerName(action.target);
        this.queueDiplomacyNotification(
            actorHtml + this._diplomacyVerb(' declared war on ', 'war') + warTargetHtml,
            'war'
        );
    } else if (action.type === AI_ACTION_TYPE.ACCEPT_PEACE) {
        var peaceTargetHtml = this._coloredPlayerName(action.target);
        this.queueDiplomacyNotification(
            actorHtml + this._diplomacyVerb(' made peace with ', 'peace') + peaceTargetHtml,
            'peace'
        );
    } else if (action.type === AI_ACTION_TYPE.PROPOSE_PEACE) {
        var target = this.engine.players[action.target];
        if (!target.isAI) {
            var proposalKey = playerId + '-' + action.target;
            this._seenPeaceProposals.set(proposalKey, this.engine.roundNumber);
            var proposeTargetHtml = this._coloredPlayerName(action.target);
            this.queueDiplomacyNotification(
                actorHtml + this._diplomacyVerb(' proposed peace to ', 'peace') + proposeTargetHtml,
                'peace'
            );
        }
    }
};

/**
 * At the start of each human turn, re-notify the player of any AI peace proposals that
 * have been sitting unanswered for 8+ rounds.
 */
GameScene.prototype._checkPeaceProposalReminder = function() {
    var humanIndex = this.engine.currentPlayerIndex;
    var currentRound = this.engine.roundNumber;

    for (var i = 0; i < this.engine.players.length; i++) {
        var player = this.engine.players[i];
        if (!player.isAI || player.eliminated) continue;
        if (player.relations[humanIndex] !== 'peace_proposed') continue;

        var proposalKey = i + '-' + humanIndex;
        var lastShownRound = this._seenPeaceProposals.has(proposalKey)
            ? this._seenPeaceProposals.get(proposalKey)
            : -Infinity;

        if (currentRound - lastShownRound >= 8) {
            this._seenPeaceProposals.set(proposalKey, currentRound);
            var actorHtml = this._coloredPlayerName(i);
            var targetHtml = this._coloredPlayerName(humanIndex);
            this.queueDiplomacyNotification(
                actorHtml + this._diplomacyVerb(' proposed peace to ', 'peace') + targetHtml,
                'peace'
            );
        }
    }
};

/**
 * Return an HTML span with the player's name colored and glowing in their primary color.
 * Uses "You" for human players.
 */
GameScene.prototype._coloredPlayerName = function(playerIndex) {
    var p = this.engine.players[playerIndex];
    var label = p.isAI ? p.name : 'You';
    return '<span style="color:' + p.color.css + ';text-shadow:0 0 8px ' + p.color.css + '">' + label + '</span>';
};

/**
 * Wrap connecting verb text in a span with the base war/peace glow.
 */
GameScene.prototype._diplomacyVerb = function(text, type) {
    var glow = type === 'war' ? COLORS.accentRed : 'rgba(255,255,255,0.5)';
    return '<span style="text-shadow:0 0 8px ' + glow + '">' + text + '</span>';
};

GameScene.prototype.getActionAnimationDelay = function(action) {
    switch (action.type) {
        case AI_ACTION_TYPE.MOVE_UNIT:
        case AI_ACTION_TYPE.ATTACK:
            return 400;
        case AI_ACTION_TYPE.BUILD_CITY:
            return 600;
        case AI_ACTION_TYPE.DECLARE_WAR:
        case AI_ACTION_TYPE.PROPOSE_PEACE:
        case AI_ACTION_TYPE.ACCEPT_PEACE:
        case AI_ACTION_TYPE.RESCIND_PEACE:
            return 300;
        case AI_ACTION_TYPE.SET_PRODUCTION:
            return 100;
        default:
            return 200;
    }
};
