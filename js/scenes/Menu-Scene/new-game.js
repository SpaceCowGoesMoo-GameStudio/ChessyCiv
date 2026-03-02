// ============================================
// MENU SCENE - New Game Options
// ============================================

/**
 * Display new game configuration options
 */
MenuScene.prototype.showNewGameOptions = function(mode, keepSettings) {
    this._currentScreen = () => this.showNewGameOptions(null, true);
    if (!keepSettings) {
        this._gameMode = mode || 'single';
        if (this._gameMode === 'hotseat') {
            this.humanPlayers = 2;
            this.aiPlayers = 0;
            this._aiOnlyMode = false;
        } else if (this._aiOnlyMode) {
            this.humanPlayers = 0;
            this.aiPlayers = 2;
        } else {
            this.humanPlayers = 1;
            this.aiPlayers = 1;
        }
    }
    const isHotSeat = this._gameMode === 'hotseat';

    this.showingMainMenu = false;
    this._stopNewGameAnimations();
    this.clearElements(this.newGameMenuElements);
    this.newGameMenuElements = [];
    this.clearElements(this.newGameElements);
    this.newGameElements = [];
    this.clearElements(this.mainMenuElements);
    this.mainMenuElements = [];
    this.clearElements(this.scenarioElements);
    this.scenarioElements = [];
    this.clearElements(this.singlePlayerMenuElements);
    this.singlePlayerMenuElements = [];

    const config = layoutConfig;
    const menuW = this._menuWidth || config.gameWidth;
    const centerX = menuW / 2;
    const mobile = config.mobile;

    // Scale factors for high-DPI touch devices
    const touchScale = (config.isTouch && config.highDPI) ? 1.3 : 1;
    const baseTitleSize = mobile ? 36 : 56;
    const baseLabelSize = mobile ? 18 : 22;

    const titleSize = `${Math.floor(baseTitleSize * touchScale)}px`;
    const labelSize = `${Math.floor(baseLabelSize * touchScale)}px`;
    const spacing = mobile ? (config.highDPI ? 0.85 : 0.7) : 1;

    let y = mobile ? Math.floor(40 * touchScale) : 80;

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
        if (this._gameMode === 'single') {
            this.showSinglePlayerMenu();
        } else {
            this.showNewGameMenu();
        }
    });
    this.container.appendChild(backBtnEl);
    const backBtn = { destroy: () => { if (backBtnEl.parentNode) backBtnEl.parentNode.removeChild(backBtnEl); } };
    this.newGameElements.push(backBtn);

    y += Math.floor(30 * spacing);

    // Button dimensions for number selectors
    const baseBtnSpacing = mobile ? 50 : 60;
    const btnSpacing = Math.floor(baseBtnSpacing * touchScale);
    const numBtnWidth = mobile ? Math.floor(40 * touchScale) : 50;
    const numBtnHeight = mobile ? Math.floor(32 * touchScale) : 38;

    // Human player count selection - only in hot seat mode
    this.humanButtons = [];
    if (isHotSeat) {
        const humanLabel = this.add.text(centerX, y, 'HUMAN PLAYERS:', {
            fontSize: labelSize,
            fontFamily: 'VT323, monospace',
            color: COLORS.textSecondary
        }).setOrigin(0.5);
        this.newGameElements.push(humanLabel);

        y += Math.floor(45 * spacing);

        for (let i = 2; i <= 4; i++) {
            const btnX = centerX + (i - 3) * btnSpacing;
            const btn = this.createButton(btnX, y, `${i}`, () => {
                this.setHumanPlayers(i);
            }, numBtnWidth, numBtnHeight);
            this.humanButtons.push({ btn, value: i });
            this.newGameElements.push(btn);
        }

        y += Math.max(Math.floor(55 * spacing * touchScale), numBtnHeight + 8);
    }

    // AI player count selection
    const minAI = isHotSeat ? 0 : (this._aiOnlyMode ? 2 : 1);
    const maxAI = isHotSeat ? 2 : (this._aiOnlyMode ? 4 : 3);
    const aiCenter = (minAI + maxAI) / 2;

    const aiLabel = this.add.text(centerX, y, 'AI PLAYERS:', {
        fontSize: labelSize,
        fontFamily: 'VT323, monospace',
        color: COLORS.textSecondary
    }).setOrigin(0.5);
    this.newGameElements.push(aiLabel);

    y += Math.floor(45 * spacing);

    this.aiButtons = [];
    for (let i = minAI; i <= maxAI; i++) {
        const btnX = centerX + (i - aiCenter) * btnSpacing;
        const btn = this.createButton(btnX, y, `${i}`, () => {
            this.setAIPlayers(i);
        }, numBtnWidth, numBtnHeight);
        this.aiButtons.push({ btn, value: i });
        this.newGameElements.push(btn);
    }

    // Update button states
    this.updateHumanButtons();
    this.updateAIButtons();

    y += Math.max(Math.floor(55 * spacing * touchScale), numBtnHeight + 8);

    // AI Only toggle - only in single player mode
    if (!isHotSeat) {
        const toggleLabel = this._aiOnlyMode ? 'DISABLE AI ONLY' : 'ENABLE AI ONLY';
        const toggleBtnWidth = mobile ? Math.floor(160 * touchScale) : 200;
        const toggleBtnHeight = mobile ? Math.floor(32 * touchScale) : 38;
        const aiOnlyBtn = this.createButton(centerX, y, toggleLabel, () => {
            this.toggleAIOnly();
        }, toggleBtnWidth, toggleBtnHeight);

        if (this._aiOnlyMode) {
            aiOnlyBtn.selected = true;
            aiOnlyBtn.bg.setFillStyle(0xaa4444);
            aiOnlyBtn.bg.setAlpha(0.35);
            aiOnlyBtn.bg.setStrokeStyle(2, 0xaa4444);
            aiOnlyBtn.label.setColor('#ff4444');
        }

        this.newGameElements.push(aiOnlyBtn);

        y += Math.max(Math.floor(55 * spacing * touchScale), toggleBtnHeight + 8);
    }

    // AI Difficulty selection - only show when there are AI players
    this.difficultyButtons = [];
    if (!isHotSeat || this.aiPlayers >= 1) {
        const difficultyLabel = this.add.text(centerX, y, 'AI DIFFICULTY:', {
            fontSize: labelSize,
            fontFamily: 'VT323, monospace',
            color: COLORS.textSecondary
        }).setOrigin(0.5);
        this.newGameElements.push(difficultyLabel);

        y += Math.floor(45 * spacing);

        const difficulties = [
            { key: AI_DIFFICULTY.EASY, label: 'Easy', color: 0x44aa44 },
            { key: AI_DIFFICULTY.MEDIUM, label: 'Medium', color: 0xaaaa44 },
            { key: AI_DIFFICULTY.HARD, label: 'Hard', color: 0xaa4444 }
        ];
        const diffBtnWidth = mobile ? Math.floor(70 * touchScale) : 90;
        const diffBtnHeight = mobile ? Math.floor(32 * touchScale) : 38;
        const diffBtnSpacing = mobile ? Math.floor(80 * touchScale) : 100;

        difficulties.forEach((diff, i) => {
            const btnX = centerX + (i - 1) * diffBtnSpacing;
            const btn = this.createButton(btnX, y, diff.label, () => {
                this.setDifficulty(diff.key);
            }, diffBtnWidth, diffBtnHeight);
            btn.difficultyKey = diff.key;
            btn.highlightColor = diff.color;
            this.difficultyButtons.push(btn);
            this.newGameElements.push(btn);
        });
        this.updateDifficultyButtons();

        y += Math.max(Math.floor(45 * spacing * touchScale), diffBtnHeight + 8);
    }

    // Random Start toggle
    const randomStartBtnWidth = mobile ? Math.floor(200 * touchScale) : 240;
    const randomStartBtnHeight = mobile ? Math.floor(32 * touchScale) : 38;
    const randomStartLabel = this.randomStart ? 'RANDOM START: ON' : 'RANDOM START: OFF';
    const randomStartBtn = this.createButton(centerX, y, randomStartLabel, () => {
        this.toggleRandomStart();
    }, randomStartBtnWidth, randomStartBtnHeight);

    if (this.randomStart) {
        randomStartBtn.selected = true;
        randomStartBtn.bg.setFillStyle(0x004488);
        randomStartBtn.bg.setAlpha(0.35);
        randomStartBtn.bg.setStrokeStyle(2, 0x00d4ff);
        randomStartBtn.label.setColor('#00d4ff');
    }
    this.newGameElements.push(randomStartBtn);

    y += Math.floor(55 * spacing * touchScale);

    // Color selection - neon terminal style
    const colorLabel = this.add.text(centerX, y, 'PLAYER COLORS:', {
        fontSize: labelSize,
        fontFamily: 'VT323, monospace',
        color: COLORS.textSecondary
    }).setOrigin(0.5);
    this.newGameElements.push(colorLabel);

    y += Math.floor(40 * spacing);

    // Player color grid - 2x2 layout with native <input type="color"> pickers
    // P1 at [0][0] (top-left), P2 at [0][1] (top-right)
    // P3 at [1][0] (bottom-left), P4 at [1][1] (bottom-right)
    this.playerColorEntries = [];
    // Clean up any previous native color inputs
    if (this._colorInputEls) {
        this._colorInputEls.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
    }
    this._colorInputEls = [];

    const gridSpacingX = mobile ? Math.floor(90 * touchScale) : 110;
    const gridSpacingY = mobile ? Math.floor(35 * touchScale) : 45;
    const inputSize = mobile ? Math.floor(28 * touchScale) : 32;
    const playerLabelSize = mobile ? `${Math.floor(16 * touchScale)}px` : '18px';

    const gridPositions = [
        { row: 0, col: 0, slot: 0, label: 'P1' }, // top-left
        { row: 0, col: 1, slot: 1, label: 'P2' }, // top-right
        { row: 1, col: 0, slot: 2, label: 'P3' }, // bottom-left
        { row: 1, col: 1, slot: 3, label: 'P4' }  // bottom-right
    ];

    gridPositions.forEach(({ row, col, slot, label }) => {
        const entryX = centerX + (col - 0.5) * gridSpacingX;
        const entryY = y + row * gridSpacingY;

        // Player label
        const playerLabel = this.add.text(col === 0 ? (entryX - 25) : entryX + 25, entryY, label, {
            fontSize: playerLabelSize,
            fontFamily: 'VT323, monospace',
            color: COLORS.textPrimary
        }).setOrigin(0.5);
        this.newGameElements.push(playerLabel);

        // Native color input
        const inputEl = document.createElement('input');
        inputEl.type = 'color';
        inputEl.value = this.playerColors[slot].css;
        inputEl.style.position = 'absolute';
        const inputX = col === 0 ? (entryX + 15) : (entryX - 15);
        inputEl.style.left = (inputX - inputSize / 2) + 'px';
        inputEl.style.top = (entryY - inputSize / 2) + 'px';
        inputEl.style.width = inputSize + 'px';
        inputEl.style.height = inputSize + 'px';
        inputEl.style.border = '2px solid #00d4ff';
        inputEl.style.borderRadius = '50%';
        inputEl.style.cursor = 'pointer';
        inputEl.style.padding = '0';
        inputEl.style.backgroundColor = 'transparent';
        inputEl.style.overflow = 'hidden';
        // Webkit-specific: hide the default swatch border
        inputEl.style.WebkitAppearance = 'none';
        inputEl.style.MozAppearance = 'none';
        inputEl.dataset.slot = slot;

        inputEl.addEventListener('input', (e) => {
            this.onPlayerColorChange(slot, e.target.value);
        });

        this.container.appendChild(inputEl);
        this._colorInputEls.push(inputEl);

        this.playerColorEntries.push({ slot, label: playerLabel, inputEl });
    });

    y += Math.floor(gridSpacingY * 2 + 20 * spacing * touchScale);

    // Play button - larger for touch
    const playBtnWidth = mobile ? Math.floor(120 * touchScale) : 150;
    const playBtnHeight = mobile ? Math.floor(40 * touchScale) : 50;
    const playBtn = this.createButton(centerX, y, 'PLAY', () => {
        this.startGame();
    }, playBtnWidth, playBtnHeight);
    this.newGameElements.push(playBtn);
};

