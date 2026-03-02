/**
 * UIController - Dev mode overlay, logging, and AI target visualization
 * Prototype extension for UIController
 */

/**
 * Create dev mode overlay (log box)
 */
UIController.prototype.createDevOverlay = function() {
    const overlay = document.createElement('div');
    overlay.id = 'dev-overlay';

    // Add inline styles
    overlay.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        width: 400px;
        max-height: 300px;
        background: rgba(10, 10, 20, 0.95);
        border: 1px solid #00d4ff66;
        box-shadow: 0 0 20px rgba(0, 212, 255, 0.2);
        z-index: 1500;
        font-family: 'VT323', monospace;
        display: none;
        flex-direction: column;
    `;

    overlay.innerHTML = `
        <div class="dev-header" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #0d0d1a; border-bottom: 1px solid #00d4ff44; color: #00d4ff; font-size: 16px;">
            <span>// DEV LOG</span>
            <button id="btn-clear-log" class="clear-log-btn" style="font-family: 'VT323', monospace; font-size: 14px; padding: 4px 10px; background: transparent; border: 1px solid #ff4444aa; color: #ff4444; cursor: pointer;">Clear</button>
        </div>
        <div id="dev-log" class="dev-log" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 14px; line-height: 1.4; max-height: 250px;"></div>
    `;

    document.body.appendChild(overlay);

    this.devOverlay = overlay;
    this.devLog = document.getElementById('dev-log');
    this.btnClearLog = document.getElementById('btn-clear-log');

    this.btnClearLog.addEventListener('click', () => this.clearLog());
};

/**
 * Unlock dev mode after correct code entry
 */
UIController.prototype.unlockDevMode = function() {
    this.devModeUnlocked = true;
    this.devCodeInput.style.display = 'none';
    this.optDevMode.disabled = false;
    this.log('Dev mode unlocked!', 'success');

    // Flash the toggle
    this.optDevMode.parentElement.classList.add('flash');
    setTimeout(() => {
        this.optDevMode.parentElement.classList.remove('flash');
    }, 500);
};

/**
 * Toggle dev mode on/off
 */
UIController.prototype.toggleDevMode = function(enabled) {
    this.settings.devMode = enabled;

    if (enabled) {
        this.devOverlay.style.display = 'flex';
        this.log('Dev mode enabled', 'info');
    } else {
        this.devOverlay.style.display = 'none';
        // Clear AI target lines when dev mode is disabled
        if (this.gameScene && this.gameScene.devCtx) {
            this.gameScene.devCtx.clearRect(0, 0, this.gameScene.devCanvas.width, this.gameScene.devCanvas.height);
        }
    }

    // Trigger redraw of AI targets if in game
    if (this.gameScene && this.gameScene.devCtx && enabled) {
        this.drawAITargets();
    }
};

/**
 * Add a log entry
 */
UIController.prototype.log = function(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = { timestamp, message, type };

    this.logs.push(entry);

    // Trim old logs
    if (this.logs.length > this.maxLogs) {
        this.logs.shift();
    }

    // Update display if visible
    if (this.devOverlay.style.display !== 'none') {
        this.renderLog();
    }

    // Also log to console
    const prefix = `[${timestamp}]`;
    if (type === 'error') {
        console.error(prefix, message);
    } else if (type === 'warning') {
        console.warn(prefix, message);
    } else {
        console.log(prefix, message);
    }
};

/**
 * Render the log display
 */
UIController.prototype.renderLog = function() {
    const html = this.logs.map(entry => {
        const typeClass = `log-${entry.type}`;
        return `<div class="log-entry ${typeClass}"><span class="log-time" style="text-shadow: 0 0 5px #00d5ff6e, 0 0 5px #00d5ff67, 0 0 10px #0088aa44; color: #00d4ff;">[${entry.timestamp}]</span> <span class="log-message" style="color: #00d4ff;">${entry.message}</span></div>`;
    }).join('');

    this.devLog.innerHTML = html;
    this.devLog.scrollTop = this.devLog.scrollHeight;
};

/**
 * Clear the log
 */
UIController.prototype.clearLog = function() {
    this.logs = [];
    this.devLog.innerHTML = '';
};

/**
 * Draw red lines from AI pieces to their targets
 */
UIController.prototype.drawAITargets = function() {
    if (!this.gameScene || !this.gameScene.devCtx) return;

    const ctx = this.gameScene.devCtx;
    ctx.clearRect(0, 0, this.gameScene.devCanvas.width, this.gameScene.devCanvas.height);

    if (!this.settings.devMode) return;

    const scene = this.gameScene;
    const engine = scene.engine;
    const aiManager = scene.aiManager;

    if (!aiManager) return;

    // Iterate through all AI players
    aiManager.aiPlayers.forEach((ai, playerId) => {
        if (!ai.warriorObjectives) return;

        ai.warriorObjectives.forEach((objective, pieceId) => {
            const piece = engine.pieces.find(p => p.id === pieceId);
            if (!piece) return;

            const target = objective.target;
            if (!target) return;

            const startX = BOARD_OFFSET + piece.col * TILE_SIZE + TILE_SIZE / 2;
            const startY = BOARD_OFFSET + piece.row * TILE_SIZE + TILE_SIZE / 2;
            const endX = BOARD_OFFSET + target.col * TILE_SIZE + TILE_SIZE / 2;
            const endY = BOARD_OFFSET + target.row * TILE_SIZE + TILE_SIZE / 2;

            // Draw red line
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Draw small circle at target
            ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.arc(endX, endY, 6, 0, Math.PI * 2);
            ctx.fill();
        });
    });
};
