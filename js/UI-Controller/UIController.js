/**
 * UIController - Manages HTML-based UI overlay for the game
 * Handles header, options panel, dev mode, and logging
 *
 * This is the main class file. Prototype extensions are loaded from:
 * - header.js - Header creation and button handlers
 * - options-panel.js - Options panel creation and settings UI
 * - dev-mode.js - Dev overlay, logging, AI target visualization
 * - settings.js - Settings persistence (load/save/apply)
 * - scene-management.js - Scene registration and mode switching
 */
class UIController {
    constructor() {
        // Settings
        this.settings = {
            autoSaveTurns: GameHistory.SAVE_INTERVAL,
            masterVolume: 100,
            devMode: false,
            hints: true,
            attackAdjacentChance: 15,
            // Graphics settings (all ON by default to preserve current look)
            crtEffects: true,
            glowBorders: true,
            reducedShadows: false,
            showFPS: false,
            precomputedEffects: typeof layoutConfig !== 'undefined' && layoutConfig.mobile
        };

        // Load settings from localStorage
        this.loadSettings();

        // State
        this.optionsPanelOpen = false;
        this.helpPanelOpen = false;
        this.gameEverStarted = false;
        this.devModeUnlocked = false;
        this.logs = [];
        this.maxLogs = 500;

        // Scene reference (set by scene)
        this.currentScene = null;
        this.gameScene = null;
        this.menuScene = null;

        // Initialize UI elements
        this.initializeUI();

        // Apply initial settings
        this.applySettings();
    }

    /**
     * Initialize all UI elements
     */
    initializeUI() {
        // Create header
        this.createHeader();

        // Create options panel
        this.createOptionsPanel();

        // Create help panel
        this.createHelpPanel();

        // Create how to play panel
        this.createHowToPlayPanel();

        // Create achievements panel
        this.createAchievementsPanel();

        // Create dev mode overlay
        this.createDevOverlay();

        // Set initial visibility (menu mode)
        this.setMenuMode();
    }
}

// Create singleton instance when DOM is ready
let uiController = null;

function initUIController() {
    if (!uiController) {
        uiController = new UIController();
    }
}

// Initialize immediately if DOM is already loaded, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUIController);
} else {
    initUIController();
}
