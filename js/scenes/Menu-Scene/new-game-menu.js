// ============================================
// MENU SCENE - New Game Sub-Menu
// ============================================
// Layout and navigation for the New Game mode selection screen.
// Animation rendering is separated into new-game-animations.js.

/**
 * Display the New Game sub-menu with animated Single Player and Hot Seat buttons.
 */
MenuScene.prototype.showNewGameMenu = function() {
    this._currentScreen = () => this.showNewGameMenu();
    this._stopNewGameAnimations();
    this.showingMainMenu = false;
    this.cleanupScrolling();
    this.clearElements(this.mainMenuElements);
    this.mainMenuElements = [];
    this.clearElements(this.newGameElements);
    this.newGameElements = [];
    this.clearElements(this.newGameMenuElements);
    this.newGameMenuElements = [];
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
    const menuW = this._menuWidth || config.gameWidth;
    const centerX = menuW / 2;
    const mobile = config.mobile;
    const touchScale = (config.isTouch && config.highDPI) ? 1.3 : 1;
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
        this.showMainMenu();
    });
    this.container.appendChild(backBtnEl);
    const backBtn = { destroy: () => { if (backBtnEl.parentNode) backBtnEl.parentNode.removeChild(backBtnEl); } };
    this.newGameMenuElements.push(backBtn);

    // Title
    const titleSize = `${Math.floor((mobile ? 36 : 48) * touchScale)}px`;
    const title = this.add.text(centerX, y + (mobile ? 25 : 10), 'NEW GAME', {
        fontSize: titleSize,
        fontFamily: 'VT323, monospace',
        color: COLORS.textPrimary,
    }).setOrigin(0.5);
    this.newGameMenuElements.push(title);

    y += Math.floor(70 * spacing);

    // Two large square animated buttons
    const boxSize = mobile ? Math.floor(120 * touchScale) : Math.min(260, Math.floor(menuW * 0.27));
    const gap = mobile ? Math.floor(20 * touchScale) : Math.floor(boxSize * 0.18);
    const leftX = centerX - gap / 2 - boxSize / 2;
    const rightX = centerX + gap / 2 + boxSize / 2;
    const boxCenterY = y + boxSize / 2;

    this._createAnimatedButton(leftX, boxCenterY, boxSize, 'single', 'SINGLE PLAYER');
    this._createAnimatedButton(rightX, boxCenterY, boxSize, 'hotseat', 'HOT SEAT');

    this._startNewGameAnimations();
};

/**
 * Create an animated button for the New Game sub-menu.
 * On mobile, tries a pre-recorded <video> first for performance,
 * falling back to canvas if WebM is unsupported or autoplay fails.
 * Desktop always uses the live canvas animation.
 *
 * A wrapper div holds the position, border, and pointer events so that
 * the inner element (canvas or video) can be swapped on fallback without
 * re-attaching listeners.
 */
