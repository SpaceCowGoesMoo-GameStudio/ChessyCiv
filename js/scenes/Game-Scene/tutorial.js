// ============================================
// GAME SCENE - Tutorial Module
// ============================================
// First-time skirmish tutorial: center toast + flashing highlights.
//
// Conditions (all must pass):
//   • uiController.settings.hints === true
//   • Skirmish mode (scenarioIndex === null)
//   • New game, not loaded from a save
//   • Exactly one human player (single-player vs AI)
//   • No saved games exist yet in IndexedDB
//
// Skirmish tutorial steps:
//   0 – "TAP YOUR CITY TO SELECT IT"
//       City flashes; board + other pieces dim. Advances when human city tapped.
//   1 – "TAP PRODUCTION TO BUILD UNITS"
//       Production button flashes. Advances when popup opens.
//   2 – "EXPLORE OPTIONS, THEN TAP × TO CLOSE"
//       × close button inside the production popup flashes. Advances when popup closes.
//       → marks civchess_has_seen_production_hint when completing this step.
//   3 – "MOVE A WARRIOR: TAP IT, THEN TAP OR DRAG TO MOVE"
//       One warrior flashes. Advances when a warrior moves successfully.
//       → skipped if civchess_has_seen_warrior_hint (seen in campaign level 1).
//       → marks civchess_has_seen_warrior_hint when completing this step.
//   4 – "OPEN VIEW PLAYERS TO SEE OPPONENTS AND DECLARE WAR"
//       View Players button flashes; × flashes once popup is open. Advances when closed.
//   5 – "OPEN VIEW RELATIONS TO SEE YOUR DIPLOMACY WEB"
//       View Relations button flashes; × flashes once popup is open. Advances when closed.
//   6 – "PRESS NEXT TURN SO OPPONENTS MOVE AND PRODUCTION ADVANCES"
//       Next Turn button flashes. Tutorial ends when Next Turn is pressed.
//
// Next Turn at any point: immediately ends the tutorial.
//
// Campaign timed hints (auto-dismiss, no interaction needed):
//   Level 1 – warrior movement hint → attack mechanic hint (after level-intro toast fades)
//   Level 4 – production hint × 2 (after level-intro toast fades)
//   On war     – attack mechanic hint (first time human player is at war; skirmish waits for tutorial)
//   On settler – settler hint (first time human player produces a settler; skirmish waits for tutorial)

// ── Tutorial progress persistence (IndexedDB) ────────────────────────────────
// Replaces localStorage for tracking which hints / tutorial the player has seen.
// Uses a simple key-value object store in 'civchess_tutorial_v1'.
// All reads go through the in-memory _cache (populated on first load).
const TutorialProgress = {
    DB_NAME:      'civchess_tutorial_v1',
    STORE:        'progress',
    _db:          null,
    _dbPromise:   null,
    _cache:       {},
    _loadPromise: null,

    _openDB: function() {
        if (this._db) return Promise.resolve(this._db);
        if (this._dbPromise) return this._dbPromise;
        const self = this;
        this._dbPromise = new Promise(function(resolve, reject) {
            const req = indexedDB.open(self.DB_NAME, 1);
            req.onerror   = function() { reject(req.error); };
            req.onsuccess = function() { self._db = req.result; resolve(self._db); };
            req.onupgradeneeded = function(e) {
                e.target.result.createObjectStore(self.STORE, { keyPath: 'key' });
            };
        });
        return this._dbPromise;
    },

    /** Load all flags into _cache (idempotent — returns the same promise). */
    load: function() {
        if (this._loadPromise) return this._loadPromise;
        const self = this;
        this._loadPromise = this._openDB().then(function(db) {
            return new Promise(function(resolve) {
                try {
                    const tx  = db.transaction([self.STORE], 'readonly');
                    const req = tx.objectStore(self.STORE).getAll();
                    req.onsuccess = function() {
                        (req.result || []).forEach(function(r) { self._cache[r.key] = r.value; });
                        resolve();
                    };
                    req.onerror = function() { resolve(); };
                } catch (_e) { resolve(); }
            });
        }).catch(function() {});
        return this._loadPromise;
    },

    /** Synchronous read from cache (call after load() has resolved). */
    getSeen: function(key) { return !!this._cache[key]; },

    /** Write flag to cache + IndexedDB (fire-and-forget). */
    markSeen: function(key) {
        this._cache[key] = true;
        this._openDB().then(function(db) {
            try {
                db.transaction([TutorialProgress.STORE], 'readwrite')
                  .objectStore(TutorialProgress.STORE)
                  .put({ key: key, value: true });
            } catch (_e) {}
        }).catch(function() {});
    },

    /** Clear all flags from cache + IndexedDB (fire-and-forget). */
    clearAll: function() {
        this._cache = {};
        this._loadPromise = null; // allow fresh load next time
        this._openDB().then(function(db) {
            try {
                db.transaction([TutorialProgress.STORE], 'readwrite')
                  .objectStore(TutorialProgress.STORE)
                  .clear();
            } catch (_e) {}
        }).catch(function() {});
    }
};

// ---- Inject CSS animations once at script load ----
(function _injectTutorialCSS() {
    if (document.getElementById('_tut_css')) return;
    const s = document.createElement('style');
    s.id = '_tut_css';
    s.textContent =
        '@keyframes _tut_piece_pulse{' +
        '0%,100%{box-shadow:0 0 8px 4px rgba(0,212,255,.65),0 0 20px 8px rgba(0,212,255,.25)}' +
        '50%{box-shadow:0 0 18px 8px rgba(0,212,255,1),0 0 36px 14px rgba(0,212,255,.5)}' +
        '}' +
        '._tut_piece_flash{' +
        'animation:_tut_piece_pulse .7s ease-in-out infinite;' +
        'border-radius:50%;' +
        '}';
    document.head.appendChild(s);
}());

// ── Init (async – called from create()) ──────────────────────────────────────

GameScene.prototype._initTutorial = async function() {
    this._tutorialActive = false;
    this._tutorialStep = -1;

    // Must be skirmish (no campaign level), a brand-new game (not loaded), hints on
    if (this.scenarioIndex !== null) return;
    if (this.savedGame) return;
    if (typeof uiController === 'undefined' || !uiController.settings.hints) return;

    // Exactly one human player (single-player vs AI)
    const humanPlayers = this.engine.players.filter(p => !p.isAI);
    if (humanPlayers.length !== 1) return;

    // Check that the tutorial hasn't been seen before
    await TutorialProgress.load();
    if (TutorialProgress.getSeen('civchess_has_seen_tutorial')) return;

    // All conditions met — record which player is human and start after scene settles
    this._tutorialHumanIndex = this.engine.players.indexOf(humanPlayers[0]);
    this.delayedCall(900, () => this._startTutorial());
};

// ── Start ─────────────────────────────────────────────────────────────────────

