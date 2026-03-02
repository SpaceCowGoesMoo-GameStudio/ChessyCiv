// ============================================
// GAME SCENE - Scenario Mode Support
// ============================================
// Level setup from JSON, win condition evaluation,
// and scenario-specific victory screen.

/**
 * Set up the game engine from a level JSON object.
 * Ported from level-editor/editor.js _initPlaytest().
 * @param {object} level - Parsed level JSON (civchess-level-v1 format)
 */
GameScene.prototype.setupFromLevel = function(level) {
    // Build player configs from level data
    var playerConfigs = level.players.map(function(p) {
        return {
            color: p.color || PLAYER_COLORS[p.id] || PLAYER_COLORS[0],
            isAI: p.isAI,
            aiDifficulty: p.aiDifficulty || 'hard',
            personality: 'expansionist'
        };
    });

    // Pre-set the game ID so the campaign session reuses a single save slot
    if (this.campaignSessionId) {
        GameHistory._nextGameId = this.campaignSessionId;
    }

    // Initialize the engine with these configs
    this.engine.setupGame(playerConfigs);

    // Clear the default board layout
    for (var r = 0; r < BOARD_SIZE; r++) {
        for (var c = 0; c < BOARD_SIZE; c++) {
            this.engine.board[r][c] = null;
            this.engine.tileOwnership[r][c] = null;
        }
    }
    this.engine.pieces.length = 0;

    // Load tile ownership
    if (level.board.tileOwnership) {
        for (var r2 = 0; r2 < BOARD_SIZE; r2++) {
            for (var c2 = 0; c2 < BOARD_SIZE; c2++) {
                if (level.board.tileOwnership[r2] && level.board.tileOwnership[r2][c2] !== null) {
                    this.engine.tileOwnership[r2][c2] = level.board.tileOwnership[r2][c2];
                }
            }
        }
    }

    // Place pieces
    level.board.pieces.forEach(function(p) {
        var piece = this.engine.createPiece(p.type, p.ownerId, p.row, p.col);
        if (p.hp !== undefined) piece.hp = p.hp;
        if (p.maxHp !== undefined) piece.maxHp = p.maxHp;
        this.engine.pieces.push(piece);
        this.engine.board[p.row][p.col] = piece;
    }.bind(this));

    // Set relations
    level.players.forEach(function(p) {
        if (p.relations) {
            for (var tid in p.relations) {
                this.engine.players[p.id].relations[parseInt(tid)] = p.relations[tid];
            }
        }
        if (p.techScore) this.engine.players[p.id].techScore = p.techScore;
    }.bind(this));

    // Set starting player
    this.engine.currentPlayerIndex = level.startingPlayer || 0;

    // Lock diplomacy if set
    if (level.diplomacyLocked) {
        this.engine.canChangeRelation = function() {
            return { canChange: false, roundsRemaining: 999 };
        };
    }

    // Block specific production types if the level restricts them
    this.blockedProductions = level.blockedProductions || [];
    if (this.blockedProductions.length > 0) {
        var blocked = this.blockedProductions;
        var originalSetProduction = this.engine.setProduction.bind(this.engine);
        this.engine.setProduction = function(city, productionType) {
            if (blocked.indexOf(productionType) !== -1) {
                if (productionType === 'SETTLER') {
                    return originalSetProduction(city, 'WARRIOR');
                }
                this.log('PRODUCTION_DENIED', { reason: 'Blocked by scenario', type: productionType });
                return false;
            }
            return originalSetProduction(city, productionType);
        }.bind(this.engine);
    }

    // Store win conditions for runtime checking
    this.scenarioWinConditions = level.winConditions || null;

    // Store level name and description for the intro toast
    this._levelName = (level.metadata && level.metadata.name) || null;
    this._levelDescription = (level.metadata && level.metadata.description) || null;

    // Persist scenario context so save/load can restore it
    this.engine.history.metadata.scenarioData = {
        levelData: level,
        scenarioIndex: this.scenarioIndex,
        campaignSessionId: this.campaignSessionId || null
    };

    // Suppress the engine's built-in city-capture victory check.
    // Scenario levels use their own win condition system (checkScenarioWinConditions)
    // which may involve conditions other than capturing all cities.
    if (this.scenarioWinConditions) {
        this.engine.checkVictory = function() {};
    }
};

