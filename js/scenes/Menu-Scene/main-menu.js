// ============================================
// MENU SCENE - Main Menu Display
// ============================================

/**
 * Display the main menu with New Game, Continue, and Load Game options.
 * Uses a CSS flex column so elements flow naturally and compress when
 * the window is too short — no JS pixel math needed.
 */
MenuScene.prototype.showMainMenu = async function() {
    this._currentScreen = () => this.showMainMenu();
    this.showingMainMenu = true;
    this._stopNewGameAnimations();
    this.cleanupScrolling();
    this.clearElements(this.mainMenuElements);
    this.mainMenuElements = [];
    this.clearElements(this.newGameMenuElements);
    this.newGameMenuElements = [];
    this.clearElements(this.newGameElements);
    this.newGameElements = [];
    this.clearElements(this.loadGameElements);
    this.loadGameElements = [];
    this.clearElements(this.scenarioElements);
    this.scenarioElements = [];
    this.clearElements(this.singlePlayerMenuElements);
    this.singlePlayerMenuElements = [];
    if (this._colorInputEls) {
        this._colorInputEls.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
        this._colorInputEls = [];
    }

    const config = layoutConfig;
    const mobile = config.mobile;
    const touchScale = (config.isTouch && config.highDPI) ? 1.3 : 1;

    // Button dimensions
    const menuWidth = this._menuWidth || config.gameWidth;
    const idealBtnWidth = mobile ? Math.floor(180 * touchScale) : 200;
    const btnWidth = Math.min(idealBtnWidth, Math.floor(menuWidth * 0.7));
    const btnHeight = mobile ? Math.floor(45 * touchScale) : 55;
    const titleSize = `${Math.floor((mobile ? 36 : 56) * touchScale)}px`;
    const subtitleSize = `${Math.floor((mobile ? 16 : 22) * touchScale)}px`;

    // --- Flex container ---
    const flexDiv = document.createElement('div');
    flexDiv.style.display = 'flex';
    flexDiv.style.flexDirection = 'column';
    flexDiv.style.alignItems = 'center';
    flexDiv.style.justifyContent = 'center';
    flexDiv.style.height = '100%';
    flexDiv.style.gap = mobile ? '10px' : '16px';
    flexDiv.style.flexShrink = '1';
    flexDiv.style.minHeight = '0';
    flexDiv.style.padding = '10px 0';
    flexDiv.style.boxSizing = 'border-box';
    this.container.appendChild(flexDiv);
    this.mainMenuElements.push({
        destroy: () => { if (flexDiv.parentNode) flexDiv.parentNode.removeChild(flexDiv); }
    });

    // Helper: reparent a wrapper's DOM element into the flex container
    const addToFlex = (wrapper) => {
        const el = wrapper.el;
        flexDiv.appendChild(el);
        el.style.position = 'relative';
        el.style.left = '';
        el.style.top = '';
        el.style.transform = '';
        el.style.flexShrink = '0';
        return wrapper;
    };

    // Center X for elements created via the factory (they use absolute pos
    // internally; we clear that in addToFlex, but the factory needs coords)
    const cx = 0;
    const normalSubtitles = [
        'A CONQUEST OF TILES',
        'CONQUER THE SYSTEM',
        'BUILD YOUR EMPIRE',
        'GROW YOUR TERRITORY',
        'OBTAIN DIGITAL SUPREMACY',
        'A DIGITAL <a href="https://pixelsea.neocities.org/#se" target="_blank_">SEA OF PIXELS</a>'
    ];

    const rareSubtitles = [
        'ALL YOUR CITIES ARE BELONG TO US',
        '59 4F 55 52 20 4C 49 46 45 20 4D 41 54 54 45 52 53',
        'ARE YOU WINNING SON?',
        'E͙̺̯̗̿̅̑́R̭̥̗̔͛̀R̙̬̃̔0̢̛̖͍̱͌̒̄R̪̜̰̈́͆͝ 8̢̛̩͙̩̰̝̀͆͑̈́͐̌ͅ9̬͔̎̇̽͟:̻̠̣͍̮̍̌͆̓͝ ̜̼͉̥̣̔̿̏̓̈́S̲͍͐̂͝ͅY̠͐S̭̝͋̉T̨̉3M̛̪͖̈ ̢̬̝̦̦̌͛̅̾͞Į͍̦̱͎͖̟͇̅̉̑̍̆̽́͞N̨͎̩̩̦͒͐͐̓̕͝ͅS͕̥̰̺͉̐͛̋̇̄T̡͎̖̭̩̦͉̈͑̏̓̉͂͝Ą̩̯̤̰͇̌͛̓͒͗̕Ḃ̹̞̫̔͒͌ͅĮ̤̮̯̝͙̒͐̏͂̔͞L̥̱̬̣̥̭̓̄̒́̊̕I̛̛̯̼̯̳̞̗̙̪͌̂͛́̐͘T̥̙͖̉̐̿Y̧͉̹̙̟̗͊̆̍̍̇̿̂ͅ ̯̲̬͚̎̀͒̽D̗̥̻̜̤̟̆̐̒̍́͒̚ͅET̡̙͈͖͈̽̈̅́̈̿͢E̬̹͗̇Č̰͈̟́͢͞͡T̨̝̹̔̅̽È̞̪̝̍̒̓̇͢ͅD͖̉',
        'CONNECT 1200 | Host Name: SCGMIS | Password: *******'
    ];

    // Random subtitle selection
    const isRare = Math.random() < 0.10;
    const targetList = isRare ? rareSubtitles : normalSubtitles;
    const randomSubtitleText = targetList[Math.floor(Math.random() * targetList.length)];

    // Title
    const title = this.add.text(cx, 0, 'CHESSYCIV v1.1.1', {
        fontSize: titleSize,
        fontFamily: 'VT323, monospace',
        color: COLORS.textPrimary,
    });
    addToFlex(title);
    title.el.style.textAlign = 'center';
    this.mainMenuElements.push(title);

    // Subtitle
    const subtitle = this.add.text(cx, 0, randomSubtitleText, {
        fontSize: subtitleSize,
        fontFamily: 'VT323, monospace',
        color: COLORS.textSecondary
    });
    addToFlex(subtitle);
    subtitle.el.style.textAlign = 'center';
    // Extra gap between subtitle and first button
    subtitle.el.style.marginBottom = mobile ? '6px' : '14px';
    subtitle.el.innerHTML = randomSubtitleText;
    subtitle.el.style.pointerEvents = 'auto';
    this.mainMenuElements.push(subtitle);

    // New Game button
    const newGameBtn = this.createButton(cx, 0, 'New Game', () => {
        this.showNewGameMenu();
    }, btnWidth, btnHeight);
    addToFlex(newGameBtn);
    this.mainMenuElements.push(newGameBtn);

    // Continue Game button
    const { games: savedGames } = await GameHistory.listSavedGames();
    const continuableGame = savedGames.find(g => g.winner === null);

    const continueBtn = this.createButton(cx, 0, 'Continue Game', () => {
        this.continueGame(continuableGame.gameId);
    }, btnWidth, btnHeight);
    addToFlex(continueBtn);

    if (!continuableGame) {
        continueBtn.bg.setFillStyle(0x2a2a3a);
        continueBtn.bg.setAlpha(0.5);
        continueBtn.label.setAlpha(0.5);
        continueBtn.disableInteractive();
    }
    this.mainMenuElements.push(continueBtn);

    // Load Game button
    const loadGameBtn = this.createButton(cx, 0, 'Load Game', () => {
        this.showLoadGameMenu();
    }, btnWidth, btnHeight);
    addToFlex(loadGameBtn);

    if (savedGames.length === 0) {
        loadGameBtn.bg.setFillStyle(0x2a2a3a);
        loadGameBtn.bg.setAlpha(0.5);
        loadGameBtn.label.setAlpha(0.5);
        loadGameBtn.disableInteractive();
    }
    this.mainMenuElements.push(loadGameBtn);

    // Achievements button
    const achievementsBtn = this.createButton(cx, 0, 'Achievements', () => {
        this.showAchievements();
    }, btnWidth, btnHeight);
    addToFlex(achievementsBtn);
    this.mainMenuElements.push(achievementsBtn);

    // How to Play button
    const howToPlayBtn = this.createButton(cx, 0, 'How to Play', () => {
        this.showHowToPlay();
    }, btnWidth, btnHeight);
    addToFlex(howToPlayBtn);
    this.mainMenuElements.push(howToPlayBtn);

    // Flash the How to Play button twice for new users with no saves
    if (savedGames.length === 0) {
        const bgEl = howToPlayBtn.bg.el;
        bgEl.style.transition = 'box-shadow 0.3s ease-in-out';
        const glowOn = () => { bgEl.style.boxShadow = '0 0 12px 3px #00d4ff, inset 0 0 8px 1px rgba(0,212,255,0.3)'; };
        const glowOff = () => { bgEl.style.boxShadow = 'none'; };
        setTimeout(glowOn, 400);
        setTimeout(glowOff, 900);
        setTimeout(glowOn, 1200);
        setTimeout(glowOff, 1700);
    }

    // Get Help button (hidden permanently after any game is started)
    const showGetHelp = typeof uiController !== 'undefined' && !uiController.gameEverStarted;
    if (showGetHelp) {
        const getHelpBtn = this.createButton(cx, 0, 'Get Help', () => {
            uiController.handleHelpMenu();
        }, btnWidth, btnHeight);
        addToFlex(getHelpBtn);
        this.mainMenuElements.push(getHelpBtn);
    }
};
