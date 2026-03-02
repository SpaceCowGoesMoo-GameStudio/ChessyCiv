/**
 * UIController - Settings persistence (load/save/apply)
 * Prototype extension for UIController
 */

/**
 * Load settings from localStorage
 */
UIController.prototype.loadSettings = function() {
    try {
        const saved = localStorage.getItem('civchess_ui_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.settings = { ...this.settings, ...parsed };
            this.devModeUnlocked = parsed.devModeUnlocked || false;
        }
    } catch (e) {
        console.warn('Failed to load UI settings:', e);
    }
};

/**
 * Save settings to localStorage
 */
UIController.prototype.saveSettings = function() {
    try {
        const toSave = {
            ...this.settings,
            devModeUnlocked: this.devModeUnlocked
        };
        localStorage.setItem('civchess_ui_settings', JSON.stringify(toSave));
    } catch (e) {
        console.warn('Failed to save UI settings:', e);
    }
};

/**
 * Apply loaded settings
 */
UIController.prototype.applySettings = function() {
    // Apply auto-save interval
    GameHistory.SAVE_INTERVAL = this.settings.autoSaveTurns;

    // Apply volume
    if (typeof soundManager !== 'undefined') {
        soundManager.setVolume(this.settings.masterVolume);
    }

    // Apply dev mode
    if (this.devModeUnlocked) {
        this.devCodeInput.style.display = 'none';
        this.optDevMode.disabled = false;

        if (this.settings.devMode) {
            this.optDevMode.checked = true;
            this.devOverlay.style.display = 'flex';
        }
    }

    // Apply graphics settings
    this.applyGraphicsSettings();
};

/**
 * Apply graphics settings to DOM (CSS classes on body)
 */
UIController.prototype.applyGraphicsSettings = function() {
    document.body.classList.toggle('crt-disabled', !this.settings.crtEffects);
    document.body.classList.toggle('reduced-shadows', this.settings.reducedShadows);

    // Precomputed CRT effects
    if (typeof _crtPrerender !== 'undefined') {
        if (this.settings.precomputedEffects && this.settings.crtEffects) {
            _crtPrerender.enable();
        } else {
            _crtPrerender.disable();
        }
    }

    // Sync toggle checkboxes if they exist
    if (this.optCRT) this.optCRT.checked = this.settings.crtEffects;
    if (this.optReducedShadows) this.optReducedShadows.checked = this.settings.reducedShadows;
    if (this.optShowFPS) this.optShowFPS.checked = this.settings.showFPS;
    if (this.optPrecomputed) this.optPrecomputed.checked = this.settings.precomputedEffects;

    // FPS overlay
    if (this.settings.showFPS) {
        this._createFPSOverlay();
    } else {
        this._destroyFPSOverlay();
    }
};

// ============================================
// FPS Overlay — real-time counter with mini graph
// ============================================

/**
 * Create the FPS overlay element and start its measurement loop.
 */
