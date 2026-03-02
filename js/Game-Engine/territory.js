// ============================================
// GAME ENGINE - Territory Module
// ============================================
// Territory expansion and tech bonus application.

/**
 * Expand territory with conquest (DIPLOMACY production) - can take tiles from other players
 * Only expands the contiguous territory containing the city
 * Prefers unowned tiles but falls back to enemy tiles if none available
 * @param {number} playerId - The expanding player
 * @param {Object} city - The city that completed DIPLOMACY production
 */
GameEngine.prototype.expandTerritoryWithConquest = function(playerId, city) {
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

    // BFS to find contiguous territory from city and collect edge candidates
    const visited = new Array(BOARD_SIZE * BOARD_SIZE).fill(false);
    const queue = [city.row * BOARD_SIZE + city.col];
    visited[queue[0]] = true;

    const unowned = [];
    const owned = [];
    const seenEdge = new Array(BOARD_SIZE * BOARD_SIZE).fill(false);

    let head = 0;
    while (head < queue.length) {
        const idx = queue[head++];
        const r = (idx / BOARD_SIZE) | 0;
        const c = idx % BOARD_SIZE;

        if (this.tileOwnership[r][c] !== playerId) continue;

        for (let d = 0; d < 8; d++) {
            const nr = r + directions[d][0];
            const nc = c + directions[d][1];
            if (!this.isValidTile(nr, nc)) continue;

            const nidx = nr * BOARD_SIZE + nc;
            const owner = this.tileOwnership[nr][nc];

            if (owner === playerId) {
                if (!visited[nidx]) {
                    visited[nidx] = true;
                    queue.push(nidx);
                }
            } else if (!seenEdge[nidx]) {
                seenEdge[nidx] = true;
                if (owner === null) {
                    unowned.push({ row: nr, col: nc });
                } else {
                    // Skip tiles with enemy warriors during war - can't claim occupied enemy positions
                    const tileRelation = this.players[playerId].relations[owner];
                    const occupant = this.board[nr][nc];
                    if (tileRelation === 'war' && occupant && occupant.type === PIECE_TYPES.WARRIOR && occupant.ownerId !== playerId) {
                        // Tile has enemy warrior at war - ineligible
                    } else {
                        owned.push({ row: nr, col: nc });
                    }
                }
            }
        }
    }

    // Prefer unowned, fall back to enemy tiles
    const candidates = unowned.length > 0 ? unowned : owned;
    if (candidates.length === 0) return;

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    this.claimTile(playerId, chosen.row, chosen.col);
    this.checkVictory();
};

/**
 * Expand territory radially from city (automatic 6-round expansion) - unowned tiles only
 * Expands from city center outward; falls back to contiguous border edge when merged
 * @param {number} playerId - The expanding player
 * @param {Object} city - The city piece triggering expansion
 */
GameEngine.prototype.expandTerritoryRadial = function(playerId, city) {
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    const centerRow = city.row;
    const centerCol = city.col;

    // Efficient ring iteration - only check border tiles at each distance
    for (let dist = 1; dist < BOARD_SIZE; dist++) {
        const candidates = [];

        // Top and bottom edges of the ring
        for (let dc = -dist; dc <= dist; dc++) {
            this.checkRadialCandidate(centerRow - dist, centerCol + dc, playerId, directions, candidates);
            this.checkRadialCandidate(centerRow + dist, centerCol + dc, playerId, directions, candidates);
        }
        // Left and right edges (excluding corners already checked)
        for (let dr = -dist + 1; dr < dist; dr++) {
            this.checkRadialCandidate(centerRow + dr, centerCol - dist, playerId, directions, candidates);
            this.checkRadialCandidate(centerRow + dr, centerCol + dist, playerId, directions, candidates);
        }

        if (candidates.length > 0) {
            const chosen = candidates[Math.floor(Math.random() * candidates.length)];
            this.claimTile(playerId, chosen.row, chosen.col);
            return;
        }
    }

    // No radial tiles found - territory likely merged, expand from contiguous border edge
    this.expandFromContiguousBorder(playerId, centerRow, centerCol);
};

/**
 * Check if a tile is a valid radial expansion candidate (unowned, adjacent to player territory)
 */
GameEngine.prototype.checkRadialCandidate = function(row, col, playerId, directions, candidates) {
    if (!this.isValidTile(row, col)) return;
    if (this.tileOwnership[row][col] !== null) return;

    // Check adjacency to player's territory
    for (let d = 0; d < 8; d++) {
        const nr = row + directions[d][0];
        const nc = col + directions[d][1];
        if (this.isValidTile(nr, nc) && this.tileOwnership[nr][nc] === playerId) {
            candidates.push({ row, col });
            return;
        }
    }
};