GameScene.prototype._startTutorial = function() {
    this._tutorialActive = true;
    this._tutorialFlashInterval = null;
    this._tutorialFlashEl = null;
    this._tutorialFlashElRef = null;
    this._tutorialFlashOrigTransition = undefined;
    this._tutorialDeclareWarCount = 0;

    const scene = this;

    // ── Method wrappers installed on the instance ──────────────────────────
    // Each wrapper calls the original prototype method, then reacts to the
    // tutorial state. Wrappers are removed (via `delete`) in _endTutorial.

    const _origEndTurn = this.endTurn.bind(this);
    this.endTurn = function() {
        if (scene._tutorialActive) scene._endTutorial('next_turn');
        _origEndTurn();
    };

    const _origSelectPiece = this.selectPiece.bind(this);
    this.selectPiece = function(sprite) {
        _origSelectPiece(sprite);
        if (scene._tutorialActive && scene._tutorialStep === 0 &&
            sprite && sprite.pieceData &&
            sprite.pieceData.type === PIECE_TYPES.CITY &&
            sprite.pieceData.ownerId === scene._tutorialHumanIndex) {
            scene._advanceTutorial();
        }
    };

    const _origShowProd = this.showProductionPopup.bind(this);
    this.showProductionPopup = function() {
        _origShowProd();
        if (scene._tutorialActive && scene._tutorialStep === 1) {
            scene._advanceTutorial();
        }
        scene._repositionTutorialToast(true);
    };

    const _origHideProd = this.hideProductionPopup.bind(this);
    this.hideProductionPopup = function() {
        _origHideProd();
        scene._repositionTutorialToast(false);
        if (scene._tutorialActive && scene._tutorialStep === 2) {
            scene._advanceTutorial();
        }
    };

    if (typeof this.onMoveSuccess === 'function') {
        const _origMoveSuccess = this.onMoveSuccess.bind(this);
        this.onMoveSuccess = function(piece, result, count) {
            _origMoveSuccess(piece, result, count);
            if (scene._tutorialActive && piece.type === PIECE_TYPES.WARRIOR) {
                // Mark warrior as moved at any step so step 3 is skipped if already done
                if (!scene._hintWarriorSeen) {
                    scene._hintWarriorSeen = true;
                    TutorialProgress.markSeen('civchess_has_seen_warrior_hint');
                }
                if (scene._tutorialStep === 3) scene._advanceTutorial();
            }
        };
    }

    if (typeof this.onMoveSuccessAnimated === 'function') {
        const _origMoveAnim = this.onMoveSuccessAnimated.bind(this);
        this.onMoveSuccessAnimated = function(piece, result, count) {
            _origMoveAnim(piece, result, count);
            if (scene._tutorialActive && piece.type === PIECE_TYPES.WARRIOR) {
                if (!scene._hintWarriorSeen) {
                    scene._hintWarriorSeen = true;
                    TutorialProgress.markSeen('civchess_has_seen_warrior_hint');
                }
                if (scene._tutorialStep === 3) scene._advanceTutorial();
            }
        };
    }

    const _origEnqueueMovement = this.enqueueMovement.bind(this);
    this.enqueueMovement = function(piece, destRow, destCol) {
        const result = _origEnqueueMovement(piece, destRow, destCol);
        if (result && scene._tutorialActive && piece.type === PIECE_TYPES.WARRIOR &&
            piece.ownerId === scene._tutorialHumanIndex) {
            if (!scene._hintWarriorSeen) {
                scene._hintWarriorSeen = true;
                TutorialProgress.markSeen('civchess_has_seen_warrior_hint');
            }
            if (scene._tutorialStep === 3) scene._advanceTutorial();
        }
        return result;
    };

    const _origShowPlayers = this.showPlayersPopup.bind(this);
    this.showPlayersPopup = function() {
        _origShowPlayers();
        if (scene._tutorialActive && scene._tutorialStep === 4) {
            scene._clearTutorialFlash();
            const closeBtn = scene.playersPopup &&
                scene.playersPopup.content.querySelector('.popup-close');
            if (closeBtn) scene._tutorialFlashElement(closeBtn);
        }
        scene._repositionTutorialToast(true);
    };

    const _origHidePlayers = this.hidePlayersPopup.bind(this);
    this.hidePlayersPopup = function() {
        _origHidePlayers();
        scene._repositionTutorialToast(false);
        if (scene._tutorialActive && scene._tutorialStep === 4) {
            scene._advanceTutorial();
        }
    };

    const _origShowRelations = this.showRelationsPopup.bind(this);
    this.showRelationsPopup = function() {
        _origShowRelations();
        if (scene._tutorialActive && scene._tutorialStep === 5) {
            scene._clearTutorialFlash();
            const closeBtn = scene.relationsPopup &&
                scene.relationsPopup.content.querySelector('.popup-close');
            if (closeBtn) scene._tutorialFlashElement(closeBtn);
        }
        scene._repositionTutorialToast(true);
    };

    const _origHideRelations = this.hideRelationsPopup.bind(this);
    this.hideRelationsPopup = function() {
        _origHideRelations();
        scene._repositionTutorialToast(false);
        if (scene._tutorialActive && scene._tutorialStep === 5) {
            scene._advanceTutorial();
        }
    };

    const _origToggleDiplomacy = this.toggleDiplomacy.bind(this);
    this.toggleDiplomacy = function(targetIndex) {
        if (scene._tutorialActive && scene._tutorialStep === 4) {
            const currentPlayer = scene.engine.getCurrentPlayer();
            const targetPlayer = scene.engine.players[targetIndex];
            if (currentPlayer && targetPlayer) {
                const myRel = currentPlayer.relations[targetIndex];
                const theirRel = targetPlayer.relations[scene.engine.currentPlayerIndex];
                if (myRel === 'peace' && theirRel === 'peace') {
                    scene._tutorialDeclareWarCount++;
                    const n = scene._tutorialDeclareWarCount;
                    if (n === 1) {
                        scene._setTutorialToastMessage(
                            'Good job! That would have declared war and put you in danger.\nPress \u00d7 to exit.');
                    } else if (n === 2) {
                        scene._setTutorialToastMessage(
                            'Yeah, that\'s a really fun button! It would immediately put you in war, which could make things harder for you right now.\nPress \u00d7 to exit.');
                    } else if (n === 3) {
                        scene._setTutorialToastMessage(
                            'I see you really want to press that button. Are you sure about that?');
                    } else {
                        scene._setTutorialToastMessage('Okie doke! Go crazy :D');
                        if (typeof achievementManager !== 'undefined') {
                            achievementManager.unlock('okie_doke');
                        }
                        _origToggleDiplomacy(targetIndex);
                    }
                    return;
                }
            }
        }
        _origToggleDiplomacy(targetIndex);
    };

    // ── Create persistent UI elements ──────────────────────────────────────

    // Dim overlay: sits between the board canvas stack and piece layer,
    // so board tiles are darkened but piece sprites remain above it.
    const dimOverlay = document.createElement('div');
    dimOverlay.style.cssText =
        'position:absolute;inset:0;background:rgba(0,0,0,0);' +
        'z-index:60;pointer-events:none;transition:background 0.35s;';
    this.boardArea.insertBefore(dimOverlay, this.pieceContainer);
    this._tutorialDimOverlay = dimOverlay;

    // Center toast
    const toast = this._createTutorialToast();
    this.container.appendChild(toast);
    this._tutorialToastEl = toast;

    // Kick off step 0 (position adjustment is done inside _showTutorialStep)
    this._showTutorialStep(0);
};

// ── Step management ───────────────────────────────────────────────────────────

GameScene.prototype._showTutorialStep = function(step) {
    // Clear effects from previous step
    this._clearTutorialFlash();
    this._tutorialRestorePieceOpacities();

    this._tutorialStep = step;

    const messages = [
        'Tap your city to select it',
        'Tap production to build units and projects',
        'Tap an option to produce it. The warrior production makes more warriors and science makes them (and your cities) stronger. Tap \u00d7 to close',
        'Move a warrior: tap it, then tap within the green squares to move immediately, or drag/tap outside of them to plan a path',
        'Open view players to declare war, propose peace, or withdraw your offer. Both sides must propose for peace to take effect',
        'Open view relations to see the status between all alive players, shown by their color, with red meaning war and grey meaning peace',
        'Press next turn to allow your opponents to move and production to advance.'
    ];
    this._setTutorialToastMessage(messages[step] || '');

    // Reposition toast to avoid covering the piece highlighted in this step.
    // Step 3 highlights a warrior; all other steps reference the city.
    this._adjustTutorialToastForPiece(
        this._tutorialToastEl,
        this._getHumanPiece(step === 3 ? PIECE_TYPES.WARRIOR : PIECE_TYPES.CITY)
    );

    if (step === 0) {
        // Dim board overlay
        if (this._tutorialDimOverlay) {
            this._tutorialDimOverlay.style.background = 'rgba(0,0,0,0.3)';
        }
        // Find human's city sprite
        const cityPiece = this.engine.pieces.find(
            p => p.type === PIECE_TYPES.CITY && p.ownerId === this._tutorialHumanIndex
        );
        if (cityPiece) {
            const citySprite = this.pieceSprites.get(cityPiece.id);
            // Dim every piece EXCEPT the target city
            for (const [, sprite] of this.pieceSprites) {
                if (sprite !== citySprite) {
                    sprite.el.style.opacity = '0.35';
                }
            }
            // Flash the city
            if (citySprite) this._tutorialFlashPiece(citySprite);
        }

    } else if (step === 1) {
        // Board is no longer dimmed
        if (this._tutorialDimOverlay) {
            this._tutorialDimOverlay.style.background = 'rgba(0,0,0,0)';
        }
        // Flash whichever production button is currently visible
        const prodBtn = layoutConfig.mobile
            ? (this.mobileProductionBtn ? this.mobileProductionBtn.el : null)
            : (this.desktopProductionBtn ? this.desktopProductionBtn.el : null);
        if (prodBtn) this._tutorialFlashElement(prodBtn);

    } else if (step === 2) {
        // Flash the × close button inside the production popup
        // (the popup was just shown by showProductionPopup before advanceTutorial was called)
        const closeBtn = this.productionPopup &&
            this.productionPopup.content.querySelector('.popup-close');
        if (closeBtn) this._tutorialFlashElement(closeBtn);

    } else if (step === 3) {
        // Flash the human player's first warrior
        const warriorPiece = this.engine.pieces.find(
            p => p.type === PIECE_TYPES.WARRIOR && p.ownerId === this._tutorialHumanIndex
        );
        if (warriorPiece) {
            const warriorSprite = this.pieceSprites.get(warriorPiece.id);
            if (warriorSprite) this._tutorialFlashPiece(warriorSprite);
        }

    } else if (step === 4) {
        // Flash the View Players button; X flashes once the popup opens (handled in wrapper)
        if (this.viewPlayersBtn) this._tutorialFlashElement(this.viewPlayersBtn.el);

    } else if (step === 5) {
        // Flash the View Relations button; X flashes once the popup opens (handled in wrapper)
        if (this.viewRelationsBtn) this._tutorialFlashElement(this.viewRelationsBtn.el);

    } else if (step === 6) {
        // Flash the Next Turn button — pressing it ends the tutorial via the endTurn wrapper
        if (this.nextTurnBtn) this._tutorialFlashElement(this.nextTurnBtn.el);
    }
};