UIController.prototype._createFPSOverlay = function() {
    if (this._fpsOverlay) return; // Already active

    // ---- Ring buffer for frame times ----
    const HISTORY_SIZE = 120; // ~2 seconds at 60fps
    const frameTimes = new Float32Array(HISTORY_SIZE);
    let frameIdx = 0;
    let frameFilled = 0;

    // ---- Graph dimensions ----
    const GRAPH_W = 120;
    const GRAPH_H = 40;
    const TOTAL_W = GRAPH_W + 4; // 2px border on each side
    const TOTAL_H = GRAPH_H + 22; // room for text above graph

    // ---- Container ----
    const container = document.createElement('div');
    container.id = 'fps-overlay';
    container.style.cssText =
        'position:fixed;bottom:8px;left:8px;z-index:9998;pointer-events:none;' +
        'font-family:VT323,monospace;font-size:14px;color:#00ff88;' +
        'background:rgba(10,10,20,0.85);border:1px solid #00d4ff66;' +
        'padding:4px 6px;line-height:1;image-rendering:pixelated;';

    // ---- FPS number ----
    const label = document.createElement('div');
    label.style.cssText = 'margin-bottom:2px;text-shadow:0 0 4px #00ff88;white-space:nowrap;';
    label.textContent = 'FPS: --';

    // ---- Graph canvas ----
    const canvas = document.createElement('canvas');
    canvas.width = GRAPH_W;
    canvas.height = GRAPH_H;
    canvas.style.cssText = 'display:block;width:' + GRAPH_W + 'px;height:' + GRAPH_H + 'px;image-rendering:pixelated;';
    const ctx = canvas.getContext('2d');

    container.appendChild(label);
    container.appendChild(canvas);
    document.body.appendChild(container);

    // ---- Measurement state ----
    let lastTimestamp = 0;
    let rafId = null;
    let sampleCount = 0;
    const UPDATE_INTERVAL = 8; // redraw graph every N frames (~8 frames)

    const tick = (timestamp) => {
        if (lastTimestamp > 0) {
            const dt = timestamp - lastTimestamp;
            frameTimes[frameIdx] = dt;
            frameIdx = (frameIdx + 1) % HISTORY_SIZE;
            if (frameFilled < HISTORY_SIZE) frameFilled++;
        }
        lastTimestamp = timestamp;
        sampleCount++;

        // Update the display periodically (not every frame)
        if (sampleCount >= UPDATE_INTERVAL) {
            sampleCount = 0;

            // Compute average FPS from recent samples
            let sum = 0;
            const count = Math.min(frameFilled, 30); // average over last 30 frames
            for (let i = 0; i < count; i++) {
                const idx = (frameIdx - 1 - i + HISTORY_SIZE) % HISTORY_SIZE;
                sum += frameTimes[idx];
            }
            const avgMs = count > 0 ? sum / count : 16.67;
            const fps = Math.round(1000 / avgMs);

            // Update label color based on FPS
            let color;
            if (fps >= 50) color = '#00ff88';
            else if (fps >= 30) color = '#ffff00';
            else color = '#ff4444';
            label.textContent = 'FPS: ' + fps;
            label.style.color = color;
            label.style.textShadow = '0 0 4px ' + color;

            // ---- Draw graph ----
            ctx.fillStyle = 'rgba(10,10,20,0.6)';
            ctx.fillRect(0, 0, GRAPH_W, GRAPH_H);

            // 60fps reference line
            const y60 = GRAPH_H - (60 / 80) * GRAPH_H;
            ctx.strokeStyle = '#00d4ff33';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y60);
            ctx.lineTo(GRAPH_W, y60);
            ctx.stroke();

            // 30fps reference line
            const y30 = GRAPH_H - (30 / 80) * GRAPH_H;
            ctx.strokeStyle = '#ffff0033';
            ctx.beginPath();
            ctx.moveTo(0, y30);
            ctx.lineTo(GRAPH_W, y30);
            ctx.stroke();

            // FPS history bars
            if (frameFilled > 1) {
                const barW = GRAPH_W / HISTORY_SIZE;
                for (let i = 0; i < frameFilled; i++) {
                    const idx = (frameIdx - frameFilled + i + HISTORY_SIZE) % HISTORY_SIZE;
                    const dt = frameTimes[idx];
                    const fpsVal = dt > 0 ? 1000 / dt : 0;
                    const clamped = Math.min(fpsVal, 80); // cap at 80 for scale
                    const barH = (clamped / 80) * GRAPH_H;
                    const x = i * barW;
                    const y = GRAPH_H - barH;

                    if (fpsVal >= 50) ctx.fillStyle = '#00ff8899';
                    else if (fpsVal >= 30) ctx.fillStyle = '#ffff0099';
                    else ctx.fillStyle = '#ff444499';

                    ctx.fillRect(x, y, Math.max(barW - 0.5, 0.5), barH);
                }
            }
        }

        rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    // Store state for cleanup
    this._fpsOverlay = container;
    this._fpsRafId = rafId;
    this._fpsTick = tick;
};

/**
 * Remove the FPS overlay and stop its measurement loop.
 */
UIController.prototype._destroyFPSOverlay = function() {
    if (this._fpsRafId) {
        cancelAnimationFrame(this._fpsRafId);
        this._fpsRafId = null;
    }
    if (this._fpsOverlay && this._fpsOverlay.parentNode) {
        this._fpsOverlay.parentNode.removeChild(this._fpsOverlay);
    }
    this._fpsOverlay = null;
    this._fpsTick = null;
};