/**
 * Expand from the edge of contiguous territory (fallback when radial finds nothing)
 */
GameEngine.prototype.expandFromContiguousBorder = function(playerId, startRow, startCol) {
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

    // BFS to find contiguous territory and collect edge candidates simultaneously
    const visited = new Array(BOARD_SIZE * BOARD_SIZE).fill(false);
    const queue = [startRow * BOARD_SIZE + startCol];
    visited[queue[0]] = true;

    const edgeCandidates = [];
    const seenEdge = new Array(BOARD_SIZE * BOARD_SIZE).fill(false);

    let head = 0;
    while (head < queue.length) {
        const idx = queue[head++];
        const r = (idx / BOARD_SIZE) | 0;
        const c = idx % BOARD_SIZE;

        if (this.tileOwnership[r][c] !== playerId) continue;

        for (let d = 0; d < 8; d++) {
            const nr = r + directions[d][0];
            const nc = c + directions[d][1];
            if (!this.isValidTile(nr, nc)) continue;

            const nidx = nr * BOARD_SIZE + nc;
            const owner = this.tileOwnership[nr][nc];

            if (owner === playerId) {
                if (!visited[nidx]) {
                    visited[nidx] = true;
                    queue.push(nidx);
                }
            } else if (owner === null && !seenEdge[nidx]) {
                seenEdge[nidx] = true;
                edgeCandidates.push({ row: nr, col: nc });
            }
        }
    }

    if (edgeCandidates.length > 0) {
        const chosen = edgeCandidates[Math.floor(Math.random() * edgeCandidates.length)];
        this.claimTile(playerId, chosen.row, chosen.col);
    }
};

/**
 * Claim a tile for a player, handling warrior displacement
 */
GameEngine.prototype.claimTile = function(playerId, row, col) {
    // Handle piece displacement if needed (warriors and settlers on peacefully claimed tiles)
    const piece = this.board[row][col];
    if (piece && (piece.type === PIECE_TYPES.WARRIOR || piece.type === PIECE_TYPES.SETTLER) && piece.ownerId !== playerId) {
        const relation = this.players[playerId].relations[piece.ownerId];
        if (relation !== 'war') {
            this.handlePieceDisplacement(piece, playerId);
        }
    }

    this.tileOwnership[row][col] = playerId;

    // Handle city capture (for conquest mode)
    const pieceAfter = this.board[row][col];
    if (pieceAfter && pieceAfter.type === PIECE_TYPES.CITY && pieceAfter.ownerId !== playerId) {
        const previousOwner = pieceAfter.ownerId;
        pieceAfter.ownerId = playerId;
        pieceAfter.production = null;
        pieceAfter.productionProgress = 0;

        this.log('CITY_CAPTURED', { city: pieceAfter.id, newOwner: playerId });
        this.history.captureSnapshot(this, 'CITY_CAPTURED', {
            city: pieceAfter.id,
            newOwner: playerId,
            previousOwner: previousOwner
        });

        // Check if the previous owner has been eliminated
        this.checkPlayerElimination(previousOwner);
    }

    this.log('TERRITORY_EXPANDED', { player: playerId, tile: { row, col } });
    this.history.captureSnapshot(this, 'TERRITORY_EXPANDED', {
        player: playerId,
        tile: { row, col }
    });
};

/**
 * Handle displacement of a piece (warrior or settler) when territory expands onto their tile
 * @param {Object} piece - The piece to displace
 * @param {number} expandingPlayerId - The player whose territory is expanding
 */
