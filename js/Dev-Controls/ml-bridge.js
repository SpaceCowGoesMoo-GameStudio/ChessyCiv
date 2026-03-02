// ============================================
// DEV CONTROLS - ML Bridge Module
// ============================================
// Model-agnostic ML training API. Provides multiple observation formats,
// dual action interfaces (fixed-space + variable-length), pluggable
// rewards, and a Gym-like episode API (step/reset).

// ================================================================
// Section 1 — Constants
// ================================================================

const ML_BRIDGE = {
    ACTION_SPACE_SIZE: 3110,
    PASS_OFFSET: 0,
    MOVE_OFFSET: 1,
    SETTLE_OFFSET: 2401,
    PRODUCTION_OFFSET: 2501,
    DIPLOMACY_OFFSET: 3101,

    DIRECTIONS: [
        [-1, 0], [-1, 1], [0, 1], [1, 1],
        [1, 0], [1, -1], [0, -1], [-1, -1]
    ],

    PRODUCTION_MAP: {
        'WARRIOR': 0, 'SETTLER': 1, 'SCIENCE': 2,
        'DIPLOMACY': 3, 'REPAIR': 4, 'HEAL_WARRIORS': 5
    },

    PRODUCTION_INDEX_TO_NAME: ['WARRIOR', 'SETTLER', 'SCIENCE', 'DIPLOMACY', 'REPAIR', 'HEAL_WARRIORS'],

    // Per-action API (3110-size): 3 diplomacy types
    DIPLOMACY_TYPE_MAP: {
        'DECLARE_WAR': 0, 'PROPOSE_PEACE': 1, 'ACCEPT_PEACE': 2
    },

    // Turn-based API (106-size): 2 diplomacy types (PEACE is context-sensitive)
    TURN_DIPLOMACY_TYPE_MAP: {
        'WAR': 0, 'PEACE': 1
    },

    OBSERVATION_FORMATS: ['raw', 'flat', 'spatial', 'structured', 'tensor'],

    // Turn-based action space: all warrior moves + diplomacy in one inference
    BOARD_CELLS: 100,      // 10x10
    DIPLO_SLOTS: 6,        // 2 types x 3 enemy slots
    TURN_ACTION_SIZE: 106, // 100 target cells + 6 diplo binary
    TURN_MASK_SIZE: 106,   // 100 warrior presence + 6 diplo mask

    // Heatmap decay factor per turn
    HEATMAP_DECAY: 0.9
};

// ================================================================
// Section 2 — State Observation Methods
// ================================================================

/**
 * Raw state: plain JS objects, no encoding.
 * Good for: custom encoders, tabular models, any architecture needing raw access.
 */
DevGame.prototype.getRawState = function(playerId) {
    const engine = this.engine;
    const pid = playerId !== undefined ? playerId : engine.currentPlayerIndex;

    const pieces = engine.pieces.map(p => ({
        id: p.id,
        type: p.type,
        ownerId: p.ownerId,
        row: p.row,
        col: p.col,
        hp: p.hp,
        maxHp: p.maxHp,
        hasMoved: p.hasMoved || false,
        production: p.production || null,
        productionProgress: p.productionProgress || 0
    }));

    const tileOwnership = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        const row = [];
        for (let c = 0; c < BOARD_SIZE; c++) {
            row.push(engine.tileOwnership[r][c]);
        }
        tileOwnership.push(row);
    }

    const players = engine.players.map((p, i) => ({
        id: i,
        eliminated: p.eliminated || false,
        techScore: p.techScore || 0,
        relations: { ...p.relations }
    }));

    return {
        pieces,
        tileOwnership,
        players,
        currentPlayerIndex: engine.currentPlayerIndex,
        turnNumber: engine.turnNumber,
        roundNumber: engine.roundNumber,
        gameOver: engine.gameOver || false,
        winner: engine.winner !== undefined ? engine.winner : null,
        meta: { playerId: pid, format: 'raw' }
    };
};

/**
 * Flat state: fixed-length Float32Array.
 * Good for: MLPs, LSTMs, KANs, any architecture consuming 1D vectors.
 */
DevGame.prototype.getFlatState = function(playerId) {
    const engine = this.engine;
    const pid = playerId !== undefined ? playerId : engine.currentPlayerIndex;
    const numPlayers = engine.players.length;

    // Layout:
    // [0-3]   global scalars: turnNumber/200, gamePhase, techScore/50, territory/100
    // [4-12]  per-opponent (up to 3): relation one-hot [peace, war, proposed] = 3 each
    // [13-112] board ownership: 100 values
    // [113-512] board pieces: 100 tiles × 4 values (type, isOwn, hp/maxHp, hasMoved)
    // [513-...] own pieces detailed (cities×6, warriors×4, settlers×4)

    const maxCities = 10;
    const maxWarriors = 20;
    const maxSettlers = 10;
    const detailedSize = maxCities * 6 + maxWarriors * 4 + maxSettlers * 4;
    const totalSize = 4 + 9 + 100 + 400 + detailedSize;

    const data = new Float32Array(totalSize);
    let offset = 0;

    // Global scalars
    data[offset++] = (engine.turnNumber || 0) / 200;
    const phase = engine.getGamePhase ? engine.getGamePhase() : 'early';
    data[offset++] = phase === 'early' ? 0.0 : phase === 'mid' ? 0.5 : 1.0;
    data[offset++] = (engine.players[pid].techScore || 0) / 50;
    let myTerritory = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (engine.tileOwnership[r][c] === pid) myTerritory++;
        }
    }
    data[offset++] = myTerritory / 100;

    // Per-opponent relations (up to 3)
    let opIdx = 0;
    for (let i = 0; i < numPlayers && opIdx < 3; i++) {
        if (i === pid) continue;
        const rel = engine.players[pid].relations[i];
        const base = 4 + opIdx * 3;
        if (rel === 'peace') data[base] = 1;
        else if (rel === 'war') data[base + 1] = 1;
        else if (rel === 'peace_proposed') data[base + 2] = 1;
        opIdx++;
    }
    offset = 13;

    // Board ownership
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const owner = engine.tileOwnership[r][c];
            if (owner === null) data[offset] = 0.5;
            else if (owner === pid) data[offset] = 1.0;
            else data[offset] = 0.0;
            offset++;
        }
    }

    // Board pieces: 100 tiles × 4 values
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = engine.board[r] ? engine.board[r][c] : null;
            if (piece) {
                const typeVal = piece.type === PIECE_TYPES.CITY ? 1.0 :
                               piece.type === PIECE_TYPES.WARRIOR ? 0.5 : 0.25;
                data[offset] = typeVal;
                data[offset + 1] = piece.ownerId === pid ? 1.0 : 0.0;
                data[offset + 2] = piece.maxHp ? (piece.hp || 0) / piece.maxHp : 0;
                data[offset + 3] = piece.hasMoved ? 1.0 : 0.0;
            }
            offset += 4;
        }
    }

    // Own pieces detailed
    const myCities = engine.pieces.filter(p => p.ownerId === pid && p.type === PIECE_TYPES.CITY);
    const myWarriors = engine.pieces.filter(p => p.ownerId === pid && p.type === PIECE_TYPES.WARRIOR);
    const mySettlers = engine.pieces.filter(p => p.ownerId === pid && p.type === PIECE_TYPES.SETTLER);

    for (let i = 0; i < maxCities; i++) {
        if (i < myCities.length) {
            const c = myCities[i];
            data[offset] = c.row / 9;
            data[offset + 1] = c.col / 9;
            data[offset + 2] = c.maxHp ? (c.hp || 0) / c.maxHp : 0;
            data[offset + 3] = c.production ? (ML_BRIDGE.PRODUCTION_MAP[c.production] + 1) / 6 : 0;
            data[offset + 4] = c.productionProgress ? c.productionProgress / 10 : 0;
            data[offset + 5] = 1; // exists flag
        }
        offset += 6;
    }
    for (let i = 0; i < maxWarriors; i++) {
        if (i < myWarriors.length) {
            const w = myWarriors[i];
            data[offset] = w.row / 9;
            data[offset + 1] = w.col / 9;
            data[offset + 2] = w.maxHp ? (w.hp || 0) / w.maxHp : 0;
            data[offset + 3] = 1; // exists flag
        }
        offset += 4;
    }
    for (let i = 0; i < maxSettlers; i++) {
        if (i < mySettlers.length) {
            const s = mySettlers[i];
            data[offset] = s.row / 9;
            data[offset + 1] = s.col / 9;
            data[offset + 2] = s.maxHp ? (s.hp || 0) / s.maxHp : 0;
            data[offset + 3] = 1; // exists flag
        }
        offset += 4;
    }

    return {
        data,
        shape: [totalSize],
        meta: { playerId: pid, format: 'flat' }
    };
};

