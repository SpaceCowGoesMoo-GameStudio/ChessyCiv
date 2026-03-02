// ============================================
// MENU SCENE - Load Game Menu
// ============================================

/**
 * Display the load game menu with saved games list
 */
MenuScene.prototype.showLoadGameMenu = async function() {
    this._currentScreen = () => this.showLoadGameMenu();
    this.showingMainMenu = false;
    this.cleanupScrolling();
    this.clearElements(this.loadGameElements);
    this.loadGameElements = [];
    this.clearElements(this.mainMenuElements);
    this.mainMenuElements = [];
    this.clearElements(this.scenarioElements);
    this.scenarioElements = [];
    this.clearElements(this.singlePlayerMenuElements);
    this.singlePlayerMenuElements = [];

    const config = layoutConfig;
    const menuW = this._menuWidth || config.gameWidth;
    const menuH = this._menuHeight || config.gameHeight;
    const centerX = menuW / 2;
    const mobile = config.mobile;

    // Scale factors for high-DPI touch devices
    const touchScale = (config.isTouch && config.highDPI) ? 1.3 : 1;

    // Match new-game header positioning exactly
    const spacing = mobile ? (config.highDPI ? 0.85 : 0.7) : 1;

    // Get saved games early so we can show count in the header
    const { games: savedGames, count: saveCount } = await GameHistory.listSavedGames();

    // Back button - DOM element so browser positions it naturally without clipping
    const backBtnEl = document.createElement('button');
    backBtnEl.className = 'achievements-back-btn';
    backBtnEl.style.cssText =
        'position:absolute;top:8px;left:8px;' +
        'font-family:"VT323",monospace;font-size:1.125em;padding:0.5em 0.75em;' +
        'background:transparent;border:1px solid #00d4ff;color:#00d4ff;' +
        'cursor:pointer;text-transform:uppercase;letter-spacing:0.06em;z-index:10;';
    backBtnEl.textContent = '\u2190 Back';
    backBtnEl.addEventListener('click', () => {
        if (typeof soundManager !== 'undefined') {
            soundManager.resumeContext();
            soundManager.playImmediate('sound/interface/click.mp3', 100);
        }
        this.cleanupScrolling();
        this.showMainMenu();
    });
    this.container.appendChild(backBtnEl);
    const backBtn = { destroy: () => { if (backBtnEl.parentNode) backBtnEl.parentNode.removeChild(backBtnEl); } };
    this.loadGameElements.push(backBtn);

    const backBtnY = mobile ? Math.floor(40 * touchScale) : 80;
    let y = backBtnY + Math.floor(30 * spacing);

    // Title - centered, same vertical position as new-game first label
    const baseTitleSize = mobile ? 36 : 56;
    const titleSize = `${Math.floor(baseTitleSize * touchScale)}px`;
    const title = this.add.text(centerX, y, 'LOAD GAME', {
        fontSize: titleSize,
        fontFamily: 'VT323, monospace',
        color: COLORS.textPrimary
    }).setOrigin(0.5);
    this.loadGameElements.push(title);

    y += mobile ? Math.floor(30 * touchScale) : Math.floor(40 * spacing);

    // Save count - below title, clearly visible
    const countFontSize = mobile ? Math.floor(16 * touchScale) : 18;
    const countColor = saveCount >= GameHistory.MAX_SAVES ? COLORS.accentRed : COLORS.accentGreen;
    const countText = this.add.text(centerX, y, `[ ${saveCount} / ${GameHistory.MAX_SAVES} SAVES ]`, {
        fontSize: `${countFontSize}px`,
        fontFamily: 'VT323, monospace',
        color: countColor
    }).setOrigin(0.5);
    this.loadGameElements.push(countText);

    y += mobile ? Math.floor(55 * touchScale) : Math.floor(40 * spacing);

    const listTopY = y;

    if (savedGames.length === 0) {
        const noGamesFontSize = mobile ? Math.floor(16 * touchScale) : 22;
        const noGames = this.add.text(centerX, listTopY + 50, 'NO SAVED GAMES FOUND', {
            fontSize: `${noGamesFontSize}px`,
            fontFamily: 'VT323, monospace',
            color: COLORS.textSecondary
        }).setOrigin(0.5);
        this.loadGameElements.push(noGames);
        return;
    }

    // --- Scrollable game list ---
    const listStartY = listTopY;
    const rowHeight = mobile ? Math.floor(76 * touchScale) : 60;
    const listWidth = mobile ? menuW - Math.floor(24 * touchScale) : menuW - 80;
    // List ends 10% above the bottom of the menu box
    const listBottomY = Math.floor(menuH * 0.90);
    const visibleHeight = Math.max(rowHeight, listBottomY - listStartY);
    const totalHeight = savedGames.length * rowHeight;

    // Max text width for game names (leave room for buttons)
    const btnAreaWidth = mobile ? Math.floor(58 * touchScale) + Math.floor(16 * touchScale) : 160;
    const nameMaxWidth = listWidth - btnAreaWidth - Math.floor(20 * touchScale);

    // Create a container for all game entries
    this.scrollContainer = this.add.container(0, 0);
    this.loadGameElements.push(this.scrollContainer);

    // Track scroll position
    this.scrollY = 0;
    this.maxScrollY = Math.max(0, totalHeight - visibleHeight);
    this.listStartY = listStartY;
    this.visibleHeight = visibleHeight;

    savedGames.forEach((game, index) => {
        const rowY = listStartY + index * rowHeight;

        // Row background
        const rowBg = this.add.rectangle(centerX, rowY, listWidth, rowHeight - 4, COLORS.uiBackground);
        rowBg.setStrokeStyle(1, 0x00d4ff44);
        rowBg.setInteractive({ useHandCursor: true });
        this.scrollContainer.add(rowBg);

        const nameX = centerX - listWidth / 2 + Math.floor(12 * touchScale);
        const displayTime = game.lastAccessedTime || game.startTime;
        const dateStr = displayTime ? this.formatDateTime(new Date(displayTime)) : 'Unknown';
        const status = game.winner !== null ? 'FINISHED' : 'IN PROGRESS';
        const sizeStr = GameHistory.formatSize(game.sizeBytes || 0);

        if (mobile) {
            // Mobile: compact card with truncated name + stacked buttons on right
            const btnWidth = Math.floor(55 * touchScale);
            const btnHeight = Math.floor(24 * touchScale);
            const btnGap = Math.floor(5 * touchScale);
            const btnX = centerX + listWidth / 2 - btnWidth / 2 - Math.floor(8 * touchScale);

            const renameBtn = this.createColoredButton(btnX, rowY - btnHeight / 2 - btnGap / 2, 'Rename', 0x00ff44, () => {
                this.showRenameDialog(game.gameId);
            }, btnWidth, btnHeight);
            this.scrollContainer.add(renameBtn);

            const deleteBtn = this.createColoredButton(btnX, rowY + btnHeight / 2 + btnGap / 2, 'Delete', 0xff0044, () => {
                this.deleteGame(game.gameId);
            }, btnWidth, btnHeight);
            this.scrollContainer.add(deleteBtn);

            // Text area (left of buttons)
            const nameFontSize = Math.floor(18 * touchScale);
            const infoFontSize = Math.floor(13 * touchScale);
            const lineSpacing = Math.floor(18 * touchScale);

            // Line 1: Game name (truncated)
            const nameText = this.add.text(nameX, rowY - lineSpacing, game.gameId.toUpperCase(), {
                fontSize: `${nameFontSize}px`,
                fontFamily: 'VT323, monospace',
                color: COLORS.textPrimary
            }).setOrigin(0, 0.5);
            nameText.el.style.maxWidth = nameMaxWidth + 'px';
            nameText.el.style.overflow = 'hidden';
            nameText.el.style.textOverflow = 'ellipsis';
            this.scrollContainer.add(nameText);

            // Line 2: Players & status (show level name for campaign saves)
            const statusColor = game.winner !== null ? COLORS.accentGreen : COLORS.textSecondary;
            const infoLabel = game.campaignLevel
                ? `LV${game.campaignIndex != null ? game.campaignIndex + 1 : '?'}: ${game.campaignLevel}  ${status}`
                : `${game.playerCount}P  ${status}`;
            const infoText = this.add.text(nameX, rowY, infoLabel, {
                fontSize: `${infoFontSize}px`,
                fontFamily: 'VT323, monospace',
                color: statusColor
            }).setOrigin(0, 0.5);
            this.scrollContainer.add(infoText);

            // Line 3: Date & size
            const detailText = this.add.text(nameX, rowY + lineSpacing, `${dateStr}  ${sizeStr}`, {
                fontSize: `${infoFontSize}px`,
                fontFamily: 'VT323, monospace',
                color: '#556688'
            }).setOrigin(0, 0.5);
            detailText.el.style.maxWidth = nameMaxWidth + 'px';
            detailText.el.style.overflow = 'hidden';
            detailText.el.style.textOverflow = 'ellipsis';
            this.scrollContainer.add(detailText);

            // Tap on row to load game (but not on buttons, and not if scrolling)
            const btnAreaLeft = btnX - btnWidth / 2 - 5;
            let rowTouched = false;
            rowBg.on('pointerdown', (pointer) => {
                if (pointer.x < btnAreaLeft) {
                    rowTouched = true;
                }
            });
            rowBg.on('pointerup', () => {
                if (rowTouched && (!this.scrollDragDistance || this.scrollDragDistance < 10)) {
                    this.loadGame(game.gameId);
                }
                rowTouched = false;
            });
        } else {
            // Desktop: single row layout
            const nameFontSize = 18;
            const nameText = this.add.text(nameX, rowY - 8, game.gameId.toUpperCase(), {
                fontSize: `${nameFontSize}px`,
                fontFamily: 'VT323, monospace',
                color: COLORS.textPrimary
            }).setOrigin(0, 0.5);
            nameText.el.style.maxWidth = nameMaxWidth + 'px';
            nameText.el.style.overflow = 'hidden';
            nameText.el.style.textOverflow = 'ellipsis';
            this.scrollContainer.add(nameText);

            const infoFontSize = 14;
            const desktopInfo = game.campaignLevel
                ? `LV${game.campaignIndex != null ? game.campaignIndex + 1 : '?'}: ${game.campaignLevel} | ${status} | ${dateStr} | ${sizeStr}`
                : `${game.playerCount} PLAYERS | ${status} | ${dateStr} | ${sizeStr}`;
            const infoText = this.add.text(nameX, rowY + 10, desktopInfo, {
                fontSize: `${infoFontSize}px`,
                fontFamily: 'VT323, monospace',
                color: COLORS.textSecondary
            }).setOrigin(0, 0.5);
            this.scrollContainer.add(infoText);

            const btnWidth = 70;
            const btnHeight = 32;
            const btnSpacing = 80;

            const deleteX = centerX + listWidth / 2 - btnWidth / 2 - 10;
            const deleteBtn = this.createColoredButton(deleteX, rowY, 'Delete', 0xff0044, () => {
                this.deleteGame(game.gameId);
            }, btnWidth, btnHeight);
            this.scrollContainer.add(deleteBtn);

            const renameX = deleteX - btnSpacing;
            const renameBtn = this.createColoredButton(renameX, rowY, 'Rename', 0x00ff44, () => {
                this.showRenameDialog(game.gameId);
            }, btnWidth, btnHeight);
            this.scrollContainer.add(renameBtn);

            // Click on row to load game (but not on buttons, and not if scrolling)
            const btnAreaStart = renameX - btnWidth / 2 - 5;
            let rowTouched = false;
            rowBg.on('pointerdown', (pointer) => {
                if (pointer.x < btnAreaStart) {
                    rowTouched = true;
                }
            });
            rowBg.on('pointerup', () => {
                if (rowTouched && (!this.scrollDragDistance || this.scrollDragDistance < 10)) {
                    this.loadGame(game.gameId);
                }
                rowTouched = false;
            });
        }

        rowBg.on('pointerover', () => {
            rowBg.setFillStyle(0x00d4ff);
            rowBg.setAlpha(0.15);
        });
        rowBg.on('pointerout', () => {
            rowBg.setFillStyle(COLORS.uiBackground);
            rowBg.setAlpha(1);
        });
        // Reset hover highlight on touch release (pointerleave doesn't fire reliably on mobile)
        rowBg.on('pointerup', (e) => {
            if (e.pointerType === 'touch') {
                rowBg.setFillStyle(COLORS.uiBackground);
                rowBg.setAlpha(1);
            }
        });
    });

    // Create mask for scrolling (only if content exceeds visible area)
    if (totalHeight > visibleHeight) {
        const maskShape = this.make.graphics();
        maskShape.fillStyle(0xffffff);
        maskShape.fillRect(0, listStartY - rowHeight / 2, menuW, visibleHeight + rowHeight / 2);
        const mask = maskShape.createGeometryMask();
        this.scrollContainer.setMask(mask);
        this.scrollMaskGraphics = maskShape;

        // Add scroll indicator
        this.createScrollIndicator(menuW - 8, listStartY, visibleHeight, totalHeight);

        // Setup mouse wheel scrolling
        this.setupScrolling();
    }
};