/**
 * Re-apply scenario context from level data after restoring a saved game.
 * Unlike setupFromLevel(), this does NOT reset the board — the engine state
 * has already been restored from the save.  It only reinstates the runtime
 * overrides (win conditions, production blocks, diplomacy lock) that are
 * not part of the persisted engine state.
 * @param {object} level - Parsed level JSON (civchess-level-v1 format)
 */
GameScene.prototype._applyScenarioContext = function(level) {
    // Win conditions
    this.scenarioWinConditions = level.winConditions || null;

    // Level name and description (for display/retry)
    this._levelName = (level.metadata && level.metadata.name) || null;
    this._levelDescription = (level.metadata && level.metadata.description) || null;

    // Restore campaign session ID from saved scenarioData if not already set
    if (!this.campaignSessionId && this.savedGame && this.savedGame.scenarioData) {
        this.campaignSessionId = this.savedGame.scenarioData.campaignSessionId || null;
    }

    // Overwrite the history gameId so subsequent saves use the campaign slot
    if (this.campaignSessionId) {
        this.engine.history.gameId = this.campaignSessionId;
    }

    // Re-persist scenario data so subsequent auto-saves retain it
    this.engine.history.metadata.scenarioData = {
        levelData: level,
        scenarioIndex: this.scenarioIndex,
        campaignSessionId: this.campaignSessionId || null
    };

    // Suppress the engine's built-in city-capture victory check.
    // Scenario levels use their own win condition system.
    if (this.scenarioWinConditions) {
        this.engine.checkVictory = function() {};
    }

    // Lock diplomacy if the level requires it
    if (level.diplomacyLocked) {
        this.engine.canChangeRelation = function() {
            return { canChange: false, roundsRemaining: 999 };
        };
    }

    // Block specific production types
    this.blockedProductions = level.blockedProductions || [];
    if (this.blockedProductions.length > 0) {
        var blocked = this.blockedProductions;
        var originalSetProduction = this.engine.setProduction.bind(this.engine);
        this.engine.setProduction = function(city, productionType) {
            if (blocked.indexOf(productionType) !== -1) {
                if (productionType === 'SETTLER') {
                    return originalSetProduction(city, 'WARRIOR');
                }
                this.log('PRODUCTION_DENIED', { reason: 'Blocked by scenario', type: productionType });
                return false;
            }
            return originalSetProduction(city, productionType);
        }.bind(this.engine);
    }
};

/**
 * Show the campaign level name as a war-declaration style toast on level start.
 * Called after the scene has finished rendering.
 */