MenuScene.prototype._createAnimatedButton = function(cx, cy, size, mode, label) {
    var config = layoutConfig;
    var mobile = config.mobile;
    var touchScale = (config.isTouch && config.highDPI) ? 1.3 : 1;
    var self = this;

    // Positioned wrapper receives all pointer events
    var wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = (cx - size / 2) + 'px';
    wrapper.style.top = (cy - size / 2) + 'px';
    wrapper.style.width = size + 'px';
    wrapper.style.height = size + 'px';
    wrapper.style.border = '1px solid #00d4ff';
    wrapper.style.cursor = 'pointer';
    wrapper.style.boxSizing = 'border-box';
    wrapper.style.transition = 'box-shadow 0.2s ease';
    wrapper.style.overflow = 'hidden';
    this.container.appendChild(wrapper);

    // Try pre-recorded video, fall back to live canvas rendering
    var video = this._createVideoButton(wrapper, size, mode);
    if (video) {
        video.play().catch(function() {
            // Remove failed video
            if (video.parentNode) video.parentNode.removeChild(video);
            if (self._animVideos) {
                var idx = self._animVideos.indexOf(video);
                if (idx !== -1) self._animVideos.splice(idx, 1);
            }
            // Fall back to canvas
            self._createCanvasButton(wrapper, size, mode);
            self._startNewGameAnimations();
        });
    } else {
        this._createCanvasButton(wrapper, size, mode);
    }

    // Hover glow on wrapper
    wrapper.addEventListener('pointerenter', function() {
        wrapper.style.boxShadow = '0 0 18px rgba(0,212,255,0.5), inset 0 0 12px rgba(0,212,255,0.15)';
    });
    wrapper.addEventListener('pointerleave', function() {
        wrapper.style.boxShadow = 'none';
    });
    wrapper.addEventListener('pointerup', function(e) {
        if (e.pointerType === 'touch') {
            wrapper.style.boxShadow = 'none';
        }
    });

    // Click navigates to game options (single player shows sub-menu first)
    wrapper.addEventListener('pointerdown', function() {
        if (typeof soundManager !== 'undefined') {
            soundManager.resumeContext();
            soundManager.playImmediate('sound/interface/click.mp3', 100);
        }
        self._stopNewGameAnimations();
        if (mode === 'single') {
            self.showSinglePlayerMenu();
        } else {
            self.showNewGameOptions(mode);
        }
    });

    // Wrapper for element cleanup
    this.newGameMenuElements.push({
        el: wrapper,
        destroy: function() { if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper); }
    });

    // Label below button
    var labelSize = Math.floor((mobile ? 14 : 18) * touchScale) + 'px';
    var labelText = this.add.text(cx, cy + size / 2 + Math.floor(20 * touchScale), label, {
        fontSize: labelSize,
        fontFamily: 'VT323, monospace',
        color: COLORS.textPrimary
    }).setOrigin(0.5);
    this.newGameMenuElements.push(labelText);
};

/**
 * Create a live-rendered canvas inside the given wrapper. Returns the canvas.
 */
MenuScene.prototype._createCanvasButton = function(wrapper, size, mode) {
    var dpr = window.devicePixelRatio || 1;
    var canvas = document.createElement('canvas');
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    wrapper.appendChild(canvas);

    // Track for animation loop
    if (!this._animCanvases) this._animCanvases = [];
    this._animCanvases.push({ canvas: canvas, ctx: ctx, mode: mode, size: size });

    return canvas;
};

/**
 * Pre-create video elements during the loading screen so the browser's
 * video decoder is already initialized and frames are decoded by the time
 * the user opens the New Game menu. Videos play off-screen in a hidden
 * holder and are reparented into the visible wrapper on demand.
 */
MenuScene.prototype._prewarmVideos = function() {
    var cache = this._videoCache || {};
    if (!cache.single && !cache.hotseat) return;

    // Hidden holder keeps videos in the DOM and decoding
    if (!this._videoHolder) {
        var holder = document.createElement('div');
        holder.style.position = 'fixed';
        holder.style.left = '-9999px';
        holder.style.top = '-9999px';
        holder.style.width = '1px';
        holder.style.height = '1px';
        holder.style.overflow = 'hidden';
        holder.style.opacity = '0';
        holder.style.pointerEvents = 'none';
        document.body.appendChild(holder);
        this._videoHolder = holder;
    }

    if (!this._prewarmedVideos) this._prewarmedVideos = {};

    var modes = ['single', 'hotseat'];
    for (var i = 0; i < modes.length; i++) {
        var key = modes[i];
        if (cache[key] && !this._prewarmedVideos[key]) {
            var video = document.createElement('video');
            video.src = cache[key];
            video.loop = true;
            video.muted = true;
            video.autoplay = true;
            video.playsInline = true;
            video.setAttribute('playsinline', '');
            video.dataset.animMode = key;
            video.style.width = '1px';
            video.style.height = '1px';
            this._videoHolder.appendChild(video);
            video.play().catch(function() {});
            this._prewarmedVideos[key] = video;
        }
    }
};