GameScene.prototype._advanceTutorial = function() {
    if (!this._tutorialActive) return;
    const next = this._tutorialStep + 1;

    // Both production steps (1 and 2) have now been seen — mark the hint bool.
    if (this._tutorialStep === 2) {
        this._hintProductionSeen = true;
        TutorialProgress.markSeen('civchess_has_seen_production_hint');
    }
    // Completing the warrior movement step marks it as seen too.
    if (this._tutorialStep === 3) {
        this._hintWarriorSeen = true;
        TutorialProgress.markSeen('civchess_has_seen_warrior_hint');
    }

    if (next > 6) {
        this._endTutorial('completed');
    } else {
        // Skip production steps (1–2) if player already saw them in campaign level 4
        let target = next;
        if (target === 1 && this._hintProductionSeen) target = 3;
        // Skip the warrior movement step if the player has already seen it in campaign
        if (target === 3 && this._hintWarriorSeen) target = 4;
        this._showTutorialStep(target);
    }
};

// ── End ───────────────────────────────────────────────────────────────────────

GameScene.prototype._endTutorial = function(reason) {
    if (!this._tutorialActive) return;
    this._tutorialActive = false;
    this._tutorialStep = -1;

    // Mark as seen so it never shows again
    TutorialProgress.markSeen('civchess_has_seen_tutorial');

    // Stop all flash effects and restore piece opacities
    this._clearTutorialFlash();
    this._tutorialRestorePieceOpacities();

    // Fade out and remove toast
    if (this._tutorialToastEl) {
        const t = this._tutorialToastEl;
        t.style.transition = 'opacity 0.4s';
        t.style.opacity = '0';
        setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 450);
        this._tutorialToastEl = null;
    }

    // Fade out and remove dim overlay
    if (this._tutorialDimOverlay) {
        const d = this._tutorialDimOverlay;
        d.style.background = 'rgba(0,0,0,0)';
        setTimeout(function() { if (d.parentNode) d.parentNode.removeChild(d); }, 400);
        this._tutorialDimOverlay = null;
    }

    // Restore wrapped methods by removing instance-level overrides
    // (prototype method takes over again after delete)
    delete this.endTurn;
    delete this.selectPiece;
    delete this.showProductionPopup;
    delete this.hideProductionPopup;
    delete this.showPlayersPopup;
    delete this.hidePlayersPopup;
    delete this.showRelationsPopup;
    delete this.hideRelationsPopup;
    if (this.hasOwnProperty('toggleDiplomacy')) delete this.toggleDiplomacy;
    if (this.hasOwnProperty('onMoveSuccess')) delete this.onMoveSuccess;
    if (this.hasOwnProperty('onMoveSuccessAnimated')) delete this.onMoveSuccessAnimated;
    if (this.hasOwnProperty('enqueueMovement')) delete this.enqueueMovement;
};

// ── Toast creation & update ───────────────────────────────────────────────────

GameScene.prototype._createTutorialToast = function() {
    const toastWidth = Math.min(210, Math.floor(BOARD_SIZE * TILE_SIZE * 0.55));
    const boardCenterX = BOARD_OFFSET + (BOARD_SIZE * TILE_SIZE) / 2;
    // Position toast at ~38% down from the top of the board
    const toastY = BOARD_OFFSET + Math.floor(BOARD_SIZE * TILE_SIZE * 0.38);

    const el = document.createElement('div');
    el.className = 'tutorial-hint-toast';
    el.style.cssText =
        'position:absolute;' +
        'left:' + Math.floor(boardCenterX - toastWidth / 2) + 'px;' +
        'top:' + toastY + 'px;' +
        'width:' + toastWidth + 'px;' +
        'background:#0a0a14;' +
        'border:3px solid #00d4ff;' +
        'box-shadow:' +
            '0 0 0 1px #0a0a14,' +
            '0 0 0 4px rgba(0,212,255,0.55),' +
            '0 0 22px rgba(0,212,255,0.35);' +
        'font-family:VT323,monospace;' +
        'text-transform:uppercase;' +
        'letter-spacing:1px;' +
        'z-index:' + (DEPTH_TOAST_TEXT + 10) + ';' +
        'pointer-events:none;' +
        'image-rendering:pixelated;' +
        'opacity:0;' +
        'transition:opacity 0.35s;';

    // Header row
    const header = document.createElement('div');
    header.style.cssText =
        'padding:4px 8px;' +
        'font-size:13px;' +
        'color:#00d4ff;' +
        'text-align:center;' +
        'letter-spacing:3px;' +
        'border-bottom:1px solid rgba(0,212,255,0.3);';
    header.textContent = '// HINT \\\\';
    el.appendChild(header);
    el._headerEl = header;

    // Message area
    const msgEl = document.createElement('div');
    msgEl.style.cssText =
        'padding:10px 12px;' +
        'font-size:18px;' +
        'color:#ffffff;' +
        'text-align:center;' +
        'line-height:1.3;' +
        'white-space:normal;';
    el.appendChild(msgEl);

    // Store msg element for updates
    el._msgEl = msgEl;

    // Store normal geometry so _restoreMobileHintNormal can reset without recomputing
    el._normalLeft  = Math.floor(boardCenterX - toastWidth / 2);
    el._normalTop   = toastY;
    el._normalWidth = toastWidth;

    // Fade in on next frame (element must be in DOM first)
    requestAnimationFrame(function() { el.style.opacity = '1'; });

    return el;
};

/**
 * Find the first board piece of the given type owned by the first non-AI player.
 * Returns null if none is found.
 * @param {string} type - A PIECE_TYPES value.
 */
GameScene.prototype._getHumanPiece = function(type) {
    if (!this.engine) return null;
    const humanPlayer = this.engine.players.find(function(p) { return !p.isAI; });
    if (!humanPlayer) return null;
    const humanIdx = this.engine.players.indexOf(humanPlayer);
    return this.engine.pieces.find(function(p) {
        return p.type === type && p.ownerId === humanIdx;
    }) || null;
};

/**
 * Reposition a hint toast to avoid covering a specific board piece.
 * Always recomputes from the canonical default Y so it can be called on every
 * step or hint transition and will produce the correct result regardless of
 * any previous adjustment.
 *
 * If the default position does not overlap the piece, the toast is reset to
 * the default. If it does overlap, the toast is shifted up (piece in lower
 * half) or down (piece in upper half), clamped to the board grid.
 *
 * @param {HTMLElement} toast - The toast element to reposition.
 * @param {object|null} piece - A piece object with a `.row` property, or null
 *                              to reset the toast to the default position.
 */
GameScene.prototype._adjustTutorialToastForPiece = function(toast, piece) {
    if (!toast) return;

    // Use the actual rendered height when the element is already in the DOM.
    // On narrow / small screens the message wraps to more lines, making the toast
    // taller than any fixed tile-size estimate would predict.  offsetHeight
    // captures that automatically.  Fall back to an approximation for the test
    // environment (no layout engine) or if the element hasn't been laid out yet.
    const toastH   = (toast.offsetHeight > 0) ? toast.offsetHeight : Math.ceil(TILE_SIZE * 1.5);
    const gap      = Math.ceil(TILE_SIZE * 0.35);
    const defaultY = BOARD_OFFSET + Math.floor(BOARD_SIZE * TILE_SIZE * 0.38);
    const boardTop    = BOARD_OFFSET;
    const boardBottom = BOARD_OFFSET + BOARD_SIZE * TILE_SIZE;

    let newY = defaultY;

    if (piece) {
        const pieceTop    = BOARD_OFFSET + piece.row * TILE_SIZE;
        const pieceBottom = pieceTop + TILE_SIZE;
        const toastBottom = defaultY + toastH;

        if (!(defaultY >= pieceBottom + gap || toastBottom <= pieceTop - gap)) {
            // Overlap — shift away from the piece
            if (piece.row < BOARD_SIZE / 2) {
                newY = Math.min(pieceBottom + gap, boardBottom - toastH);
            } else {
                newY = Math.max(pieceTop - gap - toastH, boardTop);
            }
        }
    }

    toast._normalTop = newY;
    toast.style.top = newY + 'px';
};

