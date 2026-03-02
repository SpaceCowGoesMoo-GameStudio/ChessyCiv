// ============================================
// GAME ENGINE - Combat Module
// ============================================
// Combat resolution, piece removal, and victory/elimination checks.

GameEngine.prototype.resolveCombat = function(attacker, defender) {
    const originalOwnerId = defender.ownerId;
    const result = {
        attacker: attacker.id,
        defender: defender.id,
        damageDealt: attacker.damage,
        defenderDestroyed: false,
        cityFlipped: false,
        attackerSurvived: true,
        elimination: null
    };

    defender.hp -= attacker.damage;

    if (defender.hp <= 0) {
        result.defenderDestroyed = true;

        if (defender.type === PIECE_TYPES.CITY) {
            // City is captured
            defender.hp = Math.ceil(defender.maxHp / 3);
            defender.ownerId = attacker.ownerId;
            defender.production = null;
            defender.productionProgress = 0;
            result.cityFlipped = true;
            result.defenderDestroyed = false;
            this.tileOwnership[defender.row][defender.col] = attacker.ownerId;
            this.log('CITY_CAPTURED', { city: defender.id, newOwner: attacker.ownerId });

            // Capture history snapshot for city capture
            this.history.captureSnapshot(this, 'CITY_CAPTURED', {
                city: defender.id,
                newOwner: attacker.ownerId,
                previousOwner: originalOwnerId
            });

            // Check for player elimination
            result.elimination = this.checkPlayerElimination(originalOwnerId);
        } else {
            // Track warrior kills and losses
            if (defender.type === PIECE_TYPES.WARRIOR) {
                this.players[attacker.ownerId].warriorKills++;
                this.players[defender.ownerId].warriorsLost++;
            }
            // Remove the piece
            this.removePiece(defender);
        }
    }

    this.log('COMBAT', result);
    this.checkVictory();
    return result;
};

GameEngine.prototype.removePiece = function(piece) {
    const index = this.pieces.indexOf(piece);
    if (index > -1) {
        this.pieces.splice(index, 1);
    }
    this.board[piece.row][piece.col] = null;
    this.log('PIECE_REMOVED', { piece: piece.id });
};

GameEngine.prototype.checkPlayerElimination = function(playerId) {
    const playerCities = this.pieces.filter(p =>
        p.type === PIECE_TYPES.CITY && p.ownerId === playerId
    );

    if (playerCities.length === 0) {
        // Player is eliminated
        this.players[playerId].eliminated = true;
        const conquerer = this.currentPlayerIndex;

        // Clean up any pending diplomatic relations involving the eliminated player
        for (let i = 0; i < this.players.length; i++) {
            if (i === playerId) continue;
            // Revert any peace proposals from or to the eliminated player
            if (this.players[playerId].relations[i] === 'peace_proposed') {
                this.players[playerId].relations[i] = 'war';
            }
            if (this.players[i].relations[playerId] === 'peace_proposed') {
                this.players[i].relations[playerId] = 'war';
            }
        }

        // Get warriors and settlers separately
        const playerWarriors = this.pieces.filter(p =>
            p.ownerId === playerId && p.type === PIECE_TYPES.WARRIOR
        );
        const playerSettlers = this.pieces.filter(p =>
            p.ownerId === playerId && p.type === PIECE_TYPES.SETTLER
        );

        // 25% of warriors are converted, at least 1 if any warriors exist
        const warriorsToConvert = playerWarriors.length > 0
            ? Math.max(1, Math.floor(playerWarriors.length * 0.25))
            : 0;

        // Shuffle warriors to randomly select which ones to convert
        const shuffledWarriors = [...playerWarriors].sort(() => Math.random() - 0.5);

        const convertedUnits = [];
        const destroyedUnits = [];

        // Process warriors: convert 25%, destroy 75%
        shuffledWarriors.forEach((warrior, index) => {
            if (index < warriorsToConvert) {
                // Convert this warrior: destroy it and create a new warrior for conqueror
                const row = warrior.row;
                const col = warrior.col;
                this.removePiece(warrior);

                // Create new warrior for conqueror at same position
                const newWarrior = this.createPiece(PIECE_TYPES.WARRIOR, conquerer, row, col);
                this.pieces.push(newWarrior);
                this.board[row][col] = newWarrior;

                convertedUnits.push({ oldUnit: warrior, newWarrior: newWarrior });
            } else {
                // Destroy this warrior — credit kill to conquerer, loss to eliminated player
                this.players[conquerer].warriorKills++;
                this.players[playerId].warriorsLost++;
                this.removePiece(warrior);
                destroyedUnits.push(warrior);
            }
        });

        // Destroy all settlers
        playerSettlers.forEach(settler => {
            this.removePiece(settler);
            destroyedUnits.push(settler);
        });

        // Transfer all tiles owned by the eliminated player to the conqueror
        let tilesTransferred = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (this.tileOwnership[r][c] === playerId) {
                    this.tileOwnership[r][c] = conquerer;
                    tilesTransferred++;
                }
            }
        }

        this.log('PLAYER_ELIMINATED', { player: playerId, conquerer: conquerer, tilesTransferred: tilesTransferred });

        // Capture history snapshot for player elimination
        this.history.captureSnapshot(this, 'PLAYER_ELIMINATED', {
            player: playerId,
            conquerer: conquerer,
            convertedUnits: convertedUnits.length,
            destroyedUnits: destroyedUnits.length,
            tilesTransferred: tilesTransferred
        });

        return {
            eliminated: true,
            playerId: playerId,
            conquerer: conquerer,
            convertedUnits: convertedUnits,
            destroyedUnits: destroyedUnits,
            tilesTransferred: tilesTransferred
        };
    }

    return { eliminated: false };
};

GameEngine.prototype.checkVictory = function() {
    const cityOwners = new Set(
        this.pieces
            .filter(p => p.type === PIECE_TYPES.CITY)
            .map(p => p.ownerId)
    );

    if (cityOwners.size === 1) {
        this.gameOver = true;
        this.winner = [...cityOwners][0];
        this.log('VICTORY', { winner: this.winner });

        // Mark game as ended in metadata BEFORE capturing the snapshot,
        // so the save includes the winner. captureSnapshot triggers an async
        // save — if endGame were called after, its save would be skipped by
        // the concurrent-save guard, losing the winner metadata.
        this.history.metadata.endTime = Date.now();
        this.history.metadata.winner = this.winner;
        this.history.captureSnapshot(this, 'VICTORY', { winner: this.winner });
    }
};
