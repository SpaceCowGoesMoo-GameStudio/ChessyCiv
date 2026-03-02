// ============================================
// GAME ENGINE - Diplomacy Module
// ============================================
// War declarations, peace proposals, and diplomatic relations.

/**
 * Check if a player can change their relation with another player
 * Relations must last at least RELATION_MIN_TURNS complete rounds before they can be changed
 * @param {number} playerId - The player wanting to change relation
 * @param {number} targetId - The target player
 * @returns {Object} { canChange: boolean, roundsRemaining: number }
 */
GameEngine.prototype.canChangeRelation = function(playerId, targetId) {
    const player = this.players[playerId];
    if (!player) return { canChange: false, roundsRemaining: 0 };

    // Cannot change relations with or as an eliminated player
    const target = this.players[targetId];
    if (player.eliminated || (target && target.eliminated)) {
        return { canChange: false, roundsRemaining: 0 };
    }

    const changedRound = player.relationsChangedRound[targetId] ?? -RELATION_MIN_TURNS;
    const roundsSinceChange = this.roundNumber - changedRound;
    const roundsRemaining = Math.max(0, RELATION_MIN_TURNS - roundsSinceChange);

    return {
        canChange: roundsRemaining === 0,
        roundsRemaining: roundsRemaining
    };
};

GameEngine.prototype.declareWar = function(playerId, targetId) {
    if (playerId === targetId) return false;

    const player = this.players[playerId];

    // Check if relation can be changed (minimum rounds requirement)
    const canChange = this.canChangeRelation(playerId, targetId);
    if (!canChange.canChange) {
        this.log('WAR_DENIED', {
            attacker: playerId,
            defender: targetId,
            reason: 'Peace treaty still active',
            roundsRemaining: canChange.roundsRemaining
        });
        return false;
    }

    player.relations[targetId] = 'war';
    player.relationsChangedRound[targetId] = this.roundNumber;
    this.players[targetId].relations[playerId] = 'war';
    this.players[targetId].relationsChangedRound[playerId] = this.roundNumber;

    this.log('WAR_DECLARED', { attacker: playerId, defender: targetId });

    // Capture history snapshot for war declaration
    this.history.captureSnapshot(this, 'WAR_DECLARED', {
        attacker: playerId,
        defender: targetId
    });

    return true;
};

GameEngine.prototype.proposePeace = function(playerId, targetId) {
    if (playerId === targetId) return false;

    const player = this.players[playerId];

    // Check if relation can be changed (minimum rounds requirement)
    const canChange = this.canChangeRelation(playerId, targetId);
    if (!canChange.canChange) {
        this.log('PEACE_PROPOSAL_DENIED', {
            proposer: playerId,
            target: targetId,
            reason: 'War must continue',
            roundsRemaining: canChange.roundsRemaining
        });
        return false;
    }

    // Already proposed — don't re-emit the action or re-snapshot
    if (player.relations[targetId] === 'peace_proposed') return false;

    // Only set proposing player's relation - other player must accept
    player.relations[targetId] = 'peace_proposed';

    this.log('PEACE_PROPOSED', { proposer: playerId, target: targetId });

    // Capture history snapshot for peace proposal
    this.history.captureSnapshot(this, 'PEACE_PROPOSED', {
        proposer: playerId,
        target: targetId
    });

    return true;
};

GameEngine.prototype.rescindPeace = function(playerId, targetId) {
    if (playerId === targetId) return false;

    const player = this.players[playerId];

    // Cannot rescind with an eliminated player
    if (player.eliminated || this.players[targetId].eliminated) return false;

    // Can only rescind if we proposed peace
    if (player.relations[targetId] !== 'peace_proposed') return false;

    // Revert back to war
    player.relations[targetId] = 'war';

    this.log('PEACE_RESCINDED', { player: playerId, target: targetId });

    this.history.captureSnapshot(this, 'PEACE_RESCINDED', {
        player: playerId,
        target: targetId
    });

    return true;
};

GameEngine.prototype.acceptPeace = function(playerId, targetId) {
    if (playerId === targetId) return false;

    // Check that target has proposed peace
    const target = this.players[targetId];
    if (target.relations[playerId] !== 'peace_proposed') return false;

    // Check if the accepting player can change their relation
    const canChange = this.canChangeRelation(playerId, targetId);
    if (!canChange.canChange) {
        this.log('PEACE_ACCEPT_DENIED', {
            accepter: playerId,
            proposer: targetId,
            reason: 'War must continue',
            roundsRemaining: canChange.roundsRemaining
        });
        return false;
    }

    // Both players now at peace
    const player = this.players[playerId];
    player.relations[targetId] = 'peace';
    player.relationsChangedRound[targetId] = this.roundNumber;
    target.relations[playerId] = 'peace';
    target.relationsChangedRound[playerId] = this.roundNumber;

    // Displace all pieces in each other's territory now that peace is made
    this.displacePiecesAfterPeace(playerId, targetId);
    this.displacePiecesAfterPeace(targetId, playerId);

    this.log('PEACE_MADE', { player1: playerId, player2: targetId });

    // Capture history snapshot for peace
    this.history.captureSnapshot(this, 'PEACE_MADE', {
        player1: playerId,
        player2: targetId
    });

    return true;
};

/**
 * Displace all of one player's warriors and settlers from another player's territory
 * Called when peace is made to ensure no pieces remain in enemy territory
 * @param {number} pieceOwnerId - The player whose pieces may need displacement
 * @param {number} territoryOwnerId - The player whose territory to check
 */
GameEngine.prototype.displacePiecesAfterPeace = function(pieceOwnerId, territoryOwnerId) {
    const toDisplace = this.pieces.filter(p =>
        p.ownerId === pieceOwnerId &&
        (p.type === PIECE_TYPES.WARRIOR || p.type === PIECE_TYPES.SETTLER) &&
        this.tileOwnership[p.row][p.col] === territoryOwnerId
    );

    for (const piece of toDisplace) {
        this.handlePieceDisplacement(piece, territoryOwnerId);
    }
};