/**
 * Spatial state: multi-channel 10×10 Float32Array.
 * 8 channels: ownership, piece_type, piece_owner, piece_hp,
 *             threat, opportunity, territory, expansion heatmaps.
 * Good for: CNNs, Vision Transformers.
 */
DevGame.prototype.getSpatialState = function(playerId) {
    const engine = this.engine;
    const pid = playerId !== undefined ? playerId : engine.currentPlayerIndex;
    const S = BOARD_SIZE;
    const numChannels = 8;
    const data = new Float32Array(numChannels * S * S);

    // ch0: ownership (1=own, 0.5=neutral, 0=enemy)
    for (let r = 0; r < S; r++) {
        for (let c = 0; c < S; c++) {
            const idx = c + r * S;
            const owner = engine.tileOwnership[r][c];
            if (owner === null) data[idx] = 0.5;
            else if (owner === pid) data[idx] = 1.0;
            else data[idx] = 0.0;
        }
    }

    // ch1: piece_type (0=none, 1=city, 0.5=warrior, 0.25=settler)
    // ch2: piece_owner (1=own, 0=enemy, 0.5=none)
    // ch3: piece_hp (normalized)
    const ch1Off = S * S;
    const ch2Off = 2 * S * S;
    const ch3Off = 3 * S * S;
    for (let i = 0; i < engine.pieces.length; i++) {
        const p = engine.pieces[i];
        const idx = p.row * S + p.col;
        data[ch1Off + idx] = p.type === PIECE_TYPES.CITY ? 1.0 :
                             p.type === PIECE_TYPES.WARRIOR ? 0.5 : 0.25;
        data[ch2Off + idx] = p.ownerId === pid ? 1.0 : 0.0;
        data[ch3Off + idx] = p.maxHp ? (p.hp || 0) / p.maxHp : 0;
    }

    // ch4-ch7: heatmaps (pass-throughs to engine)
    const heatmaps = [
        engine.getThreatHeatmap ? engine.getThreatHeatmap(pid) : null,
        engine.getOpportunityHeatmap ? engine.getOpportunityHeatmap(pid) : null,
        engine.getTerritoryHeatmap ? engine.getTerritoryHeatmap(pid) : null,
        engine.getExpansionHeatmap ? engine.getExpansionHeatmap(pid) : null
    ];

    for (let h = 0; h < 4; h++) {
        const chOff = (4 + h) * S * S;
        const hmap = heatmaps[h];
        if (!hmap) continue;
        for (let r = 0; r < S; r++) {
            for (let c = 0; c < S; c++) {
                const val = hmap[r] ? (hmap[r][c] || 0) : 0;
                data[chOff + r * S + c] = val;
            }
        }
    }

    return {
        data,
        shape: [numChannels, S, S],
        meta: { playerId: pid, format: 'spatial' }
    };
};

/**
 * Structured state: piece tokens + global context.
 * Each piece → Float32Array(8) token.
 * Good for: Transformers, attention models, graph networks.
 */
DevGame.prototype.getStructuredState = function(playerId) {
    const engine = this.engine;
    const pid = playerId !== undefined ? playerId : engine.currentPlayerIndex;

    // Piece tokens: [type, isOwn, row/9, col/9, hp/maxHp, hasMoved, production, prodProgress]
    const pieceTokens = [];
    for (let i = 0; i < engine.pieces.length; i++) {
        const p = engine.pieces[i];
        const token = new Float32Array(8);
        token[0] = p.type === PIECE_TYPES.CITY ? 1.0 :
                   p.type === PIECE_TYPES.WARRIOR ? 0.5 : 0.25;
        token[1] = p.ownerId === pid ? 1.0 : 0.0;
        token[2] = p.row / 9;
        token[3] = p.col / 9;
        token[4] = p.maxHp ? (p.hp || 0) / p.maxHp : 0;
        token[5] = p.hasMoved ? 1.0 : 0.0;
        token[6] = p.production ? (ML_BRIDGE.PRODUCTION_MAP[p.production] + 1) / 6 : 0;
        token[7] = p.productionProgress ? p.productionProgress / 10 : 0;
        pieceTokens.push(token);
    }

    // Global context: [turnNumber/200, gamePhase, myTech/50, myTerritory/100, numPlayers/4, myIndex/3]
    const globalContext = new Float32Array(6);
    globalContext[0] = (engine.turnNumber || 0) / 200;
    const phase = engine.getGamePhase ? engine.getGamePhase() : 'early';
    globalContext[1] = phase === 'early' ? 0.0 : phase === 'mid' ? 0.5 : 1.0;
    globalContext[2] = (engine.players[pid].techScore || 0) / 50;
    let terr = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (engine.tileOwnership[r][c] === pid) terr++;
        }
    }
    globalContext[3] = terr / 100;
    globalContext[4] = engine.players.length / 4;
    globalContext[5] = pid / 3;

    // Relation tokens: [targetNormalized, isPeace, isWar, isProposed]
    const relationTokens = [];
    for (let i = 0; i < engine.players.length; i++) {
        if (i === pid) continue;
        const token = new Float32Array(4);
        token[0] = i / 3;
        const rel = engine.players[pid].relations[i];
        if (rel === 'peace') token[1] = 1;
        else if (rel === 'war') token[2] = 1;
        else if (rel === 'peace_proposed') token[3] = 1;
        relationTokens.push(token);
    }

    return {
        pieceTokens,
        globalContext,
        relationTokens,
        meta: { playerId: pid, format: 'structured', numPieces: pieceTokens.length }
    };
};

/**
 * Relative perspective tensor: delegates to engine.encodeStateForML().
 * @param {number} [playerId]
 * @param {Object} [warriorHeatmaps] - Optional per-player warrior heatmaps (Float32Array[100] keyed by playerId)
 */
DevGame.prototype.getRelativeTensorState = function(playerId, warriorHeatmaps) {
    const pid = playerId !== undefined ? playerId : this.engine.currentPlayerIndex;
    return this.engine.encodeStateForML(pid, warriorHeatmaps);
};

