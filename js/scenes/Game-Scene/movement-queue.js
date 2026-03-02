// ============================================
// GAME SCENE - Movement Queue Module
// ============================================
// Multi-turn movement orders. Drag a piece beyond its immediate range
// to enqueue an A* path. Queued pieces auto-move on "Next Turn" if
// they weren't manually moved. Visualised as a flowing red energy line.

// ============================================
// Queue management
// ============================================

/**
 * Enqueue a multi-turn movement order for a piece.
 * Computes A* path from piece's current position to (destRow, destCol).
 * Stores { destRow, destCol, path } in _movementQueue keyed by piece.id.
 * Returns true if path was found and enqueued, false otherwise.
 */
GameScene.prototype.enqueueMovement = function(piece, destRow, destCol) {
    const path = this.engine.findFullPath(piece, destRow, destCol);
    if (!path || path.length === 0) return false;

    const queueData = {
        destRow: destRow,
        destCol: destCol,
        path: path
    };

    // Track enemy occupants at the destination
    const occupant = this.engine.board[destRow][destCol];
    if (occupant && occupant.ownerId !== piece.ownerId) {
        if (occupant.type === PIECE_TYPES.WARRIOR) {
            // Follow moving target warriors
            queueData.targetPieceId = occupant.id;
        } else if (occupant.type === PIECE_TYPES.CITY) {
            // Siege: keep attacking this city each turn until conquered or destroyed
            queueData.targetCityId = occupant.id;
        }
    }

    this._movementQueue.set(piece.id, queueData);
    return true;
};

/**
 * Remove a piece's queued movement order.
 */
GameScene.prototype.dequeueMovement = function(pieceId) {
    this._movementQueue.delete(pieceId);
};

/**
 * Clear all movement queues.
 */
GameScene.prototype.clearAllQueues = function() {
    this._movementQueue.clear();
};

/**
 * Check if a piece has a queued movement.
 */
GameScene.prototype.hasQueuedMovement = function(pieceId) {
    return this._movementQueue.has(pieceId);
};

/**
 * Get a piece's queued movement data, or null.
 */
GameScene.prototype.getQueuedMovement = function(pieceId) {
    return this._movementQueue.get(pieceId) || null;
};

/**
 * Find a path to the closest reachable tile adjacent to (row, col),
 * sorted by distance to the queued piece.
 * Returns the path array, or null if nothing is reachable.
 */
GameScene.prototype._findAdjacentFallbackPath = function(piece, row, col) {
    var candidates = [];
    for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var ar = row + dr;
            var ac = col + dc;
            if (ar < 0 || ar >= BOARD_SIZE || ac < 0 || ac >= BOARD_SIZE) continue;
            // Skip tiles occupied by other pieces (our own queued piece is OK)
            var occ = this.engine.board[ar][ac];
            if (occ && occ.id !== piece.id) continue;
            var dist = Math.max(Math.abs(ar - piece.row), Math.abs(ac - piece.col));
            candidates.push({ row: ar, col: ac, dist: dist });
        }
    }
    candidates.sort(function(a, b) { return a.dist - b.dist; });

    for (var i = 0; i < candidates.length; i++) {
        var path = this.engine.findFullPath(piece, candidates[i].row, candidates[i].col);
        if (path && path.length > 0) {
            return path;
        }
    }
    return null;
};

/**
 * Find the best reachable destination for a tracked target warrior.
 * Tries the target's exact position first. If unreachable (e.g. peace-locked
 * territory), tries adjacent tiles sorted by distance to the queued piece.
 * Returns { destRow, destCol, path } or null if nothing is reachable.
 */
GameScene.prototype._resolveTargetDestination = function(piece, target) {
    // Try direct path to target
    var path = this.engine.findFullPath(piece, target.row, target.col);
    if (path && path.length > 0) {
        return { destRow: target.row, destCol: target.col, path: path };
    }

    // Target unreachable — try adjacent tiles
    var fallback = this._findAdjacentFallbackPath(piece, target.row, target.col);
    if (fallback) {
        var last = fallback[fallback.length - 1];
        return { destRow: last.row, destCol: last.col, path: fallback };
    }

    return null;
};

