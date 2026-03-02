// ============================================
// GAME SCENE - Core Class (DOM-based)
// ============================================
// Main class definition with constructor and lifecycle methods.
// Replaces the Phaser-based GameScene with plain DOM + Canvas.
// Other modules extend this class via prototype (same pattern as before).

class GameScene {
    constructor() {
        this.engine = new GameEngine();
        this.pieceSprites = new Map();

        // Canvas contexts for board rendering (replaces Phaser graphics objects)
        this.boardCanvas = null;
        this.boardCtx = null;       // Overlay canvas (ownership markers, territory borders, highlights)
        this.devCanvas = null;
        this.devCtx = null;         // Dev mode overlay canvas
        this.glowCanvas = null;
        this.glowCtx = null;        // Animated energy pulse overlay canvas

        // Cached border geometry for glow animation (rebuilt on ownership change)
        this._cachedBorderEdges = null;   // Map<owner, [{ax1,ay1,ax2,ay2,len,horiz}]>
        this._cachedBorderCorners = null; // Map<owner, [{cx,cy,r,startAngle,endAngle}]>
        this._cachedGlowColors = null;    // Map<owner, {r,g,b}>

        // DOM-based tile grid (static checkerboard — created by drawBoard)
        this._tileGrid = null;

        // DOM element references
        this.container = null;       // #game-scene root div
        this.boardArea = null;       // #board-area div
        this.pieceContainer = null;  // #piece-container div (holds piece DOM elements)
        this.uiPanel = null;         // #ui-panel div

        // Phaser graphics replacement refs — extension files call .clear()
        // and drawing methods on these. They are set to thin wrappers around
        // the board canvas context in create().
        this.tileGraphics = null;
        this.ownershipGraphics = null;
        this.territoryBorderGraphics = null;
        this.highlightGraphics = null;

        // Selection and drag state
        this.selectedPiece = null;
        this.draggedPiece = null;
        this.originalPosition = null;
        this.hasDragged = false;

        // AI state
        this.aiManager = null;
        this.isAITurnInProgress = false;
        this.aiTurnMusicPlaying = false;

        // Animation system (replaces Phaser tweens)
        this.tweens = new TweenManager();

        // Timer tracking (replaces Phaser's this.time.delayedCall)
        this._timers = [];

        // RAF loop
        this._rafId = null;

        // Scene transition compatibility (set in create after sceneManager is available)
        // Will be overwritten in create() once sceneManager reference exists.
        this.scene = {
            start: (name, data) => {
                if (this.sceneManager) {
                    this.sceneManager.startScene(name, data);
                }
            }
        };

        // Reference set by SceneManager.register()
        this.sceneManager = null;

        // Graphics optimization: dirty flags and caches
        this._ownershipDirty = true;
        this._lastOwnershipHash = null;
        this._tilePositions = null;  // Cached tile edge positions
        this._darkenedColors = new Map();  // Cached darkened colors for borders

        // Movement queue (multi-turn movement orders)
        this._movementQueue = new Map();
        this._queueLineAlpha = 1.0;

        // Glow animation throttle (skip frames on mobile for ~15fps glow)
        this._glowFrameCounter = 0;
        this._glowFrameInterval = (typeof layoutConfig !== 'undefined' && layoutConfig.mobile) ? 3 : 1;

        // Piece sync dirty flag — skip position sync loop when no pieces are moving
        this._pieceMoving = false;

        // Event handler references (for cleanup)
        this._beforeUnloadHandler = null;
    }