// ============================================
// DATE FORMATTING
// ============================================

/**
 * Format a date as datetime string (e.g., "Jan 21, 2026 3:45 PM")
 */
MenuScene.prototype.formatDateTime = function(date) {
    const options = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };
    return date.toLocaleString(undefined, options);
};

// ============================================
// SCROLL INDICATOR
// ============================================

/**
 * Create a scroll indicator bar - neon terminal style
 */
MenuScene.prototype.createScrollIndicator = function(x, y, visibleHeight, totalHeight) {
    const trackHeight = visibleHeight - 20;
    const thumbHeight = Math.max(30, (visibleHeight / totalHeight) * trackHeight);

    // Track background - neon terminal style
    this.scrollTrack = this.add.rectangle(x, y + trackHeight / 2, 6, trackHeight, COLORS.uiBackground);
    this.scrollTrack.setStrokeStyle(1, 0x00d4ff44);
    this.loadGameElements.push(this.scrollTrack);

    // Thumb - neon terminal style
    this.scrollThumb = this.add.rectangle(x, y + thumbHeight / 2, 6, thumbHeight, 0x00d4ff);
    this.scrollThumb.setAlpha(0.6);
    this.loadGameElements.push(this.scrollThumb);

    this.scrollTrackY = y;
    this.scrollTrackHeight = trackHeight;
    this.scrollThumbHeight = thumbHeight;
};