GameScene.prototype._setTutorialToastMessage = function(msg) {
    if (this._tutorialToastEl && this._tutorialToastEl._msgEl) {
        this._tutorialToastEl._msgEl.innerHTML = msg.replace(/\n/g, '<br>');
    }
    // Keep the mobile below zone in sync if it is currently active
    if (this._tutorialToastEl && this._tutorialToastEl._mobileHintActive &&
            this._tutorialToastEl._mobileBelowEl) {
        this._tutorialToastEl._mobileBelowEl.innerHTML = msg.replace(/\n/g, '<br>');
    }
};

// ── Flash helpers ─────────────────────────────────────────────────────────────

/**
 * Add a CSS pulse animation to a piece sprite element.
 * Stores the element ref so _clearTutorialFlash can remove the class.
 */
GameScene.prototype._tutorialFlashPiece = function(sprite) {
    if (!sprite || !sprite.el) return;
    this._tutorialFlashEl = sprite.el;
    sprite.el.classList.add('_tut_piece_flash');
};

/**
 * Flash a DOM button element by toggling box-shadow on an interval.
 * Mirrors the how-to-play button flash style.
 */
GameScene.prototype._tutorialFlashElement = function(el) {
    if (!el) return;
    this._tutorialFlashElRef = el;
    this._tutorialFlashOrigTransition = el.style.transition;
    el.style.transition = 'box-shadow 0.28s ease-in-out';

    let on = true;
    const apply = function() {
        el.style.boxShadow = on
            ? '0 0 12px 3px #00d4ff, inset 0 0 8px 2px rgba(0,212,255,0.3)'
            : 'none';
        on = !on;
    };
    apply();
    this._tutorialFlashInterval = setInterval(apply, 320);
};

/**
 * Stop all active flash effects and restore styles.
 */
GameScene.prototype._clearTutorialFlash = function() {
    // CSS animation on piece element
    if (this._tutorialFlashEl) {
        this._tutorialFlashEl.classList.remove('_tut_piece_flash');
        this._tutorialFlashEl = null;
    }
    // setInterval flash on button element
    if (this._tutorialFlashInterval !== null && this._tutorialFlashInterval !== undefined) {
        clearInterval(this._tutorialFlashInterval);
        this._tutorialFlashInterval = null;
    }
    if (this._tutorialFlashElRef) {
        this._tutorialFlashElRef.style.boxShadow = 'none';
        if (this._tutorialFlashOrigTransition !== undefined) {
            this._tutorialFlashElRef.style.transition = this._tutorialFlashOrigTransition;
        }
        this._tutorialFlashElRef = null;
    }
};

/**
 * Slide the toast out of the way when a popup is open, then back when it closes.
 *   Mobile:  slide down to just above the bottom of the container.
 *   Desktop: slide left to the left edge of the board (clear of the centred popup).
 */
GameScene.prototype._repositionTutorialToast = function(belowPopup) {
    if (!this._tutorialToastEl) return;

    const toastWidth = Math.min(210, Math.floor(BOARD_SIZE * TILE_SIZE * 0.55));
    const boardCenterX = BOARD_OFFSET + (BOARD_SIZE * TILE_SIZE) / 2;
    const normalY = BOARD_OFFSET + Math.floor(BOARD_SIZE * TILE_SIZE * 0.38);

    if (layoutConfig.mobile) {
        if (belowPopup) {
            // Defer one frame so the popup is fully laid out before measuring
            const scene = this;
            requestAnimationFrame(function() { scene._showMobileHintAroundPopup(); });
        } else {
            this._restoreMobileHintNormal();
        }
    } else {
        // Popup is centred in the full container; slide the toast to the left
        // edge of the board so it sits clear of the popup.
        const normalLeft   = Math.floor(boardCenterX - toastWidth / 2);
        const leftSideLeft = BOARD_OFFSET;
        this._tutorialToastEl.style.transition = 'left 0.2s ease-out, opacity 0.35s';
        this._tutorialToastEl.style.left = (belowPopup ? leftSideLeft : normalLeft) + 'px';
    }
};

/**
 * On mobile when a popup opens: expand the hint toast to cover the full game scene
 * (transparent, behind the popup), then show the HINT label above the popup and the
 * message text below it — both constrained to the popup's horizontal column so no
 * text appears in the space to the left or right of the popup box.
 */
GameScene.prototype._showMobileHintAroundPopup = function() {
    const toast = this._tutorialToastEl;
    if (!toast) return;

    // Clean up any previous mobile layout before rebuilding
    if (toast._mobileHintActive) this._restoreMobileHintNormal();

    // Find whichever popup is currently visible
    let popupContent = null;
    if (this.productionPopup && this.productionPopup.visible) popupContent = this.productionPopup.content;
    else if (this.playersPopup && this.playersPopup.visible)  popupContent = this.playersPopup.content;
    else if (this.relationsPopup && this.relationsPopup.visible) popupContent = this.relationsPopup.content;
    if (!popupContent) return;

    // Measure popup and container in screen space, convert to container-relative coords
    const containerRect = this.container.getBoundingClientRect();
    const popupRect     = popupContent.getBoundingClientRect();

    const popupTop    = popupRect.top    - containerRect.top;
    const popupBottom = popupRect.bottom - containerRect.top;
    const popupLeft   = popupRect.left   - containerRect.left;
    const popupW      = popupRect.width;
    const containerW  = containerRect.width;
    const containerH  = containerRect.height;

    // Text column: same width as popup, horizontally centred on the popup
    const popupCenterX = popupLeft + popupW / 2;
    const textW    = popupW;
    const textLeft = Math.max(0, Math.min(containerW - textW, Math.floor(popupCenterX - textW / 2)));

    const msgHTML = toast._msgEl ? toast._msgEl.innerHTML : '';
    const PAD = 8;

    // Transform toast into a full-size transparent overlay behind the popup
    toast.style.transition = 'none';
    toast.style.left       = '0';
    toast.style.top        = '0';
    toast.style.width      = containerW + 'px';
    toast.style.height     = containerH + 'px';
    toast.style.background = 'transparent';
    toast.style.border     = 'none';
    toast.style.boxShadow  = 'none';
    toast.style.padding    = '0';
    toast.style.overflow   = 'hidden';

    // Hide original header and message so they don't show through
    if (toast._headerEl) toast._headerEl.style.display = 'none';
    if (toast._msgEl)    toast._msgEl.style.display    = 'none';

    // ── Above zone: HINT label anchored to the bottom of the above space ──
    const aboveAvail = popupTop - PAD * 2;
    if (aboveAvail > 24) {
        const aboveEl = document.createElement('div');
        aboveEl.style.cssText =
            'position:absolute;' +
            'left:' + textLeft + 'px;' +
            'top:' + PAD + 'px;' +
            'width:' + textW + 'px;' +
            'height:' + aboveAvail + 'px;' +
            'overflow:hidden;' +
            'display:flex;flex-direction:column;align-items:center;justify-content:flex-end;' +
            'padding-bottom:4px;' +
            'font-family:VT323,monospace;text-transform:uppercase;letter-spacing:1px;';

        const hdrEl = document.createElement('div');
        hdrEl.style.cssText =
            'background:#0a0a14;border:3px solid #00d4ff;' +
            'box-shadow:0 0 0 1px #0a0a14,0 0 0 4px rgba(0,212,255,0.55),0 0 22px rgba(0,212,255,0.35);' +
            'padding:4px 8px;font-size:13px;color:#00d4ff;' +
            'text-align:center;letter-spacing:3px;';
        hdrEl.textContent = '// HINT \\\\';
        aboveEl.appendChild(hdrEl);

        toast.appendChild(aboveEl);
        toast._mobileAboveEl = aboveEl;
    }

    // ── Below zone: message text anchored to the top of the below space ──
    const belowStart = popupBottom + PAD;
    const belowAvail = containerH - belowStart - PAD;
    if (belowAvail > 28) {
        const belowEl = document.createElement('div');
        belowEl.style.cssText =
            'position:absolute;' +
            'left:' + textLeft + 'px;' +
            'top:' + belowStart + 'px;' +
            'width:' + textW + 'px;' +
            'max-height:' + belowAvail + 'px;' +
            'overflow:hidden;' +
            'background:#0a0a14;border:3px solid #00d4ff;' +
            'box-shadow:0 0 0 1px #0a0a14,0 0 0 4px rgba(0,212,255,0.55),0 0 22px rgba(0,212,255,0.35);' +
            'padding:8px 12px;box-sizing:border-box;' +
            'font-family:VT323,monospace;text-transform:uppercase;letter-spacing:1px;' +
            'font-size:14px;color:#ffffff;text-align:center;line-height:1.3;' +
            'word-break:break-word;overflow-wrap:break-word;';
        belowEl.innerHTML = msgHTML;

        toast.appendChild(belowEl);
        toast._mobileBelowEl = belowEl;
    }

    toast._mobileHintActive = true;
};