/**
 * Execute queued moves for the current human player before ending the turn.
 * For each queued piece that has NOT moved this turn:
 *   - Warriors: move 1 step along the re-computed path
 *   - Settlers: move up to 3 steps along the re-computed path
 * After combat, the queue is removed for that piece.
 * Returns an array of move results for animation:
 *   [{ pieceId, fromX, fromY, toX, toY, combat, blocked }]
 * Returns empty array if no moves were executed.
 */
GameScene.prototype.executeQueuedMoves = function() {
    const currentIdx = this.engine.currentPlayerIndex;
    const player = this.engine.players[currentIdx];
    if (player.isAI) return [];

    const halfTile = TILE_SIZE / 2;
    const moveResults = [];
    const toRemove = [];

    for (const [pieceId, queueData] of this._movementQueue) {
        const piece = this.engine.pieces.find(p => p.id === pieceId);

        // Piece gone or already moved — remove from queue
        if (!piece || piece.hasMoved) {
            toRemove.push(pieceId);
            continue;
        }

        // Not current player's piece — skip but keep in queue (hot seat)
        if (piece.ownerId !== currentIdx) {
            continue;
        }

        // Follow tracked target city (siege) — validate it still exists and we're at war
        if (queueData.targetCityId != null) {
            const city = this.engine.pieces.find(p => p.id === queueData.targetCityId);
            if (!city || city.ownerId === piece.ownerId) {
                // City gone or already ours — siege complete
                toRemove.push(pieceId);
                continue;
            }
            const rel = this.engine.players[piece.ownerId].relations[city.ownerId];
            if (rel === 'peace') {
                toRemove.push(pieceId);
                continue;
            }
            // Keep destination pointing at the city (cities don't move)
            queueData.destRow = city.row;
            queueData.destCol = city.col;
        }

        // Follow tracked target warrior
        if (queueData.targetPieceId != null) {
            const target = this.engine.pieces.find(p => p.id === queueData.targetPieceId);
            if (!target) {
                toRemove.push(pieceId);
                continue;
            }
            // Abandon target if now at peace
            const rel = this.engine.players[piece.ownerId].relations[target.ownerId];
            if (rel === 'peace') {
                toRemove.push(pieceId);
                continue;
            }
            const resolved = this._resolveTargetDestination(piece, target);
            if (!resolved) {
                toRemove.push(pieceId);
                continue;
            }
            queueData.destRow = resolved.destRow;
            queueData.destCol = resolved.destCol;
        }

        // Re-compute path from current position
        let path = this.engine.findFullPath(piece, queueData.destRow, queueData.destCol);
        if (!path || path.length === 0) {
            // Destination blocked by occupant — try adjacent tiles as fallback
            path = this._findAdjacentFallbackPath(piece, queueData.destRow, queueData.destCol);
            if (!path) {
                toRemove.push(pieceId);
                continue;
            }
        }

        // Save starting position for animation
        const fromX = BOARD_OFFSET + piece.col * TILE_SIZE + halfTile;
        const fromY = BOARD_OFFSET + piece.row * TILE_SIZE + halfTile;

        // Determine how many steps this piece can take
        const maxSteps = piece.type === PIECE_TYPES.SETTLER ? 3 : 1;
        let stepsThisTurn = 0;
        let lastCombat = null;
        let wasBlocked = false;
        let lastBlockedStep = null;
        let settlerDir = null; // Settlers must move in a straight line each turn
        let didAdjacentAttack = false;

        // Opportunistic adjacent attack: queued warriors may strike a nearby enemy instead of moving
        if (piece.type === PIECE_TYPES.WARRIOR) {
            const adjChance = (typeof uiController !== 'undefined' && uiController.settings.attackAdjacentChance != null)
                ? uiController.settings.attackAdjacentChance / 100 : 0.15;
            if (adjChance > 0 && Math.random() < adjChance) {
                const adjacentEnemies = [];
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const ar = piece.row + dr, ac = piece.col + dc;
                        if (ar < 0 || ar >= BOARD_SIZE || ac < 0 || ac >= BOARD_SIZE) continue;
                        const occ = this.engine.board[ar][ac];
                        if (!occ || occ.ownerId === piece.ownerId) continue;
                        if (this.engine.players[piece.ownerId].relations[occ.ownerId] !== 'war') continue;
                        adjacentEnemies.push(occ);
                    }
                }
                if (adjacentEnemies.length > 0) {
                    const adjTarget = adjacentEnemies[Math.floor(Math.random() * adjacentEnemies.length)];
                    const adjResult = this.engine.movePiece(piece, adjTarget.row, adjTarget.col);
                    if (adjResult.success) {
                        stepsThisTurn = 1;
                        didAdjacentAttack = true;
                        if (adjResult.combat) {
                            lastCombat = adjResult.combat;
                            wasBlocked = !!adjResult.blocked;
                            if (wasBlocked) lastBlockedStep = { row: adjTarget.row, col: adjTarget.col };
                            if (adjResult.combat.defenderDestroyed && !adjResult.combat.cityFlipped) {
                                this.removePieceSprite(adjResult.combat.defender);
                            } else if (adjResult.combat.cityFlipped) {
                                const adjCity = this.engine.pieces.find(p => p.id === adjResult.combat.defender);
                                if (adjCity) {
                                    const oldSprite = this.pieceSprites.get(adjCity.id);
                                    if (oldSprite) { oldSprite.destroy(); this.pieceSprites.delete(adjCity.id); }
                                    this.createPieceSprite(adjCity);
                                }
                                if (adjResult.combat.elimination && adjResult.combat.elimination.eliminated) {
                                    this.handleEliminationAnimation(adjResult.combat.elimination);
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!didAdjacentAttack)
        for (let s = 0; s < Math.min(maxSteps, path.length); s++) {
            const step = path[s];

            // Settlers must continue in the same direction each step —
            // stop at turns and resume next turn (prevents diagonal zigzag)
            if (piece.type === PIECE_TYPES.SETTLER) {
                const dr = step.row - piece.row;
                const dc = step.col - piece.col;
                if (settlerDir === null) {
                    settlerDir = dr + ',' + dc;
                } else if ((dr + ',' + dc) !== settlerDir) {
                    break;
                }
            }
            const result = this.engine.movePiece(piece, step.row, step.col);

            if (!result.success) break;

            stepsThisTurn++;

            // Handle combat results visually
            if (result.combat) {
                lastCombat = result.combat;
                wasBlocked = !!result.blocked;
                if (wasBlocked) lastBlockedStep = step;

                if (result.combat.defenderDestroyed && !result.combat.cityFlipped) {
                    this.removePieceSprite(result.combat.defender);
                } else if (result.combat.cityFlipped) {
                    const cityPiece = this.engine.pieces.find(p => p.id === result.combat.defender);
                    if (cityPiece) {
                        const oldSprite = this.pieceSprites.get(cityPiece.id);
                        if (oldSprite) {
                            oldSprite.destroy();
                            this.pieceSprites.delete(cityPiece.id);
                        }
                        this.createPieceSprite(cityPiece);
                    }

                    if (result.combat.elimination && result.combat.elimination.eliminated) {
                        this.handleEliminationAnimation(result.combat.elimination);
                    }
                }
                // For city sieges: keep the queue going until the city falls
                if (queueData.targetCityId != null && !result.combat.cityFlipped) {
                    // City survived this hit — warrior will attack again next turn
                } else {
                    toRemove.push(pieceId);
                }
                break;
            }

            // For settlers, hasMoved is set after first move by movePiece.
            // But we need to continue moving them. Temporarily clear hasMoved for
            // subsequent steps within this settler's multi-step turn.
            if (piece.type === PIECE_TYPES.SETTLER && s < maxSteps - 1 && s < path.length - 1) {
                piece.hasMoved = false;
            }
        }

        // Collect animation data (do NOT call updatePieceSprite — animation handles it)
        if (stepsThisTurn > 0) {
            const toX = BOARD_OFFSET + piece.col * TILE_SIZE + halfTile;
            const toY = BOARD_OFFSET + piece.row * TILE_SIZE + halfTile;
            const moveData = {
                pieceId: pieceId,
                fromX: fromX,
                fromY: fromY,
                toX: toX,
                toY: toY,
                combat: lastCombat,
                blocked: wasBlocked
            };
            // For blocked attacks, include target tile for bump animation
            if (wasBlocked && lastBlockedStep) {
                moveData.bumpTargetX = BOARD_OFFSET + lastBlockedStep.col * TILE_SIZE + halfTile;
                moveData.bumpTargetY = BOARD_OFFSET + lastBlockedStep.row * TILE_SIZE + halfTile;
            }
            moveResults.push(moveData);
        }

        // If piece reached destination, remove queue (unless waiting for a tracked/blocked target)
        if (piece.row === queueData.destRow && piece.col === queueData.destCol) {
            if (queueData.targetPieceId == null && queueData.targetCityId == null) {
                toRemove.push(pieceId);
            }
            // else: at fallback tile adjacent to tracked target / city — keep queue
        } else {
            // Update stored path for next turn (with adjacent fallback)
            queueData.path = this.engine.findFullPath(piece, queueData.destRow, queueData.destCol);
            if (!queueData.path || queueData.path.length === 0) {
                queueData.path = this._findAdjacentFallbackPath(piece, queueData.destRow, queueData.destCol);
                if (!queueData.path) {
                    toRemove.push(pieceId);
                }
            }
        }
    }

    for (let i = 0; i < toRemove.length; i++) {
        this._movementQueue.delete(toRemove[i]);
    }

    return moveResults;
};

/**
 * Animate queued move results in batches (up to 8 per batch), with
 * batch-aware sound effects matching the AI movement batching system.
 * @param {Array} moveResults - from executeQueuedMoves
 * @param {Function} onComplete - called when all animations finish
 */
GameScene.prototype._animateQueuedMoveResults = function(moveResults, onComplete) {
    if (moveResults.length === 0) {
        onComplete();
        return;
    }
    this._animateQueuedBatch(moveResults, 0, onComplete);
};

/**
 * Animate a single batch of up to 8 queued moves simultaneously,
 * then recurse for the next batch. Plays batch-aware sound effects
 * (single / squad / army) based on the number of pieces that moved.
 * @param {Array} moveResults - full array of move results
 * @param {number} index - start index of the current batch
 * @param {Function} onComplete - called when all batches are done
 */
GameScene.prototype._animateQueuedBatch = function(moveResults, index, onComplete) {
    if (index >= moveResults.length) {
        onComplete();
        return;
    }

    // Collect the next batch (up to 8 moves)
    const batchEnd = Math.min(index + 8, moveResults.length);
    const batch = moveResults.slice(index, batchEnd);
    const total = batch.length;
    let completed = 0;
    let hasCombat = false;
    let hasCityCapture = false;

    const checkDone = () => {
        completed++;
        if (completed >= total) {
            // Update ownership and UI after the batch completes
            this.drawOwnership();
            this.updateUI();

            // Play combat sounds
            if (hasCombat) this.playAttackSound();
            if (hasCityCapture) this.playCityCapture();

            // Batch-aware movement sound (scales with piece count)
            this.playPieceDropSoundAI(total);

            // Continue to next batch with a small delay
            if (batchEnd < moveResults.length) {
                this.delayedCall(30, () => {
                    this._animateQueuedBatch(moveResults, batchEnd, onComplete);
                });
            } else {
                onComplete();
            }
        }
    };

    for (let i = 0; i < total; i++) {
        const move = batch[i];
        const sprite = this.pieceSprites.get(move.pieceId);

        if (move.combat) hasCombat = true;
        if (move.combat && move.combat.cityFlipped) hasCityCapture = true;

        if (!sprite) {
            checkDone();
            continue;
        }

        // Set sprite to the old position before animating
        sprite.x = move.fromX;
        sprite.y = move.fromY;

        // Blocked attack → bump animation (halfway to target, then bounce back)
        if (move.blocked && move.bumpTargetX != null) {
            const bumpX = (move.fromX + move.bumpTargetX) / 2;
            const bumpY = (move.fromY + move.bumpTargetY) / 2;

            this.tweens.add({
                targets: sprite,
                x: bumpX,
                y: bumpY,
                duration: 100,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: sprite,
                        x: move.fromX,
                        y: move.fromY,
                        duration: 150,
                        ease: 'Back.easeOut',
                        onComplete: () => {
                            const piece = this.engine.pieces.find(p => p.id === move.pieceId);
                            if (piece) this.updatePieceSprite(piece);
                            checkDone();
                        }
                    });
                }
            });
        } else {
            // Regular movement animation
            this.tweens.add({
                targets: sprite,
                x: move.toX,
                y: move.toY,
                duration: 200,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    const piece = this.engine.pieces.find(p => p.id === move.pieceId);
                    if (piece) this.updatePieceSprite(piece);
                    checkDone();
                }
            });
        }
    }
};

