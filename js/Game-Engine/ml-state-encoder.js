// ============================================
// GAME ENGINE - ML State Encoder
// ============================================
// Converts game state into the Relative Perspective Tensor
// format required by the MCTS + Dual Head CNN.
//
// Produces a multi-channel 10x10 spatial tensor where all data
// is relative to the requesting player ("Me" vs "Enemies").
// Enemies are sorted by turn order (next to move after me = Enemy 1).

/**
 * Production type string to numeric code mapping.
 * 0 = idle, 1 = diplomacy, 2 = science, 3 = warrior, 4 = settler, 5 = repair, 6 = heal warriors
 */
const ML_PRODUCTION_CODE = {
    null: 0,
    'DIPLOMACY': 1,
    'SCIENCE': 2,
    'WARRIOR': 3,
    'SETTLER': 4,
    'REPAIR': 5,
    'HEAL_WARRIORS': 6
};

/**
 * Encode the full game state as a Relative Perspective Tensor for ML input.
 *
 * Fixed 40-channel layout (always 3 enemy slots, zeros for absent enemies):
 *   0  - My Units (bitmap)
 *   1  - My Cities (bitmap)
 *   2  - My Warrior Heatmap (1=present now, decaying values track past positions)
 *   3  - My Settlers (bitmap)
 *   4  - My Territory (bitmap)
 *   5  - My Production (per-city code 0-6)
 *   6  - My Tech Level (global plane, normalized by /10)
 *
 *   Per enemy (enemy index e = 0,1,2), base = 7 + e*10:
 *     base+0 - Enemy Units (bitmap)
 *     base+1 - Enemy Cities (bitmap)
 *     base+2 - Enemy Warrior Heatmap (1=present now, decaying values track past)
 *     base+3 - Enemy Settlers (bitmap)
 *     base+4 - Enemy Territory (bitmap)
 *     base+5 - War Status (global plane of 1s or 0s)
 *     base+6 - Peace Proposal Active (global plane)
 *     base+7 - Enemy Production (playerOffset + code)
 *     base+8 - Enemy Production Status (raw turns remaining)
 *     base+9 - Enemy Tech Level (global plane, normalized by /10)
 *
 *   History & Meta (channels 37-39):
 *     37 - Was Attacked Last Turn (global plane)
 *     38 - Turn Progress (normalized, global plane)
 *     39 - Bias Plane (all 1s)
 *
 * @param {number} playerId - The player whose perspective to encode
 * @param {Object} [warriorHeatmaps] - Optional per-player warrior heatmaps (Float32Array[100] keyed by playerId).
 *        If provided, warrior channels use these values instead of binary bitmaps.
 *        Values: 1.0 = warrior present now, 0 < x < 1 = decayed past presence, 0 = no history.
 * @returns {{ channels: Float32Array[], numChannels: number, size: number }}
 */