GameEngine.prototype.handlePieceDisplacement = function(piece, expandingPlayerId) {
    const pieceOwnerId = piece.ownerId;
    const pieceType = piece.type === PIECE_TYPES.WARRIOR ? 'WARRIOR' : 'SETTLER';

    // Find nearest valid tile: neutral or owned by piece's owner, and empty
    const targetTile = this.findNearestDisplacementTile(piece.row, piece.col, pieceOwnerId);

    if (targetTile) {
        // Push piece to the new tile
        const fromRow = piece.row;
        const fromCol = piece.col;
        this.board[piece.row][piece.col] = null;
        piece.row = targetTile.row;
        piece.col = targetTile.col;
        this.board[targetTile.row][targetTile.col] = piece;

        this.log(pieceType + '_DISPLACED', {
            piece: piece.id,
            owner: pieceOwnerId,
            from: { row: fromRow, col: fromCol },
            to: targetTile,
            reason: 'territory_expansion'
        });

        this.history.captureSnapshot(this, pieceType + '_DISPLACED', {
            piece: piece.id,
            owner: pieceOwnerId,
            to: targetTile
        });
    } else {
        // No valid tile - 95% delete, 5% flip to new owner (warriors only; settlers always deleted)
        const roll = Math.random();

        if (roll < 0.05 && piece.type === PIECE_TYPES.WARRIOR) {
            // 5% chance: flip warrior to new owner
            const oldRow = piece.row;
            const oldCol = piece.col;

            this.removePiece(piece);

            const newWarrior = this.createPiece(PIECE_TYPES.WARRIOR, expandingPlayerId, oldRow, oldCol);
            this.pieces.push(newWarrior);
            this.board[oldRow][oldCol] = newWarrior;

            this.log('WARRIOR_CONVERTED_BY_EXPANSION', {
                originalOwner: pieceOwnerId,
                newOwner: expandingPlayerId,
                position: { row: oldRow, col: oldCol }
            });

            this.history.captureSnapshot(this, 'WARRIOR_CONVERTED_BY_EXPANSION', {
                originalOwner: pieceOwnerId,
                newOwner: expandingPlayerId,
                position: { row: oldRow, col: oldCol }
            });
        } else {
            // Credit warrior kill to expanding player, loss to piece owner
            if (piece.type === PIECE_TYPES.WARRIOR) {
                this.players[expandingPlayerId].warriorKills++;
                this.players[pieceOwnerId].warriorsLost++;
            }
            this.removePiece(piece);

            this.log(pieceType + '_CRUSHED_BY_EXPANSION', {
                owner: pieceOwnerId,
                position: { row: piece.row, col: piece.col }
            });

            this.history.captureSnapshot(this, pieceType + '_CRUSHED_BY_EXPANSION', {
                owner: pieceOwnerId
            });
        }
    }
};

/**
 * Find the nearest tile that a displaced piece can move to
 * Valid tiles are: neutral (unowned) or owned by the piece's owner, and empty
 * Uses expanding ring search (Chebyshev distance) - O(1) memory, no queue overhead
 * @param {number} startRow - Starting row
 * @param {number} startCol - Starting col
 * @param {number} pieceOwnerId - The owner of the piece
 * @returns {Object|null} - {row, col} of nearest valid tile, or null if none found
 */
GameEngine.prototype.findNearestDisplacementTile = function(startRow, startCol, warriorOwnerId) {
    // Search in expanding rings by Chebyshev distance
    // Only iterate the border of each ring for efficiency
    for (let dist = 1; dist < BOARD_SIZE; dist++) {
        // Top and bottom edges of the ring
        for (let dc = -dist; dc <= dist; dc++) {
            // Top edge
            const topRow = startRow - dist;
            const topCol = startCol + dc;
            if (this.isValidDisplacementTile(topRow, topCol, warriorOwnerId)) {
                return { row: topRow, col: topCol };
            }
            // Bottom edge
            const botRow = startRow + dist;
            const botCol = startCol + dc;
            if (this.isValidDisplacementTile(botRow, botCol, warriorOwnerId)) {
                return { row: botRow, col: botCol };
            }
        }
        // Left and right edges (excluding corners already checked)
        for (let dr = -dist + 1; dr < dist; dr++) {
            // Left edge
            const leftRow = startRow + dr;
            const leftCol = startCol - dist;
            if (this.isValidDisplacementTile(leftRow, leftCol, warriorOwnerId)) {
                return { row: leftRow, col: leftCol };
            }
            // Right edge
            const rightRow = startRow + dr;
            const rightCol = startCol + dist;
            if (this.isValidDisplacementTile(rightRow, rightCol, warriorOwnerId)) {
                return { row: rightRow, col: rightCol };
            }
        }
    }
    return null;
};

/**
 * Check if a tile is valid for warrior displacement
 * @param {number} row - Tile row
 * @param {number} col - Tile col
 * @param {number} warriorOwnerId - The owner of the warrior being displaced
 * @returns {boolean} - True if tile is valid for displacement
 */
GameEngine.prototype.isValidDisplacementTile = function(row, col, warriorOwnerId) {
    if (!this.isValidTile(row, col)) return false;
    if (this.board[row][col] !== null) return false;
    const tileOwner = this.tileOwnership[row][col];
    return tileOwner === null || tileOwner === warriorOwnerId;
};

GameEngine.prototype.applyTechBonus = function(playerId) {
    this.pieces.forEach(piece => {
        if (piece.ownerId === playerId) {
            if (piece.type === PIECE_TYPES.CITY || piece.type === PIECE_TYPES.WARRIOR) {
                piece.maxHp++;
                piece.hp++;
            }
            if (piece.type === PIECE_TYPES.WARRIOR) {
                piece.damage++;
            }
        }
    });
};