/**
 * Update scroll indicator position
 */
MenuScene.prototype.updateScrollIndicator = function() {
    if (this.scrollThumb && this.maxScrollY > 0) {
        const scrollPercent = this.scrollY / this.maxScrollY;
        const thumbTravel = this.scrollTrackHeight - this.scrollThumbHeight;
        this.scrollThumb.y = this.scrollTrackY + this.scrollThumbHeight / 2 + (scrollPercent * thumbTravel);
    }
};

// ============================================
// SCROLLING CONTROLS
// ============================================

/**
 * Setup mouse wheel and touch scrolling
 */
MenuScene.prototype.setupScrolling = function() {
    // Mouse wheel scrolling
    this.scrollHandler = (pointer, gameObjects, deltaX, deltaY) => {
        if (this.scrollContainer && this.maxScrollY > 0) {
            this.scrollY = clamp(this.scrollY + deltaY * 0.5, 0, this.maxScrollY);
            this.scrollContainer.y = -this.scrollY;
            this.updateScrollIndicator();
        }
    };
    this.input.on('wheel', this.scrollHandler);

    // Touch drag scrolling for mobile
    this.isDragging = false;
    this.lastPointerY = 0;

    this.pointerDownHandler = (pointer) => {
        if (pointer.y >= this.listStartY && pointer.y <= this.listStartY + this.visibleHeight) {
            this.isDragging = true;
            this.lastPointerY = pointer.y;
            this.scrollDragDistance = 0;
        }
    };

    this.pointerMoveHandler = (pointer) => {
        if (this.isDragging && this.scrollContainer && this.maxScrollY > 0) {
            const deltaY = this.lastPointerY - pointer.y;
            this.scrollDragDistance = (this.scrollDragDistance || 0) + Math.abs(deltaY);
            this.scrollY = clamp(this.scrollY + deltaY, 0, this.maxScrollY);
            this.scrollContainer.y = -this.scrollY;
            this.lastPointerY = pointer.y;
            this.updateScrollIndicator();
        }
    };

    this.pointerUpHandler = () => {
        this.isDragging = false;
        // scrollDragDistance is checked by row pointerup handlers before this resets it,
        // so use a microtask delay to reset after the row handler fires
        Promise.resolve().then(() => { this.scrollDragDistance = 0; });
    };

    this.input.on('pointerdown', this.pointerDownHandler);
    this.input.on('pointermove', this.pointerMoveHandler);
    this.input.on('pointerup', this.pointerUpHandler);
};