// ============================================
// PLAYER COUNT MANAGEMENT
// ============================================

/**
 * Set number of human players and auto-adjust AI count if needed
 */
MenuScene.prototype.setHumanPlayers = function(count) {
    const prevAI = this.aiPlayers;
    this.humanPlayers = count;
    const total = this.humanPlayers + this.aiPlayers;

    if (total > 4) {
        this.aiPlayers = 4 - this.humanPlayers;
    } else if (total < 2) {
        this.aiPlayers = 2 - this.humanPlayers;
    }

    // Rebuild in hot seat when AI visibility changes
    if (this._gameMode === 'hotseat' && (prevAI >= 1) !== (this.aiPlayers >= 1)) {
        this.showNewGameOptions(null, true);
        return;
    }

    this.updateHumanButtons();
    this.updateAIButtons();
};

/**
 * Set number of AI players and auto-adjust human count if needed
 */
MenuScene.prototype.setAIPlayers = function(count) {
    const prevAI = this.aiPlayers;
    this.aiPlayers = count;
    const total = this.humanPlayers + this.aiPlayers;

    if (total > 4) {
        this.humanPlayers = 4 - this.aiPlayers;
    } else if (total < 2) {
        this.humanPlayers = 2 - this.aiPlayers;
    }

    // Rebuild in hot seat when AI visibility changes
    if (this._gameMode === 'hotseat' && (prevAI >= 1) !== (this.aiPlayers >= 1)) {
        this.showNewGameOptions(null, true);
        return;
    }

    this.updateHumanButtons();
    this.updateAIButtons();
};