/**
 * Set the default observation format used by step().
 * @param {string} format - One of: 'raw', 'flat', 'spatial', 'structured', 'tensor'
 */
DevGame.prototype.setObservationFormat = function(format) {
    if (ML_BRIDGE.OBSERVATION_FORMATS.indexOf(format) === -1) {
        throw new Error('Unknown observation format: ' + format + '. Valid: ' + ML_BRIDGE.OBSERVATION_FORMATS.join(', '));
    }
    this._observationFormat = format;
};

/**
 * Get observation using the specified or default format.
 */
DevGame.prototype._getObservation = function(playerId, format) {
    const fmt = format || this._observationFormat || 'raw';
    switch (fmt) {
        case 'raw': return this.getRawState(playerId);
        case 'flat': return this.getFlatState(playerId);
        case 'spatial': return this.getSpatialState(playerId);
        case 'structured': return this.getStructuredState(playerId);
        case 'tensor': return this.getRelativeTensorState(playerId);
        default: return this.getRawState(playerId);
    }
};

/**
 * Returns shape/dimension metadata for the given observation format.
 */
DevGame.prototype.getObservationSpaceInfo = function(format) {
    const fmt = format || this._observationFormat || 'raw';
    switch (fmt) {
        case 'raw':
            return { format: 'raw', type: 'object', description: 'Plain JS objects with pieces, tileOwnership, players' };
        case 'flat': {
            const maxCities = 10, maxWarriors = 20, maxSettlers = 10;
            const detailedSize = maxCities * 6 + maxWarriors * 4 + maxSettlers * 4;
            const totalSize = 4 + 9 + 100 + 400 + detailedSize;
            return { format: 'flat', type: 'Float32Array', shape: [totalSize], size: totalSize };
        }
        case 'spatial':
            return { format: 'spatial', type: 'Float32Array', shape: [8, 10, 10], size: 800 };
        case 'structured':
            return { format: 'structured', type: 'object', tokenSize: 8, globalSize: 6, relationTokenSize: 4, description: 'Variable-length piece tokens + global context + relation tokens' };
        case 'tensor': {
            const numChannels = 40; // fixed: 7 my + 3×10 enemy + 3 meta
            return { format: 'tensor', type: 'Float32Array[]', shape: [numChannels, 10, 10], numChannels };
        }
        default:
            return { format: fmt, type: 'unknown' };
    }
};

// ================================================================
// Section 3 — Action Space
// ================================================================

// --- Internal helpers (encoding/decoding) ---

DevGame.prototype._encodeMoveAction = function(srcRow, srcCol, dstRow, dstCol) {
    const dr = dstRow - srcRow;
    const dc = dstCol - srcCol;
    if (dr === 0 && dc === 0) return ML_BRIDGE.PASS_OFFSET;
    const dist = Math.max(Math.abs(dr), Math.abs(dc));
    const normDr = dr === 0 ? 0 : dr / Math.abs(dr);
    const normDc = dc === 0 ? 0 : dc / Math.abs(dc);
    const actualDist = (normDr !== 0 && normDc !== 0) ? dist : Math.max(Math.abs(dr), Math.abs(dc));
    let dirIdx = -1;
    for (let d = 0; d < 8; d++) {
        if (ML_BRIDGE.DIRECTIONS[d][0] === normDr && ML_BRIDGE.DIRECTIONS[d][1] === normDc) {
            dirIdx = d;
            break;
        }
    }
    if (dirIdx < 0) return ML_BRIDGE.PASS_OFFSET;
    const srcCell = srcRow * 10 + srcCol;
    return ML_BRIDGE.MOVE_OFFSET + srcCell * 24 + dirIdx * 3 + (actualDist - 1);
};

DevGame.prototype._decodeMoveAction = function(index) {
    const rel = index - ML_BRIDGE.MOVE_OFFSET;
    const srcCell = Math.floor(rel / 24);
    const remainder = rel % 24;
    const dirIdx = Math.floor(remainder / 3);
    const dist = (remainder % 3) + 1;
    const srcRow = Math.floor(srcCell / 10);
    const srcCol = srcCell % 10;
    const dir = ML_BRIDGE.DIRECTIONS[dirIdx];
    const dstRow = srcRow + dir[0] * dist;
    const dstCol = srcCol + dir[1] * dist;
    return { srcRow, srcCol, dstRow, dstCol };
};

DevGame.prototype._buildEnemySlotMap = function(playerId) {
    const enemies = [];
    for (let offset = 1; offset < this.engine.players.length; offset++) {
        const idx = (playerId + offset) % this.engine.players.length;
        if (!this.engine.players[idx].eliminated) {
            enemies.push(idx);
        }
    }
    const slotToPlayer = enemies;
    const playerToSlot = {};
    for (let e = 0; e < enemies.length; e++) {
        playerToSlot[enemies[e]] = e;
    }
    return { slotToPlayer, playerToSlot };
};

DevGame.prototype._decodeActionIndex = function(actionIndex, playerId) {
    if (actionIndex === ML_BRIDGE.PASS_OFFSET) {
        return { type: 'pass' };
    }

    if (actionIndex >= ML_BRIDGE.MOVE_OFFSET && actionIndex < ML_BRIDGE.SETTLE_OFFSET) {
        const move = this._decodeMoveAction(actionIndex);
        return { type: 'move', ...move };
    }

    if (actionIndex >= ML_BRIDGE.SETTLE_OFFSET && actionIndex < ML_BRIDGE.PRODUCTION_OFFSET) {
        const cell = actionIndex - ML_BRIDGE.SETTLE_OFFSET;
        return { type: 'settle', row: Math.floor(cell / 10), col: cell % 10 };
    }

    if (actionIndex >= ML_BRIDGE.PRODUCTION_OFFSET && actionIndex < ML_BRIDGE.DIPLOMACY_OFFSET) {
        const rel = actionIndex - ML_BRIDGE.PRODUCTION_OFFSET;
        const cell = Math.floor(rel / 6);
        const prodIdx = rel % 6;
        return {
            type: 'production',
            row: Math.floor(cell / 10),
            col: cell % 10,
            production: ML_BRIDGE.PRODUCTION_INDEX_TO_NAME[prodIdx]
        };
    }

    if (actionIndex >= ML_BRIDGE.DIPLOMACY_OFFSET && actionIndex < ML_BRIDGE.ACTION_SPACE_SIZE) {
        const rel = actionIndex - ML_BRIDGE.DIPLOMACY_OFFSET;
        const typeIdx = Math.floor(rel / 3);
        const enemySlot = rel % 3;
        const { slotToPlayer } = this._buildEnemySlotMap(playerId);
        const typeNames = ['declare_war', 'propose_peace', 'accept_peace'];
        return {
            type: typeNames[typeIdx],
            enemySlot,
            targetPlayerId: slotToPlayer[enemySlot] !== undefined ? slotToPlayer[enemySlot] : -1
        };
    }

    return { type: 'unknown' };
};

// --- Public action mask (fixed-space) ---

/**
 * Generate a valid action mask for the given player.
 * Returns a Uint8Array of length 3110 where 1 = legal action.
 */
