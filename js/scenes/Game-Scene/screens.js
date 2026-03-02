// ============================================
// GAME SCENE - Screens Module
// ============================================
// Victory, defeat, elimination screens, and toast notifications.

/**
 * Show a brief toast notification in the upper left corner when game is saved.
 * Creates a DOM div positioned absolutely within the board area.
 */
GameScene.prototype.showSaveToast = function(sizeBytes) {
    const sizeStr = GameHistory.formatSize(sizeBytes);
    const padding = 10;
    const toastX = BOARD_OFFSET + padding;
    const toastY = BOARD_OFFSET + padding;

    // Create toast container - neon terminal style
    const toastEl = document.createElement('div');
    toastEl.style.position = 'absolute';
    toastEl.style.left = toastX + 'px';
    toastEl.style.top = toastY + 'px';
    toastEl.style.width = '150px';
    toastEl.style.height = '28px';
    toastEl.style.lineHeight = '28px';
    toastEl.style.textAlign = 'center';
    toastEl.style.background = hexToRGBA(COLORS.uiBackground, 0.95);
    toastEl.style.border = '1px solid rgba(0,212,255,0.4)';
    toastEl.style.color = COLORS.accentGreen;
    toastEl.style.fontSize = '14px';
    toastEl.style.fontFamily = 'VT323, monospace';
    toastEl.style.pointerEvents = 'none';
    toastEl.style.zIndex = DEPTH_TOAST_TEXT;
    toastEl.style.opacity = '0';
    toastEl.textContent = `SAVED (${sizeStr})`;

    this.container.appendChild(toastEl);

    // Fade in
    this.tweens.add({
        targets: toastEl,
        alpha: 1,
        duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => {
            // Hold for 1.5 seconds, then fade out
            this.delayedCall(1500, () => {
                this.tweens.add({
                    targets: toastEl,
                    alpha: 0,
                    duration: 300,
                    ease: 'Quad.easeIn',
                    onComplete: () => {
                        if (toastEl.parentNode) {
                            toastEl.parentNode.removeChild(toastEl);
                        }
                    }
                });
            });
        }
    });
};

/**
 * Show a brief toast notification in the upper right corner of the board.
 * Used for diplomacy-related messages (war/peace restrictions).
 */
GameScene.prototype.showDiplomacyToast = function(message) {
    // Destroy any existing toast
    if (this.activeToast) {
        if (this.activeToast.timerId) {
            clearTimeout(this.activeToast.timerId);
        }
        this.tweens.killTweensOf(this.activeToast.el);
        if (this.activeToast.el.parentNode) {
            this.activeToast.el.parentNode.removeChild(this.activeToast.el);
        }
        this.activeToast = null;
    }

    const padding = 10;
    const boardRight = BOARD_OFFSET + BOARD_SIZE * TILE_SIZE;
    const toastWidth = 220;
    const toastX = boardRight - padding - toastWidth;
    const toastY = BOARD_OFFSET + padding;

    // Create toast container - neon terminal style with warning color
    const toastEl = document.createElement('div');
    toastEl.style.position = 'absolute';
    toastEl.style.left = toastX + 'px';
    toastEl.style.top = toastY + 'px';
    toastEl.style.width = toastWidth + 'px';
    toastEl.style.height = '28px';
    toastEl.style.lineHeight = '28px';
    toastEl.style.textAlign = 'center';
    toastEl.style.background = hexToRGBA(COLORS.uiBackground, 0.95);
    toastEl.style.border = '1px solid rgba(255,136,0,0.4)';
    toastEl.style.color = '#ff8800';
    toastEl.style.fontSize = '14px';
    toastEl.style.fontFamily = 'VT323, monospace';
    toastEl.style.pointerEvents = 'none';
    toastEl.style.zIndex = DEPTH_TOAST_TEXT;
    toastEl.style.opacity = '0';
    toastEl.textContent = message;

    this.container.appendChild(toastEl);

    // Store reference to active toast
    this.activeToast = { el: toastEl, timerId: null };

    // Fade in
    this.tweens.add({
        targets: toastEl,
        alpha: 1,
        duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => {
            // Hold for 2 seconds, then fade out
            const timerId = setTimeout(() => {
                this.tweens.add({
                    targets: toastEl,
                    alpha: 0,
                    duration: 300,
                    ease: 'Quad.easeIn',
                    onComplete: () => {
                        if (toastEl.parentNode) {
                            toastEl.parentNode.removeChild(toastEl);
                        }
                        this.activeToast = null;
                    }
                });
            }, 2000);
            if (this.activeToast) {
                this.activeToast.timerId = timerId;
            }
        }
    });
};

