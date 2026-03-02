// ============================================
// MENU SCENE - How to Play (delegates to UIController DOM overlay)
// ============================================

/**
 * Display the How to Play overlay via UIController.
 */
MenuScene.prototype.showHowToPlay = function() {
    if (typeof uiController !== 'undefined' && uiController.toggleHowToPlayPanel) {
        uiController.toggleHowToPlayPanel();
    }
};