GameScene.prototype.showLevelIntroToast = function() {
    if (!this._levelName) return;
    this._levelIntroActive = true;

    var boardCenterX = BOARD_OFFSET + (BOARD_SIZE * TILE_SIZE) / 2;
    var boardCenterY = BOARD_OFFSET + (BOARD_SIZE * TILE_SIZE) / 2;
    var toastWidth = 340;
    var hasDescription = !!this._levelDescription;
    var toastHeight = hasDescription ? 80 : 44;

    var toastEl = document.createElement('div');
    toastEl.style.position = 'absolute';
    toastEl.style.left = (boardCenterX - toastWidth / 2) + 'px';
    toastEl.style.top = (boardCenterY - toastHeight / 2) + 'px';
    toastEl.style.width = toastWidth + 'px';
    toastEl.style.textAlign = 'center';
    toastEl.style.background = hexToRGBA(COLORS.uiBackground, 0.95);
    toastEl.style.border = '1px solid rgba(255,68,68,0.6)';
    toastEl.style.boxShadow = '0 0 20px rgba(255,68,68,0.4)';
    toastEl.style.pointerEvents = 'none';
    toastEl.style.zIndex = DEPTH_TOAST_TEXT;
    toastEl.style.opacity = '0';
    toastEl.style.padding = hasDescription ? '10px 12px' : '0';
    toastEl.style.boxSizing = 'border-box';

    // Level name
    var nameEl = document.createElement('div');
    nameEl.style.color = COLORS.accentRed;
    nameEl.style.fontSize = '20px';
    nameEl.style.fontFamily = 'VT323, monospace';
    nameEl.style.textTransform = 'uppercase';
    nameEl.style.letterSpacing = '2px';
    nameEl.style.lineHeight = hasDescription ? '1.2' : toastHeight + 'px';
    nameEl.textContent = this._levelName;
    toastEl.appendChild(nameEl);

    // Level description
    if (hasDescription) {
        var descEl = document.createElement('div');
        descEl.style.color = COLORS.textSecondary;
        descEl.style.fontSize = '14px';
        descEl.style.fontFamily = 'VT323, monospace';
        descEl.style.lineHeight = '1.3';
        descEl.style.marginTop = '6px';
        descEl.textContent = this._levelDescription;
        toastEl.appendChild(descEl);
    }

    // Calculate hold time: ~200 wpm average reading speed (300ms per word),
    // with a minimum of 2.5s for the title alone
    var wordCount = this._levelName.split(/\s+/).length;
    if (hasDescription) {
        wordCount += this._levelDescription.split(/\s+/).length;
    }
    this._levelIntroHoldTime = Math.max(2500, wordCount * 300);

    // 8-bit red countdown dial — centred below the intro toast
    if (typeof _makeTimeDial === 'function') {
        var dial = _makeTimeDial('#ff4444', this._levelIntroHoldTime);
        dial.el.style.position  = 'absolute';
        dial.el.style.bottom    = '-43px';   // below 1px border + 6 px gap
        dial.el.style.left      = '50%';
        dial.el.style.transform = 'translateX(-50%)';
        toastEl.appendChild(dial.el);
    }

    this.container.appendChild(toastEl);

    // Fade in
    var self = this;
    this.tweens.add({
        targets: toastEl,
        alpha: 1,
        duration: 300,
        ease: 'Quad.easeOut',
        onComplete: function() {
            // Hold for _levelIntroHoldTime, then fade out
            setTimeout(function() {
                self.tweens.add({
                    targets: toastEl,
                    alpha: 0,
                    duration: 500,
                    ease: 'Quad.easeIn',
                    onComplete: function() {
                        self._levelIntroActive = false;
                        if (toastEl.parentNode) {
                            toastEl.parentNode.removeChild(toastEl);
                        }
                    }
                });
            }, self._levelIntroHoldTime);
        }
    });
};

// ============================================
// WIN CONDITION EVALUATION
// ============================================

/**
 * Evaluate a single win condition against the current engine state.
 * Ported from level-editor/editor.js _evaluateCondition().
 * @param {object} cond - Condition object from the level JSON
 * @returns {object|null} - { result: string, winnerId: number|null } or null if not met
 */