DevGame.prototype.getValidActionMask = function(playerId) {
    const engine = this.engine;
    const mask = new Uint8Array(ML_BRIDGE.ACTION_SPACE_SIZE);

    // PASS is always valid
    mask[ML_BRIDGE.PASS_OFFSET] = 1;

    const pid = playerId !== undefined ? playerId : engine.currentPlayerIndex;
    const { playerToSlot } = this._buildEnemySlotMap(pid);

    for (let i = 0; i < engine.pieces.length; i++) {
        const piece = engine.pieces[i];
        if (piece.ownerId !== pid) continue;

        // ML model only controls warriors and diplomacy.
        // Production and settlers are handled by the Hard AI helper.
        if (piece.type === PIECE_TYPES.WARRIOR) {
            if (!piece.hasMoved) {
                for (let d = 0; d < 8; d++) {
                    const dr = ML_BRIDGE.DIRECTIONS[d][0];
                    const dc = ML_BRIDGE.DIRECTIONS[d][1];
                    const tr = piece.row + dr;
                    const tc = piece.col + dc;
                    const canMove = engine.canMoveTo(piece, tr, tc);
                    if (canMove.valid) {
                        const idx = ML_BRIDGE.MOVE_OFFSET + (piece.row * 10 + piece.col) * 24 + d * 3;
                        mask[idx] = 1;
                    }
                }
            }
        }
        // Settlers (move + settle) and cities (production) are omitted —
        // the Hard AI handles these before the model acts.
    }

    // Diplomacy actions
    const player = engine.players[pid];
    if (player) {
        for (let targetId = 0; targetId < engine.players.length; targetId++) {
            if (targetId === pid || engine.players[targetId].eliminated) continue;
            const slot = playerToSlot[targetId];
            if (slot === undefined || slot >= 3) continue;

            const relation = player.relations[targetId];
            const canChange = engine.canChangeRelation(pid, targetId);

            if (canChange) {
                if (relation === 'peace') {
                    mask[ML_BRIDGE.DIPLOMACY_OFFSET + ML_BRIDGE.DIPLOMACY_TYPE_MAP['DECLARE_WAR'] * 3 + slot] = 1;
                } else if (relation === 'war') {
                    mask[ML_BRIDGE.DIPLOMACY_OFFSET + ML_BRIDGE.DIPLOMACY_TYPE_MAP['PROPOSE_PEACE'] * 3 + slot] = 1;
                }
            }

            if (engine.players[targetId].relations[pid] === 'peace_proposed') {
                mask[ML_BRIDGE.DIPLOMACY_OFFSET + ML_BRIDGE.DIPLOMACY_TYPE_MAP['ACCEPT_PEACE'] * 3 + slot] = 1;
            }
        }
    }

    return mask;
};

/**
 * Variable-length action list for the given player.
 * Each action includes an actionIndex field for models that want both interfaces.
 */
DevGame.prototype.getValidActions = function(playerId) {
    const engine = this.engine;
    const pid = playerId !== undefined ? playerId : engine.currentPlayerIndex;
    const mask = this.getValidActionMask(pid);
    const actions = [];

    for (let i = 0; i < ML_BRIDGE.ACTION_SPACE_SIZE; i++) {
        if (!mask[i]) continue;
        const decoded = this._decodeActionIndex(i, pid);
        decoded.actionIndex = i;
        actions.push(decoded);
    }

    return { actions, count: actions.length };
};

/**
 * Returns metadata about the action space layout.
 */
DevGame.prototype.getActionSpaceInfo = function() {
    return {
        fixedSize: ML_BRIDGE.ACTION_SPACE_SIZE,
        layout: {
            pass: 0,
            move: [ML_BRIDGE.MOVE_OFFSET, ML_BRIDGE.SETTLE_OFFSET - 1],
            settle: [ML_BRIDGE.SETTLE_OFFSET, ML_BRIDGE.PRODUCTION_OFFSET - 1],
            production: [ML_BRIDGE.PRODUCTION_OFFSET, ML_BRIDGE.DIPLOMACY_OFFSET - 1],
            diplomacy: [ML_BRIDGE.DIPLOMACY_OFFSET, ML_BRIDGE.ACTION_SPACE_SIZE - 1]
        },
        turnBased: {
            moveSize: ML_BRIDGE.BOARD_CELLS,
            diploSize: ML_BRIDGE.DIPLO_SLOTS,
            actionSize: ML_BRIDGE.TURN_ACTION_SIZE,
            maskSize: ML_BRIDGE.TURN_MASK_SIZE,
        }
    };
};

// --- Turn-based action interface (all actions in one inference) ---

/**
 * Generate a turn-based valid action mask for the given player.
 *
 * Layout: [100 warrior presence] + [6 diplomacy slots]
 * Total size: 106
 *
 * Movement (first 100 values):
 *   mask[cell] = 1 if the player has an unmoved warrior at this cell.
 *   Warriors sample target cells from a shared spatial objective map.
 *
 * Diplomacy (last 6 values):
 *   2 types (WAR=0, PEACE=1) × 3 enemy slots.
 *   mask[100 + typeIdx*3 + enemySlot] = 1 if that diplomacy action is valid.
 *   PEACE is context-sensitive: proposePeace if at war, acceptPeace if opponent proposed.
 *
 * @param {number} [playerId]
 * @returns {Uint8Array} of length 106
 */
DevGame.prototype.getValidTurnMask = function(playerId) {
    const engine = this.engine;
    const pid = playerId !== undefined ? playerId : engine.currentPlayerIndex;
    const mask = new Uint8Array(ML_BRIDGE.TURN_MASK_SIZE);

    const { playerToSlot } = this._buildEnemySlotMap(pid);

    // Movement: 1 where cell has our unmoved warrior
    for (let i = 0; i < engine.pieces.length; i++) {
        const piece = engine.pieces[i];
        if (piece.ownerId !== pid) continue;
        if (piece.type !== PIECE_TYPES.WARRIOR) continue;
        if (piece.hasMoved) continue;

        const cell = piece.row * 10 + piece.col;
        mask[cell] = 1;
    }

    // Diplomacy (offset 100): 2 types × 3 slots
    const player = engine.players[pid];
    if (player) {
        for (let targetId = 0; targetId < engine.players.length; targetId++) {
            if (targetId === pid || engine.players[targetId].eliminated) continue;
            const slot = playerToSlot[targetId];
            if (slot === undefined || slot >= 3) continue;

            const relation = player.relations[targetId];
            const canChange = engine.canChangeRelation(pid, targetId);

            if (canChange) {
                if (relation === 'peace') {
                    // WAR action valid
                    mask[100 + ML_BRIDGE.TURN_DIPLOMACY_TYPE_MAP['WAR'] * 3 + slot] = 1;
                } else if (relation === 'war') {
                    // PEACE action valid (will propose peace)
                    mask[100 + ML_BRIDGE.TURN_DIPLOMACY_TYPE_MAP['PEACE'] * 3 + slot] = 1;
                }
            }

            // PEACE action also valid if opponent proposed peace (will accept)
            if (engine.players[targetId].relations[pid] === 'peace_proposed') {
                mask[100 + ML_BRIDGE.TURN_DIPLOMACY_TYPE_MAP['PEACE'] * 3 + slot] = 1;
            }
        }
    }

    return mask;
};