/**
 * Queue a diplomacy notification toast for center-screen display.
 * Shows other players' diplomacy actions (war declarations, peace proposals, peace acceptance).
 * Toasts render in queue — one at a time, next shows after current fades out.
 * @param {string} message - The message to display
 * @param {string} type - 'war' for red styling, 'peace' for white styling
 */
GameScene.prototype.queueDiplomacyNotification = function(message, type) {
    if (!this._diplomacyNotifQueue) this._diplomacyNotifQueue = [];
    this._diplomacyNotifQueue.push({ message: message, type: type });
    if (!this._activeDiplomacyNotif) {
        this._showNextDiplomacyNotification();
    }
};

GameScene.prototype._showNextDiplomacyNotification = function() {
    if (!this._diplomacyNotifQueue || this._diplomacyNotifQueue.length === 0) {
        this._activeDiplomacyNotif = null;
        return;
    }

    var item = this._diplomacyNotifQueue.shift();
    var message = item.message;
    var isWar = item.type === 'war';

    var boardCenterX = BOARD_OFFSET + (BOARD_SIZE * TILE_SIZE) / 2;
    var boardCenterY = BOARD_OFFSET + (BOARD_SIZE * TILE_SIZE) / 2;
    var toastWidth = 300;
    var toastHeight = 36;

    var textColor = isWar ? COLORS.accentRed : '#ffffff';
    var borderColor = isWar ? 'rgba(255,68,68,0.6)' : 'rgba(255,255,255,0.4)';
    var glowColor = isWar ? 'rgba(255,68,68,0.3)' : 'rgba(255,255,255,0.15)';

    var toastEl = document.createElement('div');
    toastEl.style.position = 'absolute';
    toastEl.style.left = (boardCenterX - toastWidth / 2) + 'px';
    toastEl.style.top = (boardCenterY - toastHeight / 2) + 'px';
    toastEl.style.width = toastWidth + 'px';
    toastEl.style.height = toastHeight + 'px';
    toastEl.style.lineHeight = toastHeight + 'px';
    toastEl.style.textAlign = 'center';
    toastEl.style.background = hexToRGBA(COLORS.uiBackground, 0.95);
    toastEl.style.border = '1px solid ' + borderColor;
    toastEl.style.color = textColor;
    toastEl.style.fontSize = '16px';
    toastEl.style.fontFamily = 'VT323, monospace';
    toastEl.style.textTransform = 'uppercase';
    toastEl.style.letterSpacing = '1px';
    toastEl.style.boxShadow = '0 0 15px ' + glowColor;
    toastEl.style.pointerEvents = 'none';
    toastEl.style.zIndex = DEPTH_TOAST_TEXT;
    toastEl.style.opacity = '0';
    toastEl.innerHTML = message;

    // 8-bit countdown dial — war=red, peace=white — centred below the toast
    if (typeof _makeTimeDial === 'function') {
        var dialColor = isWar ? '#ff4444' : '#ffffff';
        var dial = _makeTimeDial(dialColor, 2000);
        dial.el.style.position  = 'absolute';
        dial.el.style.bottom    = '-43px';   // below 1px border + 6 px gap
        dial.el.style.left      = '50%';
        dial.el.style.transform = 'translateX(-50%)';
        toastEl.appendChild(dial.el);
    }

    this.container.appendChild(toastEl);
    this._activeDiplomacyNotif = { el: toastEl, timerId: null };

    // Fade in
    this.tweens.add({
        targets: toastEl,
        alpha: 1,
        duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => {
            // Hold for 2 seconds, then fade out
            var timerId = setTimeout(() => {
                this.tweens.add({
                    targets: toastEl,
                    alpha: 0,
                    duration: 300,
                    ease: 'Quad.easeIn',
                    onComplete: () => {
                        if (toastEl.parentNode) {
                            toastEl.parentNode.removeChild(toastEl);
                        }
                        this._activeDiplomacyNotif = null;
                        // Show next in queue
                        this._showNextDiplomacyNotification();
                    }
                });
            }, 2000);
            if (this._activeDiplomacyNotif) {
                this._activeDiplomacyNotif.timerId = timerId;
            }
        }
    });
};

/**
 * Clean up all pending and active diplomacy notifications.
 * Called during scene destroy.
 */
