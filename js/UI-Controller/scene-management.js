/**
 * UIController - Scene registration and mode switching
 * Prototype extension for UIController
 */

/**
 * Set UI to menu mode (only title and options visible)
 */
UIController.prototype.setMenuMode = function() {
    this.currentScene = 'menu';
    document.body.classList.remove('game-mode');
    document.querySelectorAll('.game-only').forEach(el => {
        el.style.display = 'none';
    });
};

/**
 * Set UI to game mode (all buttons visible)
 */
UIController.prototype.setGameMode = function() {
    this.currentScene = 'game';
    this.gameEverStarted = true;
    document.body.classList.add('game-mode');
    document.querySelectorAll('.game-only').forEach(el => {
        el.style.display = '';
    });
};

/**
 * Register the game scene for dev mode features
 */
UIController.prototype.registerGameScene = function(scene) {
    this.gameScene = scene;

    // Dev canvas for AI target lines is created by GameSceneDOM
    this.setGameMode();
    this.log('Game scene started', 'info');
};

/**
 * Register the menu scene
 */
UIController.prototype.registerMenuScene = function(scene) {
    this.menuScene = scene;
};

/**
 * Unregister the game scene
 */
UIController.prototype.unregisterGameScene = function() {
    this.gameScene = null;
    this.setMenuMode();
};