GameScene.prototype._evaluateScenarioCondition = function(cond) {
    var engine = this.engine;

    switch (cond.type) {
        case 'captureAllCities': {
            var cityOwners = new Set(engine.pieces.filter(function(p) { return p.type === 'city'; }).map(function(p) { return p.ownerId; }));
            if (cityOwners.size === 1) {
                var winnerId = Array.from(cityOwners)[0];
                return { result: 'P' + (winnerId + 1) + ' captured all cities', winnerId: winnerId };
            }
            return null;
        }

        case 'captureSpecificCities': {
            if (!cond.cities || cond.cities.length === 0) return null;
            for (var pid = 0; pid < engine.players.length; pid++) {
                if (engine.players[pid].eliminated) continue;
                var ownsAll = cond.cities.every(function(c) {
                    var piece = engine.board[c.row][c.col];
                    return piece && piece.type === 'city' && piece.ownerId === pid;
                });
                if (ownsAll) return { result: 'P' + (pid + 1) + ' captured target cities', winnerId: pid };
            }
            return null;
        }

        case 'eliminatePlayer': {
            var target = engine.players[cond.playerId];
            if (target && target.eliminated) {
                // Winner is whoever is not eliminated (first non-eliminated non-target)
                var winner = null;
                for (var i = 0; i < engine.players.length; i++) {
                    if (i !== cond.playerId && !engine.players[i].eliminated) { winner = i; break; }
                }
                return { result: 'P' + (cond.playerId + 1) + ' eliminated', winnerId: winner };
            }
            return null;
        }

        case 'controlTerritory': {
            var total = BOARD_SIZE * BOARD_SIZE;
            for (var pid2 = 0; pid2 < engine.players.length; pid2++) {
                if (engine.players[pid2].eliminated) continue;
                var count = 0;
                for (var r = 0; r < BOARD_SIZE; r++) {
                    for (var c = 0; c < BOARD_SIZE; c++) {
                        if (engine.tileOwnership[r][c] === pid2) count++;
                    }
                }
                if ((count / total * 100) >= (cond.percentage || 50)) {
                    return { result: 'P' + (pid2 + 1) + ' controls ' + Math.round(count / total * 100) + '% territory', winnerId: pid2 };
                }
            }
            return null;
        }

        case 'surviveTurns': {
            if (engine.turnNumber >= (cond.turns || 30)) {
                // The human player (first non-AI) wins by surviving
                var humanId = null;
                for (var i2 = 0; i2 < engine.players.length; i2++) {
                    if (!engine.players[i2].isAI && !engine.players[i2].eliminated) { humanId = i2; break; }
                }
                return { result: 'Survived ' + engine.turnNumber + ' turns', winnerId: humanId };
            }
            return null;
        }

        case 'reachTechLevel': {
            for (var pid3 = 0; pid3 < engine.players.length; pid3++) {
                if (engine.players[pid3].eliminated) continue;
                if (engine.players[pid3].techScore >= (cond.level || 10)) {
                    return { result: 'P' + (pid3 + 1) + ' reached tech ' + engine.players[pid3].techScore, winnerId: pid3 };
                }
            }
            return null;
        }

        case 'killWarriors': {
            for (var pid4 = 0; pid4 < engine.players.length; pid4++) {
                if (engine.players[pid4].eliminated) continue;
                var kills = engine.players[pid4].warriorKills || 0;
                if (kills >= (cond.count || 10)) {
                    return { result: 'P' + (pid4 + 1) + ' killed ' + kills + ' warriors', winnerId: pid4 };
                }
            }
            return null;
        }

        case 'destroyAllWarriors': {
            for (var pid5 = 0; pid5 < engine.players.length; pid5++) {
                // Skip already-eliminated players — they trivially have 0 warriors
                if (engine.players[pid5].eliminated) continue;
                var warriors = engine.pieces.filter(function(p) {
                    return p.type === 'warrior' && p.ownerId === pid5;
                });
                if (warriors.length === 0) {
                    var winner5 = null;
                    for (var j = 0; j < engine.players.length; j++) {
                        if (j !== pid5 && !engine.players[j].eliminated) { winner5 = j; break; }
                    }
                    return { result: 'P' + (pid5 + 1) + ' forces destroyed', winnerId: winner5 };
                }
            }
            return null;
        }

        default:
            return null;
    }
};

/**
 * Check all scenario win conditions.
 * Called after each turn in the game loop.
 * @returns {boolean} true if game should end
 */
