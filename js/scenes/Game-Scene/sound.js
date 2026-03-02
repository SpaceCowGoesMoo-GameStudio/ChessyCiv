// ============================================
// GAME SCENE - Sound Module
// ============================================
// Sound effects and music management.

/**
 * Play a short sound effect when a piece is dropped
 * :param numPieces: integer representing the number of pieces a player has
 */
GameScene.prototype.playPieceDropSoundAI = function(numberPieces) {
    if (this.soundDenied) return;
    if (typeof soundManager !== 'undefined') {
        soundManager.resumeContext(); // Ensure context is active
        if (numberPieces <= 3){
            soundManager.playImmediate('sound/interface/1piece move.mp3', 100);
        } else if (numberPieces < 6 && numberPieces > 3){
            soundManager.playImmediate('sound/interface/move-squad.mp3', 100);
        } else if (numberPieces >= 6){
            soundManager.playImmediate('sound/interface/move-army.mp3', 100);
        }
    }
};

GameScene.prototype.playPieceDropSoundHuman = function() {
    if (this.soundDenied) return;
    if (typeof soundManager !== 'undefined') {
        soundManager.resumeContext(); // Ensure context is active
        soundManager.playImmediate('sound/interface/1piece move.mp3', 100);
    }
};

GameScene.prototype.playCivDeath = function(){
    if (this.soundDenied || this.engine.winner !== null) return;
    if (typeof soundManager !== 'undefined') {
        soundManager.resumeContext(); // Ensure context is active
        soundManager.playImmediate('sound/music/thefallofaciv.mp3', 80);
    }
}

GameScene.prototype.playCityCapture = function(){
    if (this.soundDenied || this.engine.winner !== null) return;
    if (typeof soundManager !== 'undefined') {
        soundManager.resumeContext(); // Ensure context is active
        soundManager.playImmediate('sound/interface/delete.mp3', 100);
    }
}

GameScene.prototype.playCitySettle = function(){
    if (this.soundDenied) return;
    if (typeof soundManager !== 'undefined') {
        soundManager.resumeContext(); // Ensure context is active
        soundManager.playImmediate('sound/interface/founding 2.mp3', 90);
    }
}

GameScene.prototype.playClickSound = function() {
    if (this.soundDenied) return;
    if (typeof soundManager !== 'undefined') {
        soundManager.resumeContext();
        soundManager.playImmediate('sound/interface/click.mp3', 100);
    }
}

GameScene.prototype.playWinSong = function(){
    if (typeof soundManager !== 'undefined') {
        soundManager.resumeContext();
        soundManager.playImmediate('sound/music/WIN.mp3', 80);
    }
}

GameScene.prototype.playLoseSong = function(){
    if (typeof soundManager !== 'undefined') {
        soundManager.resumeContext();
        soundManager.playImmediate('sound/music/LOSE.mp3', 80);
    }
}

GameScene.prototype.playAttackSound = function(){
    if (this.soundDenied) return;
    if (typeof soundManager !== 'undefined') {
        soundManager.resumeContext();
        soundManager.playImmediate('sound/interface/attack.mp3', 100);
    }
}

/**
 * Start playing AI turn background music in a loop
 */
GameScene.prototype.startAITurnMusic = function() {
    if (this.soundDenied) return;
    if (typeof soundManager !== 'undefined') {
        soundManager.resumeContext(); // Ensure context is active
        soundManager.addLoop('sound/music/domain of the machine-smol.mp3', 0, 30);
    }
};

/**
 * Stop the AI turn background music
 */
GameScene.prototype.stopAITurnMusic = function() {
    if (typeof soundManager !== 'undefined') {
        soundManager.stopLoop();
    }
};