GameScene.prototype._clearDiplomacyNotifications = function() {
    if (this._activeDiplomacyNotif) {
        if (this._activeDiplomacyNotif.timerId) {
            clearTimeout(this._activeDiplomacyNotif.timerId);
        }
        this.tweens.killTweensOf(this._activeDiplomacyNotif.el);
        if (this._activeDiplomacyNotif.el.parentNode) {
            this._activeDiplomacyNotif.el.parentNode.removeChild(this._activeDiplomacyNotif.el);
        }
        this._activeDiplomacyNotif = null;
    }
    if (this._diplomacyNotifQueue) {
        this._diplomacyNotifQueue.length = 0;
    }
};

GameScene.prototype.showVictoryScreen = function() {
    // Prevent multiple victory screens (e.g. from repeated updateUI calls during AI-only games)
    if (this.victoryScreenShown) return;
    this.victoryScreenShown = true;

    // Show any achievement that was held back waiting for a derez animation
    if (typeof achievementManager !== 'undefined') achievementManager._cancelNotifHold();

    const winner = this.engine.players[this.engine.winner];
    const config = layoutConfig;

    // Log victory in dev mode
    if (typeof uiController !== 'undefined' && uiController.settings.devMode) {
        uiController.log(`VICTORY: ${winner.name} has won the game!`, 'success');
    }

    this.soundDenied = true;
    this.stopAITurnMusic();
    // Skip end-game music if an achievement animation is playing
    var achievementPlaying = typeof achievementManager !== 'undefined' &&
        (achievementManager._activeNotif || (achievementManager._notifQueue && achievementManager._notifQueue.length > 0));
    if (!achievementPlaying) {
        this.playWinSong();
    }

    // Create full-screen overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.zIndex = DEPTH_SCREEN_OVERLAY;
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    // Scale text based on game width
    const scale = Math.min(config.gameWidth / 500, 1);
    const titleSize = Math.max(Math.floor(56 * scale), 28);
    const subtitleSize = Math.max(Math.floor(36 * scale), 20);
    const spacing = Math.floor(50 * scale);

    // Victory text - neon terminal style
    const titleEl = document.createElement('div');
    titleEl.textContent = 'VICTORY';
    titleEl.style.fontSize = titleSize + 'px';
    titleEl.style.fontFamily = 'VT323, monospace';
    titleEl.style.color = winner.color.css;
    titleEl.style.textAlign = 'center';
    titleEl.style.marginBottom = Math.floor(spacing * 0.4) + 'px';

    const subtitleEl = document.createElement('div');
    subtitleEl.textContent = winner.name.toUpperCase() + ' WINS';
    subtitleEl.style.fontSize = subtitleSize + 'px';
    subtitleEl.style.fontFamily = 'VT323, monospace';
    subtitleEl.style.color = COLORS.textPrimary;
    subtitleEl.style.textAlign = 'center';
    subtitleEl.style.marginBottom = spacing + 'px';

    overlay.appendChild(titleEl);
    overlay.appendChild(subtitleEl);

    // Main Menu button
    const btnWidth = Math.max(Math.floor(150 * scale), 100);
    const btnHeight = Math.max(Math.floor(50 * scale), 35);
    const menuBtn = this.createButton(0, 0, 'Main Menu', () => {
        this.scene.start('MenuScene');
    }, btnWidth, btnHeight);
    menuBtn.el.style.zIndex = DEPTH_SCREEN_CONTENT;
    overlay.appendChild(menuBtn.el);

    this.container.appendChild(overlay);
};

