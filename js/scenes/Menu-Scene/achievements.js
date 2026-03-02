// ============================================
// MENU SCENE - Achievements (delegates to UIController DOM overlay)
// ============================================

/**
 * Display the Achievements overlay via UIController.
 */
MenuScene.prototype.showAchievements = function() {
    if (typeof uiController !== 'undefined' && uiController.toggleAchievementsPanel) {
        uiController.toggleAchievementsPanel();
    }
};