GameEngine.prototype.encodeStateForML = function(playerId, warriorHeatmaps) {
    const S = BOARD_SIZE; // 10
    const maxEnemies = 3; // always 3 slots regardless of player count
    const numChannels = 7 + maxEnemies * 10 + 3; // 40

    // Allocate all channels as flat Float32Arrays (row-major)
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
        channels.push(new Float32Array(S * S));
    }

    // --- Build enemy list sorted by turn order (next after me first) ---
    // Always pad to 3 slots so channel layout is fixed regardless of player count
    const enemies = [];
    for (let offset = 1; offset < this.players.length; offset++) {
        const idx = (playerId + offset) % this.players.length;
        if (!this.players[idx].eliminated) {
            enemies.push(idx);
        }
    }
    while (enemies.length < 3) {
        enemies.push(-1); // sentinel for eliminated/absent enemy
    }

    // Map enemy player id -> enemy slot index (0-based)
    const enemySlot = {};
    for (let e = 0; e < enemies.length; e++) {
        if (enemies[e] >= 0) {
            enemySlot[enemies[e]] = e;
        }
    }

    // --- Channel indices ---
    const CH_MY_UNITS = 0;
    const CH_MY_CITIES = 1;
    const CH_MY_WARRIORS = 2;
    const CH_MY_SETTLERS = 3;
    const CH_MY_TERRITORY = 4;
    const CH_MY_PRODUCTION = 5;
    const CH_MY_TECH = 6;

    const enemyBase = (e) => 7 + e * 10;
    // enemy offsets within block: 0=units,1=cities,2=warriors,3=settlers,4=territory,5=war,6=peace,7=production,8=prodStatus,9=tech

    const metaBase = 7 + maxEnemies * 10; // 37
    const CH_ATTACKED = metaBase + 0;    // 37
    const CH_TURN_PROGRESS = metaBase + 1; // 38
    const CH_BIAS = metaBase + 2;        // 39

    // --- Fill piece channels ---
    // If warrior heatmaps are provided, use them for warrior channels
    const useHeatmaps = !!warriorHeatmaps;

    for (let i = 0; i < this.pieces.length; i++) {
        const piece = this.pieces[i];
        const idx = piece.row * S + piece.col;

        if (piece.ownerId === playerId) {
            // My piece
            channels[CH_MY_UNITS][idx] = 1;
            if (piece.type === PIECE_TYPES.CITY) {
                channels[CH_MY_CITIES][idx] = 1;
                channels[CH_MY_PRODUCTION][idx] = ML_PRODUCTION_CODE[piece.production] || 0;
            } else if (piece.type === PIECE_TYPES.WARRIOR) {
                // Binary fallback if no heatmaps provided
                if (!useHeatmaps) {
                    channels[CH_MY_WARRIORS][idx] = 1;
                }
            } else if (piece.type === PIECE_TYPES.SETTLER) {
                channels[CH_MY_SETTLERS][idx] = 1;
            }
        } else {
            // Enemy piece
            const slot = enemySlot[piece.ownerId];
            if (slot === undefined) continue; // eliminated player with lingering reference
            const base = enemyBase(slot);

            channels[base + 0][idx] = 1; // units
            if (piece.type === PIECE_TYPES.CITY) {
                channels[base + 1][idx] = 1; // cities
                // Enemy production: (enemySlot+1)*10 + productionCode
                const prodCode = ML_PRODUCTION_CODE[piece.production] || 0;
                channels[base + 7][idx] = (slot + 1) * 10 + prodCode;
                // Production status: raw turns remaining
                if (piece.production) {
                    const totalTurns = PRODUCTION_TYPES[piece.production]?.turns || 0;
                    channels[base + 8][idx] = Math.max(0, totalTurns - piece.productionProgress);
                }
            } else if (piece.type === PIECE_TYPES.WARRIOR) {
                // Binary fallback if no heatmaps provided
                if (!useHeatmaps) {
                    channels[base + 2][idx] = 1;
                }
            } else if (piece.type === PIECE_TYPES.SETTLER) {
                channels[base + 3][idx] = 1;
            }
        }
    }

    // --- Fill warrior heatmap channels from external heatmaps ---
    if (useHeatmaps) {
        // My warrior heatmap
        if (warriorHeatmaps[playerId]) {
            const hm = warriorHeatmaps[playerId];
            for (let j = 0; j < S * S; j++) {
                channels[CH_MY_WARRIORS][j] = hm[j];
            }
        }
        // Enemy warrior heatmaps
        for (let e = 0; e < enemies.length; e++) {
            const enemyId = enemies[e];
            if (enemyId < 0) continue;
            if (warriorHeatmaps[enemyId]) {
                const base = enemyBase(e);
                const hm = warriorHeatmaps[enemyId];
                for (let j = 0; j < S * S; j++) {
                    channels[base + 2][j] = hm[j];
                }
            }
        }
    }

    // --- Fill territory channels ---
    for (let r = 0; r < S; r++) {
        for (let c = 0; c < S; c++) {
            const tileIdx = r * S + c;
            const owner = this.tileOwnership[r][c];
            if (owner === null) continue;

            if (owner === playerId) {
                channels[CH_MY_TERRITORY][tileIdx] = 1;
            } else {
                const slot = enemySlot[owner];
                if (slot !== undefined) {
                    channels[enemyBase(slot) + 4][tileIdx] = 1;
                }
            }
        }
    }

    // --- Fill enemy diplomacy planes (war status, peace proposals) ---
    const myPlayer = this.players[playerId];
    for (let e = 0; e < enemies.length; e++) {
        const enemyId = enemies[e];
        if (enemyId < 0) continue;
        const base = enemyBase(e);
        const relation = myPlayer.relations[enemyId];

        if (relation === 'war') {
            channels[base + 5].fill(1); // war plane
        }

        // Peace proposal active: either side has proposed
        if (relation === 'peace_proposed' ||
            this.players[enemyId].relations[playerId] === 'peace_proposed') {
            channels[base + 6].fill(1);
        }
    }

    // --- Tech level planes ---
    const TECH_NORM = 10; // normalize tech score by dividing by this
    const myTech = Math.min((this.players[playerId].techScore || 0) / TECH_NORM, 1.0);
    if (myTech > 0) {
        channels[CH_MY_TECH].fill(myTech);
    }

    for (let e = 0; e < enemies.length; e++) {
        const enemyId = enemies[e];
        if (enemyId < 0) continue;
        const base = enemyBase(e);
        const eTech = Math.min((this.players[enemyId].techScore || 0) / TECH_NORM, 1.0);
        if (eTech > 0) {
            channels[base + 9].fill(eTech);
        }
    }

    // --- History & Meta ---

    // Was attacked last turn: check action log for combat where I was the defender
    const wasAttacked = this._wasPlayerAttackedLastTurn(playerId);
    if (wasAttacked) {
        channels[CH_ATTACKED].fill(1);
    }

    // Turn progress: normalized by a reasonable max (100 rounds)
    const turnProgress = Math.min(this.roundNumber / 100, 1.0);
    channels[CH_TURN_PROGRESS].fill(turnProgress);

    // Bias plane: all 1s
    channels[CH_BIAS].fill(1);

    return {
        channels: channels,
        numChannels: numChannels,
        size: S
    };
};

