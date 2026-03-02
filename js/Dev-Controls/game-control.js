// ============================================
// DEV CONTROLS - Game Control Module
// ============================================
// Game ending, logging, turn/round numbers, sandbox mode.

DevGame.prototype.setGameEndingEnabled = function(enabled) {
    if (enabled && !this._gameEndingEnabled) {
        if (this._originalCheckVictory) {
            this.engine.checkVictory = this._originalCheckVictory;
            this._originalCheckVictory = null;
        }
        this._gameEndingEnabled = true;
    } else if (!enabled && this._gameEndingEnabled) {
        this._originalCheckVictory = this.engine.checkVictory.bind(this.engine);
        this.engine.checkVictory = function() {};
        this._gameEndingEnabled = false;
    }
};

DevGame.prototype.isGameEndingEnabled = function() {
    return this._gameEndingEnabled;
};

DevGame.prototype.setLoggingEnabled = function(enabled) {
    if (!enabled && this._loggingEnabled) {
        this._originalLog = this.engine.log.bind(this.engine);
        this.engine.log = function(action, details) {
            const entry = { turn: this.currentPlayerIndex, action, details, timestamp: Date.now() };
            this.actionLog.push(entry);
            return entry;
        }.bind(this.engine);
        this._loggingEnabled = false;
    } else if (enabled && !this._loggingEnabled) {
        if (this._originalLog) {
            this.engine.log = this._originalLog;
            this._originalLog = null;
        }
        this._loggingEnabled = true;
    }
};

DevGame.prototype.isLoggingEnabled = function() {
    return this._loggingEnabled;
};

DevGame.prototype.forceGameOver = function(winnerId) {
    this.engine.gameOver = true;
    this.engine.winner = winnerId;
};

DevGame.prototype.resetGameOver = function() {
    this.engine.gameOver = false;
    this.engine.winner = null;
};

DevGame.prototype.setTurnNumber = function(n) {
    this.engine.turnNumber = n;
};

DevGame.prototype.setRoundNumber = function(n) {
    this.engine.roundNumber = n;
};

// ================================================================
// Sandbox Mode — bypass engine rule constraints
// ================================================================

// Default sandbox rules — all false (no bypasses)
DevGame.prototype._defaultSandboxRules = function() {
    return {
        movement: false,
        combat: false,
        settling: false,
        diplomacy: false,
        production: false
    };
};

DevGame.prototype.setSandboxRules = function(rules) {
    if (!this._sandboxRules) {
        this._sandboxRules = this._defaultSandboxRules();
    }
    const prev = { ...this._sandboxRules };
    for (const key in rules) {
        if (this._sandboxRules.hasOwnProperty(key)) {
            this._sandboxRules[key] = !!rules[key];
        }
    }
    this._applySandboxOverrides(prev);
};

DevGame.prototype.getSandboxRules = function() {
    return { ...(this._sandboxRules || this._defaultSandboxRules()) };
};

DevGame.prototype.setSandboxMode = function(enabled) {
    if (!this._sandboxRules) {
        this._sandboxRules = this._defaultSandboxRules();
    }
    const prev = { ...this._sandboxRules };
    const val = !!enabled;
    this._sandboxRules.movement = val;
    this._sandboxRules.combat = val;
    this._sandboxRules.settling = val;
    this._sandboxRules.diplomacy = val;
    this._sandboxRules.production = val;
    this._sandboxMode = val;
    this._applySandboxOverrides(prev);
};

DevGame.prototype._applySandboxOverrides = function(prev) {
    const rules = this._sandboxRules;
    const engine = this.engine;
    const anyActive = rules.movement || rules.combat || rules.settling || rules.diplomacy || rules.production;
    this._sandboxMode = anyActive;

    // Movement + Combat (these are intertwined in canMoveTo/movePiece)
    if (rules.movement || rules.combat) {
        engine.canMoveTo = function(piece, targetRow, targetCol) {
            if (!engine.isValidTile(targetRow, targetCol)) {
                return { valid: false, reason: 'Out of bounds' };
            }
            const target = engine.board[targetRow][targetCol];
            if (target) {
                return { valid: true, isAttack: true, target };
            }
            return { valid: true, isAttack: false };
        };

        engine.movePiece = function(piece, targetRow, targetCol) {
            if (!engine.isValidTile(targetRow, targetCol)) {
                return { success: false, reason: 'Out of bounds' };
            }
            const target = engine.board[targetRow][targetCol];
            if (target && target.ownerId === piece.ownerId) {
                return { success: false, reason: 'Cannot attack own piece' };
            }

            engine.board[piece.row][piece.col] = null;

            let combatResult = null;
            if (target) {
                combatResult = engine.resolveCombat(piece, target);
            }

            if (!piece.removed) {
                piece.row = targetRow;
                piece.col = targetCol;
                engine.board[targetRow][targetCol] = piece;
            }

            return { success: true, combat: combatResult };
        };
    } else if (prev && (prev.movement || prev.combat)) {
        delete engine.canMoveTo;
        delete engine.movePiece;
    }

    // Settling
    if (rules.settling) {
        engine.canSettlerBuildCity = function(piece) {
            if (!piece || piece.type !== PIECE_TYPES.SETTLER) {
                return { valid: false, reason: 'Not a settler' };
            }
            return { valid: true };
        };

        engine.settlerBuildCity = function(piece) {
            if (!piece || piece.type !== PIECE_TYPES.SETTLER) {
                return { success: false, reason: 'Not a settler' };
            }
            const row = piece.row, col = piece.col;
            engine.removePiece(piece);
            const city = engine.createPiece(PIECE_TYPES.CITY, piece.ownerId, row, col);
            engine.pieces.push(city);
            engine.board[row][col] = city;
            engine.tileOwnership[row][col] = piece.ownerId;
            return { success: true, city: DevExport.pieceToPlain(city) };
        };
    } else if (prev && prev.settling) {
        delete engine.canSettlerBuildCity;
        delete engine.settlerBuildCity;
    }

    // Diplomacy
    if (rules.diplomacy) {
        engine.canChangeRelation = function() { return { canChange: true, roundsRemaining: 0 }; };
    } else if (prev && prev.diplomacy) {
        delete engine.canChangeRelation;
    }

    // Production — bypass type/cost checks by overriding setProduction
    if (rules.production) {
        engine.setProduction = function(piece, type) {
            if (!piece || piece.type !== PIECE_TYPES.CITY) return false;
            piece.production = type;
            piece.productionProgress = 0;
            return true;
        };
    } else if (prev && prev.production) {
        delete engine.setProduction;
    }

    this._savedEngineMethods = anyActive ? true : null;
};

DevGame.prototype.isSandboxMode = function() {
    return !!this._sandboxMode;
};