/**
 * Cleanup scrolling event handlers
 */
MenuScene.prototype.cleanupScrolling = function() {
    if (this.scrollHandler) {
        this.input.off('wheel', this.scrollHandler);
        this.scrollHandler = null;
    }
    if (this.pointerDownHandler) {
        this.input.off('pointerdown', this.pointerDownHandler);
        this.pointerDownHandler = null;
    }
    if (this.pointerMoveHandler) {
        this.input.off('pointermove', this.pointerMoveHandler);
        this.pointerMoveHandler = null;
    }
    if (this.pointerUpHandler) {
        this.input.off('pointerup', this.pointerUpHandler);
        this.pointerUpHandler = null;
    }
    if (this.scrollMaskGraphics) {
        this.scrollMaskGraphics.destroy();
        this.scrollMaskGraphics = null;
    }
    this.scrollContainer = null;
    this.scrollThumb = null;
    this.scrollTrack = null;
};

// ============================================
// SAVE MANAGEMENT
// ============================================

/**
 * Load a saved game
 */
MenuScene.prototype.loadGame = async function(gameId) {
    // Update last-accessed time so it sorts to the top of the list
    await GameHistory.updateLastAccessed(gameId);

    const savedGame = await GameHistory.loadFromIndexedDB(gameId);
    if (savedGame) {
        this.cleanupScrolling();
        const sceneData = { savedGame: savedGame };
        // Restore scenario context if this was a campaign game
        if (savedGame.scenarioData) {
            sceneData.levelData = savedGame.scenarioData.levelData;
            sceneData.scenarioIndex = savedGame.scenarioData.scenarioIndex;
            sceneData.campaignSessionId = savedGame.scenarioData.campaignSessionId || null;
        }
        this.scene.start('GameScene', sceneData);
    }
};

