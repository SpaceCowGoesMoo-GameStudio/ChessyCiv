// ============================================
// GAME ENGINE - Turns Module
// ============================================
// Turn management and end-of-turn processing.

/**
 * Process automatic border expansion for cities every 6 rounds since creation
 */
GameEngine.prototype.processAutomaticBorderExpansion = function() {
    const round = this.roundNumber;

    // Only process cities (filter once, efficient for many pieces)
    for (let i = 0; i < this.pieces.length; i++) {
        const piece = this.pieces[i];
        if (piece.type !== PIECE_TYPES.CITY) continue;

        const age = round - piece.createdOnRound;
        // Expand every 6 rounds after creation (at rounds 6, 12, 18, etc. since creation)
        if (age > 0 && age % 6 === 0) {
            this.expandTerritoryRadial(piece.ownerId, piece);
            this.log('AUTO_BORDER_EXPANSION', {
                city: piece.id,
                owner: piece.ownerId,
                cityAge: age
            });
        }
    }
};

GameEngine.prototype.endTurn = function() {
    // Advance production progress for current player's cities (but don't complete yet)
    this.pieces.forEach(piece => {
        if (piece.type === PIECE_TYPES.CITY && piece.ownerId === this.currentPlayerIndex) {
            this.advanceProduction(piece);
        }
    });

    // Reset movement for current player's pieces
    this.pieces.forEach(piece => {
        if (piece.ownerId === this.currentPlayerIndex) {
            piece.hasMoved = false;
        }
    });

    // Find the first active player (lowest index with cities)
    const firstActivePlayer = this.getFirstActivePlayer();
    const previousPlayerIndex = this.currentPlayerIndex;

    // Next player
    do {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    } while (this.players[this.currentPlayerIndex].eliminated && !this.gameOver);

    // Check if we've completed a round (wrapped back to first active player)
    if (this.currentPlayerIndex === firstActivePlayer && previousPlayerIndex !== firstActivePlayer) {
        this.roundNumber++;

        // Automatic border expansion: every 6 rounds since city creation
        this.processAutomaticBorderExpansion();
    }

    this.turnNumber++;
    this.log('TURN_END', { nextPlayer: this.currentPlayerIndex, round: this.roundNumber });

    // Complete any ready production for the new current player (start of their turn)
    this.pieces.forEach(piece => {
        if (piece.type === PIECE_TYPES.CITY && piece.ownerId === this.currentPlayerIndex) {
            this.checkAndCompleteProduction(piece);
        }
    });

    // Capture history snapshot at end of each turn
    this.history.captureSnapshot(this, 'TURN_END', {
        turnNumber: this.turnNumber,
        nextPlayer: this.currentPlayerIndex
    });
};