/**
 * Execute a full turn of actions from a single inference.
 *
 * @param {number[]} moveActions - Array of 100 integers (0-99), one per cell.
 *   Each value is the target cell index for the warrior at this cell.
 *   Ignored for cells without our warriors.
 * @param {number[]} diploActions - Array of 6 integers (0 or 1), one per diplomacy slot.
 *   2 types (WAR=0, PEACE=1) × 3 enemy slots.
 * @param {number} [playerId]
 * @returns {{ actionsExecuted: number, moveResults: Object[], diploResults: Object[] }}
 */
DevGame.prototype.executeTurnActions = function(moveActions, diploActions, playerId) {
    const engine = this.engine;
    const pid = playerId !== undefined ? playerId : engine.currentPlayerIndex;
    const { slotToPlayer } = this._buildEnemySlotMap(pid);

    const moveResults = [];
    const diploResults = [];
    let actionsExecuted = 0;

    // Execute diplomacy first (war declarations must happen before attacks)
    for (let i = 0; i < 6; i++) {
        if (!diploActions[i]) continue;
        const typeIdx = Math.floor(i / 3);  // 0=WAR, 1=PEACE
        const enemySlot = i % 3;
        const targetPlayerId = slotToPlayer[enemySlot];
        if (targetPlayerId === undefined || targetPlayerId < 0) continue;

        let decoded;
        if (typeIdx === 0) {
            // WAR
            decoded = { type: 'declare_war', targetPlayerId: targetPlayerId };
        } else {
            // PEACE: context-sensitive — acceptPeace if opponent proposed, else proposePeace
            const opponentRel = engine.players[targetPlayerId].relations[pid];
            if (opponentRel === 'peace_proposed') {
                decoded = { type: 'accept_peace', targetPlayerId: targetPlayerId };
            } else {
                decoded = { type: 'propose_peace', targetPlayerId: targetPlayerId };
            }
        }
        const result = this._executeGameAction(decoded, pid);
        diploResults.push({ slot: i, type: decoded.type, target: targetPlayerId, success: result.success });
        if (result.success) actionsExecuted++;
    }

    // Create pathfinder AI for A* movement
    if (!this._pathfinderAI) {
        this._pathfinderAI = new CivChessAI(engine, pid, 'expansionist', 'hard');
    }
    this._pathfinderAI.engine = engine;

    // Execute warrior moves with attack-aware pathfinding
    const player = engine.players[pid];
    for (let cell = 0; cell < 100; cell++) {
        const targetCell = moveActions[cell];
        const srcRow = Math.floor(cell / 10);
        const srcCol = cell % 10;
        const piece = engine.board[srcRow] && engine.board[srcRow][srcCol];
        if (!piece || piece.ownerId !== pid || piece.type !== PIECE_TYPES.WARRIOR) continue;
        if (piece.hasMoved) continue;

        const targetRow = Math.floor(targetCell / 10);
        const targetCol = targetCell % 10;

        // Already at target — stay
        if (srcRow === targetRow && srcCol === targetCol) continue;

        const validMoves = engine.getValidMoves(piece);
        let stepped = false;

        // 100% attack: if target cell is adjacent and has an enemy at war
        for (let m = 0; m < validMoves.length; m++) {
            if (validMoves[m].row === targetRow && validMoves[m].col === targetCol) {
                const targetPiece = engine.board[targetRow][targetCol];
                if (targetPiece && targetPiece.ownerId !== pid && player.relations[targetPiece.ownerId] === 'war') {
                    const result = engine.movePiece(piece, targetRow, targetCol);
                    moveResults.push({
                        cell: cell,
                        src: [srcRow, srcCol],
                        target: [targetRow, targetCol],
                        step: [targetRow, targetCol],
                        success: !!result.success
                    });
                    if (result.success) actionsExecuted++;
                    stepped = true;
                }
                break;
            }
        }
        if (stepped) continue;

        // 50% attack: adjacent enemy warriors/cities at war
        const attackMoves = [];
        for (let m = 0; m < validMoves.length; m++) {
            const mv = validMoves[m];
            const adjPiece = engine.board[mv.row][mv.col];
            if (adjPiece && adjPiece.ownerId !== pid && player.relations[adjPiece.ownerId] === 'war'
                && (adjPiece.type === PIECE_TYPES.WARRIOR || adjPiece.type === PIECE_TYPES.CITY)) {
                attackMoves.push(mv);
            }
        }
        if (attackMoves.length > 0 && Math.random() < 0.5) {
            let bestAttack = attackMoves[0];
            let bestDist = Infinity;
            for (let a = 0; a < attackMoves.length; a++) {
                const dist = Math.max(Math.abs(attackMoves[a].row - targetRow), Math.abs(attackMoves[a].col - targetCol));
                if (dist < bestDist) {
                    bestDist = dist;
                    bestAttack = attackMoves[a];
                }
            }
            const result = engine.movePiece(piece, bestAttack.row, bestAttack.col);
            moveResults.push({
                cell: cell,
                src: [srcRow, srcCol],
                target: [targetRow, targetCol],
                step: [bestAttack.row, bestAttack.col],
                success: !!result.success
            });
            if (result.success) actionsExecuted++;
            continue;
        }

        // A* pathfinding (returns a single move object {row, col}, not an array)
        const firstStep = this._pathfinderAI.findWarriorPathAStar(piece, { row: targetRow, col: targetCol });
        if (firstStep) {
            const result = engine.movePiece(piece, firstStep.row, firstStep.col);
            moveResults.push({
                cell: cell,
                src: [srcRow, srcCol],
                target: [targetRow, targetCol],
                step: [firstStep.row, firstStep.col],
                success: !!result.success
            });
            if (result.success) actionsExecuted++;
        } else if (validMoves.length > 0) {
            // A* failed — greedy fallback
            let bestMove = null;
            let bestDist = Infinity;
            for (let m = 0; m < validMoves.length; m++) {
                const mv = validMoves[m];
                const dist = Math.max(Math.abs(mv.row - targetRow), Math.abs(mv.col - targetCol));
                if (dist < bestDist) {
                    bestDist = dist;
                    bestMove = mv;
                }
            }
            if (bestMove) {
                const result = engine.movePiece(piece, bestMove.row, bestMove.col);
                moveResults.push({
                    cell: cell,
                    src: [srcRow, srcCol],
                    target: [targetRow, targetCol],
                    step: [bestMove.row, bestMove.col],
                    success: !!result.success
                });
                if (result.success) actionsExecuted++;
            }
        }
    }

    return { actionsExecuted, moveResults, diploResults };
};

/**
 * Execute only diplomacy actions for a player (used by sequential movement pipeline).
 * @param {number[]} diploActions — 6-element array of binary diplomacy decisions
 * @param {number} [playerId]
 * @returns {{ diploResults: Object[] }}
 */
DevGame.prototype.executeDiplomacyActions = function(diploActions, playerId) {
    const engine = this.engine;
    const pid = playerId !== undefined ? playerId : engine.currentPlayerIndex;
    const { slotToPlayer } = this._buildEnemySlotMap(pid);
    const diploResults = [];

    for (let i = 0; i < 6; i++) {
        if (!diploActions[i]) continue;
        const typeIdx = Math.floor(i / 3);
        const enemySlot = i % 3;
        const targetPlayerId = slotToPlayer[enemySlot];
        if (targetPlayerId === undefined || targetPlayerId < 0) continue;

        let decoded;
        if (typeIdx === 0) {
            decoded = { type: 'declare_war', targetPlayerId: targetPlayerId };
        } else {
            const opponentRel = engine.players[targetPlayerId].relations[pid];
            if (opponentRel === 'peace_proposed') {
                decoded = { type: 'accept_peace', targetPlayerId: targetPlayerId };
            } else {
                decoded = { type: 'propose_peace', targetPlayerId: targetPlayerId };
            }
        }
        const result = this._executeGameAction(decoded, pid);
        diploResults.push({ slot: i, type: decoded.type, target: targetPlayerId, success: result.success });
    }
    return { diploResults };
};