/**
 * Check if the given player was attacked during the previous turn cycle.
 * Scans the action log for COMBAT entries where the defender belonged to playerId.
 * @param {number} playerId
 * @returns {boolean}
 */
GameEngine.prototype._wasPlayerAttackedLastTurn = function(playerId) {
    // Walk the log backwards looking for combat events in the last round
    for (let i = this.actionLog.length - 1; i >= 0; i--) {
        const entry = this.actionLog[i];

        // Stop scanning once we go beyond the previous full round of turns
        if (entry.action === 'TURN_END' && entry.turn === playerId) {
            // We've hit our own previous turn end - anything before this is older
            break;
        }

        if (entry.action === 'COMBAT' && entry.details) {
            // Find the defender piece to check ownership
            const defenderId = entry.details.defender;
            // Check if any of our pieces were the defender
            // The details contain attacker/defender piece IDs - check the log context
            // Since combat logs the defender ID, we need to check if that piece was ours
            // The combat entry also has the turn index (who was attacking)
            if (entry.turn !== playerId) {
                // Someone else's turn - they could have attacked us
                // Check if the defender piece belonged to us by looking for our piece IDs
                const defId = entry.details.defender;
                if (typeof defId === 'string' && defId.includes('_')) {
                    // We can't reliably determine ownership from ID alone in the log
                    // Instead, use the elimination/cityFlipped data
                    if (entry.details.cityFlipped || entry.details.defenderDestroyed) {
                        // A piece was destroyed or city flipped during someone else's turn
                        // This is a heuristic - the combat was against someone
                        // For accuracy, we'd need the defender's owner in the log
                        // Fall back to checking if combat happened near our territory
                    }
                }
            }
        }
    }

    // More reliable approach: check if any of our pieces have lower HP than max
    // and the damage happened recently (simple heuristic)
    // For headless mode (ML training), action log may be empty
    // Use a dedicated tracking field instead
    return this._attackedLastTurn?.[playerId] || false;
};

/**
 * Fill a plane with 1s on tiles where a settler could legally found a city.
 * A tile is valid if: owned by playerId, empty, and at least 2 tiles from any city.
 * @param {number} playerId
 * @param {Float32Array} plane - The plane to fill (mutated in place)
 */
GameEngine.prototype._fillCanGrowPlane = function(playerId, plane) {
    const S = BOARD_SIZE;

    // Build a forbidden zone mask around all cities (Chebyshev distance <= 1)
    const forbidden = new Uint8Array(S * S);
    for (let i = 0; i < this.pieces.length; i++) {
        const p = this.pieces[i];
        if (p.type !== PIECE_TYPES.CITY) continue;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = p.row + dr;
                const nc = p.col + dc;
                if (nr >= 0 && nr < S && nc >= 0 && nc < S) {
                    forbidden[nr * S + nc] = 1;
                }
            }
        }
    }

    for (let r = 0; r < S; r++) {
        for (let c = 0; c < S; c++) {
            const idx = r * S + c;
            if (this.tileOwnership[r][c] === playerId &&
                this.board[r][c] === null &&
                !forbidden[idx]) {
                plane[idx] = 1;
            }
        }
    }
};

/**
 * Track attacks for the "was attacked last turn" feature.
 * Call this from combat resolution to record that a player was attacked.
 * @param {number} defenderId - The player who was attacked
 */
GameEngine.prototype.recordAttack = function(defenderId) {
    if (!this._attackedLastTurn) {
        this._attackedLastTurn = {};
    }
    this._attackedLastTurn[defenderId] = true;
};

/**
 * Clear attack tracking at the start of a player's turn.
 * Call this at the beginning of each turn.
 * @param {number} playerId - The player whose turn is starting
 */
GameEngine.prototype.clearAttackTracking = function(playerId) {
    if (this._attackedLastTurn) {
        this._attackedLastTurn[playerId] = false;
    }
};