/**
 * Toggle AI-only mode in single player (spectator mode)
 */
MenuScene.prototype.toggleAIOnly = function() {
    this._aiOnlyMode = !this._aiOnlyMode;
    if (this._aiOnlyMode) {
        this.humanPlayers = 0;
        this.aiPlayers = 2;
    } else {
        this.humanPlayers = 1;
        this.aiPlayers = 1;
    }
    this.showNewGameOptions(null, true);
};

/**
 * Toggle random start positions on/off
 */
MenuScene.prototype.toggleRandomStart = function() {
    this.randomStart = !this.randomStart;
    this.showNewGameOptions(null, true);
};

MenuScene.prototype.updateHumanButtons = function() {
    this.humanButtons.forEach(({ btn, value }) => {
        if (value === this.humanPlayers) {
            btn.selected = true;
            btn.bg.setFillStyle(0x00ff88);
            btn.bg.setAlpha(0.25);
            btn.bg.setStrokeStyle(1, 0x00ff88);
            btn.label.setColor(COLORS.accentGreen);
        } else {
            btn.selected = false;
            btn.bg.setFillStyle(COLORS.buttonBg);
            btn.bg.setAlpha(1);
            btn.bg.setStrokeStyle(1, COLORS.buttonBorder);
            btn.label.setColor(COLORS.textPrimary);
        }
    });
};