/**
 * Continue an in-progress game
 */
MenuScene.prototype.continueGame = async function(gameId) {
    // Update last-accessed time so it sorts to the top of the list
    await GameHistory.updateLastAccessed(gameId);

    const savedGame = await GameHistory.loadFromIndexedDB(gameId);
    if (savedGame) {
        const sceneData = { savedGame: savedGame };
        // Restore scenario context if this was a campaign game
        if (savedGame.scenarioData) {
            sceneData.levelData = savedGame.scenarioData.levelData;
            sceneData.scenarioIndex = savedGame.scenarioData.scenarioIndex;
            sceneData.campaignSessionId = savedGame.scenarioData.campaignSessionId || null;
        }
        this.scene.start('GameScene', sceneData);
    }
};

/**
 * Delete a saved game
 */
MenuScene.prototype.deleteGame = async function(gameId) {
    await GameHistory.deleteSavedGame(gameId);
    // Refresh the load game menu
    this.cleanupScrolling();
    this.clearElements(this.loadGameElements);
    this.loadGameElements = [];
    this.showLoadGameMenu();
};

/**
 * Show dialog to rename a saved game
 */
MenuScene.prototype.showRenameDialog = async function(gameId) {
    const newName = prompt('Enter new name for the save:', gameId);
    if (newName && newName.trim() && newName !== gameId) {
        const success = await GameHistory.renameSavedGame(gameId, newName.trim());
        if (success) {
            // Refresh the load game menu
            this.cleanupScrolling();
            this.clearElements(this.loadGameElements);
            this.loadGameElements = [];
            this.showLoadGameMenu();
        } else {
            alert('Failed to rename. A save with that name may already exist.');
        }
    }
};