/**
 * Validate all queued movements. Remove invalid entries where:
 * - Piece was destroyed
 * - Destination is peace-locked
 * - No path exists from current position
 * Also refreshes stored paths to reflect current board state.
 */
GameScene.prototype.validateQueues = function() {
    const toRemove = [];

    for (const [pieceId, queueData] of this._movementQueue) {
        const piece = this.engine.pieces.find(p => p.id === pieceId);

        // Piece gone
        if (!piece) {
            toRemove.push(pieceId);
            continue;
        }

        // Validate city siege target
        if (queueData.targetCityId != null) {
            const city = this.engine.pieces.find(p => p.id === queueData.targetCityId);
            if (!city || city.ownerId === piece.ownerId) {
                toRemove.push(pieceId);
                continue;
            }
            const cityRel = this.engine.players[piece.ownerId].relations[city.ownerId];
            if (cityRel === 'peace') {
                toRemove.push(pieceId);
                continue;
            }
            queueData.destRow = city.row;
            queueData.destCol = city.col;
            // Re-compute path to city (or adjacent fallback)
            const newPath = this.engine.findFullPath(piece, city.row, city.col);
            queueData.path = newPath && newPath.length > 0
                ? newPath
                : this._findAdjacentFallbackPath(piece, city.row, city.col);
            if (!queueData.path) {
                toRemove.push(pieceId);
            }
            continue;
        }

        // Follow tracked target warrior — resolve to adjacent tile if target is unreachable
        if (queueData.targetPieceId != null) {
            const target = this.engine.pieces.find(p => p.id === queueData.targetPieceId);
            if (!target) {
                toRemove.push(pieceId);
                continue;
            }
            // Abandon target if now at peace
            const targetRel = this.engine.players[piece.ownerId].relations[target.ownerId];
            if (targetRel === 'peace') {
                toRemove.push(pieceId);
                continue;
            }
            const resolved = this._resolveTargetDestination(piece, target);
            if (!resolved) {
                toRemove.push(pieceId);
            } else {
                queueData.destRow = resolved.destRow;
                queueData.destCol = resolved.destCol;
                queueData.path = resolved.path;
            }
            continue;
        }

        // Check destination peace-lock for warriors
        if (piece.type === PIECE_TYPES.WARRIOR) {
            const destOwner = this.engine.tileOwnership[queueData.destRow][queueData.destCol];
            if (destOwner !== null && destOwner !== piece.ownerId) {
                const rel = this.engine.players[piece.ownerId].relations[destOwner];
                if (rel === 'peace') {
                    toRemove.push(pieceId);
                    continue;
                }
            }
        }

        // Re-compute path (with adjacent fallback if destination is blocked)
        const newPath = this.engine.findFullPath(piece, queueData.destRow, queueData.destCol);
        if (!newPath || newPath.length === 0) {
            const fallback = this._findAdjacentFallbackPath(piece, queueData.destRow, queueData.destCol);
            if (!fallback) {
                toRemove.push(pieceId);
            } else {
                queueData.path = fallback;
            }
        } else {
            queueData.path = newPath;
        }
    }

    for (let i = 0; i < toRemove.length; i++) {
        this._movementQueue.delete(toRemove[i]);
    }
};