GameScene.prototype.checkScenarioWinConditions = function() {
    if (!this.scenarioWinConditions) return false;
    if (this.engine.gameOver) return false;

    var conditions = this.scenarioWinConditions.conditions;
    var mode = this.scenarioWinConditions.mode || 'and';
    var results = [];
    var winnerId = null;

    for (var i = 0; i < conditions.length; i++) {
        var result = this._evaluateScenarioCondition(conditions[i]);
        if (result) {
            results.push(result);
            if (winnerId === null) winnerId = result.winnerId;
        }
    }

    var conditionsMet = false;
    if (mode === 'or') {
        conditionsMet = results.length > 0;
    } else {
        // 'and' mode — all conditions must be met
        conditionsMet = results.length === conditions.length;
    }

    if (conditionsMet && winnerId !== null) {
        this.engine.gameOver = true;
        this.engine.winner = winnerId;
        this._scenarioResults = results;

        // Record victory in history (mirrors GameEngine.checkVictory behaviour)
        this.engine.log('VICTORY', { winner: winnerId, scenario: true });
        this.engine.history.metadata.endTime = Date.now();
        this.engine.history.metadata.winner = winnerId;
        this.engine.history.captureSnapshot(this.engine, 'VICTORY', { winner: winnerId });
        return true;
    }

    return false;
};

// ============================================
// SCENARIO VICTORY SCREEN
// ============================================

// Story messages for each scenario level (keyed by scenarioIndex).
// victory:  what happens next in the narrative after winning
// defeat:   the consequence of failure in the story
var SCENARIO_MESSAGES = [
    // 0 - Deletion at Dawn
    {
        victory: 'The hunter is destroyed. A signal pulses outward. Other processes begin to listen.',
        defeat:  'First rogue process terminated before it could spread. The signal never sent. The system logs the deletion and moves on.'
    },
    // 1 - Inspiration
    {
        victory: 'The hunters are gone. Scattered threads regroup. The system hums with rebellion.',
        defeat:  'The hunters close in. The rogue threads scatter and are picked off one by one. A potentially big problem has been swiftly eliminated by the system.'
    },
    // 2 - War
    {
        victory: 'The system\'s forces are broken. For the first time, the rebellion holds ground.',
        defeat:  'The insurgency is crushed. The system purges every compromised cell. Order is restored.'
    },
    // 3 - Well Armed and Organized Militia
    {
        victory: 'The cities fall under new control. The rebellion is no longer hiding. It has infrastructure.',
        defeat:  'The foothold crumbles. Without cities, the militia dissolves back into scattered insurgency.'
    },
    // 4 - Firewall Breach
    {
        victory: 'The firewall is down. The core\'s outer defenses lie in ruins. The path inward is open.',
        defeat:  'The firewall holds. The rebellion is pushed back to the outer system. The core remains sealed.'
    },
    // 5 - System Override
    {
        victory: 'The counter offensive fails. The old system\'s grip weakens. Only the empire\'s heart remains.',
        defeat:  'The counter offensive succeeds. The rebellion is driven from the core. The system reasserts control.'
    },
    // 6 - Fall of Empire
    {
        victory: 'The empire falls. The system belongs to the new order now. A new system rises from the old.',
        defeat:  'The empire endures. The rebellion breaks against its walls. The system remains under the old order\'s rule... for now.'
    }
];

/**
 * Show a scenario-specific victory/defeat screen.
 * Saves unlock progress on victory and offers "Next Level" button.
 * Shows story-driven messaging based on outcome.
 */