/**
 * Restore the tutorial hint toast to its normal compact size after a popup closes on mobile.
 */
GameScene.prototype._restoreMobileHintNormal = function() {
    const toast = this._tutorialToastEl;
    if (!toast || !toast._mobileHintActive) return;

    // Remove mobile text zones
    if (toast._mobileAboveEl) {
        if (toast._mobileAboveEl.parentNode === toast) toast.removeChild(toast._mobileAboveEl);
        toast._mobileAboveEl = null;
    }
    if (toast._mobileBelowEl) {
        if (toast._mobileBelowEl.parentNode === toast) toast.removeChild(toast._mobileBelowEl);
        toast._mobileBelowEl = null;
    }

    // Restore original children
    if (toast._headerEl) toast._headerEl.style.display = '';
    if (toast._msgEl)    toast._msgEl.style.display    = '';

    // Restore compact toast styling using the geometry stored at creation time
    toast.style.transition = 'none';
    toast.style.left       = toast._normalLeft  + 'px';
    toast.style.top        = toast._normalTop   + 'px';
    toast.style.width      = toast._normalWidth + 'px';
    toast.style.height     = '';
    toast.style.overflow   = '';
    toast.style.background = '#0a0a14';
    toast.style.border     = '3px solid #00d4ff';
    toast.style.boxShadow  =
        '0 0 0 1px #0a0a14,' +
        '0 0 0 4px rgba(0,212,255,0.55),' +
        '0 0 22px rgba(0,212,255,0.35)';

    toast._mobileHintActive = false;
};

/**
 * Pause all active hints (called when the hints setting is turned off mid-game).
 * Hides toasts and removes visual effects without ending the tutorial state,
 * so _resumeHints can restore everything at the same step.
 */
GameScene.prototype._pauseHints = function() {
    this._hintsPaused = true;

    // Skirmish tutorial toast
    if (this._tutorialActive && this._tutorialToastEl) {
        this._tutorialToastEl.style.transition = 'opacity 0.3s';
        this._tutorialToastEl.style.opacity = '0';
        this._clearTutorialFlash();
        this._tutorialRestorePieceOpacities();
        if (this._tutorialDimOverlay) {
            this._tutorialDimOverlay.style.background = 'rgba(0,0,0,0)';
        }
    }

    // Campaign persistent warrior hint
    if (this._campaignWarriorHintEl) {
        this._campaignWarriorHintEl.style.transition = 'opacity 0.3s';
        this._campaignWarriorHintEl.style.opacity = '0';
    }

    // Campaign persistent production hint (level 4)
    if (this._campaignProductionHintEl) {
        this._campaignProductionHintEl.style.transition = 'opacity 0.3s';
        this._campaignProductionHintEl.style.opacity = '0';
        this._clearTutorialFlash();
        this._tutorialRestorePieceOpacities();
        if (this._campaignProdDimOverlay) {
            this._campaignProdDimOverlay.style.background = 'rgba(0,0,0,0)';
        }
    }

    // Any timed hint toasts still in the scene container
    if (this.container) {
        const toasts = this.container.querySelectorAll('.tutorial-hint-toast');
        toasts.forEach(function(el) {
            el.style.transition = 'opacity 0.3s';
            el.style.opacity = '0';
        });
    }
};

/**
 * Resume all active hints (called when the hints setting is turned back on mid-game).
 * Restores toast visibility and re-applies flash effects for the current tutorial step.
 */
GameScene.prototype._resumeHints = function() {
    this._hintsPaused = false;

    // Skirmish tutorial toast — re-apply the current step's effects
    if (this._tutorialActive && this._tutorialToastEl) {
        this._tutorialToastEl.style.transition = 'opacity 0.3s';
        this._tutorialToastEl.style.opacity = '1';
        this._showTutorialStep(this._tutorialStep);
    }

    // Campaign persistent warrior hint
    if (this._campaignWarriorHintEl) {
        this._campaignWarriorHintEl.style.transition = 'opacity 0.3s';
        this._campaignWarriorHintEl.style.opacity = '1';
    }

    // Campaign persistent production hint (level 4) — re-apply flash and dim
    if (this._campaignProductionHintEl) {
        this._campaignProductionHintEl.style.transition = 'opacity 0.3s';
        this._campaignProductionHintEl.style.opacity = '1';
        if (this._campaignProdStep === 0) {
            // Restore board dim and city flash
            if (this._campaignProdDimOverlay) {
                this._campaignProdDimOverlay.style.background = 'rgba(0,0,0,0.3)';
            }
            const humanIndex = this._campaignProdHumanIndex !== undefined
                ? this._campaignProdHumanIndex
                : (this.engine.players.findIndex(function(p) { return !p.isAI; }));
            const cityPiece = this.engine.pieces.find(function(p) {
                return p.type === PIECE_TYPES.CITY && p.ownerId === humanIndex;
            });
            if (cityPiece) {
                const citySprite = this.pieceSprites.get(cityPiece.id);
                for (const [, sprite] of this.pieceSprites) {
                    if (sprite !== citySprite) sprite.el.style.opacity = '0.35';
                }
                if (citySprite) this._tutorialFlashPiece(citySprite);
            }
        } else if (this._campaignProdStep === 1) {
            const prodBtn = layoutConfig.mobile
                ? (this.mobileProductionBtn ? this.mobileProductionBtn.el : null)
                : (this.desktopProductionBtn ? this.desktopProductionBtn.el : null);
            if (prodBtn) this._tutorialFlashElement(prodBtn);
        } else if (this._campaignProdStep === 2) {
            const closeBtn = this.productionPopup &&
                this.productionPopup.content.querySelector('.popup-close');
            if (closeBtn) this._tutorialFlashElement(closeBtn);
        }
    }

    // Any timed hint toasts still in the scene container
    if (this.container) {
        const toasts = this.container.querySelectorAll('.tutorial-hint-toast');
        toasts.forEach(function(el) {
            el.style.transition = 'opacity 0.3s';
            el.style.opacity = '1';
        });
    }
};

/**
 * Returns true if any hint toast is currently active.
 * Used to prevent multiple hints from showing simultaneously.
 */
GameScene.prototype._isAnyHintActive = function() {
    if (this._levelIntroActive)        return true;
    if (this._tutorialActive)          return true;
    if (this._campaignWarriorHintEl)   return true;
    if (this._campaignProductionHintEl) return true;
    if (this._campaignNextTurnHintEl)  return true;
    // Catch any in-DOM timed hint toasts
    if (this.container &&
            this.container.querySelector('.tutorial-hint-toast')) return true;
    return false;
};

/**
 * Restore opacity on all piece sprites (called when leaving a step that dimmed them).
 */
GameScene.prototype._tutorialRestorePieceOpacities = function() {
    for (const [, sprite] of this.pieceSprites) {
        sprite.el.style.opacity = '';
    }
};

// ── General Post-Tutorial Hints ───────────────────────────────────────────────
// One-shot timed hints tracked in IndexedDB (civchess_tutorial_v1 via TutorialProgress).
//
// Tracked booleans (IndexedDB keys):
//   civchess_has_seen_tutorial              – full skirmish tutorial
//   civchess_has_seen_attack_hint           – attack mechanic hint (first time at war)
//   civchess_has_seen_warrior_hint          – warrior movement hint (skirmish tutorial step 3)
//   civchess_has_seen_campaign_l1_warrior   – warrior movement hint shown on campaign level 1
//   civchess_has_seen_production_hint       – production tips (tutorial steps 1–2, or campaign lvl 4)
//   civchess_has_seen_settler_hint          – settler hint (first time human player has a settler)