    init(data) {
        data = data || {};
        this.playerConfigs = data.playerConfigs || null;
        this.randomStart = data.randomStart !== false; // default true
        this.savedGame = data.savedGame || null;
        this.levelData = data.levelData || null;
        this.scenarioIndex = data.scenarioIndex != null ? data.scenarioIndex : null;
        this.campaignSessionId = data.campaignSessionId || null;
        this.disableSaving = data.disableSaving || false;
        this.forcedStartPositions = data.forcedStartPositions || null;

        // Reset all scene state - critical for scene reuse
        // GameScene instances are reused, so state persists across startScene() calls

        // Clear old sprite references to prevent accessing destroyed objects
        this.pieceSprites.clear();

        // Reset selection and drag state
        this.selectedPiece = null;
        this.draggedPiece = null;
        this.originalPosition = null;
        this.hasDragged = false;

        // Reset AI turn state
        this.isAITurnInProgress = false;
        this.aiTurnMusicPlaying = false;

        // Reset diplomacy notification state
        this._diplomacyNotifQueue = [];
        this._activeDiplomacyNotif = null;
        // Maps "actorId-targetId" -> roundNumber the peace proposal toast was last shown.
        // Used to show the toast once when first proposed, then again every 8 rounds.
        this._seenPeaceProposals = new Map();

        // Reset sound denial and end-game screen flags (set on victory/defeat screens)
        this.soundDenied = false;
        this.victoryScreenShown = false;

        // Reset ownership rendering cache to force redraw on scene start
        this._ownershipDirty = true;
        this._lastOwnershipHash = null;
        this._darkenedColors.clear();

        // Reset glow animation caches
        this._cachedBorderEdges = null;
        this._cachedBorderCorners = null;
        this._cachedGlowColors = null;
        this._cachedBorderTotalLen = null;
        this._glowThresholds = null;
        this._cachedGlowRGBA = null;

        // Reset movement queue
        this._movementQueue = new Map();
        this._queueLineAlpha = 1.0;

        // Reset highlight state so stale highlights don't persist across games
        this._lastHighlightMoves = null;

        // Reset glow throttle and piece sync flag
        this._glowFrameCounter = 0;
        this._pieceMoving = false;

        // Reset scenario state
        this.scenarioWinConditions = null;
        this._scenarioResults = null;
        this.blockedProductions = [];

        // Restore engine.setProduction to its prototype method in case a
        // previous scenario wrapped it to block certain production types.
        if (this.engine.hasOwnProperty('setProduction')) {
            delete this.engine.setProduction;
        }

        // Restore engine.canChangeRelation to its prototype method in case a
        // previous scenario locked diplomacy by overriding it.
        if (this.engine.hasOwnProperty('canChangeRelation')) {
            delete this.engine.canChangeRelation;
        }

        // Restore engine.checkVictory to its prototype method in case a
        // previous scenario suppressed it for custom win conditions.
        if (this.engine.hasOwnProperty('checkVictory')) {
            delete this.engine.checkVictory;
        }
    }