MenuScene.prototype.updateAIButtons = function() {
    this.aiButtons.forEach(({ btn, value }) => {
        if (value === this.aiPlayers) {
            btn.selected = true;
            btn.bg.setFillStyle(0x00ff88);
            btn.bg.setAlpha(0.25);
            btn.bg.setStrokeStyle(1, 0x00ff88);
            btn.label.setColor(COLORS.accentGreen);
        } else {
            btn.selected = false;
            btn.bg.setFillStyle(COLORS.buttonBg);
            btn.bg.setAlpha(1);
            btn.bg.setStrokeStyle(1, COLORS.buttonBorder);
            btn.label.setColor(COLORS.textPrimary);
        }
    });
};

// ============================================
// DIFFICULTY MANAGEMENT
// ============================================

MenuScene.prototype.setDifficulty = function(difficulty) {
    this.selectedDifficulty = difficulty;
    this.updateDifficultyButtons();
};

MenuScene.prototype.updateDifficultyButtons = function() {
    if (!this.difficultyButtons) return;

    this.difficultyButtons.forEach(btn => {
        if (btn.difficultyKey === this.selectedDifficulty) {
            btn.selected = true;
            btn.bg.setFillStyle(btn.highlightColor);
            btn.bg.setAlpha(0.35);
            btn.bg.setStrokeStyle(2, btn.highlightColor);
            btn.label.setColor('#ffffff');
        } else {
            btn.selected = false;
            btn.bg.setFillStyle(COLORS.buttonBg);
            btn.bg.setAlpha(1);
            btn.bg.setStrokeStyle(1, COLORS.buttonBorder);
            btn.label.setColor(COLORS.textPrimary);
        }
    });
};

// ============================================
// COLOR SELECTION
// ============================================

/**
 * Handle a player picking a new color via the native color input.
 * Generates complementary colors for all other active player slots.
 */