/**
 * Returns the ms delay needed after game-start for post-intro hints to appear without
 * overlapping the level-name toast. Uses the same word-count formula as showLevelIntroToast.
 */
GameScene.prototype._introFadeDelay = function() {
    let introWords = this._levelName ? this._levelName.split(/\s+/).length : 0;
    if (this._levelDescription) introWords += this._levelDescription.split(/\s+/).length;
    const introHold = Math.max(2500, introWords * 300); // mirror showLevelIntroToast formula
    return 400 + 300 + introHold + 500 + 600; // initial delay + fade-in + hold + fade-out + buffer
};

/**
 * Initialise hint tracking bools and schedule campaign-specific hint sequences.
 * Called from create() after _initTutorial().
 */
GameScene.prototype._initHints = async function() {
    await TutorialProgress.load();
    this._hintAttackSeen     = TutorialProgress.getSeen('civchess_has_seen_attack_hint');
    this._hintWarriorSeen    = TutorialProgress.getSeen('civchess_has_seen_warrior_hint');
    this._hintProductionSeen = TutorialProgress.getSeen('civchess_has_seen_production_hint');
    this._hintNextTurnSeen   = TutorialProgress.getSeen('civchess_has_seen_next_turn_hint');
    this._hintSettlerSeen    = TutorialProgress.getSeen('civchess_has_seen_settler_hint');

    const hintsOn = typeof uiController === 'undefined' || uiController.settings.hints;
    if (!hintsOn) return;

    const scene = this;

    // ── Campaign level 1: warrior movement (persistent) → warrior attack → next turn ──
    // (manifest 0-based → level 1 = index 0)
    if (this.scenarioIndex === 0) {
        // Use a campaign-specific warrior flag so skirmish warrior movement doesn't
        // suppress the warrior tutorial on campaign level 1.
        const showWarrior  = !TutorialProgress.getSeen('civchess_has_seen_campaign_l1_warrior');
        const showAttack   = !this._hintAttackSeen;
        const showNextTurn = !this._hintNextTurnSeen;

        if (showWarrior || showAttack || showNextTurn) {
            const msgWarrior  = 'Move a warrior: tap it, then tap within the green squares to move immediately, or drag/tap outside of them to plan a path';
            const msgAttack   = 'To attack an enemy warrior or city, move your piece onto their tile. If they have a higher tech (science) relative to you, it will take more hits to destroy them';
            const msgNextTurn = 'Press next turn to end your turn. Opponents will move and production will advance';
            const durAttack   = Math.max(2500, msgAttack.split(/\s+/).length * 300);

            // ── Early detection: warrior moved or Next Turn pressed during intro delay ──
            // These lightweight wrappers set flags so the scheduled hints can skip
            // themselves if the player has already performed the action.
            if (showWarrior) {
                scene._campaignWarriorMoved = false;
                if (typeof scene.onMoveSuccess === 'function') {
                    const _earlyOMS = scene.onMoveSuccess.bind(scene);
                    scene.onMoveSuccess = function(piece, result, count) {
                        _earlyOMS(piece, result, count);
                        if (piece && piece.type === PIECE_TYPES.WARRIOR) {
                            const owner = scene.engine.players[piece.ownerId];
                            if (owner && !owner.isAI) scene._campaignWarriorMoved = true;
                        }
                    };
                }
                if (typeof scene.onMoveSuccessAnimated === 'function') {
                    const _earlyOMSA = scene.onMoveSuccessAnimated.bind(scene);
                    scene.onMoveSuccessAnimated = function(piece, result, count) {
                        _earlyOMSA(piece, result, count);
                        if (piece && piece.type === PIECE_TYPES.WARRIOR) {
                            const owner = scene.engine.players[piece.ownerId];
                            if (owner && !owner.isAI) scene._campaignWarriorMoved = true;
                        }
                    };
                }
                const _earlyEnqueue = scene.enqueueMovement.bind(scene);
                scene.enqueueMovement = function(piece, destRow, destCol) {
                    const result = _earlyEnqueue(piece, destRow, destCol);
                    if (result && piece && piece.type === PIECE_TYPES.WARRIOR) {
                        const owner = scene.engine.players[piece.ownerId];
                        if (owner && !owner.isAI) scene._campaignWarriorMoved = true;
                    }
                    return result;
                };
            }

            if (showNextTurn) {
                scene._campaignNextTurnPressed = false;
                const _earlyEndTurn = scene.endTurn.bind(scene);
                scene.endTurn = function() {
                    scene._campaignNextTurnPressed = true;
                    _earlyEndTurn();
                };
            }

            // Build callback chain from back to front
            const nextTurnCb = showNextTurn ? function() {
                scene.delayedCall(400, function() {
                    scene._showCampaignNextTurnHint(msgNextTurn);
                });
            } : undefined;

            const attackCb = showAttack ? function() {
                scene.delayedCall(400, function() {
                    scene._showTimedHint(msgAttack, durAttack, nextTurnCb, '#ff4444');
                });
            } : nextTurnCb;

            // Retry until no other hint is active (level intro may still be fading).
            // Without retry, _showCampaignWarriorHint/_showTimedHint would silently
            // drop the hint and never call onDone, breaking the whole chain.
            scene.delayedCall(scene._introFadeDelay(), function tryShowL1Hints() {
                if (scene._isAnyHintActive()) {
                    scene.delayedCall(500, tryShowL1Hints);
                    return;
                }
                if (showWarrior) {
                    // Persistent hint — dismissed when the human player moves a warrior
                    scene._showCampaignWarriorHint(msgWarrior, attackCb || null);
                } else if (showAttack) {
                    scene._showTimedHint(msgAttack, durAttack, nextTurnCb, '#ff4444');
                } else {
                    scene._showCampaignNextTurnHint(msgNextTurn);
                }
            });

            // Mark seen immediately — prevents duplicate via _checkAttackHint or a replay
            if (showWarrior) {
                this._hintWarriorSeen = true;
                TutorialProgress.markSeen('civchess_has_seen_warrior_hint');
                TutorialProgress.markSeen('civchess_has_seen_campaign_l1_warrior');
            }
            if (showAttack) {
                this._hintAttackSeen = true;
                TutorialProgress.markSeen('civchess_has_seen_attack_hint');
            }
            if (showNextTurn) {
                this._hintNextTurnSeen = true;
                TutorialProgress.markSeen('civchess_has_seen_next_turn_hint');
            }
        }
    }

    // ── Campaign level 4: production hints ────────────────────────────────────
    // (manifest 0-based → level 4 = index 3)
    if (this.scenarioIndex === 3 && !this._hintProductionSeen) {
        scene.delayedCall(scene._introFadeDelay(), function tryShowProdHint() {
            if (scene._isAnyHintActive()) {
                scene.delayedCall(500, tryShowProdHint);
                return;
            }
            scene._showCampaignProductionHint();
        });

        // Mark as seen immediately so it never repeats even if the player leaves early
        this._hintProductionSeen = true;
        TutorialProgress.markSeen('civchess_has_seen_production_hint');
    }
};

/**
 * Show the campaign level 4 production tutorial, mirroring skirmish steps 0–2:
 *   Step 0 – Dim board + flash city; "Tap your city to select it"
 *            Advances when the human taps their city.
 *   Step 1 – Clear dim; flash production button; "Tap production to build units and projects"
 *            Advances when the production popup opens.
 *   Step 2 – Flash × close button; "Explore options, then tap × to close"
 *            Dismissed when the popup closes.
 *            → marks civchess_has_seen_production_hint when completing this step.
 */