    async create() {
        const gameContainer = document.getElementById('game-container');

        // ---- Build DOM structure ----

        // Root container for the game scene
        this.container = document.createElement('div');
        this.container.id = 'game-scene';
        this.container.style.position = 'relative';
        this.container.style.width = layoutConfig.gameWidth + 'px';
        this.container.style.height = layoutConfig.gameHeight + 'px';
        this.container.style.backgroundColor = hexToCSS(COLORS.background);
        this.container.style.overflow = 'hidden';
        // Reset text-align — inherited 'center' from .wrapper would shift
        // the inline-block board area right, misaligning it with the
        // absolutely-positioned UI panel.
        this.container.style.textAlign = 'left';

        // Board area — holds canvases and piece layer
        const boardW = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;
        const boardH = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;

        this.boardArea = document.createElement('div');
        this.boardArea.id = 'board-area';
        this.boardArea.style.position = 'relative';
        this.boardArea.style.width = boardW + 'px';
        this.boardArea.style.height = boardH + 'px';
        if (layoutConfig.mobile) {
            // Mobile: board at top
            this.boardArea.style.display = 'block';
        } else {
            // Desktop: board on the left
            this.boardArea.style.display = 'inline-block';
            this.boardArea.style.verticalAlign = 'top';
        }

        // Overlay canvas — ownership markers, territory borders, move highlights
        // Rendered at half resolution and CSS-upscaled for 8-bit pixel art look
        const PIXEL_SCALE = 0.5;
        this.boardCanvas = document.createElement('canvas');
        this.boardCanvas.id = 'board-canvas';
        this.boardCanvas.width = Math.ceil(boardW * PIXEL_SCALE);
        this.boardCanvas.height = Math.ceil(boardH * PIXEL_SCALE);
        this.boardCanvas.style.width = boardW + 'px';
        this.boardCanvas.style.height = boardH + 'px';
        this.boardCanvas.style.imageRendering = 'pixelated';
        this.boardCanvas.style.position = 'absolute';
        this.boardCanvas.style.left = '0';
        this.boardCanvas.style.top = '0';
        this.boardCtx = this.boardCanvas.getContext('2d', { willReadFrequently: false });
        this.boardCtx.scale(PIXEL_SCALE, PIXEL_SCALE);

        // Glow canvas — animated energy pulse along territory borders
        // Same half-resolution and pixelated rendering as boardCanvas
        this.glowCanvas = document.createElement('canvas');
        this.glowCanvas.id = 'glow-canvas';
        this.glowCanvas.width = Math.ceil(boardW * PIXEL_SCALE);
        this.glowCanvas.height = Math.ceil(boardH * PIXEL_SCALE);
        this.glowCanvas.style.width = boardW + 'px';
        this.glowCanvas.style.height = boardH + 'px';
        this.glowCanvas.style.imageRendering = 'pixelated';
        this.glowCanvas.style.position = 'absolute';
        this.glowCanvas.style.left = '0';
        this.glowCanvas.style.top = '0';
        this.glowCanvas.style.pointerEvents = 'none';
        this.glowCtx = this.glowCanvas.getContext('2d', { willReadFrequently: false });
        this.glowCtx.scale(PIXEL_SCALE, PIXEL_SCALE);

        // Dev mode overlay canvas — AI target lines, debug visuals
        this.devCanvas = document.createElement('canvas');
        this.devCanvas.id = 'dev-canvas';
        this.devCanvas.width = boardW;
        this.devCanvas.height = boardH;
        this.devCanvas.style.position = 'absolute';
        this.devCanvas.style.left = '0';
        this.devCanvas.style.top = '0';
        this.devCanvas.style.pointerEvents = 'none';
        this.devCtx = this.devCanvas.getContext('2d', { willReadFrequently: false });

        // Piece container — holds DOM elements for each piece
        // pointer-events:none lets clicks pass through to boardCanvas for click-to-move;
        // individual piece elements have pointer-events:auto so they still receive events.
        this.pieceContainer = document.createElement('div');
        this.pieceContainer.id = 'piece-container';
        this.pieceContainer.style.position = 'absolute';
        this.pieceContainer.style.left = '0';
        this.pieceContainer.style.top = '0';
        this.pieceContainer.style.width = boardW + 'px';
        this.pieceContainer.style.height = boardH + 'px';
        this.pieceContainer.style.pointerEvents = 'none';

        // Assemble board area (tile grid is DOM-based, created by drawBoard())
        this.boardArea.appendChild(this.boardCanvas);
        this.boardArea.appendChild(this.glowCanvas);
        this.boardArea.appendChild(this.devCanvas);
        this.boardArea.appendChild(this.pieceContainer);

        // UI panel
        this.uiPanel = document.createElement('div');
        this.uiPanel.id = 'ui-panel';
        this.uiPanel.style.position = layoutConfig.mobile ? 'relative' : 'absolute';
        if (layoutConfig.mobile) {
            // Gap between the board and the panel (matches boardPanelGap in layout)
            this.uiPanel.style.marginTop = '6px';
        } else {
            this.uiPanel.style.left = layoutConfig.panelX + 'px';
            this.uiPanel.style.top = layoutConfig.panelY + 'px';
        }
        this.uiPanel.style.width = layoutConfig.panelWidth + 'px';
        this.uiPanel.style.height = layoutConfig.panelHeight + 'px';
        this.uiPanel.style.overflow = 'hidden';

        // Assemble scene container
        this.container.appendChild(this.boardArea);
        this.container.appendChild(this.uiPanel);

        // Attach to the game container in the page
        gameContainer.appendChild(this.container);

        // ---- Rebuild the scene property now that sceneManager is available ----
        this.scene = {
            start: (name, data) => {
                if (this.sceneManager) {
                    this.sceneManager.startScene(name, data);
                }
            }
        };

        // ---- Initialize game engine ----
        if (this.savedGame) {
            this.engine.restoreFromSavedGame(this.savedGame);
            // Re-apply scenario context if this was a campaign game.
            // The engine state is restored from the save, but runtime
            // overrides (win conditions, production blocks, diplomacy lock)
            // need to be reinstated from the level data.
            if (this.levelData) {
                this._applyScenarioContext(this.levelData);
            }
        } else if (this.levelData) {
            this.setupFromLevel(this.levelData);
            this._showLevelIntro = true;
        } else {
            if (this.forcedStartPositions) {
                const forced = this.forcedStartPositions;
                const origFn = this.engine.getRandomStartPositions.bind(this.engine);
                this.engine.getRandomStartPositions = () => forced;
                this.engine.setupGame(this.playerConfigs, { randomStart: true });
                this.engine.getRandomStartPositions = origFn;
            } else {
                this.engine.setupGame(this.playerConfigs, { randomStart: this.randomStart });
            }
        }

        // Initialize AI Manager
        this.aiManager = new AIManager(this.engine);

        // Register AI players with their configured difficulty and personality
        this.engine.players.forEach((player, index) => {
            if (player.isAI) {
                const difficulty = player.aiDifficulty || AI_DIFFICULTY.MEDIUM;
                const personality = player.personality || null;
                this.aiManager.registerAIPlayer(index, difficulty, personality);
            }
        });


        // Pre-compute tile positions for graphics optimization
        this._initTilePositionCache();

        // Draw the board
        this.drawBoard();
        this.drawOwnership();

        // Create pieces
        this.createAllPieces();

        // Create UI panel contents
        this.createUIPanel();

        // Set up input handlers
        this.setupInput();

        // Draw board border
        this._drawBoardBorder();

        // Add coordinates
        this.addCoordinates();

        // For loaded games where human was defeated: block the standard victory
        // screen so we can show the correct defeat screen instead.
        // Scenario games handle their own screens via the wrapped updateUI, so
        // only set the guard for non-scenario games.
        let humanDefeatedOnLoad = false;
        if (this.savedGame) {
            const humanPlayers = this.engine.players.filter(p => !p.isAI);
            humanDefeatedOnLoad = humanPlayers.length > 0 && humanPlayers.every(p => p.eliminated);
            if (humanDefeatedOnLoad && !this.scenarioWinConditions) {
                this.victoryScreenShown = true;
            }
        }

        // Update UI
        this.updateUI();

        // Register save callback for toast notifications
        GameHistory.onSaveCallback = (gameId, sizeBytes) => {
            this.showSaveToast(sizeBytes);
        };

        // If saves were full when this game was started, disable saving for this session
        if (this.disableSaving) {
            this.engine.history.savingDisabled = true;
        }

        // Handler for saving state on browser close/refresh
        this._beforeUnloadHandler = () => {
            if (this.engine.history && !this.engine.gameOver) {
                this.engine.history.captureSnapshot(this.engine, 'BROWSER_CLOSE');
                this.engine.history.forceSave();
            }
        };
        window.addEventListener('beforeunload', this._beforeUnloadHandler);

        // If loading a saved game, check if we loaded mid-turn and need to complete it
        if (this.savedGame) {
            this.handleLoadedMidTurn();
        }

        // If human was defeated in the loaded game, show defeat/scenario screen
        if (humanDefeatedOnLoad) {
            const defeatedPlayer = this.engine.players.find(p => !p.isAI && p.eliminated);
            if (defeatedPlayer) {
                if (this.scenarioWinConditions) {
                    // Ensure game-over state is set so the scenario screen
                    // can determine winner/loser (may not have been saved in metadata
                    // if the save happened mid-combat).
                    if (!this.engine.gameOver) {
                        this.engine.gameOver = true;
                        const winner = this.engine.players.find(p => !p.eliminated);
                        this.engine.winner = winner ? winner.id : 0;
                    }
                    this.showScenarioVictoryScreen();
                } else {
                    this.showDefeatScreen(defeatedPlayer.id);
                }
            }
        } else {
            // If the first player is AI, start their turn
            this.checkAndExecuteAITurn();
        }

        // Register with UI controller for header/dev mode features
        if (typeof uiController !== 'undefined') {
            uiController.registerGameScene(this);
        }

        // ---- Start the update loop ----
        this._startUpdateLoop();

        // Deferred board repaint — ensures the canvas is painted after the
        // browser has completed its first layout pass for the newly-created
        // DOM structure.  Without this, some browsers may show a blank canvas
        // until a user interaction triggers a redraw.
        requestAnimationFrame(() => {
            if (this.boardCtx) {
                this.drawOwnership(true);
            }
        });

        // Show level name toast for campaign levels after a short delay
        if (this._showLevelIntro) {
            this._showLevelIntro = false;
            var self = this;
            setTimeout(function() { self.showLevelIntroToast(); }, 400);
        }

        // First-time skirmish tutorial (no-op for campaign/returning players)
        this._initTutorial();
        // Timed one-shot hints for both skirmish and campaign
        this._initHints();
    }