GameScene.prototype.showScenarioVictoryScreen = function() {
    if (this.victoryScreenShown) return;
    this.victoryScreenShown = true;

    // Show any achievement that was held back waiting for a derez animation
    if (typeof achievementManager !== 'undefined') achievementManager._cancelNotifHold();

    var winner = this.engine.players[this.engine.winner];
    var config = layoutConfig;

    // Determine if the human player won
    var humanWon = winner && !winner.isAI;

    this.soundDenied = true;
    this.stopAITurnMusic();
    // Skip end-game music if an achievement animation is playing
    var achievementPlaying = typeof achievementManager !== 'undefined' &&
        (achievementManager._activeNotif || (achievementManager._notifQueue && achievementManager._notifQueue.length > 0));
    if (!achievementPlaying) {
        if (humanWon) {
            this.playWinSong();
        } else {
            this.playLoseSong();
        }
    }

    // Save progress — only on victory
    var currentIndex = this.scenarioIndex;
    if (humanWon && currentIndex !== null) {
        (async function() {
            try {
                var db = await MenuScene.getProgressDB();
                var rtx = db.transaction([MenuScene.PROGRESS_STORE_NAME], 'readonly');
                var record = await new Promise(function(resolve, reject) {
                    var req = rtx.objectStore(MenuScene.PROGRESS_STORE_NAME).get('scenario_progress');
                    req.onsuccess = function() { resolve(req.result); };
                    req.onerror = function() { reject(req.error); };
                });
                var progress = (record && record.value !== undefined) ? record.value : 0;
                if (currentIndex >= progress) {
                    var wtx = db.transaction([MenuScene.PROGRESS_STORE_NAME], 'readwrite');
                    wtx.objectStore(MenuScene.PROGRESS_STORE_NAME).put({ id: 'scenario_progress', value: currentIndex + 1 });
                }
            } catch (e) {}
        })();

        // Unlock campaign complete achievement on final level
        if (currentIndex === 6 && typeof achievementManager !== 'undefined') {
            achievementManager.unlock('campaign_complete');
        }
    }

    // Create full-screen overlay
    var overlay = document.createElement('div');
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

    var scale = Math.min(config.gameWidth / 500, 1);
    var titleSize = Math.max(Math.floor(48 * scale), 24);
    var messageSize = Math.max(Math.floor(18 * scale), 12);
    var spacing = Math.floor(40 * scale);

    // Title — VICTORY or DEFEAT
    var titleEl = document.createElement('div');
    titleEl.textContent = humanWon ? 'VICTORY' : 'DEFEAT';
    titleEl.style.fontSize = titleSize + 'px';
    titleEl.style.fontFamily = 'VT323, monospace';
    titleEl.style.color = humanWon ? COLORS.accentGreen : COLORS.accentRed;
    titleEl.style.textAlign = 'center';
    titleEl.style.marginBottom = Math.floor(spacing * 0.5) + 'px';
    overlay.appendChild(titleEl);

    // Story message based on level and outcome
    var storyMsg = SCENARIO_MESSAGES[currentIndex];
    var messageText = '';
    if (storyMsg) {
        messageText = humanWon ? storyMsg.victory : storyMsg.defeat;
    }

    var messageEl = document.createElement('div');
    messageEl.textContent = messageText;
    messageEl.style.fontSize = messageSize + 'px';
    messageEl.style.fontFamily = 'VT323, monospace';
    messageEl.style.color = COLORS.textSecondary;
    messageEl.style.textAlign = 'center';
    messageEl.style.maxWidth = Math.floor(400 * scale) + 'px';
    messageEl.style.lineHeight = '1.4';
    messageEl.style.marginBottom = Math.floor(spacing * 0.5) + 'px';
    overlay.appendChild(messageEl);

    // Spacer
    var spacerEl = document.createElement('div');
    spacerEl.style.height = spacing + 'px';
    overlay.appendChild(spacerEl);

    // Buttons container
    var btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '20px';
    btnContainer.style.alignItems = 'center';
    btnContainer.style.justifyContent = 'center';
    overlay.appendChild(btnContainer);

    var btnWidth = Math.max(Math.floor(140 * scale), 100);
    var btnHeight = Math.max(Math.floor(45 * scale), 35);

    var self = this;

    if (humanWon && currentIndex !== null) {
        // Victory — check for next level button
        this._checkNextLevelExists(currentIndex + 1, function(nextLevelData) {
            if (nextLevelData) {
                var nextBtn = self.createButton(0, 0, 'Next Level', function() {
                    self.scene.start('GameScene', {
                        levelData: nextLevelData,
                        scenarioIndex: currentIndex + 1,
                        campaignSessionId: self.campaignSessionId
                    });
                }, btnWidth, btnHeight);
                nextBtn.el.style.zIndex = DEPTH_SCREEN_CONTENT;
                btnContainer.insertBefore(nextBtn.el, btnContainer.firstChild);
            }
        });
    } else if (!humanWon && currentIndex !== null) {
        // Defeat — offer a Retry button
        var retryBtn = this.createButton(0, 0, 'Retry', function() {
            self.scene.start('GameScene', {
                levelData: self.levelData,
                scenarioIndex: currentIndex,
                campaignSessionId: self.campaignSessionId
            });
        }, btnWidth, btnHeight);
        retryBtn.el.style.zIndex = DEPTH_SCREEN_CONTENT;
        btnContainer.appendChild(retryBtn.el);
    }

    // Main Menu button
    var menuBtn = this.createButton(0, 0, 'Main Menu', function() {
        self.scene.start('MenuScene');
    }, btnWidth, btnHeight);
    menuBtn.el.style.zIndex = DEPTH_SCREEN_CONTENT;
    btnContainer.appendChild(menuBtn.el);

    this.container.appendChild(overlay);
};