MenuScene.prototype.onPlayerColorChange = function(slot, cssHex) {
    const totalPlayers = this.humanPlayers + this.aiPlayers;
    const complementary = generateComplementaryColors(cssHex, totalPlayers);

    // The picked player keeps their exact chosen color at their slot position.
    // Other active slots get the remaining generated colors.
    let genIndex = 0;
    for (let i = 0; i < 4; i++) {
        if (i < totalPlayers) {
            if (i === slot) {
                this.playerColors[i] = complementary[0]; // exact picked color
            } else {
                genIndex++;
                this.playerColors[i] = complementary[genIndex];
            }
        }
    }

    this.updatePlayerColorInputs();
};

/**
 * Sync all native <input type="color"> values from this.playerColors.
 */
MenuScene.prototype.updatePlayerColorInputs = function() {
    if (!this._colorInputEls) return;
    this._colorInputEls.forEach(el => {
        const slot = parseInt(el.dataset.slot, 10);
        if (this.playerColors[slot]) {
            el.value = this.playerColors[slot].css;
        }
    });
};

// ============================================
// START GAME
// ============================================

MenuScene.prototype.startGame = async function() {
    if (this._startingGame) return;
    this._startingGame = true;
    try {
        const { count } = await GameHistory.listSavedGames();
        const savesFull = count >= GameHistory.MAX_SAVES;
        if (savesFull) {
            await this._showSaveFullToast();
        }

        const totalPlayers = this.humanPlayers + this.aiPlayers;
        const playerConfigs = [];

        // Players use their assigned colors from the grid
        // Human players first, then AI players
        let playerSlot = 0;

        // Human players
        for (let i = 0; i < this.humanPlayers; i++) {
            playerConfigs.push({
                color: this.playerColors[playerSlot],
                isAI: false
            });
            playerSlot++;
        }

        // AI players
        for (let i = 0; i < this.aiPlayers; i++) {
            playerConfigs.push({
                color: this.playerColors[playerSlot],
                isAI: true,
                aiDifficulty: this.selectedDifficulty
            });
            playerSlot++;
        }

        return this.scene.start('GameScene', { playerConfigs, randomStart: this.randomStart, disableSaving: savesFull });
    } finally {
        this._startingGame = false;
    }
};

/**
 * Show a blocking full-screen toast when saves are full.
 * Displays an error message with a 5-second countdown before the game starts.
 * Returns a Promise that resolves once the countdown expires.
 */
MenuScene.prototype._showSaveFullToast = function() {
    return new Promise(function(resolve) {
        var overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;top:0;left:0;width:100%;height:100%;' +
            'display:flex;align-items:center;justify-content:center;' +
            'background:rgba(0,0,0,0.78);z-index:9998;opacity:0;' +
            'transition:opacity 0.2s ease;font-family:"VT323",monospace;';

        var toast = document.createElement('div');
        toast.style.cssText =
            'background:#160808;border:2px solid #ff4444;padding:32px 40px;' +
            'max-width:420px;width:90%;text-align:center;box-sizing:border-box;' +
            'box-shadow:0 0 24px rgba(255,68,68,0.45),inset 0 0 18px rgba(255,68,68,0.06);';

        var header = document.createElement('div');
        header.style.cssText =
            'color:#ff4444;font-size:32px;margin-bottom:14px;letter-spacing:0.1em;' +
            'text-shadow:0 0 12px rgba(255,68,68,0.7);';
        header.textContent = '\u26a0 SAVES FULL';

        var msg = document.createElement('div');
        msg.style.cssText = 'color:#cccccc;font-size:20px;line-height:1.4;margin-bottom:18px;';
        msg.textContent = 'Delete saves in the Load Game menu to save your progress on new games.';

        var countdown = document.createElement('div');
        countdown.style.cssText =
            'color:#00d4ff;font-size:24px;text-shadow:0 0 8px rgba(0,212,255,0.6);';
        countdown.textContent = 'Starting in 5...';

        toast.appendChild(header);
        toast.appendChild(msg);
        toast.appendChild(countdown);
        overlay.appendChild(toast);
        document.body.appendChild(overlay);

        requestAnimationFrame(function() { overlay.style.opacity = '1'; });

        var secondsLeft = 5;
        var tick = function() {
            secondsLeft--;
            if (secondsLeft > 0) {
                countdown.textContent = 'Starting in ' + secondsLeft + '...';
                setTimeout(tick, 1000);
            } else {
                countdown.textContent = 'Starting now...';
                overlay.style.opacity = '0';
                setTimeout(function() {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    resolve();
                }, 250);
            }
        };
        setTimeout(tick, 1000);
    });
};
