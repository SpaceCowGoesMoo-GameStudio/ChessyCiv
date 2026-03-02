// ============================================
// MENU SCENE - Scenario Level List
// ============================================

/**
 * Display the scenario level selection screen.
 * Fetches levels/manifest.json, loads each level's metadata,
 * and shows a scrollable grid with unlock progress.
 * Uses a DOM overlay matching the achievements panel style.
 */
MenuScene.prototype.showScenarioList = async function() {
    this.showingMainMenu = false;
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
    this.clearElements(this.singlePlayerMenuElements);
    this.singlePlayerMenuElements = [];
    this.clearElements(this.scenarioElements);
    this.scenarioElements = [];
    if (this._colorInputEls) {
        this._colorInputEls.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
        this._colorInputEls = [];
    }

    // Remove any previous campaign overlay
    this._removeCampaignOverlay();

    var highestUnlocked = await this._getScenarioProgress();
    var self = this;

    // ── Full-screen overlay (matches achievements panel) ──
    var overlay = document.createElement('div');
    overlay.id = 'campaign-panel-overlay';
    overlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:linear-gradient(180deg, #0a0a14 0%, #1a1a2e 100%);' +
        'z-index:3000;display:flex;font-family:"VT323",monospace;' +
        'flex-direction:column;overflow:hidden;font-size:16px;';

    // ── Header bar ──────────────────────────────────────
    var headerBar = document.createElement('div');
    headerBar.className = 'achievements-header';
    headerBar.style.cssText =
        'flex-shrink:0;display:flex;align-items:center;justify-content:space-between;' +
        'padding:0.75em 1.25em;background:#0a0a14;border-bottom:1px solid rgba(0,212,255,0.3);';

    var backBtn = document.createElement('button');
    backBtn.className = 'achievements-back-btn';
    backBtn.style.cssText =
        'font-family:"VT323",monospace;font-size:1.125em;padding:0.5em 0.75em;' +
        'background:transparent;border:1px solid #00d4ff;color:#00d4ff;' +
        'cursor:pointer;text-transform:uppercase;letter-spacing:0.06em;';
    backBtn.textContent = '\u2190 BACK';
    backBtn.addEventListener('click', function() {
        self._removeCampaignOverlay();
        self.showSinglePlayerMenu();
    });
    headerBar.appendChild(backBtn);

    var title = document.createElement('div');
    title.className = 'achievements-title';
    title.style.cssText =
        'font-size:1.75em;color:#ffc800;text-shadow:0 0 0.6em rgba(255,200,0,0.4);' +
        'text-transform:uppercase;letter-spacing:0.19em;';
    title.textContent = 'CAMPAIGN';
    headerBar.appendChild(title);

    var progressEl = document.createElement('div');
    progressEl.className = 'achievements-progress';
    progressEl.style.cssText =
        'font-size:1em;color:rgba(255,255,255,0.6);letter-spacing:0.06em;';
    headerBar.appendChild(progressEl);

    overlay.appendChild(headerBar);

    // ── 8-bit bordered container ────────────────────────
    var container = document.createElement('div');
    container.style.cssText =
        'flex:1;margin:1em;overflow:hidden;position:relative;' +
        'border:0.25em solid #00d4ff;' +
        'box-shadow:inset 0 0 0 0.125em #0088aa, 0 0 0.75em rgba(0,212,255,0.3);' +
        'background:rgba(0,0,0,0.4);image-rendering:pixelated;';

    // Inner pixel border for 8-bit feel
    var innerBorder = document.createElement('div');
    innerBorder.style.cssText =
        'position:absolute;top:0.125em;left:0.125em;right:0.125em;bottom:0.125em;' +
        'border:0.125em solid #005577;pointer-events:none;z-index:1;';
    container.appendChild(innerBorder);

    // Corner decorations (8-bit style)
    var corners = ['top:0;left:0;', 'top:0;right:0;', 'bottom:0;left:0;', 'bottom:0;right:0;'];
    for (var ci = 0; ci < corners.length; ci++) {
        var corner = document.createElement('div');
        corner.style.cssText =
            'position:absolute;' + corners[ci] +
            'width:0.5em;height:0.5em;background:#00d4ff;z-index:2;';
        container.appendChild(corner);
    }

    // Scrollable card area
    var scrollArea = document.createElement('div');
    scrollArea.style.cssText =
        'position:absolute;top:0.375em;left:0.375em;right:0.375em;bottom:0.375em;' +
        'overflow-y:auto;overflow-x:hidden;' +
        'padding:0.75em;-webkit-overflow-scrolling:touch;';

    // CSS grid — responsive columns
    var grid = document.createElement('div');
    var isMobile = window.innerWidth < 768;
    grid.style.cssText =
        'display:grid;' +
        (isMobile ? 'grid-template-columns:repeat(2, 1fr);' : 'grid-template-columns:repeat(auto-fill, minmax(17em, 1fr));') +
        'gap:0.625em;justify-items:center;';

    scrollArea.appendChild(grid);
    container.appendChild(scrollArea);
    overlay.appendChild(container);

    document.body.appendChild(overlay);
    this._campaignOverlay = overlay;

    // Guard against ghost clicks from the touch that opened this panel.
    // On mobile, the browser fires a delayed click (~300ms) at the original
    // touch coordinates after the Campaign button is removed, which can
    // land on a card and immediately start a level.
    this._campaignReadyTime = Date.now() + 400;
    grid.style.pointerEvents = 'none';
    setTimeout(function() { grid.style.pointerEvents = ''; }, 400);

    // ── Fetch manifest + level metadata (sessionStorage-cached per version) ──
    // The cache key includes the project version hash stamped into <script>
    // src URLs, so it is automatically invalidated whenever a new deploy is
    // detected and a hard reload has been performed.
    var _vScript = document.querySelector('script[src*="?v="]');
    var _vMatch  = _vScript && _vScript.src.match(/[?&]v=([a-f0-9]{16,64})/);
    var _levelCacheKey = 'civchess_levels_' + (_vMatch ? _vMatch[1] : 'default');

    var manifest, levels;

    var _cached = null;
    try {
        var _raw = sessionStorage.getItem(_levelCacheKey);
        if (_raw) _cached = JSON.parse(_raw);
    } catch (e) { /* sessionStorage unavailable — proceed with fetch */ }

    if (_cached && _cached.manifest && _cached.levels) {
        manifest = _cached.manifest;
        levels   = _cached.levels;
    } else {
        // ── Fetch manifest ────────────────────────────────
        try {
            var resp = await fetch('levels/manifest.json', { cache: 'no-cache' });
            manifest = await resp.json();
        } catch (e) {
            var errorEl = document.createElement('div');
            errorEl.style.cssText =
                'color:#ff4444;font-size:1.25em;text-align:center;width:100%;padding:2.5em;grid-column:1/-1;';
            errorEl.textContent = 'FAILED TO LOAD CAMPAIGN';
            grid.appendChild(errorEl);
            return;
        }

        // ── Fetch all level metadata in parallel ──────────
        levels = await Promise.all(manifest.map(async function(filename) {
            try {
                var r = await fetch('levels/' + filename, { cache: 'no-cache' });
                return await r.json();
            } catch (e) {
                return null;
            }
        }));

        // Store in sessionStorage so subsequent opens in this session are free.
        try {
            sessionStorage.setItem(_levelCacheKey, JSON.stringify({ manifest: manifest, levels: levels }));
        } catch (e) { /* quota exceeded or unavailable — not fatal */ }
    }

    if (!manifest || manifest.length === 0) {
        var emptyEl = document.createElement('div');
        emptyEl.style.cssText =
            'color:rgba(255,255,255,0.3);font-size:1.25em;text-align:center;' +
            'width:100%;padding:2.5em;grid-column:1/-1;';
        emptyEl.textContent = 'NO LEVELS AVAILABLE';
        grid.appendChild(emptyEl);
        return;
    }

    // Update progress text
    var completedCount = Math.max(0, highestUnlocked);
    progressEl.textContent = completedCount + ' / ' + levels.length + ' COMPLETED';

    // ── Build cards ──────────────────────────────────────
    levels.forEach(function(level, index) {
        var isUnlocked = index <= highestUnlocked;
        var isCompleted = index < highestUnlocked;
        var card = self._createCampaignCard(level, index, isUnlocked, isCompleted);
        grid.appendChild(card);
    });

    // Equalize card heights to the tallest card
    if (levels.length > 0) {
        requestAnimationFrame(function() {
            var cards = grid.children;
            var maxH = 0;
            for (var i = 0; i < cards.length; i++) {
                if (cards[i].offsetHeight > maxH) maxH = cards[i].offsetHeight;
            }
            if (maxH > 0) {
                for (var i = 0; i < cards.length; i++) {
                    cards[i].style.height = maxH + 'px';
                }
            }
        });
    }
};

// ============================================
// Create a single campaign level card
// ============================================

MenuScene.prototype._createCampaignCard = function(level, index, isUnlocked, isCompleted) {
    var card = document.createElement('div');
    var isMobile = window.innerWidth < 768;
    var self = this;

    card.style.cssText =
        'position:relative;width:100%;' +
        (isMobile ? 'min-height:7.5em;' : 'aspect-ratio:4/3;') +
        'overflow:hidden;font-family:"VT323",monospace;' +
        'image-rendering:pixelated;box-sizing:border-box;padding:0.75em;' +
        'display:flex;flex-direction:column;align-items:center;';

    if (isCompleted) {
        card.className = 'campaign-card campaign-card-completed';
        // Completed — gold border with glow (like obtained achievement)
        card.style.background = 'linear-gradient(180deg, #1a1020 0%, #0a0a14 100%)';
        card.style.border = '0.125em solid #ffc800';
        card.style.boxShadow =
            '0 0 0.75em rgba(255,200,0,0.3), inset 0 0 1.25em rgba(255,200,0,0.05)';
    } else if (isUnlocked) {
        card.className = 'campaign-card campaign-card-unlocked';
        // Unlocked but not completed — cyan border
        card.style.background = 'linear-gradient(180deg, #0a0a14 0%, #1a1a2e 100%)';
        card.style.border = '0.125em solid #00d4ff';
        card.style.boxShadow = '0 0 0.5em rgba(0,212,255,0.2)';
    } else {
        card.className = 'campaign-card campaign-card-locked';
        // Locked — hidden card with pixelated noise (like hidden achievements)
        card.style.background = '#1a1a2a';
        card.style.border = '0.125em dashed #555555';

        // Pixelated neon blue and grey noise background
        var canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 32;
        canvas.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;' +
            'image-rendering:pixelated;';
        var ctx = canvas.getContext('2d');
        if (ctx) {
            var blues = ['#00d4ff', '#0088aa', '#005577', '#003344'];
            var greys = ['#444444', '#555555', '#333333', '#666666', '#2a2a3a'];
            var allColors = blues.concat(greys);
            for (var y = 0; y < 32; y++) {
                for (var x = 0; x < 40; x++) {
                    ctx.fillStyle = allColors[Math.floor(Math.random() * allColors.length)];
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
        card.appendChild(canvas);

        // Dark overlay for readability
        var noiseOverlay = document.createElement('div');
        noiseOverlay.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;' +
            'background:rgba(0,0,0,0.45);';
        card.appendChild(noiseOverlay);

        // "LOCKED" label centered
        var lockedLabel = document.createElement('div');
        lockedLabel.style.cssText =
            'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
            'color:rgba(255,255,255,0.85);font-size:1em;text-align:center;' +
            'text-transform:uppercase;letter-spacing:0.125em;line-height:1.4;' +
            'text-shadow:' +
                '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, ' +
                '0 0 0.5em rgba(0,212,255,0.4);' +
            'white-space:pre-line;';
        lockedLabel.textContent = 'LEVEL ' + (index + 1) + '\nLOCKED';
        card.appendChild(lockedLabel);

        // Question mark icon
        var qmark = document.createElement('div');
        qmark.style.cssText =
            'position:absolute;bottom:0.5em;left:50%;transform:translateX(-50%);' +
            'font-size:1.5em;color:rgba(0,212,255,0.5);' +
            'text-shadow:-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;';
        qmark.textContent = '?';
        card.appendChild(qmark);

        return card;
    }

    // Status badge — upper right
    var badge = document.createElement('div');
    badge.className = 'campaign-badge';
    if (isCompleted) {
        badge.style.cssText =
            'position:absolute;top:0.375em;right:0.375em;font-size:0.7em;color:#ffc800;' +
            'text-transform:uppercase;letter-spacing:0.06em;' +
            'text-shadow:0 0 0.375em rgba(255,200,0,0.5);';
        badge.textContent = '\u2713 COMPLETED';
    } else {
        badge.style.cssText =
            'position:absolute;top:0.375em;right:0.375em;font-size:0.7em;color:#00d4ff;' +
            'text-transform:uppercase;letter-spacing:0.06em;' +
            'text-shadow:0 0 0.375em rgba(0,212,255,0.5);';
        badge.textContent = 'UNLOCKED';
    }
    card.appendChild(badge);

    // Level name (large)
    var levelName = level ? (level.metadata.name || 'Level ' + (index + 1)) : 'Level ' + (index + 1);
    var name = document.createElement('div');
    name.className = 'campaign-name';
    var nameColor = isCompleted ? '#ffc800' : '#00d4ff';
    name.style.cssText =
        'font-size:1.5em;color:' + nameColor + ';margin-top:1em;text-align:center;' +
        'text-transform:uppercase;letter-spacing:0.06em;padding:0 0.5em;' +
        (isCompleted ? 'text-shadow:0 0 0.5em rgba(255,200,0,0.4);' :
        'text-shadow:0 0 0.5em rgba(0,212,255,0.4);');
    name.textContent = levelName;
    card.appendChild(name);

    // Level number (small)
    var levelNum = document.createElement('div');
    levelNum.className = 'campaign-num';
    var numColor = isCompleted ? '#ffc800' : '#00d4ff';
    levelNum.style.cssText =
        'font-size:0.85em;color:' + numColor + ';text-align:center;margin-top:0.25em;' +
        'text-transform:uppercase;letter-spacing:0.06em;opacity:0.7;';
    levelNum.textContent = 'LEVEL ' + (index + 1);
    card.appendChild(levelNum);

    // Description
    var levelDesc = level && level.metadata.description ? level.metadata.description : '';
    if (levelDesc) {
        var desc = document.createElement('div');
        desc.className = 'campaign-desc';
        desc.style.cssText =
            'font-size:0.75em;color:rgba(255,255,255,0.8);text-align:center;margin-top:0.25em;' +
            'padding:0 0.5em;line-height:1.3;';
        desc.textContent = levelDesc;
        card.appendChild(desc);
    }

    // Click handler for unlocked levels
    if (isUnlocked && level) {
        card.style.cursor = 'pointer';
        var defaultShadow = isCompleted
            ? '0 0 0.75em rgba(255,200,0,0.3), inset 0 0 1.25em rgba(255,200,0,0.05)'
            : '0 0 0.5em rgba(0,212,255,0.2)';
        var hoverShadow = isCompleted
            ? '0 0 1.5em rgba(255,200,0,0.5), inset 0 0 1.25em rgba(255,200,0,0.1)'
            : '0 0 1.5em rgba(0,212,255,0.5), inset 0 0 1.25em rgba(0,212,255,0.1)';

        card.addEventListener('mouseenter', function() {
            card.style.boxShadow = hoverShadow;
        });
        card.addEventListener('mouseleave', function() {
            card.style.boxShadow = defaultShadow;
        });
        card.addEventListener('click', function() {
            // Ignore ghost clicks that arrive before the guard period expires
            if (self._campaignReadyTime && Date.now() < self._campaignReadyTime) return;
            self._removeCampaignOverlay();
            self.startScenario(index, level);
        });
    }

    return card;
};

// ============================================
// Remove the campaign DOM overlay
// ============================================

MenuScene.prototype._removeCampaignOverlay = function() {
    if (this._campaignOverlay && this._campaignOverlay.parentNode) {
        this._campaignOverlay.parentNode.removeChild(this._campaignOverlay);
    }
    this._campaignOverlay = null;
};

// ============================================
// Scenario progress IndexedDB helpers
// ============================================

MenuScene.PROGRESS_DB_NAME    = 'civchess_progress';
MenuScene.PROGRESS_DB_VERSION = 1;
MenuScene.PROGRESS_STORE_NAME = 'progress';
MenuScene._progressDB         = null;
MenuScene._progressDBPromise  = null;

MenuScene.getProgressDB = async function() {
    if (MenuScene._progressDB) return MenuScene._progressDB;
    if (MenuScene._progressDBPromise) return MenuScene._progressDBPromise;

    MenuScene._progressDBPromise = new Promise(function(resolve, reject) {
        var request = indexedDB.open(MenuScene.PROGRESS_DB_NAME, MenuScene.PROGRESS_DB_VERSION);
        request.onerror = function() { reject(request.error); };
        request.onsuccess = function() {
            MenuScene._progressDB = request.result;
            resolve(request.result);
        };
        request.onupgradeneeded = function(event) {
            var db = event.target.result;
            if (!db.objectStoreNames.contains(MenuScene.PROGRESS_STORE_NAME)) {
                db.createObjectStore(MenuScene.PROGRESS_STORE_NAME, { keyPath: 'id' });
            }
        };
    });

    return MenuScene._progressDBPromise;
};

// ============================================
// Get scenario progress
// ============================================

/**
 * Get the highest unlocked scenario index from IndexedDB.
 * Level 0 is always unlocked.
 */
MenuScene.prototype._getScenarioProgress = async function() {
    try {
        var db = await MenuScene.getProgressDB();
        var transaction = db.transaction([MenuScene.PROGRESS_STORE_NAME], 'readonly');
        var store = transaction.objectStore(MenuScene.PROGRESS_STORE_NAME);
        var record = await new Promise(function(resolve, reject) {
            var req = store.get('scenario_progress');
            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { reject(req.error); };
        });
        if (record && record.value !== undefined) return record.value;
    } catch (e) {}
    return 0;
};

/**
 * Start a scenario level.
 * @param {number} index - The level index in the manifest
 * @param {object} levelData - The parsed level JSON
 */
MenuScene.prototype.startScenario = async function(index, levelData, campaignSessionId) {
    const { count } = await GameHistory.listSavedGames();
    const savesFull = count >= GameHistory.MAX_SAVES;
    if (savesFull) {
        await this._showSaveFullToast();
    }
    this._removeCampaignOverlay();
    this.cleanupScrolling();
    // Generate a stable campaign session ID if not provided (new campaign playthrough)
    if (!campaignSessionId) {
        var chars = Math.random().toString(36).substring(2, 6);
        campaignSessionId = 'Campaign ' + chars;
    }
    this.scene.start('GameScene', {
        levelData: levelData,
        scenarioIndex: index,
        campaignSessionId: campaignSessionId,
        disableSaving: savesFull
    });
};