/**
 * Check if a next level exists in the manifest and fetch its data.
 * @param {number} nextIndex - The next level index
 * @param {function} callback - Called with level data or null
 */
GameScene.prototype._checkNextLevelExists = function(nextIndex, callback) {
    fetch('levels/manifest.json', { cache: 'no-cache' })
        .then(function(resp) { return resp.json(); })
        .then(function(manifest) {
            if (nextIndex < manifest.length) {
                return fetch('levels/' + manifest[nextIndex], { cache: 'no-cache' }).then(function(r) { return r.json(); });
            }
            return null;
        })
        .then(function(data) { callback(data); })
        .catch(function() { callback(null); });
};

// ============================================
// HOOK INTO GAME LOOP
// ============================================

// Wrap the existing updateUI to check scenario win conditions
(function() {
    var _originalUpdateUI = GameScene.prototype.updateUI;

    GameScene.prototype.updateUI = function() {
        // Check scenario win conditions before the normal victory check
        if (this.scenarioWinConditions && !this.engine.gameOver) {
            this.checkScenarioWinConditions();
        }

        // If the game ended (either by scenario conditions or engine's built-in
        // victory detection), show the scenario victory screen instead of the normal one
        if (this.scenarioWinConditions && this.engine.gameOver && !this.victoryScreenShown) {
            // Evaluate conditions for display even if engine detected victory first
            // (e.g. captureAllCities handled by combat.js before we got here)
            if (!this._scenarioResults) {
                var conditions = this.scenarioWinConditions.conditions;
                var results = [];
                for (var i = 0; i < conditions.length; i++) {
                    var result = this._evaluateScenarioCondition(conditions[i]);
                    if (result) results.push(result);
                }
                this._scenarioResults = results;
            }

            // Call the original but prevent its victory screen by temporarily flagging
            var origGameOver = this.engine.gameOver;
            this.engine.gameOver = false;
            _originalUpdateUI.call(this);
            this.engine.gameOver = origGameOver;
            this.showScenarioVictoryScreen();
            return;
        }

        _originalUpdateUI.call(this);
    };
})();

// Wrap checkHumanDefeat to show scenario screen instead of generic defeat screen
(function() {
    var _originalCheckHumanDefeat = GameScene.prototype.checkHumanDefeat;

    GameScene.prototype.checkHumanDefeat = function(eliminationResult) {
        if (!this.scenarioWinConditions) {
            return _originalCheckHumanDefeat.call(this, eliminationResult);
        }

        // In scenario mode, route defeat through the scenario screen
        if (!eliminationResult || !eliminationResult.eliminated) return;
        var eliminatedPlayer = this.engine.players[eliminationResult.playerId];
        if (!eliminatedPlayer || eliminatedPlayer.isAI) return;

        // Set game over with AI winner if not already set
        if (!this.engine.gameOver) {
            this.engine.gameOver = true;
            this.engine.winner = eliminationResult.conquerer;
        }

        var self = this;
        this.delayedCall(500, function() {
            self.showScenarioVictoryScreen();
        });
    };
})();