    update(timestamp) {
        const ts = timestamp || performance.now();

        // Check if glow borders are enabled in graphics settings
        const glowEnabled = typeof uiController === 'undefined' || uiController.settings.glowBorders;
        const hasGlow = glowEnabled && this.glowCanvas && this._cachedBorderEdges;
        const hasQueue = this._movementQueue && this._movementQueue.size > 0 && this.glowCanvas;

        // Glow animation and movement queue lines share the same canvas and throttle
        // cycle. Synchronizing them prevents queue lines from accumulating on frames
        // where the glow canvas isn't cleared.
        if (hasGlow || hasQueue) {
            this._glowFrameCounter++;
            if (this._glowFrameCounter >= this._glowFrameInterval) {
                this._glowFrameCounter = 0;

                // Glow animation draws and clears the canvas; if disabled, clear manually
                if (hasGlow) {
                    this._drawGlowAnimation(ts);
                } else if (this.glowCtx) {
                    this.glowCtx.save();
                    this.glowCtx.setTransform(1, 0, 0, 1, 0, 0);
                    this.glowCtx.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
                    this.glowCtx.restore();
                }

                // Movement queue lines (drawn on top of glow)
                if (hasQueue) {
                    const isHumanTurn = !this.engine.getCurrentPlayer().isAI;
                    const targetAlpha = isHumanTurn ? 1.0 : 0.0;
                    // Scale fade step by frame interval to keep fade speed constant
                    const fadeStep = 0.05 * this._glowFrameInterval;
                    if (this._queueLineAlpha < targetAlpha) {
                        this._queueLineAlpha = Math.min(this._queueLineAlpha + fadeStep, 1.0);
                    } else if (this._queueLineAlpha > targetAlpha) {
                        this._queueLineAlpha = Math.max(this._queueLineAlpha - fadeStep, 0.0);
                    }
                    this._drawMovementQueueLines(ts);
                }
            }
        } else if (!glowEnabled && this.glowCanvas && this.glowCtx) {
            // Clear glow canvas when disabled
            if (this._cachedBorderEdges) {
                this.glowCtx.save();
                this.glowCtx.setTransform(1, 0, 0, 1, 0, 0);
                this.glowCtx.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
                this.glowCtx.restore();
            }
        }

        // Draw AI target lines when dev mode is active
        // (do this before early return so it works in all-AI games)
        if (typeof uiController !== 'undefined' && uiController.settings.devMode) {
            uiController.drawAITargets();
        }

        // Don't interfere with sprite positions during AI turn animations
        if (this.isAITurnInProgress) return;

        // Early exit if dragging (position controlled by drag handler)
        if (this.draggedPiece) return;

        // Sync piece sprites with engine state — skip when no pieces are moving
        if (!this._pieceMoving) return;

        const pieces = this.engine.pieces;
        const halfTile = TILE_SIZE / 2;
        let anyMoving = false;
        const movedSprites = [];
        for (let i = 0, len = pieces.length; i < len; i++) {
            const piece = pieces[i];
            const sprite = this.pieceSprites.get(piece.id);
            if (sprite) {
                const targetX = BOARD_OFFSET + piece.col * TILE_SIZE + halfTile;
                const targetY = BOARD_OFFSET + piece.row * TILE_SIZE + halfTile;
                const dx = targetX - sprite.x;
                const dy = targetY - sprite.y;
                if (dx * dx + dy * dy > 1) {
                    sprite.setPositionSilent(sprite.x + dx * 0.2, sprite.y + dy * 0.2);
                    movedSprites.push(sprite);
                    anyMoving = true;
                }
            }
        }
        for (let i = 0, len = movedSprites.length; i < len; i++) {
            movedSprites[i].flushTransform();
        }
        if (!anyMoving) this._pieceMoving = false;
    }