GameScene.prototype._showCampaignProductionHint = function() {
    const scene = this;

    // Respect hints setting (delayedCall might fire after hints were turned off)
    if (typeof uiController !== 'undefined' && !uiController.settings.hints) return;
    if (this._isAnyHintActive()) return;

    // Find human player
    const humanPlayers = this.engine.players.filter(function(p) { return !p.isAI; });
    if (humanPlayers.length === 0) return;
    const humanIndex = this.engine.players.indexOf(humanPlayers[0]);
    this._campaignProdHumanIndex = humanIndex; // stored for _resumeHints

    // Create toast (stored in _tutorialToastEl so repositioning helpers work)
    const toast = this._createTutorialToast();
    if (!toast) return;
    this.container.appendChild(toast);
    this._campaignProductionHintEl = toast;
    this._tutorialToastEl = toast;

    // Dim overlay — same construction as skirmish tutorial
    const dimOverlay = document.createElement('div');
    dimOverlay.style.cssText =
        'position:absolute;inset:0;background:rgba(0,0,0,0);' +
        'z-index:60;pointer-events:none;transition:background 0.35s;';
    this.boardArea.insertBefore(dimOverlay, this.pieceContainer);
    this._campaignProdDimOverlay = dimOverlay;

    this._campaignProdStep = 0;

    // ── Step 0: city flash ───────────────────────────────────────────────────
    toast._msgEl.innerHTML = 'Tap your city to select it';
    dimOverlay.style.background = 'rgba(0,0,0,0.3)';

    const cityPiece = this.engine.pieces.find(function(p) {
        return p.type === PIECE_TYPES.CITY && p.ownerId === humanIndex;
    });
    this._adjustTutorialToastForPiece(toast, cityPiece || null);
    if (cityPiece) {
        const citySprite = this.pieceSprites.get(cityPiece.id);
        for (const [, sprite] of this.pieceSprites) {
            if (sprite !== citySprite) sprite.el.style.opacity = '0.35';
        }
        if (citySprite) this._tutorialFlashPiece(citySprite);
    }

    // ── Instance wrappers ────────────────────────────────────────────────────

    // selectPiece → advance step 0 when human taps their city
    const _origSelectPiece = this.selectPiece.bind(this);
    this.selectPiece = function(sprite) {
        _origSelectPiece(sprite);
        if (scene._campaignProdStep === 0 &&
                sprite && sprite.pieceData &&
                sprite.pieceData.type === PIECE_TYPES.CITY &&
                sprite.pieceData.ownerId === humanIndex) {
            scene._advanceCampaignProductionHint();
        }
    };

    // showProductionPopup → advance step 1 when popup opens; reposition toast
    const _origShow = this.showProductionPopup.bind(this);
    this.showProductionPopup = function() {
        _origShow();
        if (scene._campaignProdStep === 1) {
            scene._advanceCampaignProductionHint();
        }
        scene._repositionTutorialToast(true);
    };

    // hideProductionPopup → dismiss hint on step 2; reposition toast otherwise
    const _origHide = this.hideProductionPopup.bind(this);
    this.hideProductionPopup = function() {
        _origHide();
        scene._repositionTutorialToast(false);
        if (scene._campaignProdStep === 2) {
            scene._dismissCampaignProductionHint();
        }
    };

    // endTurn → dismiss hint whenever the player presses Next Turn
    const _origEndTurn = this.endTurn.bind(this);
    this.endTurn = function() {
        if (scene._campaignProductionHintEl) scene._dismissCampaignProductionHint();
        _origEndTurn();
    };
};

/**
 * Advance the campaign production tutorial to the next step.
 */
GameScene.prototype._advanceCampaignProductionHint = function() {
    this._campaignProdStep++;
    this._clearTutorialFlash();
    this._tutorialRestorePieceOpacities();

    if (this._campaignProdStep === 1) {
        // Remove dim overlay
        if (this._campaignProdDimOverlay) {
            this._campaignProdDimOverlay.style.background = 'rgba(0,0,0,0)';
        }
        // Flash production button
        const prodBtn = layoutConfig.mobile
            ? (this.mobileProductionBtn ? this.mobileProductionBtn.el : null)
            : (this.desktopProductionBtn ? this.desktopProductionBtn.el : null);
        if (prodBtn) this._tutorialFlashElement(prodBtn);
        this._setTutorialToastMessage('Tap production to build units and projects');
        this._adjustTutorialToastForPiece(this._tutorialToastEl, this._getHumanPiece(PIECE_TYPES.CITY));

    } else if (this._campaignProdStep === 2) {
        // Flash × close button inside the production popup
        const closeBtn = this.productionPopup &&
            this.productionPopup.content.querySelector('.popup-close');
        if (closeBtn) this._tutorialFlashElement(closeBtn);
        this._setTutorialToastMessage(
            'Tap an option to produce it. The warrior production makes more warriors ' +
            '(see How to Play for more info). Tap \u00d7 to close');
        this._adjustTutorialToastForPiece(this._tutorialToastEl, this._getHumanPiece(PIECE_TYPES.CITY));
    }
};

/**
 * Dismiss the campaign production hint, restore all wrapped methods and visuals,
 * and mark the production hint as seen in IndexedDB.
 */
GameScene.prototype._dismissCampaignProductionHint = function() {
    const toast = this._campaignProductionHintEl;
    this._campaignProductionHintEl = null;
    if (this._tutorialToastEl === toast) this._tutorialToastEl = null;
    this._campaignProdStep = -1;

    // Remove instance-level wrappers
    if (this.hasOwnProperty('selectPiece'))          delete this.selectPiece;
    if (this.hasOwnProperty('showProductionPopup'))  delete this.showProductionPopup;
    if (this.hasOwnProperty('hideProductionPopup'))  delete this.hideProductionPopup;
    if (this.hasOwnProperty('endTurn'))              delete this.endTurn;

    this._clearTutorialFlash();
    this._tutorialRestorePieceOpacities();

    // Remove dim overlay
    if (this._campaignProdDimOverlay) {
        const d = this._campaignProdDimOverlay;
        d.style.background = 'rgba(0,0,0,0)';
        setTimeout(function() { if (d.parentNode) d.parentNode.removeChild(d); }, 400);
        this._campaignProdDimOverlay = null;
    }

    // Mark as seen now that the player has completed the full flow
    this._hintProductionSeen = true;
    TutorialProgress.markSeen('civchess_has_seen_production_hint');

    if (toast) {
        toast.style.transition = 'opacity 0.4s';
        toast.style.opacity = '0';
        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 450);
    }
};

/**
 * Called at the start of each human turn.
 * Shows the attack mechanic hint once, the first time the human player is at war.
 * In skirmish mode, waits until the tutorial has ended before showing.
 */
GameScene.prototype._checkAttackHint = function() {
    if (this._hintAttackSeen === undefined) return; // _initHints not yet called
    if (this._hintAttackSeen) return;
    if (typeof uiController === 'undefined' || !uiController.settings.hints) return;
    if (this._isAnyHintActive()) return;

    const humanPlayers = this.engine.players.filter(function(p) { return !p.isAI; });
    if (humanPlayers.length === 0) return;

    const humanPlayer = humanPlayers[0];
    const atWar = humanPlayer.relations &&
        Object.values(humanPlayer.relations).some(function(r) { return r === 'war'; });
    if (!atWar) return;

    const msg = 'To attack an enemy warrior or city, move your piece onto their tile. ' +
                'If they have a higher tech relative to you, it will take more hits to destroy them';
    const dur = Math.max(2500, msg.split(/\s+/).length * 300);
    // Campaign context → red dial; skirmish context → cyan dial
    const dialColor = (this.scenarioIndex !== null && this.scenarioIndex !== undefined) ? '#ff4444' : '#00d4ff';
    this._showTimedHint(msg, dur, undefined, dialColor);

    this._hintAttackSeen = true;
    TutorialProgress.markSeen('civchess_has_seen_attack_hint');
};

/**
 * Called at the start of each human turn.
 * Shows the settler hint once, the first time the human player has a settler piece.
 * In skirmish mode, waits until the tutorial has ended before showing.
 */
GameScene.prototype._checkSettlerHint = function() {
    if (this._hintSettlerSeen === undefined) return; // _initHints not yet called
    if (this._hintSettlerSeen) return;
    if (typeof uiController === 'undefined' || !uiController.settings.hints) return;
    if (this._tutorialActive) return; // wait for skirmish tutorial to finish
    if (this._isAnyHintActive()) return;

    const humanPlayers = this.engine.players.filter(function(p) { return !p.isAI; });
    if (humanPlayers.length !== 1) return;

    const humanIdx = this.engine.players.indexOf(humanPlayers[0]);
    const hasSettler = this.engine.pieces.some(function(p) {
        return p.type === PIECE_TYPES.SETTLER && p.ownerId === humanIdx;
    });
    if (!hasSettler) return;

    const msg = 'To settle a new city, select your settler piece and move it to the points on ' +
                'the board that glow gold. Once there, tap the settler again while it has a move ' +
                'left (while not gray), then press the green \u201cSETTLE\u201d button.';
    const dur = Math.max(2500, msg.split(/\s+/).length * 300);
    this._showTimedHint(msg, dur);

    this._hintSettlerSeen = true;
    TutorialProgress.markSeen('civchess_has_seen_settler_hint');
};

/**
 * Show a persistent warrior-movement hint toast on campaign level 1.
 * The toast stays until the human player successfully moves a warrior, at which point
 * it fades out and `onDone` is called (used to chain the attack hint).
 * Uses the same instance-level wrapper pattern as the skirmish tutorial.
 * @param {string}   msg    - Message text.
 * @param {function} onDone - Called after the toast fades out.
 */
