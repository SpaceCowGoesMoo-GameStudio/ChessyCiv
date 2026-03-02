/**
 * UIController - Header creation and button handlers
 * Prototype extension for UIController
 */

/**
 * Create the header bar
 */
UIController.prototype.createHeader = function() {
    const header = document.createElement('div');
    header.id = 'game-header';

    // Add inline styles as fallback in case CSS doesn't load properly
    header.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 50px;
        background: linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 100%);
        border-bottom: 2px solid #00d4ff;
        box-shadow: 0 2px 20px rgba(0, 212, 255, 0.3);
        display: flex;
        align-items: center;
        padding: 0 20px;
        font-family: 'VT323', monospace;
        z-index: 1000;
        box-sizing: border-box;
    `;

    // Build mailto URL for bug reports / suggestions
    const bugEmail = 'chessyciv-bugs-suggestions@pm.me';
    const mailSubject = 'BUG: [your title here]';
    const mailBody = [
        'Please update the subject line to one of:',
        'BUG: [brief title]',
        'SUGGESTION: [brief title]',
        '',
        '--- For Bugs ---',
        'What happened:',
        '',
        'What you expected to happen:',
        '',
        'Steps to reproduce:',
        '1. ',
        '2. ',
        '3. ',
        '',
        'Browser / Device:',
        '',
        'Screenshots or additional details (if applicable):',
        '',
        '--- For Suggestions ---',
        'Describe your idea in detail:',
        ''
    ].join('\n');
    const mailtoUrl = 'mailto:' + bugEmail
        + '?subject=' + encodeURIComponent(mailSubject)
        + '&body=' + encodeURIComponent(mailBody);

    header.innerHTML = `
        <div class="header-left">
            <a href="${mailtoUrl}" class="header-link-btn" style="font-family: 'VT323', monospace; font-size: 16px; padding: 6px 12px; background: transparent; border: 1px solid #00d4ff; color: #00d4ff; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; text-decoration: none; text-align: center;">
                <span class="btn-desktop-text">Report Bugs / Make Suggestions</span>
                <span class="btn-mobile-text">Report</span>
            </a>
            <a href="https://buymeacoffee.com/spacecowgoesmoo" class="header-link-btn" target="_blank" rel="noopener noreferrer" style="font-family: 'VT323', monospace; font-size: 16px; padding: 6px 12px; background: transparent; border: 1px solid #00d4ff; color: #00d4ff; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; text-decoration: none; text-align: center;">
                <span class="btn-desktop-text">Give Support</span>
                <span class="btn-mobile-text">Support</span>
            </a>
        </div>
        <div class="header-right" style="display: flex; gap: 12px; align-items: center;">
            <button id="btn-save-game" class="header-btn game-only" style="font-family: 'VT323', monospace; font-size: 18px; padding: 8px 16px; background: transparent; border: 1px solid #00d4ff; color: #00d4ff; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; text-align: center;">Save Game</button>
            <button id="btn-main-menu" class="header-btn game-only" style="font-family: 'VT323', monospace; font-size: 18px; padding: 8px 16px; background: transparent; border: 1px solid #00d4ff; color: #00d4ff; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; text-align: center;">Main Menu</button>
            <button id="btn-options" class="header-btn" style="font-family: 'VT323', monospace; font-size: 18px; padding: 8px 16px; background: transparent; border: 1px solid #00d4ff; color: #00d4ff; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; text-align: center;">Options</button>
        </div>
    `;

    // Insert at the very beginning of the body
    document.body.insertBefore(header, document.body.firstChild);

    // Add padding to body for fixed header
    document.body.style.paddingTop = '50px';

    // Hide the old h1 element
    const oldH1 = document.querySelector('h1');
    if (oldH1) {
        oldH1.style.display = 'none';
    }

    // Store references
    this.header = header;
    this.btnSaveGame = document.getElementById('btn-save-game');
    this.btnMainMenu = document.getElementById('btn-main-menu');
    this.btnOptions = document.getElementById('btn-options');

    // Add event listeners
    this.btnSaveGame.addEventListener('click', () => this.handleSaveGame());
    this.btnMainMenu.addEventListener('click', () => this.handleMainMenu());
    this.btnOptions.addEventListener('click', () => {
        if (typeof soundManager !== 'undefined') {
            soundManager.resumeContext();
            soundManager.playImmediate('sound/interface/click.mp3', 100);
        }
        this.toggleOptionsPanel();
    });

    // Add hover effects to buttons (skip on touch devices where mouseenter sticks)
    if (window.matchMedia('(hover: hover)').matches) {
        const allButtons = header.querySelectorAll('.header-btn, .header-link-btn');
        allButtons.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(0, 212, 255, 0.2)';
                btn.style.boxShadow = '0 0 15px rgba(0, 212, 255, 0.5)';
                btn.style.textShadow = '0 0 10px #00d4ff';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'transparent';
                btn.style.boxShadow = 'none';
                btn.style.textShadow = 'none';
            });
        });
    }

    // Create mobile game footer with report/support links
    const footer = document.createElement('div');
    footer.id = 'game-footer';
    footer.innerHTML = `
        <div class="footer-buttons">
            <a href="${mailtoUrl}" class="footer-link-btn">Report Bugs / Make Suggestions</a>
            <a href="https://buymeacoffee.com/spacecowgoesmoo" class="footer-link-btn" target="_blank" rel="noopener noreferrer">Give Support</a>
        </div>
        <span class="footer-copyright">\u00A9 2026 SpaceCowGoesMoo. Licensed under <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">AGPL 3.0</a>. <a href="https://github.com/SpaceCowGoesMoo-Studio/ChessyCiv" target="_blank" rel="noopener noreferrer">Source Code</a></span>
    `;
    document.body.appendChild(footer);
    this.gameFooter = footer;

    // Add hover effects to footer buttons (skip on touch devices where mouseenter sticks)
    if (window.matchMedia('(hover: hover)').matches) {
        footer.querySelectorAll('.footer-link-btn').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(0, 212, 255, 0.2)';
                btn.style.boxShadow = '0 0 15px rgba(0, 212, 255, 0.5)';
                btn.style.textShadow = '0 0 10px #00d4ff';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'transparent';
                btn.style.boxShadow = 'none';
                btn.style.textShadow = 'none';
            });
        });
    }
};

/**
 * Handle save game button
 */
UIController.prototype.handleSaveGame = function() {
    if (!this.gameScene || !this.gameScene.engine) {
        this.log('No active game to save', 'warning');
        return;
    }

    const engine = this.gameScene.engine;
    if (engine.history) {
        engine.history.forceSave();
        this.log('Game saved manually', 'success');
    }
};

/**
 * Handle main menu button
 */
UIController.prototype.handleMainMenu = async function() {
    if (!this.gameScene) return;

    // Capture current state and save before exiting
    const engine = this.gameScene.engine;
    if (engine && engine.history && !engine.gameOver) {
        // Capture current snapshot first
        engine.history.captureSnapshot(engine, 'MAIN_MENU_EXIT');

        // Wait for any ongoing save to complete before starting ours
        const maxWait = 2000; // Max 2 seconds
        const startTime = Date.now();
        while (engine.history.saving && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Wait for save to complete before transitioning
        await engine.history.saveToIndexedDB(true);
        this.log('Game saved before exit', 'info');
    }

    // Return to menu scene
    this.gameScene.scene.start('MenuScene');
};

/*
 * Handle help section.
 */
UIController.prototype.handleHelpMenu = function () {
    if(this.gameScene) return;  // This menu should only appear on the main menu.
    this.toggleHelpPanel();
}