    destroy() {
        // Kill all running tweens to prevent callbacks firing on destroyed objects
        this.tweens.killAll();

        // Clear all pending timers
        this.removeAllTimers();

        // Cancel the update loop
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        // Unregister save callback
        GameHistory.onSaveCallback = null;

        // Remove beforeunload handler
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }

        // Capture current state and force save before teardown
        // This ensures mid-turn state is preserved (critical for all-AI games)
        if (this.engine.history && !this.engine.gameOver) {
            this.engine.history.captureSnapshot(this.engine, 'SHUTDOWN');
            this.engine.history.forceSave();
        }

        // Clean up diplomacy notifications
        this._clearDiplomacyNotifications();

        // Stop AI turn music if playing
        if (this.aiTurnMusicPlaying) {
            this.stopAITurnMusic();
        }


        // Reset AI turn state
        this.isAITurnInProgress = false;
        this.aiTurnMusicPlaying = false;

        // Unregister from UI controller
        if (typeof uiController !== 'undefined') {
            uiController.unregisterGameScene();
        }

        // Remove DOM elements
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }

        // Null out DOM references
        this._tileGrid = null;
        this.boardCanvas = null;
        this.boardCtx = null;
        this.glowCanvas = null;
        this.glowCtx = null;
        this._cachedBorderEdges = null;
        this._cachedBorderCorners = null;
        this._cachedGlowColors = null;
        this._cachedBorderTotalLen = null;
        this._cachedBorderCanvas = null;
        this._glowThresholds = null;
        this._cachedGlowRGBA = null;
        this._glowBucketPool = null;
        this.devCanvas = null;
        this.devCtx = null;
        this.pieceContainer = null;
        this.boardArea = null;
        this.uiPanel = null;
        this.container = null;
        this._movementQueue = null;
        this.tileGraphics = null;
        this.ownershipGraphics = null;
        this.territoryBorderGraphics = null;
        this.highlightGraphics = null;
    }

    // ---- Update loop ----

    _startUpdateLoop() {
        // Drive TweenManager from this RAF loop instead of letting it run its own.
        // Eliminates a duplicate requestAnimationFrame callback.
        this.tweens._external = true;
        const loop = (timestamp) => {
            this.tweens.update(timestamp);
            this.update(timestamp);
            this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }

    // Board border is now a CSS outline on the tile grid (created by drawBoard).
    _drawBoardBorder() {}

    // ---- Tile position cache ----

    _initTilePositionCache() {
        // Pre-compute edge positions for territory borders (BOARD_SIZE + 1 edges)
        this._tilePositions = new Float32Array(BOARD_SIZE + 1);
        for (let i = 0; i <= BOARD_SIZE; i++) {
            this._tilePositions[i] = BOARD_OFFSET + i * TILE_SIZE;
        }
        // Clear darkened color cache (will be populated on first use)
        this._darkenedColors.clear();
    }

    // ---- Color helpers ----

    // Get darkened color for border rendering (cached)
    _getDarkenedColor(playerId) {
        if (this._darkenedColors.has(playerId)) {
            return this._darkenedColors.get(playerId);
        }
        const base = this.engine.players[playerId].color.hex;
        const r = ((base >> 16) & 0xFF) * 0.7 | 0;
        const g = ((base >> 8) & 0xFF) * 0.7 | 0;
        const b = (base & 0xFF) * 0.7 | 0;
        const color = (r << 16) | (g << 8) | b;
        this._darkenedColors.set(playerId, color);
        return color;
    }

    // ---- Ownership hash ----

    // Compute hash of ownership state to detect changes
    _computeOwnershipHash() {
        const ownership = this.engine.tileOwnership;
        let hash = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const owner = ownership[r][c];
                // Encode owner (-1 for null, otherwise owner index) into hash
                hash = ((hash << 5) - hash + (owner === null ? -1 : owner)) | 0;
            }
        }
        return hash;
    }

    // Mark ownership as needing redraw
    markOwnershipDirty() {
        this._ownershipDirty = true;
        this._cachedBorderCanvas = null;
    }

    // ---- Timer helpers (replaces Phaser's this.time.delayedCall) ----

    /**
     * Schedule a delayed callback. Returns the timer ID.
     * Use this anywhere the original code used this.time.delayedCall().
     */
    delayedCall(ms, fn) {
        const id = setTimeout(() => {
            // Remove from tracking array once fired
            const idx = this._timers.indexOf(id);
            if (idx !== -1) this._timers.splice(idx, 1);
            fn();
        }, ms);
        this._timers.push(id);
        return id;
    }

    /**
     * Clear all pending timers. Called during destroy and scene transitions.
     */
    removeAllTimers() {
        for (let i = 0; i < this._timers.length; i++) {
            clearTimeout(this._timers[i]);
        }
        this._timers.length = 0;
    }
}