// ============================================
// Red energy line rendering
// ============================================

/**
 * Draw animated red energy lines on the glow canvas for all queued movements.
 * Only draws for the current human player's pieces.
 * @param {number} timestamp - RAF timestamp
 */
GameScene.prototype._drawMovementQueueLines = function(timestamp) {
    const gCtx = this.glowCtx;
    if (!gCtx) return;

    const currentIdx = this.engine.currentPlayerIndex;
    const player = this.engine.players[currentIdx];
    if (player.isAI) return;

    const alpha = this._queueLineAlpha;
    if (alpha <= 0.01) return;

    const halfTile = TILE_SIZE / 2;
    const CYCLE_MS = 1500;
    const SIGMA = TILE_SIZE * 2;

    // Pre-compute distance thresholds for 4 quantized Gaussian levels
    // (replaces per-sub-segment Math.exp calls with simple comparisons)
    const s2x2 = 2 * SIGMA * SIGMA;
    const QD4 = Math.sqrt(-Math.log(0.875) * s2x2);
    const QD3 = Math.sqrt(-Math.log(0.625) * s2x2);
    const QD2 = Math.sqrt(-Math.log(0.375) * s2x2);
    const QD1 = Math.sqrt(-Math.log(0.125) * s2x2);

    // Pre-compute 5 RGBA strings for quantized alpha levels.
    // Gaussian quantized to 0, 0.25, 0.5, 0.75, 1.0 →
    // glowAlpha = (0.15 + q*0.25*0.45) * alpha
    // This replaces per-sub-segment string allocation + toFixed().
    const qStyles = new Array(5);
    qStyles[0] = 'rgba(255,68,68,' + (0.150 * alpha).toFixed(3) + ')';
    qStyles[1] = 'rgba(255,68,68,' + (0.2625 * alpha).toFixed(3) + ')';
    qStyles[2] = 'rgba(255,68,68,' + (0.375 * alpha).toFixed(3) + ')';
    qStyles[3] = 'rgba(255,68,68,' + (0.4875 * alpha).toFixed(3) + ')';
    qStyles[4] = 'rgba(255,68,68,' + (0.600 * alpha).toFixed(3) + ')';

    // Larger sub-segments on mobile for fewer iterations
    const SUB_LEN = layoutConfig.mobile ? TILE_SIZE * 0.8 : TILE_SIZE * 0.4;

    for (const [pieceId, queueData] of this._movementQueue) {
        const piece = this.engine.pieces.find(p => p.id === pieceId);
        if (!piece || piece.ownerId !== currentIdx) continue;

        const path = queueData.path;
        if (!path || path.length === 0) continue;

        // Build pixel-coordinate path starting from piece position
        const points = [];
        points.push({
            x: BOARD_OFFSET + piece.col * TILE_SIZE + halfTile,
            y: BOARD_OFFSET + piece.row * TILE_SIZE + halfTile
        });
        for (let i = 0; i < path.length; i++) {
            points.push({
                x: BOARD_OFFSET + path[i].col * TILE_SIZE + halfTile,
                y: BOARD_OFFSET + path[i].row * TILE_SIZE + halfTile
            });
        }

        // Compute total path length
        let totalLen = 0;
        const segLens = [];
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i-1].x;
            const dy = points[i].y - points[i-1].y;
            const len = Math.sqrt(dx * dx + dy * dy);
            segLens.push(len);
            totalLen += len;
        }
        if (totalLen <= 0) continue;

        const halfLen = totalLen * 0.5;

        // --- Base thin solid red line (single draw call) ---
        gCtx.save();
        gCtx.lineCap = 'round';
        gCtx.lineJoin = 'round';
        gCtx.lineWidth = 2;
        gCtx.strokeStyle = 'rgba(255,68,68,' + (0.5 * alpha) + ')';
        gCtx.beginPath();
        gCtx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            gCtx.lineTo(points[i].x, points[i].y);
        }
        gCtx.stroke();

        // --- Wider glow with batched Gaussian pulse ---
        // Batch sub-segments into 5 alpha-level buckets (one draw call each)
        // instead of N individual draw calls per sub-segment.
        const phase = (timestamp % CYCLE_MS) / CYCLE_MS;
        const pulseCenter = phase * totalLen;

        gCtx.lineWidth = 5;

        const buckets = [[], [], [], [], []];

        let dist = 0;
        for (let seg = 0; seg < segLens.length; seg++) {
            const sLen = segLens[seg];
            const p0 = points[seg];
            const p1 = points[seg + 1];
            const nSubs = Math.max(1, Math.round(sLen / SUB_LEN));
            const subLen = sLen / nSubs;
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;

            for (let s = 0; s < nSubs; s++) {
                const segMid = dist + (s + 0.5) * subLen;

                // Wrapped distance from pulse center
                let d = Math.abs(segMid - pulseCenter);
                if (d > halfLen) d = totalLen - d;

                // Quantize Gaussian via distance thresholds (replaces Math.exp)
                let qi;
                if (d < QD4) qi = 4;
                else if (d < QD3) qi = 3;
                else if (d < QD2) qi = 2;
                else if (d < QD1) qi = 1;
                else qi = 0;

                const t0 = s / nSubs;
                const t1 = (s + 1) / nSubs;
                buckets[qi].push(
                    p0.x + dx * t0, p0.y + dy * t0,
                    p0.x + dx * t1, p0.y + dy * t1
                );
            }
            dist += sLen;
        }

        // Draw batched by alpha level (5 draw calls instead of N)
        for (let bi = 0; bi < 5; bi++) {
            const bucket = buckets[bi];
            if (bucket.length === 0) continue;
            gCtx.strokeStyle = qStyles[bi];
            gCtx.beginPath();
            for (let i = 0; i < bucket.length; i += 4) {
                gCtx.moveTo(bucket[i], bucket[i + 1]);
                gCtx.lineTo(bucket[i + 2], bucket[i + 3]);
            }
            gCtx.stroke();
        }

        // --- Destination circle (fluctuating) ---
        const dest = points[points.length - 1];
        const pulse = Math.sin(timestamp * 0.004) * 0.5 + 0.5;
        const outerR = halfTile * 0.4 + pulse * halfTile * 0.15;
        const innerR = outerR * 0.6;
        const outerAlpha = (0.2 + pulse * 0.3) * alpha;
        const innerAlpha = (0.5 + pulse * 0.3) * alpha;

        gCtx.beginPath();
        gCtx.arc(dest.x, dest.y, outerR, 0, Math.PI * 2);
        gCtx.strokeStyle = 'rgba(255,68,68,' + outerAlpha.toFixed(3) + ')';
        gCtx.lineWidth = 3;
        gCtx.stroke();

        gCtx.beginPath();
        gCtx.arc(dest.x, dest.y, innerR, 0, Math.PI * 2);
        gCtx.strokeStyle = 'rgba(255,68,68,' + innerAlpha.toFixed(3) + ')';
        gCtx.lineWidth = 2;
        gCtx.stroke();

        gCtx.restore();
    }
};

// ============================================
// Drag preview (dashed red path during drag)
// ============================================

/**
 * Draw a dashed red preview path on the boardCanvas during drag.
 * Called from the drag pointermove handler.
 */
GameScene.prototype._drawDragQueuePreview = function(piece, destRow, destCol) {
    // Compute A* path
    const path = this.engine.findFullPath(piece, destRow, destCol);
    if (!path || path.length === 0) return;

    const ctx = this.boardCtx;
    const halfTile = TILE_SIZE / 2;

    // Build pixel points
    const points = [];
    points.push({
        x: BOARD_OFFSET + piece.col * TILE_SIZE + halfTile,
        y: BOARD_OFFSET + piece.row * TILE_SIZE + halfTile
    });
    for (let i = 0; i < path.length; i++) {
        points.push({
            x: BOARD_OFFSET + path[i].col * TILE_SIZE + halfTile,
            y: BOARD_OFFSET + path[i].row * TILE_SIZE + halfTile
        });
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,68,68,0.7)';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // Small circle at destination
    const dest = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(dest.x, dest.y, halfTile * 0.3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,68,68,0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.restore();
};