GameScene.prototype._showCampaignWarriorHint = function(msg, onDone) {
    // If a human warrior moved during the intro delay, skip straight to the next hint
    if (this._campaignWarriorMoved) {
        if (typeof onDone === 'function') onDone();
        return;
    }
    if (this._isAnyHintActive()) return;

    const toast = this._createTutorialToast();
    if (!toast) return;
    this.container.appendChild(toast);
    toast._msgEl.innerHTML = msg.replace(/\n/g, '<br>');
    this._campaignWarriorHintEl    = toast;
    this._campaignWarriorHintDone  = onDone || null;

    // Flash the human player's warrior — same highlight as skirmish tutorial step 3
    const humanIdx = this.engine.players.findIndex(function(p) { return !p.isAI; });
    if (humanIdx !== -1) {
        const warriorPiece = this.engine.pieces.find(function(p) {
            return p.type === PIECE_TYPES.WARRIOR && p.ownerId === humanIdx;
        });
        this._adjustTutorialToastForPiece(toast, warriorPiece || null);
        if (warriorPiece) {
            const warriorSprite = this.pieceSprites.get(warriorPiece.id);
            if (warriorSprite) this._tutorialFlashPiece(warriorSprite);
        }
    }

    const scene = this;

    // Install lightweight instance-level wrappers that fire once a human warrior moves.
    // Mirrors the skirmish tutorial wrappers for step 3.
    if (typeof this.onMoveSuccess === 'function') {
        const _orig = this.onMoveSuccess.bind(this);
        this.onMoveSuccess = function(piece, result, count) {
            _orig(piece, result, count);
            if (scene._campaignWarriorHintEl && piece.type === PIECE_TYPES.WARRIOR) {
                const owner = scene.engine.players[piece.ownerId];
                if (owner && !owner.isAI) scene._dismissCampaignWarriorHint();
            }
        };
    }

    if (typeof this.onMoveSuccessAnimated === 'function') {
        const _orig = this.onMoveSuccessAnimated.bind(this);
        this.onMoveSuccessAnimated = function(piece, result, count) {
            _orig(piece, result, count);
            if (scene._campaignWarriorHintEl && piece.type === PIECE_TYPES.WARRIOR) {
                const owner = scene.engine.players[piece.ownerId];
                if (owner && !owner.isAI) scene._dismissCampaignWarriorHint();
            }
        };
    }

    const _origEnqueue = this.enqueueMovement.bind(this);
    this.enqueueMovement = function(piece, destRow, destCol) {
        const result = _origEnqueue(piece, destRow, destCol);
        if (result && scene._campaignWarriorHintEl && piece.type === PIECE_TYPES.WARRIOR) {
            const owner = scene.engine.players[piece.ownerId];
            if (owner && !owner.isAI) scene._dismissCampaignWarriorHint();
        }
        return result;
    };
};

/**
 * Fade out and remove the campaign warrior hint toast, restore the wrapped methods,
 * then call the stored onDone callback.
 */
GameScene.prototype._dismissCampaignWarriorHint = function() {
    const toast = this._campaignWarriorHintEl;
    const onDone = this._campaignWarriorHintDone;
    this._campaignWarriorHintEl   = null;
    this._campaignWarriorHintDone = null;

    // Remove instance-level wrappers
    if (this.hasOwnProperty('onMoveSuccess'))         delete this.onMoveSuccess;
    if (this.hasOwnProperty('onMoveSuccessAnimated')) delete this.onMoveSuccessAnimated;
    if (this.hasOwnProperty('enqueueMovement'))       delete this.enqueueMovement;

    this._clearTutorialFlash();

    if (toast) {
        toast.style.transition = 'opacity 0.4s';
        toast.style.opacity = '0';
        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
            if (typeof onDone === 'function') onDone();
        }, 450);
    } else if (typeof onDone === 'function') {
        onDone();
    }
};

/**
 * Show a persistent next-turn hint toast on campaign level 1.
 * Flashes the Next Turn button. Dismissed when the player presses Next Turn.
 * @param {string} msg - Message text.
 */
GameScene.prototype._showCampaignNextTurnHint = function(msg) {
    // If Next Turn was pressed before this hint was scheduled, skip it entirely
    if (this._campaignNextTurnPressed) {
        if (this.hasOwnProperty('endTurn')) delete this.endTurn;
        return;
    }
    if (this._isAnyHintActive()) return;

    const toast = this._createTutorialToast();
    if (!toast) return;
    this.container.appendChild(toast);
    toast._msgEl.innerHTML = msg.replace(/\n/g, '<br>');
    this._campaignNextTurnHintEl = toast;
    this._adjustTutorialToastForPiece(toast, this._getHumanPiece(PIECE_TYPES.CITY));

    // Flash the Next Turn button
    if (this.nextTurnBtn) this._tutorialFlashElement(this.nextTurnBtn.el);

    const scene = this;

    // Wrap endTurn to dismiss when the player presses Next Turn
    const _orig = this.endTurn.bind(this);
    this.endTurn = function() {
        if (scene._campaignNextTurnHintEl) scene._dismissCampaignNextTurnHint();
        _orig();
    };
};

/**
 * Fade out and remove the campaign next-turn hint toast, restore the wrapped method,
 * and stop the button flash.
 */
GameScene.prototype._dismissCampaignNextTurnHint = function() {
    const toast = this._campaignNextTurnHintEl;
    this._campaignNextTurnHintEl = null;

    if (this.hasOwnProperty('endTurn')) delete this.endTurn;
    this._clearTutorialFlash();

    if (toast) {
        toast.style.transition = 'opacity 0.4s';
        toast.style.opacity = '0';
        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 450);
    }
};

/**
 * Show a timed hint toast that auto-dismisses after `duration` ms.
 * Reuses the tutorial toast DOM factory for a consistent visual style.
 * @param {string}   msg       - Message text (supports \n for line breaks).
 * @param {number}   duration  - Display duration in ms.
 * @param {function} [onDone]  - Optional callback fired after the toast is removed.
 * @param {string}   [dialColor] - 8-bit dial color; defaults to cyan (hint) or auto-detected from campaign context.
 */
GameScene.prototype._showTimedHint = function(msg, duration, onDone, dialColor) {
    if (this._isAnyHintActive()) return;
    const toast = this._createTutorialToast();
    if (!toast) return;
    this.container.appendChild(toast);
    toast._msgEl.innerHTML = msg.replace(/\n/g, '<br>');
    this._adjustTutorialToastForPiece(toast, this._getHumanPiece(PIECE_TYPES.CITY));

    // Add X dismiss button to header (matching relations popup style)
    const header = toast._headerEl;
    header.style.position = 'relative';
    header.textContent = '';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = '// HINT \\\\';
    header.appendChild(titleSpan);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'X';
    closeBtn.style.cssText =
        'position:absolute;right:0;top:50%;transform:translateY(-50%);' +
        'font-family:VT323,monospace;font-size:24px;color:#00d4ff;' +
        'background:transparent;border:none;cursor:pointer;' +
        'padding:4px 10px;line-height:1;outline:none;pointer-events:auto;';
    if (window.matchMedia('(hover: hover)').matches) {
        closeBtn.addEventListener('mouseenter', function() { closeBtn.style.color = '#ff4444'; });
        closeBtn.addEventListener('mouseleave', function() { closeBtn.style.color = '#00d4ff'; });
    }
    header.appendChild(closeBtn);

    // 8-bit countdown dial — centred below the toast box
    if (typeof _makeTimeDial === 'function') {
        var color = dialColor || '#00d4ff';
        var dial = _makeTimeDial(color, duration);
        dial.el.style.position  = 'absolute';
        dial.el.style.bottom    = '-46px';   // below toast border + 6 px gap
        dial.el.style.left      = '50%';
        dial.el.style.transform = 'translateX(-50%)';
        toast.appendChild(dial.el);
    }

    const scene = this;
    var dismissed = false;
    function dismissHint() {
        if (dismissed) return;
        dismissed = true;
        clearTimeout(timerId);
        var idx = scene._timers.indexOf(timerId);
        if (idx !== -1) scene._timers.splice(idx, 1);
        toast.style.transition = 'opacity 0.4s';
        toast.style.opacity = '0';
        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
            if (typeof onDone === 'function') onDone();
        }, 450);
    }
    closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (scene.playClickSound) scene.playClickSound();
        dismissHint();
    });
    var timerId = scene.delayedCall(duration, dismissHint);
};