/**
 * Execute a single warrior move via A* pathfinding (used by sequential movement pipeline).
 * @param {Object} warrior — piece object with row, col, ownerId
 * @param {number} targetRow — target cell row
 * @param {number} targetCol — target cell column
 * @param {number} [playerId]
 * @returns {{ success: boolean, step: number[]|null }}
 */
DevGame.prototype.executeSingleWarriorMove = function(warrior, targetRow, targetCol, playerId) {
    const engine = this.engine;
    const pid = playerId !== undefined ? playerId : warrior.ownerId;

    if (warrior.row === targetRow && warrior.col === targetCol) {
        return { success: false, step: null };
    }

    // Per-player pathfinder cache (different players need different A* perspectives)
    if (!this._pathfinderAIs) this._pathfinderAIs = {};
    if (!this._pathfinderAIs[pid]) {
        this._pathfinderAIs[pid] = new CivChessAI(engine, pid, 'expansionist', 'hard');
    }
    const pathfinderAI = this._pathfinderAIs[pid];
    pathfinderAI.engine = engine;

    const player = engine.players[pid];
    const validMoves = engine.getValidMoves(warrior);

    // 100% attack: if target cell is adjacent and has an enemy at war
    for (let m = 0; m < validMoves.length; m++) {
        if (validMoves[m].row === targetRow && validMoves[m].col === targetCol) {
            const targetPiece = engine.board[targetRow][targetCol];
            if (targetPiece && targetPiece.ownerId !== pid && player.relations[targetPiece.ownerId] === 'war') {
                const result = engine.movePiece(warrior, targetRow, targetCol);
                return { success: !!result.success, step: [targetRow, targetCol] };
            }
            break;
        }
    }

    // 50% attack: adjacent enemy warriors/cities at war
    const attackMoves = [];
    for (let m = 0; m < validMoves.length; m++) {
        const mv = validMoves[m];
        const adjPiece = engine.board[mv.row][mv.col];
        if (adjPiece && adjPiece.ownerId !== pid && player.relations[adjPiece.ownerId] === 'war'
            && (adjPiece.type === PIECE_TYPES.WARRIOR || adjPiece.type === PIECE_TYPES.CITY)) {
            attackMoves.push(mv);
        }
    }
    if (attackMoves.length > 0 && Math.random() < 0.5) {
        let bestAttack = attackMoves[0];
        let bestDist = Infinity;
        for (let a = 0; a < attackMoves.length; a++) {
            const dist = Math.max(Math.abs(attackMoves[a].row - targetRow), Math.abs(attackMoves[a].col - targetCol));
            if (dist < bestDist) {
                bestDist = dist;
                bestAttack = attackMoves[a];
            }
        }
        const result = engine.movePiece(warrior, bestAttack.row, bestAttack.col);
        return { success: !!result.success, step: [bestAttack.row, bestAttack.col] };
    }

    // A* pathfinding (returns a single move object {row, col}, not an array)
    const firstStep = pathfinderAI.findWarriorPathAStar(warrior, { row: targetRow, col: targetCol });
    if (firstStep) {
        const result = engine.movePiece(warrior, firstStep.row, firstStep.col);
        return { success: !!result.success, step: [firstStep.row, firstStep.col] };
    }

    // A* failed — greedy fallback
    if (validMoves.length > 0) {
        let bestMove = null;
        let bestDist = Infinity;
        for (let m = 0; m < validMoves.length; m++) {
            const mv = validMoves[m];
            const dist = Math.max(Math.abs(mv.row - targetRow), Math.abs(mv.col - targetCol));
            if (dist < bestDist) {
                bestDist = dist;
                bestMove = mv;
            }
        }
        if (bestMove) {
            const result = engine.movePiece(warrior, bestMove.row, bestMove.col);
            return { success: !!result.success, step: [bestMove.row, bestMove.col] };
        }
    }

    return { success: false, step: null };
};

// ================================================================
// Section 4 — Execution
// ================================================================

DevGame.prototype._executeGameAction = function(decoded, playerId) {
    const engine = this.engine;

    switch (decoded.type) {
        case 'pass':
            return { success: true };

        case 'move': {
            const piece = engine.board[decoded.srcRow]?.[decoded.srcCol];
            if (!piece) return { success: false, reason: 'No piece at source' };
            const result = engine.movePiece(piece, decoded.dstRow, decoded.dstCol);
            return { success: !!result.success, result };
        }

        case 'settle': {
            const piece = engine.board[decoded.row]?.[decoded.col];
            if (!piece) return { success: false, reason: 'No piece at tile' };
            const result = engine.settlerBuildCity(piece);
            return { success: !!result.success, result };
        }

        case 'production': {
            const piece = engine.board[decoded.row]?.[decoded.col];
            if (!piece) return { success: false, reason: 'No city at tile' };
            const result = engine.setProduction(piece, decoded.production);
            return { success: !!result };
        }

        case 'declare_war': {
            if (decoded.targetPlayerId < 0) return { success: false, reason: 'Invalid target' };
            const result = engine.declareWar(playerId, decoded.targetPlayerId);
            return { success: !!result };
        }

        case 'propose_peace': {
            if (decoded.targetPlayerId < 0) return { success: false, reason: 'Invalid target' };
            const result = engine.proposePeace(playerId, decoded.targetPlayerId);
            return { success: !!result };
        }

        case 'accept_peace': {
            if (decoded.targetPlayerId < 0) return { success: false, reason: 'Invalid target' };
            const result = engine.acceptPeace(playerId, decoded.targetPlayerId);
            return { success: !!result };
        }

        default:
            return { success: false, reason: 'Unknown action type' };
    }
};

/**
 * Execute an action by its fixed-space index (0-3109).
 * Returns { success, reward, done, info }.
 */
DevGame.prototype.executeActionByIndex = function(actionIndex) {
    const pid = this.engine.currentPlayerIndex;
    const decoded = this._decodeActionIndex(actionIndex, pid);
    const preSnap = this._snapshotForReward(pid);

    const execResult = this._executeGameAction(decoded, pid);

    const postSnap = this._snapshotForReward(pid);
    const rewardFn = this._rewardFunction || _defaultRewardFn;
    const reward = execResult.success ? rewardFn(this.engine, pid, preSnap, postSnap, decoded.type) : 0;

    return {
        success: execResult.success,
        reward: reward,
        done: this.engine.gameOver,
        info: {
            actionType: decoded.type,
            decoded: decoded,
            turnNumber: this.engine.turnNumber,
            roundNumber: this.engine.roundNumber,
            winner: this.engine.winner
        }
    };
};

/**
 * Execute a structured action object directly. No index needed.
 * @param {Object} action - { type, srcRow?, srcCol?, dstRow?, dstCol?, row?, col?, production?, targetPlayerId? }
 */