GameScene.prototype.showDefeatScreen = function(defeatedPlayerId) {
    // Show any achievement that was held back waiting for a derez animation
    if (typeof achievementManager !== 'undefined') achievementManager._cancelNotifHold();

    const defeatedPlayer = this.engine.players[defeatedPlayerId];
    const config = layoutConfig;

    // Stop AI turn music if playing
    if (this.aiTurnMusicPlaying) {
        this.aiTurnMusicPlaying = false;
        this.stopAITurnMusic();
    }

    this.soundDenied = true;
    // Skip end-game music if an achievement animation is playing
    var achievementPlaying = typeof achievementManager !== 'undefined' &&
        (achievementManager._activeNotif || (achievementManager._notifQueue && achievementManager._notifQueue.length > 0));
    if (!achievementPlaying) {
        this.playLoseSong();
    }

    // Log defeat in dev mode
    if (typeof uiController !== 'undefined' && uiController.settings.devMode) {
        uiController.log(`DEFEAT: ${defeatedPlayer.name} has been eliminated!`, 'error');
    }

    // Create full-screen overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.zIndex = DEPTH_SCREEN_OVERLAY;
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    // Scale text based on game width
    const scale = Math.min(config.gameWidth / 500, 1);
    const titleSize = Math.max(Math.floor(56 * scale), 28);
    const subtitleSize = Math.max(Math.floor(36 * scale), 20);
    const spacing = Math.floor(50 * scale);

    // Defeat text - neon terminal style
    const titleEl = document.createElement('div');
    titleEl.textContent = 'DEFEATED';
    titleEl.style.fontSize = titleSize + 'px';
    titleEl.style.fontFamily = 'VT323, monospace';
    titleEl.style.color = COLORS.accentRed;
    titleEl.style.textAlign = 'center';
    titleEl.style.marginBottom = Math.floor(spacing * 0.4) + 'px';

    const subtitleEl = document.createElement('div');
    subtitleEl.textContent = defeatedPlayer.name.toUpperCase() + ' ELIMINATED';
    subtitleEl.style.fontSize = subtitleSize + 'px';
    subtitleEl.style.fontFamily = 'VT323, monospace';
    subtitleEl.style.color = COLORS.textPrimary;
    subtitleEl.style.textAlign = 'center';
    subtitleEl.style.marginBottom = spacing + 'px';

    overlay.appendChild(titleEl);
    overlay.appendChild(subtitleEl);

    // Main Menu button
    const btnWidth = Math.max(Math.floor(150 * scale), 100);
    const btnHeight = Math.max(Math.floor(50 * scale), 35);
    const menuBtn = this.createButton(0, 0, 'Main Menu', () => {
        this.scene.start('MenuScene');
    }, btnWidth, btnHeight);
    menuBtn.el.style.zIndex = DEPTH_SCREEN_CONTENT;
    overlay.appendChild(menuBtn.el);

    this.container.appendChild(overlay);
};

GameScene.prototype.checkHumanDefeat = function(eliminationResult) {
    if (!eliminationResult || !eliminationResult.eliminated) return;

    const eliminatedPlayer = this.engine.players[eliminationResult.playerId];
    if (eliminatedPlayer && !eliminatedPlayer.isAI) {
        // Check if any other human players are still active
        const remainingHumans = this.engine.players.filter(p => {
            if (!p || p.isAI || p.id === eliminationResult.playerId) return false;
            // Check if this human player still has cities (not eliminated)
            return !p.eliminated;
        });
        if (remainingHumans.length === 0) {
            // Last human eliminated.
            // If the game is also over and a human won (hot seat), the victory
            // screen is more appropriate — skip the defeat screen.
            if (this.engine.gameOver) {
                const winner = this.engine.players[this.engine.winner];
                if (winner && !winner.isAI) return;
                // AI won — show defeat screen and block the victory screen
                // so both don't display simultaneously.
                this.victoryScreenShown = true;
            } else {
                // Game continues between AIs but is over for the human player.
                // Update history metadata so load menu shows FINISHED status
                // and reloading this save shows the defeat screen.
                this.engine.history.metadata.endTime = Date.now();
                this.engine.history.metadata.winner = eliminationResult.conquerer;
            }
            this.delayedCall(500, () => {
                this.showDefeatScreen(eliminationResult.playerId);
            });
        }
    }
};

GameScene.prototype.handleEliminationAnimation = function(elimination) {
    // CRT jitter on player defeat
    if (this.sceneManager) this.sceneManager.triggerCRTJitter();

    // Animate destruction of 75% of units
    for (const unit of elimination.destroyedUnits) {
        this.removePieceSprite(unit.id);
    }

    // Animate conversion of 25% of units (destroy old, create new warrior for conqueror)
    for (const conversion of elimination.convertedUnits) {
        const oldSprite = this.pieceSprites.get(conversion.oldUnit.id);
        if (oldSprite) {
            // Get position before destroying
            const x = oldSprite.x;
            const y = oldSprite.y;

            // Destroy old sprite with animation
            const angle = Math.random() * Math.PI * 2;
            const distance = 100 + Math.random() * 100;
            const targetX = x + Math.cos(angle) * distance;
            const targetY = y + Math.sin(angle) * distance + 200;
            const rotation = (Math.random() - 0.5) * Math.PI * 4;

            this.tweens.add({
                targets: oldSprite,
                x: targetX,
                y: targetY,
                alpha: 0,
                scale: 0.2,
                rotation: rotation,
                duration: 1500,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    oldSprite.destroy();
                    this.pieceSprites.delete(conversion.oldUnit.id);
                }
            });
        }

        // Create new warrior sprite for conqueror (slight delay for visual effect)
        this.delayedCall(300, () => {
            this.createPieceSprite(conversion.newWarrior);
            this.drawOwnership();
        });
    }

    // Check if a human player was defeated
    this.checkHumanDefeat(elimination);
};
