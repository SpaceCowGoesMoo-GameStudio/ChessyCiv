/**
 * UIController - Options panel creation and settings UI
 * Prototype extension for UIController
 */

/**
 * Create the options panel
 */
UIController.prototype.createOptionsPanel = function() {
    const panel = document.createElement('div');
    panel.id = 'options-panel';

    // Add inline styles for the panel
    panel.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        width: 340px;
        height: 100vh;
        background: #0a0a14;
        border-left: 2px solid #00d4ff;
        box-shadow: -4px 0 0 #0088aa;
        font-family: 'VT323', monospace;
        display: none;
        flex-direction: column;
        overflow: hidden;
        image-rendering: pixelated;
    `;

    panel.innerHTML = `
        <div class="options-header" style="display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid #00d4ff44;">
            <span class="options-title" style="font-size: 24px; color: #00d4ff; text-shadow: 0 0 10px #00d4ff;">// OPTIONS</span>
            <button id="btn-close-options" class="close-btn" style="font-family: 'VT323', monospace; font-size: 32px; background: none; border: none; color: #00d4ff; cursor: pointer; padding: 0 10px;">×</button>
        </div>
        <div class="options-content" style="padding: 20px; flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y;">
            <div class="option-group" style="margin-bottom: 0; padding-bottom: 18px; border-bottom: 1px solid #00d4ff22;">
                <label class="option-label" style="display: block; font-size: 14px; color: #00d4ff88; letter-spacing: 3px; text-transform: uppercase; text-shadow: 0 0 6px #00d4ff44; text-align: center; margin-top: 0; margin-bottom: 18px; padding-top: 0;">&#9608; Auto-Save Interval (turns) &#9608;</label>
                <input type="number" id="opt-autosave" class="option-input" min="1" max="50" value="${this.settings.autoSaveTurns}" style="font-family: 'VT323', monospace; font-size: 20px; width: 100%; padding: 10px 15px; background: #0a0a14; border: 1px solid #00d4ff66; color: #00ff88; outline: none;">
            </div>

            <div class="option-group" style="margin-bottom: 0; padding-bottom: 18px; border-bottom: 1px solid #00d4ff22;">
                <label class="option-label" style="display: block; font-size: 14px; color: #00d4ff88; letter-spacing: 3px; text-transform: uppercase; text-shadow: 0 0 6px #00d4ff44; text-align: center; margin-top: 0; margin-bottom: 18px; padding-top: 18px;">&#9608; Master Volume &#9608;</label>
                <div class="slider-container" style="display: flex; align-items: center; gap: 15px;">
                    <input type="range" id="opt-volume" class="option-slider" min="0" max="100" value="${this.settings.masterVolume}" style="flex: 1; height: 8px; background: #0a0a14; border: 1px solid #00d4ff66; outline: none; cursor: pointer;">
                    <span id="volume-display" class="slider-value" style="font-size: 20px; color: #00ff88; min-width: 50px; text-align: right;">${this.settings.masterVolume}%</span>
                </div>
            </div>

            <div class="option-group" style="margin-bottom: 0; padding-bottom: 18px; border-bottom: 1px solid #00d4ff22;">
                <label class="option-label" style="display: block; font-size: 14px; color: #00d4ff88; letter-spacing: 3px; text-transform: uppercase; text-shadow: 0 0 6px #00d4ff44; text-align: center; margin-top: 0; margin-bottom: 18px; padding-top: 18px;">&#9608; Gameplay &#9608;</label>

                <div class="dev-mode-container" style="display: flex; align-items: center; gap: 15px; margin-bottom: 12px;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="opt-hints" ${this.settings.hints ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <span style="font-size: 16px; color: #ccc;">Tutorial Hints</span>
                </div>
                <button id="btn-clear-hints" style="font-family: 'VT323', monospace; font-size: 16px; padding: 8px 16px; background: rgba(0, 212, 255, 0.1); border: 1px solid rgba(0, 212, 255, 0.4); color: #00d4ff; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; width: 100%; margin-top: 4px;">[ Clear Hint Progress ]</button>

                <div style="margin-top: 16px;">
                    <span style="display: block; font-size: 13px; color: #00d4ff88; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">Attack Adjacent Chance</span>
                    <div class="slider-container" style="display: flex; align-items: center; gap: 15px;">
                        <input type="range" id="opt-attack-adj" class="option-slider" min="0" max="100" value="${this.settings.attackAdjacentChance}" style="flex: 1; height: 8px; background: #0a0a14; border: 1px solid #00d4ff66; outline: none; cursor: pointer;">
                        <span id="attack-adj-display" class="slider-value" style="font-size: 20px; color: #00ff88; min-width: 50px; text-align: right;">${this.settings.attackAdjacentChance}%</span>
                    </div>
                </div>
            </div>

            <div class="option-group" style="margin-bottom: 0; padding-bottom: 18px; border-bottom: 1px solid #00d4ff22;">
                <label class="option-label" style="display: block; font-size: 14px; color: #00d4ff88; letter-spacing: 3px; text-transform: uppercase; text-shadow: 0 0 6px #00d4ff44; text-align: center; margin-top: 0; margin-bottom: 18px; padding-top: 18px;">&#9608; Graphics &#9608;</label>

                <div class="dev-mode-container" style="display: flex; align-items: center; gap: 15px; margin-bottom: 12px;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="opt-crt" ${this.settings.crtEffects ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <span style="font-size: 16px; color: #ccc;">CRT Effects</span>
                </div>

                <div class="dev-mode-container" style="display: flex; align-items: center; gap: 15px; margin-bottom: 12px;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="opt-reduced-shadows" ${this.settings.reducedShadows ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <span style="font-size: 16px; color: #ccc;">Reduced Shadows</span>
                </div>

                <div class="dev-mode-container" style="display: flex; align-items: center; gap: 15px; margin-bottom: 12px;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="opt-show-fps" ${this.settings.showFPS ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <span style="font-size: 16px; color: #ccc;">Show FPS</span>
                </div>

                <div class="dev-mode-container" style="display: flex; align-items: center; gap: 15px;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="opt-precomputed" ${this.settings.precomputedEffects ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <span style="font-size: 16px; color: #ccc;">Precomputed Effects</span>
                </div>
            </div>

            <div id="debug-section" class="option-group" style="margin-bottom: 0; padding-bottom: 18px; border-bottom: 1px solid #00d4ff22; display: none;">
                <label class="option-label" style="display: block; font-size: 14px; color: #00d4ff88; letter-spacing: 3px; text-transform: uppercase; text-shadow: 0 0 6px #00d4ff44; text-align: center; margin-top: 0; margin-bottom: 18px; padding-top: 18px;">&#9608; Debug &#9608;</label>
                <button id="btn-preview-achievement" style="font-family: 'VT323', monospace; font-size: 16px; padding: 8px 16px; background: rgba(255, 200, 0, 0.1); border: 1px solid rgba(255, 200, 0, 0.4); color: #ffc800; cursor: pointer; text-transform: uppercase; letter-spacing: 1px;">Test Achievement Effect</button>
                <button id="btn-cheat-circle" style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#cc0000;border:2px solid #880000;cursor:pointer;padding:0;margin-left:10px;vertical-align:middle;"></button>
            </div>

            <div class="option-group" style="margin-bottom: 0; padding-bottom: 0;">
                <label class="option-label" style="display: block; font-size: 14px; color: #00d4ff88; letter-spacing: 3px; text-transform: uppercase; text-shadow: 0 0 6px #00d4ff44; text-align: center; margin-top: 0; margin-bottom: 18px; padding-top: 18px;">&#9608; System Control &#9608;</label>
                <input type="text" id="opt-system-input" placeholder="ENTER COMMAND..." style="font-family: 'VT323', monospace; font-size: 20px; width: 100%; padding: 10px 15px; background: #0a0a14; border: 1px solid #00d4ff66; color: #00ff88; outline: none; letter-spacing: 1px;" autocomplete="off" spellcheck="false">
                <button id="btn-system-submit" style="font-family: 'VT323', monospace; font-size: 18px; width: 100%; padding: 10px 15px; margin-top: 10px; background: #0a0a14; border: 2px solid #00d4ff66; color: #00d4ff; cursor: pointer; text-transform: uppercase; letter-spacing: 3px; text-shadow: 0 0 6px #00d4ff44; image-rendering: pixelated;">[ EXECUTE ]</button>
            </div>
            <div style="height: 15rem; flex-shrink: 0;"></div>
        </div>
    `;

    document.body.appendChild(panel);

    // Store references
    this.optionsPanel = panel;
    this.btnCloseOptions = document.getElementById('btn-close-options');
    this.optAutoSave = document.getElementById('opt-autosave');
    this.optVolume = document.getElementById('opt-volume');
    this.volumeDisplay = document.getElementById('volume-display');
    this.optHints = document.getElementById('opt-hints');
    this.btnClearHints = document.getElementById('btn-clear-hints');
    this.optAttackAdj = document.getElementById('opt-attack-adj');
    this.attackAdjDisplay = document.getElementById('attack-adj-display');
    this.optCRT = document.getElementById('opt-crt');
    this.optReducedShadows = document.getElementById('opt-reduced-shadows');
    this.optShowFPS = document.getElementById('opt-show-fps');
    this.optPrecomputed = document.getElementById('opt-precomputed');
    this.btnPreviewAchievement = document.getElementById('btn-preview-achievement');
    this.btnCheatCircle = document.getElementById('btn-cheat-circle');
    this.optSystemInput = document.getElementById('opt-system-input');
    this.btnSystemSubmit = document.getElementById('btn-system-submit');
    this.debugSection = document.getElementById('debug-section');
    this._cheatClickCount = 0;
    this.cheatModeActive = false;
    // Add event listeners
    this.btnCloseOptions.addEventListener('click', () => {
        if (typeof soundManager !== 'undefined') {
            soundManager.resumeContext();
            soundManager.playImmediate('sound/interface/click.mp3', 100);
        }
        this.toggleOptionsPanel();
    });

    // Add hover effect to close button (skip on touch devices where mouseenter sticks)
    if (window.matchMedia('(hover: hover)').matches) {
        this.btnCloseOptions.addEventListener('mouseenter', () => {
            this.btnCloseOptions.style.color = '#ff4444';
            this.btnCloseOptions.style.textShadow = '0 0 10px #ff4444';
        });
        this.btnCloseOptions.addEventListener('mouseleave', () => {
            this.btnCloseOptions.style.color = '#00d4ff';
            this.btnCloseOptions.style.textShadow = 'none';
        });
    }

    this.optAutoSave.addEventListener('change', (e) => {
        this.settings.autoSaveTurns = parseInt(e.target.value) || 3;
        GameHistory.SAVE_INTERVAL = this.settings.autoSaveTurns;
        this.saveSettings();
    });

    this.optVolume.addEventListener('input', (e) => {
        this.settings.masterVolume = parseInt(e.target.value);
        this.volumeDisplay.textContent = `${this.settings.masterVolume}%`;
        if (typeof soundManager !== 'undefined') {
            soundManager.setVolume(this.settings.masterVolume);
        }
        this.saveSettings();
    });

    // Hints toggle
    this.optHints.addEventListener('change', (e) => {
        this.settings.hints = e.target.checked;
        this.saveSettings();
        const gameScene = typeof sceneManager !== 'undefined' ? sceneManager.scenes.get('GameScene') : null;
        if (gameScene) {
            if (e.target.checked) {
                if (typeof gameScene._resumeHints === 'function') gameScene._resumeHints();
            } else {
                if (typeof gameScene._pauseHints === 'function') gameScene._pauseHints();
            }
        }
    });

    // Clear hint progress button
    this.btnClearHints.addEventListener('click', () => {
        // Clear all progress from IndexedDB and the in-memory cache
        if (typeof TutorialProgress !== 'undefined') {
            TutorialProgress.clearAll();
        }
        // Reset in-memory flags on the active game scene so hints can show again
        const gameScene = typeof sceneManager !== 'undefined' ? sceneManager.scenes.get('GameScene') : null;
        if (gameScene) {
            gameScene._hintAttackSeen     = false;
            gameScene._hintWarriorSeen    = false;
            gameScene._hintProductionSeen = false;
            gameScene._hintNextTurnSeen   = false;
        }
        this.btnClearHints.textContent = '[ Cleared! ]';
        this.btnClearHints.style.color = '#00ff88';
        this.btnClearHints.style.borderColor = '#00ff88';
        this.btnClearHints.style.background = 'rgba(0, 255, 136, 0.1)';
        setTimeout(() => {
            this.btnClearHints.textContent = '[ Clear Hint Progress ]';
            this.btnClearHints.style.color = '#00d4ff';
            this.btnClearHints.style.borderColor = 'rgba(0, 212, 255, 0.4)';
            this.btnClearHints.style.background = 'rgba(0, 212, 255, 0.1)';
        }, 1500);
    });
    if (window.matchMedia('(hover: hover)').matches) {
        this.btnClearHints.addEventListener('mouseenter', () => {
            this.btnClearHints.style.background = 'rgba(0, 212, 255, 0.2)';
            this.btnClearHints.style.boxShadow = '0 0 10px rgba(0, 212, 255, 0.2)';
        });
        this.btnClearHints.addEventListener('mouseleave', () => {
            this.btnClearHints.style.background = 'rgba(0, 212, 255, 0.1)';
            this.btnClearHints.style.boxShadow = 'none';
        });
    }

    this.optAttackAdj.addEventListener('input', (e) => {
        this.settings.attackAdjacentChance = parseInt(e.target.value);
        this.attackAdjDisplay.textContent = `${this.settings.attackAdjacentChance}%`;
        this.saveSettings();
    });

    // Graphics toggle listeners
    this.optCRT.addEventListener('change', (e) => {
        this.settings.crtEffects = e.target.checked;
        this.applyGraphicsSettings();
        this.saveSettings();
    });

    this.optReducedShadows.addEventListener('change', (e) => {
        this.settings.reducedShadows = e.target.checked;
        this.applyGraphicsSettings();
        this.saveSettings();
    });

    this.optShowFPS.addEventListener('change', (e) => {
        this.settings.showFPS = e.target.checked;
        this.applyGraphicsSettings();
        this.saveSettings();
    });

    this.optPrecomputed.addEventListener('change', (e) => {
        this.settings.precomputedEffects = e.target.checked;
        this.applyGraphicsSettings();
        this.saveSettings();
    });

    // Achievement effect preview button
    this.btnPreviewAchievement.addEventListener('click', () => {
        var log = ['[AchievementPreview] Button clicked'];
        window._achievementDebugLog = log;
        var uic = this;

        try {
            if (typeof soundManager !== 'undefined') {
                soundManager.resumeContext();
                log.push('soundManager.resumeContext() OK, ctx=' +
                    (soundManager.audioContext ? soundManager.audioContext.state : 'no ctx'));
            } else {
                log.push('soundManager is UNDEFINED');
            }

            if (this.optionsPanelOpen) {
                this.toggleOptionsPanel();
                log.push('Panel closed');
            } else {
                log.push('Panel was already closed');
            }

            if (typeof achievementManager === 'undefined') {
                log.push('ERROR: achievementManager is UNDEFINED');
            } else {
                log.push('achievementManager exists');

                var fnSrc = achievementManager._showNextNotification.toString();
                var isStub = fnSrc.indexOf('Stub') !== -1 || fnSrc.length < 200;
                log.push('_showNextNotification is ' + (isStub ? 'STUB (display module NOT loaded)' : 'display module (' + fnSrc.length + ' chars)'));
                log.push('_activeNotif before: ' + (achievementManager._activeNotif ? 'SET (blocked!)' : 'null (OK)'));
                log.push('_notifQueue before: len=' + (achievementManager._notifQueue ? achievementManager._notifQueue.length : 'N/A'));

                achievementManager.previewEffect(5);
                log.push('previewEffect(5) returned');

                // Unlock first_blood so the achievements panel shows an OBTAINED card
                if (!achievementManager.isUnlocked('first_blood')) {
                    achievementManager.unlock('first_blood', { source: 'test_button' });
                    log.push('Unlocked first_blood for panel preview');
                }

                log.push('_activeNotif after: ' + (achievementManager._activeNotif ? 'SET' : 'null (batched, starts next tick)'));
                log.push('_notifQueue after: len=' + (achievementManager._notifQueue ? achievementManager._notifQueue.length : 'N/A'));

                var ew = document.querySelectorAll('.achievement-effects-wrapper');
                var tw = document.querySelectorAll('.achievement-toast-wrapper');
                log.push('Effects wrappers in DOM: ' + ew.length);
                log.push('Toast wrappers in DOM: ' + tw.length);
                if (ew.length > 0) {
                    var e = ew[ew.length - 1];
                    log.push('Effects: z=' + e.style.zIndex + ' size=' + e.style.width + 'x' + e.style.height + ' children=' + e.children.length);
                    var r = e.getBoundingClientRect();
                    log.push('Effects rect: ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' @(' + Math.round(r.left) + ',' + Math.round(r.top) + ')');
                }
                if (tw.length > 0) {
                    var t = tw[tw.length - 1];
                    log.push('Toast: z=' + t.style.zIndex + ' size=' + t.style.width + 'x' + t.style.height + ' children=' + t.children.length);
                }
            }

            log.push('viewport=' + window.innerWidth + 'x' + window.innerHeight);
            log.push('audioCtx=' + (typeof soundManager !== 'undefined' && soundManager.audioContext ? soundManager.audioContext.state : 'N/A'));
            log.push('dpr=' + window.devicePixelRatio);
            log.push('ua=' + navigator.userAgent);

        } catch (err) {
            log.push('CAUGHT ERROR: ' + err.message);
            log.push('Stack: ' + (err.stack || 'N/A'));
        }

        setTimeout(function() {
            uic._showAchievementDebugLog(log);
            window._achievementDebugLog = null;
        }, 200);
    });
    if (window.matchMedia('(hover: hover)').matches) {
        this.btnPreviewAchievement.addEventListener('mouseenter', () => {
            this.btnPreviewAchievement.style.background = 'rgba(255, 200, 0, 0.2)';
            this.btnPreviewAchievement.style.boxShadow = '0 0 10px rgba(255, 200, 0, 0.2)';
        });
        this.btnPreviewAchievement.addEventListener('mouseleave', () => {
            this.btnPreviewAchievement.style.background = 'rgba(255, 200, 0, 0.1)';
            this.btnPreviewAchievement.style.boxShadow = 'none';
        });
    }

    // Cheat mode button — press 10 times to activate
    this.btnCheatCircle.addEventListener('click', () => {
        if (typeof soundManager !== 'undefined') {
            soundManager.resumeContext();
            soundManager.playImmediate('sound/interface/click.mp3', 100);
        }
        this._cheatClickCount++;
        if (this._cheatClickCount >= 10 && !this.cheatModeActive) {
            this.cheatModeActive = true;
            this.btnCheatCircle.style.background = '#ff4444';
            this.btnCheatCircle.style.boxShadow = '0 0 10px #ff0000, 0 0 20px #ff0000';
        }
    });

    // System control input
    this.optSystemInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const command = this.optSystemInput.value.trim().toUpperCase();
            if (command) {
                this._handleSystemCommand(command);
            }
            this.optSystemInput.value = '';
        }
    });

    // System control submit button
    this.btnSystemSubmit.addEventListener('click', () => {
        const command = this.optSystemInput.value.trim().toUpperCase();
        if (command) {
            this._handleSystemCommand(command);
        }
        this.optSystemInput.value = '';
    });
    if (window.matchMedia('(hover: hover)').matches) {
        this.btnSystemSubmit.addEventListener('mouseenter', () => {
            this.btnSystemSubmit.style.background = '#00d4ff22';
            this.btnSystemSubmit.style.borderColor = '#00d4ff';
            this.btnSystemSubmit.style.textShadow = '0 0 10px #00d4ff';
        });
        this.btnSystemSubmit.addEventListener('mouseleave', () => {
            this.btnSystemSubmit.style.background = '#0a0a14';
            this.btnSystemSubmit.style.borderColor = '#00d4ff66';
            this.btnSystemSubmit.style.textShadow = '0 0 6px #00d4ff44';
        });
    }

    // Click outside to close
    document.addEventListener('click', (e) => {
        if (this.optionsPanelOpen &&
            !this.optionsPanel.contains(e.target) &&
            !this.btnOptions.contains(e.target)) {
            this.toggleOptionsPanel();
        }
    });
};

/**
 * Toggle options panel
 */
UIController.prototype.toggleOptionsPanel = function() {
    this.optionsPanelOpen = !this.optionsPanelOpen;
    this.optionsPanel.classList.toggle('open', this.optionsPanelOpen);

    // Instant show/hide — 8-bit style, no slide
    if (this.optionsPanelOpen) {
        this.optionsPanel.style.display = 'flex';
    } else {
        this.optionsPanel.style.display = 'none';
        // Release focus so hover/glow styles don't stick on mobile
        if (document.activeElement) document.activeElement.blur();
    }
};

/**
 * Show a visible debug log overlay for achievement preview diagnostics.
 * Tap the overlay to dismiss it.
 */
UIController.prototype._showAchievementDebugLog = function(lines) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:99999;overflow-y:auto;padding:16px;font-family:monospace;font-size:13px;color:#0f0;white-space:pre-wrap;word-break:break-all;-webkit-overflow-scrolling:touch;';
    var title = document.createElement('div');
    title.style.cssText = 'font-size:16px;color:#ffc800;margin-bottom:12px;';
    title.textContent = 'ACHIEVEMENT DEBUG LOG  (tap to dismiss)';
    overlay.appendChild(title);

    for (var i = 0; i < lines.length; i++) {
        var line = document.createElement('div');
        line.style.cssText = 'margin-bottom:4px;' + (lines[i].indexOf('ERROR') !== -1 ? 'color:#ff4444;' : '');
        line.textContent = lines[i];
        overlay.appendChild(line);
    }

    overlay.addEventListener('click', function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
    document.body.appendChild(overlay);
};

/**
 * Handle system control commands (easter eggs / cheat codes)
 */
UIController.prototype._handleSystemCommand = function(command) {
    const input = this.optSystemInput;
    const origBorder = input.style.border;

    // DEBUG — toggle debug section visibility
    if (command === 'DEBUG') {
        const visible = this.debugSection.style.display !== 'none';
        this.debugSection.style.display = visible ? 'none' : 'block';
        input.style.border = '1px solid #00ff88';
        input.placeholder = visible ? 'DEBUG: OFF' : 'DEBUG: ON';
        setTimeout(() => {
            input.style.border = origBorder;
            input.placeholder = 'ENTER COMMAND...';
        }, 600);
        return;
    }

    // RETRO — toggle monochrome green terminal mode
    if (command === 'RETRO') {
        const enabling = !document.body.classList.contains('retro-mode');
        this._toggleRetroMode(enabling);
        input.style.border = '1px solid #00ff88';
        input.placeholder = enabling ? 'RETRO: ON' : 'RETRO: OFF';
        setTimeout(() => {
            input.style.border = origBorder;
            input.placeholder = 'ENTER COMMAND...';
        }, 600);
        return;
    }

    // Y2K — toggle hot pink Y2K internet aesthetic mode
    if (command === 'Y2K') {
        const enabling = !document.body.classList.contains('y2k-mode');
        this._toggleY2KMode(enabling);
        input.style.border = '1px solid #FF69B4';
        input.placeholder = enabling ? 'Y2K: ON' : 'Y2K: OFF';
        setTimeout(() => {
            input.style.border = origBorder;
            input.placeholder = 'ENTER COMMAND...';
        }, 600);
        return;
    }

    // OHTHEHUMANITY! — unlock all achievements
    if (command === 'OHTHEHUMANITY!') {
        if (typeof achievementManager !== 'undefined') {
            const defs = achievementManager.getAllDefs();
            let newlyUnlocked = 0;
            for (let i = 0; i < defs.length; i++) {
                const id = defs[i].id;
                if (!achievementManager.isUnlocked(id)) {
                    achievementManager.unlocked[id] = {
                        unlockedAt: Date.now(),
                        gameId: null,
                        details: null
                    };
                    achievementManager._queueNotification(id);
                    newlyUnlocked++;
                }
            }
            if (newlyUnlocked > 0) {
                achievementManager.saveUnlocked();
            }

            if (newlyUnlocked === 0) {
                // All already unlocked — show a special "you got nothing" animation only
                var fakeId = '__ohthehumanity_joke__';
                achievementManager.registry[fakeId] = {
                    id: fakeId,
                    name: 'ALL ACHIEVEMENTS UNLOCKED!!!!',
                    description: "But you already had everything, didn't you? Hm, well I guess you got nothing in that case huh.",
                    category: 'joke',
                    icon: '\uD83E\uDD28',
                    hidden: false
                };
                achievementManager._notifQueue.push(fakeId);
                if (!achievementManager._activeNotif && !achievementManager._batchPending) {
                    achievementManager._batchPending = true;
                    setTimeout(function() {
                        achievementManager._batchPending = false;
                        if (!achievementManager._activeNotif) {
                            achievementManager._showNextNotification();
                        }
                    }, 0);
                }
                // Remove from registry after display so it never appears in the achievements panel
                setTimeout(function() {
                    delete achievementManager.registry[fakeId];
                }, 10000);

                if (this.optionsPanelOpen) {
                    this.toggleOptionsPanel();
                }
            }

            input.style.border = '1px solid #ffc800';
            input.placeholder = newlyUnlocked > 0 ? 'ALL ACHIEVEMENTS UNLOCKED' : 'ALREADY UNLOCKED';
            setTimeout(() => {
                input.style.border = origBorder;
                input.placeholder = 'ENTER COMMAND...';
            }, 1500);
        }
        return;
    }

    // ISEEALL — unlock all campaign levels
    if (command === 'ISEEALL') {
        (async () => {
            try {
                var db = await MenuScene.getProgressDB();
                var wtx = db.transaction([MenuScene.PROGRESS_STORE_NAME], 'readwrite');
                wtx.objectStore(MenuScene.PROGRESS_STORE_NAME).put({ id: 'scenario_progress', value: 6 });
                input.style.border = '1px solid #00ff88';
                input.placeholder = 'ALL LEVELS UNLOCKED';
            } catch (e) {
                input.style.border = '1px solid #ff4444';
                input.placeholder = 'STORAGE UNAVAILABLE';
            }
            setTimeout(() => {
                input.style.border = origBorder;
                input.placeholder = 'ENTER COMMAND...';
            }, 1500);
        })();
        return;
    }

    // FILLUP — fill saves to the maximum limit (dev testing)
    if (command === 'FILLUP') {
        (async () => {
            try {
                await GameHistory.fillUp();
                input.style.border = '1px solid #00ff88';
                input.placeholder = 'SAVES FILLED';
            } catch (e) {
                input.style.border = '1px solid #ff4444';
                input.placeholder = 'FILL FAILED';
            }
            setTimeout(() => {
                input.style.border = origBorder;
                input.placeholder = 'ENTER COMMAND...';
            }, 1500);
        })();
        return;
    }

    // CORNERMANIA — start a 4-player game with 3 corner cities and 1 centre city,
    // random start flag on, to test the corner vs surround blockade strategies.
    if (command === 'CORNERMANIA') {
        const maxIdx = BOARD_SIZE - 1;
        const forcedStartPositions = [
            { row: 0,      col: 0      }, // upper-left corner
            { row: 0,      col: maxIdx }, // upper-right corner
            { row: maxIdx, col: 0      }, // lower-left corner
            { row: 4,      col: 4      }  // centre
        ];
        const playerConfigs = [
            { color: PLAYER_COLORS[0], isAI: false },
            { color: PLAYER_COLORS[1], isAI: true, aiDifficulty: AI_DIFFICULTY.HARD },
            { color: PLAYER_COLORS[2], isAI: true, aiDifficulty: AI_DIFFICULTY.HARD },
            { color: PLAYER_COLORS[3], isAI: true, aiDifficulty: AI_DIFFICULTY.HARD }
        ];
        if (this.optionsPanelOpen) this.toggleOptionsPanel();
        sceneManager.startScene('GameScene', {
            playerConfigs,
            randomStart: true,
            forcedStartPositions
        });
        input.style.border = '1px solid #00ff88';
        input.placeholder = 'CORNERMANIA: LOADING...';
        setTimeout(() => {
            input.style.border = origBorder;
            input.placeholder = 'ENTER COMMAND...';
        }, 1500);
        return;
    }

    // CENTERTEST — start a 4-player game with the human city dead center
    // and 3 Hard AI opponents at the corners.
    if (command === 'CENTERTEST') {
        const maxIdx = BOARD_SIZE - 1;
        const center = Math.floor(BOARD_SIZE / 2) - 1; // 4 on a 10x10 board
        const forcedStartPositions = [
            { row: center, col: center      }, // dead centre (human)
            { row: 0,      col: 0           }, // upper-left corner
            { row: 0,      col: maxIdx      }, // upper-right corner
            { row: maxIdx, col: maxIdx      }  // lower-right corner
        ];
        const playerConfigs = [
            { color: PLAYER_COLORS[0], isAI: false },
            { color: PLAYER_COLORS[1], isAI: true, aiDifficulty: AI_DIFFICULTY.HARD },
            { color: PLAYER_COLORS[2], isAI: true, aiDifficulty: AI_DIFFICULTY.HARD },
            { color: PLAYER_COLORS[3], isAI: true, aiDifficulty: AI_DIFFICULTY.HARD }
        ];
        if (this.optionsPanelOpen) this.toggleOptionsPanel();
        sceneManager.startScene('GameScene', {
            playerConfigs,
            randomStart: true,
            forcedStartPositions
        });
        input.style.border = '1px solid #00ff88';
        input.placeholder = 'CENTERTEST: LOADING...';
        setTimeout(() => {
            input.style.border = origBorder;
            input.placeholder = 'ENTER COMMAND...';
        }, 1500);
        return;
    }

    // Unknown command — red flash
    input.style.border = '1px solid #ff4444';
    input.style.color = '#ff4444';
    input.placeholder = 'UNKNOWN COMMAND';
    setTimeout(() => {
        input.style.border = origBorder;
        input.style.color = '#00ff88';
        input.placeholder = 'ENTER COMMAND...';
    }, 600);
};

/**
 * Toggle retro monochrome green terminal mode
 */
UIController.prototype._toggleRetroMode = function(enable) {
    if (enable) {
        // Mutual exclusion: disable Y2K mode first
        if (document.body.classList.contains('y2k-mode')) {
            this._toggleY2KMode(false);
        }
        document.body.classList.add('retro-mode');
        if (!document.getElementById('retro-mode-styles')) {
            const link = document.createElement('link');
            link.id = 'retro-mode-styles';
            link.rel = 'stylesheet';
            link.href = 'retro.css';
            document.head.appendChild(link);
        }
    } else {
        document.body.classList.remove('retro-mode');
        const link = document.getElementById('retro-mode-styles');
        if (link) link.remove();
    }
};

/**
 * Toggle Y2K hot pink aesthetic mode
 */
UIController.prototype._toggleY2KMode = function(enable) {
    if (enable) {
        // Mutual exclusion: disable RETRO mode first
        if (document.body.classList.contains('retro-mode')) {
            this._toggleRetroMode(false);
        }
        // Apply theme colors
        if (typeof ThemeConfig !== 'undefined') {
            ThemeConfig.apply('y2k');
        }
        document.body.classList.add('y2k-mode');
        if (!document.getElementById('y2k-mode-styles')) {
            const link = document.createElement('link');
            link.id = 'y2k-mode-styles';
            link.rel = 'stylesheet';
            link.href = 'y2k.css';
            document.head.appendChild(link);
        }
    } else {
        // Reset theme colors
        if (typeof ThemeConfig !== 'undefined') {
            ThemeConfig.reset();
        }
        document.body.classList.remove('y2k-mode');
        const link = document.getElementById('y2k-mode-styles');
        if (link) link.remove();
    }
    this._refreshThemeColors();
};

/**
 * Refresh canvas-rendered elements after a theme change.
 * Updates board tiles, territory borders, and piece circles.
 */
UIController.prototype._refreshThemeColors = function() {
    // Refresh game scene if active
    var gameScene = (typeof sceneManager !== 'undefined') ? sceneManager.scenes.get('GameScene') : null;
    if (gameScene && gameScene._tileGrid) {
        // Update tile grid colors
        var light = hexToCSS(COLORS.lightTile);
        var dark  = hexToCSS(COLORS.darkTile);
        var cells = gameScene._tileGrid.children;
        for (var i = 0; i < cells.length; i++) {
            var row = Math.floor(i / BOARD_SIZE);
            var col = i % BOARD_SIZE;
            cells[i].style.backgroundColor = (row + col) % 2 === 0 ? light : dark;
        }
        // Update board border color
        var bw = Math.max(Math.floor(TILE_SIZE * 0.06), 3);
        gameScene._tileGrid.style.outline = bw + 'px solid ' + hexToCSS(COLORS.border);

        // Clear border caches and redraw ownership/territory
        gameScene._cachedBorderCanvas = null;
        gameScene._ownershipDirty = true;
        gameScene.drawOwnership(true);

        // Update piece circle backgrounds
        var circles = document.querySelectorAll('.piece-circle');
        var bgColor = (typeof ThemeConfig !== 'undefined' && ThemeConfig.isActive('y2k'))
            ? 'rgba(61,15,28,0.95)'
            : 'rgba(26,26,58,0.95)';
        for (var j = 0; j < circles.length; j++) {
            circles[j].style.background = bgColor;
        }
    }

    // Refresh game scene container background
    var gameContainer = document.getElementById('game-scene-container');
    if (gameContainer) {
        gameContainer.style.background = (typeof ThemeConfig !== 'undefined' && ThemeConfig.isActive('y2k'))
            ? '#FFB6C1' : '';
    }

    // Refresh menu scene — rebuild it so buttons pick up new COLORS values
    var menuScene = (typeof sceneManager !== 'undefined') ? sceneManager.scenes.get('MenuScene') : null;
    if (menuScene && menuScene.container && menuScene.container.style.display !== 'none') {
        menuScene.container.style.backgroundColor = hexToCSS(COLORS.background);
        // Rebuild the main menu to refresh button colors
        if (menuScene.showingMainMenu) {
            menuScene.showMainMenu();
        }
    }
};