/**
 * Get a video element for the given mode. Prefers a pre-warmed element
 * (already decoded and playing) for instant display. Falls back to creating
 * a new element from the blob cache or file path. Returns null if WebM
 * is unsupported.
 */
MenuScene.prototype._createVideoButton = function(wrapper, size, mode) {
    var key = mode === 'single' ? 'single' : 'hotseat';

    // Grab the pre-warmed video if available (already playing, decoder warm)
    var prewarmed = this._prewarmedVideos && this._prewarmedVideos[key];
    if (prewarmed) {
        delete this._prewarmedVideos[key];
        // Restyle from hidden 1px to fill the wrapper
        prewarmed.style.width = '100%';
        prewarmed.style.height = '100%';
        prewarmed.style.display = 'block';
        prewarmed.style.objectFit = 'cover';
        prewarmed.style.background = '#0a0a14';
        wrapper.appendChild(prewarmed);

        if (!this._animVideos) this._animVideos = [];
        this._animVideos.push(prewarmed);
        return prewarmed;
    }

    // No pre-warmed video — create a fresh one
    var video = document.createElement('video');
    if (!video.canPlayType || !video.canPlayType('video/webm')) {
        return null;
    }

    var cache = this._videoCache || {};
    if (cache[key]) {
        video.src = cache[key];
    } else {
        var filename = mode === 'single' ? 'single-anim.webm' : 'hotseat-anim.webm';
        video.src = 'videos/' + filename;
    }

    video.loop = true;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.dataset.animMode = key;

    video.style.width = '100%';
    video.style.height = '100%';
    video.style.display = 'block';
    video.style.objectFit = 'cover';
    video.style.background = '#0a0a14';

    wrapper.appendChild(video);

    if (!this._animVideos) this._animVideos = [];
    this._animVideos.push(video);

    return video;
};

// ============================================
// SINGLE PLAYER SUB-MENU (Skirmish / Scenario)
// ============================================

/**
 * Display intermediate Single Player menu with Skirmish and Scenario choices.
 */
MenuScene.prototype.showSinglePlayerMenu = function() {
    this._currentScreen = () => this.showSinglePlayerMenu();
    this._stopNewGameAnimations();
    this.showingMainMenu = false;
    this.cleanupScrolling();
    if (this._removeCampaignOverlay) this._removeCampaignOverlay();
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
    const menuW = this._menuWidth || config.gameWidth;
    const centerX = menuW / 2;
    const mobile = config.mobile;
    const touchScale = (config.isTouch && config.highDPI) ? 1.3 : 1;
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
        this.showNewGameMenu();
    });
    this.container.appendChild(backBtnEl);
    const backBtn = { destroy: () => { if (backBtnEl.parentNode) backBtnEl.parentNode.removeChild(backBtnEl); } };
    this.singlePlayerMenuElements.push(backBtn);

    // Title
    const titleSize = `${Math.floor((mobile ? 36 : 48) * touchScale)}px`;
    const title = this.add.text(centerX, y + (mobile ? 25 : 10), 'SINGLE PLAYER', {
        fontSize: titleSize,
        fontFamily: 'VT323, monospace',
        color: COLORS.textPrimary
    }).setOrigin(0.5);
    this.singlePlayerMenuElements.push(title);

    y += Math.floor(100 * spacing);

    // Two buttons: Skirmish and Scenario
    const btnWidth = mobile ? Math.floor(180 * touchScale) : 200;
    const btnHeight = mobile ? Math.floor(45 * touchScale) : 55;
    const btnSpacingY = Math.floor(70 * spacing * (config.highDPI ? 1.1 : 1));

    const skirmishBtn = this.createButton(centerX, y, 'Skirmish', () => {
        this.showNewGameOptions('single');
    }, btnWidth, btnHeight);
    this.singlePlayerMenuElements.push(skirmishBtn);

    y += btnSpacingY;

    const scenarioBtn = this.createButton(centerX, y, 'Campaign', () => {
        this.showScenarioList();
    }, btnWidth, btnHeight);
    this.singlePlayerMenuElements.push(scenarioBtn);
};