DevGame.prototype.executeAction = function(action) {
    const pid = this.engine.currentPlayerIndex;
    const preSnap = this._snapshotForReward(pid);

    // For diplomacy actions that use targetPlayerId but need enemySlot for internal routing
    const decoded = { ...action };
    if (['declare_war', 'propose_peace', 'accept_peace'].indexOf(decoded.type) >= 0 && decoded.targetPlayerId === undefined) {
        decoded.targetPlayerId = -1;
    }

    const execResult = this._executeGameAction(decoded, pid);

    const postSnap = this._snapshotForReward(pid);
    const rewardFn = this._rewardFunction || _defaultRewardFn;
    const reward = execResult.success ? rewardFn(this.engine, pid, preSnap, postSnap, decoded.type) : 0;

    return {
        success: execResult.success,
        reward: reward,
        done: this.engine.gameOver,
        info: {
            actionType: decoded.type,
            turnNumber: this.engine.turnNumber,
            roundNumber: this.engine.roundNumber,
            winner: this.engine.winner
        }
    };
};

/**
 * Gym-like step function. Accepts either an integer (fixed-space index) or
 * a structured action object. Returns { observation, reward, done, truncated, info }.
 */
DevGame.prototype.step = function(actionIndexOrAction) {
    let result;
    if (typeof actionIndexOrAction === 'number') {
        result = this.executeActionByIndex(actionIndexOrAction);
    } else {
        result = this.executeAction(actionIndexOrAction);
    }

    const pid = this.engine.currentPlayerIndex;
    const observation = this._getObservation(pid);

    return {
        observation,
        reward: result.reward,
        done: result.done,
        truncated: false,
        info: result.info
    };
};

/**
 * Explicit turn ending for multi-action-per-turn models.
 * Wraps the existing endTurn() (from actions.js) with ML-relevant fields.
 * Note: Does NOT override DevGame.prototype.endTurn — that is defined in actions.js
 * with history recording, event emission, and auto-AI support.
 */
DevGame.prototype.mlEndTurn = function() {
    const info = this.endTurn();
    return {
        success: true,
        nextPlayer: info.currentPlayerIndex,
        turnNumber: info.turnNumber,
        roundNumber: info.roundNumber,
        done: info.gameOver
    };
};

// ================================================================
// Section 5 — Rewards
// ================================================================

/**
 * Default reward weights.
 */
const _defaultRewardWeights = {
    city_captured: 5,
    city_founded: 3,
    city_lost: -5,
    territory_gained: 0.1,
    territory_lost: -0.1,
    enemy_unit_killed: 1,
    unit_lost: -1,
    player_eliminated: 10,
    eliminated: -10,
    warrior_moved: 0.01,
    settler_moved: 0.01,
    war_declared: 2.0,
    peace_proposed: 0.3,
    peace_made: 0.3,
    production_set: 0.05,
    production_switch: -0.1,
    production_complete: 0.5,
    warrior_healed: 0.2,
    city_repaired: 0.3,
    tech_gained: 0.5,
    tech_behind_per_level: -0.1,
    idle_turn: -0.1,
    production_blocked_per_city: -0.05,
    production_active_per_city: 0.02
};

/**
 * Generic state snapshot for reward computation.
 */
DevGame.prototype._snapshotForReward = function(playerId) {
    const engine = this.engine;
    const snap = {};
    snap.cities = engine.pieces.filter(p => p.type === PIECE_TYPES.CITY && p.ownerId === playerId).length;
    snap.units = engine.pieces.filter(p => p.ownerId === playerId && p.type !== PIECE_TYPES.CITY).length;
    snap.territory = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (engine.tileOwnership[r][c] === playerId) snap.territory++;
        }
    }
    snap.enemyUnits = {};
    snap.enemyCities = {};
    snap.eliminatedSet = new Set();
    for (let pi = 0; pi < engine.players.length; pi++) {
        if (pi === playerId) continue;
        snap.enemyUnits[pi] = engine.pieces.filter(p => p.ownerId === pi && p.type !== PIECE_TYPES.CITY).length;
        snap.enemyCities[pi] = engine.pieces.filter(p => p.ownerId === pi && p.type === PIECE_TYPES.CITY).length;
        if (engine.players[pi].eliminated) snap.eliminatedSet.add(pi);
    }
    snap.tech = engine.players[playerId].techScore || 0;
    snap.warriorHP = {};
    snap.cityHP = {};
    engine.pieces.filter(p => p.ownerId === playerId).forEach(p => {
        if (p.type === PIECE_TYPES.CITY) {
            snap.cityHP[p.id] = p.hp || 0;
        } else {
            snap.warriorHP[p.id] = p.hp || 0;
        }
    });
    snap.productionProgress = {};
    snap.productionType = {};
    engine.pieces.filter(p => p.type === PIECE_TYPES.CITY && p.ownerId === playerId).forEach(c => {
        snap.productionProgress[c.id] = c.productionProgress || 0;
        snap.productionType[c.id] = c.production || null;
    });
    return snap;
};

/**
 * Default reward function. Standalone — can be referenced, wrapped, or replaced.
 * @param {GameEngine} engine
 * @param {number} playerId
 * @param {Object} preSnap - snapshot before action
 * @param {Object} postSnap - snapshot after action
 * @param {string} actionType
 * @returns {number}
 */
function _defaultRewardFn(engine, playerId, preSnap, postSnap, actionType) {
    // Use instance weights if available via closure, otherwise defaults
    const rewards = _defaultRewardFn._weights || _defaultRewardWeights;

    let shaped = 0;

    // City changes
    const cityDelta = postSnap.cities - preSnap.cities;
    if (cityDelta > 0) {
        let enemyCitiesLost = 0;
        for (let pi = 0; pi < engine.players.length; pi++) {
            if (pi === playerId) continue;
            const postEC = postSnap.enemyCities[pi] !== undefined ? postSnap.enemyCities[pi] : 0;
            if (postEC < preSnap.enemyCities[pi]) enemyCitiesLost++;
        }
        if (enemyCitiesLost > 0) {
            shaped += (rewards.city_captured || 0) * enemyCitiesLost;
        } else {
            shaped += (rewards.city_founded || 0) * cityDelta;
        }
    }
    if (cityDelta < 0) {
        shaped += (rewards.city_lost || 0) * Math.abs(cityDelta);
    }

    // Territory
    const terrDelta = postSnap.territory - preSnap.territory;
    if (terrDelta > 0) shaped += (rewards.territory_gained || 0) * terrDelta;
    if (terrDelta < 0) shaped += (rewards.territory_lost || 0) * Math.abs(terrDelta);

    // Enemy units killed
    for (let pi = 0; pi < engine.players.length; pi++) {
        if (pi === playerId) continue;
        const postEU = postSnap.enemyUnits[pi] !== undefined ? postSnap.enemyUnits[pi] : 0;
        const killed = preSnap.enemyUnits[pi] - postEU;
        if (killed > 0) shaped += (rewards.enemy_unit_killed || 0) * killed;
    }

    // Own units lost
    const unitDelta = preSnap.units - postSnap.units;
    if (unitDelta > 0) shaped += (rewards.unit_lost || 0) * unitDelta;

    // Player eliminated
    for (let pi = 0; pi < engine.players.length; pi++) {
        if (pi === playerId) continue;
        if (postSnap.eliminatedSet.has(pi) && !preSnap.eliminatedSet.has(pi)) {
            shaped += (rewards.player_eliminated || 0);
        }
    }

    // Own elimination
    if (postSnap.cities === 0 || engine.players[playerId].eliminated) {
        shaped += (rewards.eliminated || 0);
    }

    // Movement rewards
    if (actionType === 'move') {
        shaped += (rewards.warrior_moved || 0);
    }

    // Diplomacy rewards
    if (actionType === 'declare_war') shaped += (rewards.war_declared || 0);
    if (actionType === 'propose_peace') shaped += (rewards.peace_proposed || 0);
    if (actionType === 'accept_peace') shaped += (rewards.peace_made || 0);

    // Production set
    if (actionType === 'production') {
        shaped += (rewards.production_set || 0);
        // Check for production switches
        const postCities = engine.pieces.filter(p => p.type === PIECE_TYPES.CITY && p.ownerId === playerId);
        postCities.forEach(c => {
            const prevProgress = preSnap.productionProgress[c.id];
            const prevType = preSnap.productionType[c.id];
            if (prevProgress > 0 && prevType && c.production !== prevType) {
                shaped += (rewards.production_switch || 0);
            }
        });
    }

    // Production complete
    const postCities = engine.pieces.filter(p => p.type === PIECE_TYPES.CITY && p.ownerId === playerId);
    postCities.forEach(c => {
        const prev = preSnap.productionProgress[c.id];
        if (prev !== undefined && prev > 0 && (c.productionProgress || 0) === 0) {
            shaped += (rewards.production_complete || 0);
        }
    });

    // Warrior healed
    engine.pieces.filter(p => p.ownerId === playerId && p.type !== PIECE_TYPES.CITY).forEach(p => {
        const prevHP = preSnap.warriorHP[p.id];
        if (prevHP !== undefined && (p.hp || 0) > prevHP) {
            shaped += (rewards.warrior_healed || 0);
        }
    });

    // City repaired
    engine.pieces.filter(p => p.ownerId === playerId && p.type === PIECE_TYPES.CITY).forEach(p => {
        const prevHP = preSnap.cityHP[p.id];
        if (prevHP !== undefined && (p.hp || 0) > prevHP) {
            shaped += (rewards.city_repaired || 0);
        }
    });

    // Tech gained
    const postTech = engine.players[playerId].techScore || 0;
    if (postTech > preSnap.tech) {
        shaped += (rewards.tech_gained || 0) * (postTech - preSnap.tech);
    }

    // Tech behind penalty
    let maxEnemyTech = 0;
    for (let pi = 0; pi < engine.players.length; pi++) {
        if (pi === playerId || engine.players[pi].eliminated) continue;
        maxEnemyTech = Math.max(maxEnemyTech, engine.players[pi].techScore || 0);
    }
    if (maxEnemyTech > postTech) {
        shaped += (rewards.tech_behind_per_level || 0) * (maxEnemyTech - postTech);
    }

    // PASS signals turn end — apply idle penalty and production status check
    if (actionType === 'pass') {
        shaped += (rewards.idle_turn || 0);
        // Production status rewards — only at turn end so they don't
        // contaminate every per-action reward
        const postCities2 = engine.pieces.filter(p => p.type === PIECE_TYPES.CITY && p.ownerId === playerId);
        for (let ci = 0; ci < postCities2.length; ci++) {
            if (postCities2[ci].production) {
                shaped += (rewards.production_active_per_city || 0);
            } else {
                shaped += (rewards.production_blocked_per_city || 0);
            }
        }
    }

    return shaped;
}

/**
 * Set a custom reward function.
 * @param {Function} fn - (engine, playerId, preSnap, postSnap, actionType) → number
 */
DevGame.prototype.setRewardFunction = function(fn) {
    this._rewardFunction = fn;
};

/**
 * Get the default reward function for wrapping or reference.
 */
DevGame.prototype.getDefaultRewardFunction = function() {
    return _defaultRewardFn;
};

/**
 * Set reward weights (only affects the default reward function).
 */
DevGame.prototype.setRewardWeights = function(weights) {
    this._rewardWeights = { ..._defaultRewardWeights, ...weights };
    _defaultRewardFn._weights = this._rewardWeights;
};

/**
 * Get current reward weights.
 */
DevGame.prototype.getRewardWeights = function() {
    return { ...(this._rewardWeights || _defaultRewardWeights) };
};

// ================================================================
// Section 6 — Episode Control
// ================================================================

/**
 * Clone engine state for rollback.
 */
DevGame.prototype.cloneState = function() {
    return this.engine.cloneState();
};

/**
 * Restore engine state from a previous clone.
 */
DevGame.prototype.restoreState = function(state) {
    this.engine.restoreState(state);
};

/**
 * Fast game reset — preserves settings, recreates AIManager.
 */
DevGame.prototype.resetGame = function(playerConfigs) {
    const gameEndingEnabled = this._gameEndingEnabled;
    const loggingEnabled = this._loggingEnabled;
    const rewardWeights = this._rewardWeights;
    const observationFormat = this._observationFormat;
    const rewardFunction = this._rewardFunction;

    this.engine = new GameEngine();
    this.engine.setupGame(playerConfigs);
    this._gameEndingEnabled = true;
    this._originalCheckVictory = null;
    this._loggingEnabled = true;
    this._originalLog = null;
    this._sandboxMode = false;
    this._savedEngineMethods = null;
    this._eventCallbacks = {};
    this._turnHistory = [];
    this._recordHistory = false;
    this._aiManager = (typeof AIManager !== 'undefined') ? new AIManager(this.engine) : null;
    this._autoAI = false;

    // Re-apply preserved settings
    if (!gameEndingEnabled) this.setGameEndingEnabled(false);
    if (!loggingEnabled) this.setLoggingEnabled(false);
    if (rewardWeights) {
        this._rewardWeights = rewardWeights;
        _defaultRewardFn._weights = rewardWeights;
    }
    if (observationFormat) this._observationFormat = observationFormat;
    if (rewardFunction) this._rewardFunction = rewardFunction;
};

// ================================================================
// Section 7 — Analysis Pass-throughs
// ================================================================

DevGame.prototype.getGameStateForAI = function(playerId) {
    return this.engine.getGameStateForAI(playerId);
};

DevGame.prototype.getGamePhase = function() {
    return this.engine.getGamePhase();
};

DevGame.prototype.getThreatHeatmap = function(playerId) {
    return this.engine.getThreatHeatmap(playerId);
};

DevGame.prototype.getOpportunityHeatmap = function(playerId) {
    return this.engine.getOpportunityHeatmap(playerId);
};

DevGame.prototype.getTerritoryHeatmap = function(playerId) {
    return this.engine.getTerritoryHeatmap(playerId);
};

DevGame.prototype.getExpansionHeatmap = function(playerId) {
    return this.engine.getExpansionHeatmap(playerId);
};

DevGame.prototype.getPlayerStrength = function(playerId) {
    return this.engine.getPlayerStrength(playerId);
};

DevGame.prototype.getRelativeStrength = function(playerId, targetId) {
    return this.engine.getRelativeStrength(playerId, targetId);
};

DevGame.prototype.getStrategicPositions = function(playerId) {
    return this.engine.getStrategicPositions(playerId);
};

DevGame.prototype.getPieceThreats = function(row, col, defenderId) {
    return this.engine.getPieceThreats(row, col, defenderId);
};
