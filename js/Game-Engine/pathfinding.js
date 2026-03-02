// ============================================
// GAME ENGINE - Pathfinding Module
// ============================================
// A* pathfinding that returns full waypoint paths (not just first move).
// Used by the movement queue system for multi-turn movement orders.

function _chebyshevDistance(r1, c1, r2, c2) {
    return Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
}

function _manhattanDistance(r1, c1, r2, c2) {
    return Math.abs(r2 - r1) + Math.abs(c2 - c1);
}

/**
 * Find the full A* path from a piece's current position to (destRow, destCol).
 * Returns an array of waypoints [{row, col}, ...] excluding start, including destination.
 * Returns null if no path exists.
 *
 * Warriors: 8-directional, 1 tile per step, avoids friendly pieces on intermediate tiles,
 *           avoids enemy pieces on intermediate tiles (destination CAN be enemy = attack).
 * Settlers: orthogonal only, 1 tile per step in the pathfinding graph,
 *           avoids all pieces on intermediate tiles.
 */
GameEngine.prototype.findFullPath = function(piece, destRow, destCol) {
    if (!this.isValidTile(destRow, destCol)) return null;

    const startRow = piece.row;
    const startCol = piece.col;
    if (startRow === destRow && startCol === destCol) return null;

    const isWarrior = piece.type === PIECE_TYPES.WARRIOR;
    const isSettler = piece.type === PIECE_TYPES.SETTLER;
    if (!isWarrior && !isSettler) return null;

    const ownerId = piece.ownerId;
    const player = this.players[ownerId];

    const heuristic = isWarrior ? _chebyshevDistance : _manhattanDistance;

    // Directions: warriors use 8-dir, settlers use 4-dir (orthogonal)
    const dirs = isWarrior
        ? [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
        : [[-1,0],[1,0],[0,-1],[0,1]];

    // Precompute tiles adjacent to enemy warriors at war (danger zones)
    const dangerTiles = new Set();
    for (var pi = 0; pi < this.pieces.length; pi++) {
        var ep = this.pieces[pi];
        if (ep.type !== PIECE_TYPES.WARRIOR || ep.ownerId === ownerId) continue;
        if (player.relations[ep.ownerId] === 'peace') continue;
        for (var dr2 = -1; dr2 <= 1; dr2++) {
            for (var dc2 = -1; dc2 <= 1; dc2++) {
                if (dr2 === 0 && dc2 === 0) continue;
                var ar = ep.row + dr2;
                var ac = ep.col + dc2;
                if (ar >= 0 && ar < BOARD_SIZE && ac >= 0 && ac < BOARD_SIZE) {
                    dangerTiles.add(ar * BOARD_SIZE + ac);
                }
            }
        }
    }

    // Open set as sorted array (by fCost)
    const openSet = [];
    const gCosts = new Map();
    const parent = new Map();

    const startKey = startRow * BOARD_SIZE + startCol;
    const destKey = destRow * BOARD_SIZE + destCol;
    gCosts.set(startKey, 0);

    const h0 = heuristic(startRow, startCol, destRow, destCol);
    openSet.push({ row: startRow, col: startCol, key: startKey, g: 0, f: h0 });

    const maxIterations = 200;
    let iterations = 0;

    while (openSet.length > 0 && iterations < maxIterations) {
        iterations++;

        // Pop lowest fCost node
        const current = openSet.shift();
        const { row: cr, col: cc, key: ck, g: cg } = current;

        // Skip if we already found a better route here
        if (cg > gCosts.get(ck)) continue;

        for (let di = 0; di < dirs.length; di++) {
            const dr = dirs[di][0];
            const dc = dirs[di][1];
            const nr = cr + dr;
            const nc = cc + dc;

            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;

            const nk = nr * BOARD_SIZE + nc;
            const isDestination = (nr === destRow && nc === destCol);

            // Check tile occupancy
            const occupant = this.board[nr][nc];

            if (isWarrior) {
                // Check blockade on diagonal moves
                if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
                    if (this.isBlockedByBlockade(cr, cc, nr, nc, ownerId)) continue;
                }

                if (occupant) {
                    if (isDestination) {
                        // Destination can have an enemy piece (attack target)
                        if (occupant.ownerId === ownerId) continue; // Can't attack own piece
                        // Must be at war to attack
                        const rel = player.relations[occupant.ownerId];
                        if (rel === 'peace') continue;
                    } else {
                        // Intermediate tiles: skip any occupied tile
                        continue;
                    }
                }

                // Peace-locked tile check (can't enter enemy territory at peace)
                const tileOwner = this.tileOwnership[nr][nc];
                if (tileOwner !== null && tileOwner !== ownerId) {
                    const rel = player.relations[tileOwner];
                    if (rel === 'peace') continue;
                }
            } else {
                // Settler: can't land on any piece, intermediate or destination
                if (occupant) continue;

                // Peace-locked tile check
                const tileOwner = this.tileOwnership[nr][nc];
                if (tileOwner !== null && tileOwner !== ownerId) {
                    const rel = player.relations[tileOwner];
                    if (rel === 'peace') continue;
                }
            }

            // Penalise tiles adjacent to enemy warriors (danger zones)
            const moveCost = (!isDestination && dangerTiles.has(nk)) ? 1.5 : 1;
            const tentativeG = cg + moveCost;
            if (gCosts.has(nk) && tentativeG >= gCosts.get(nk)) continue;

            gCosts.set(nk, tentativeG);
            parent.set(nk, ck);

            if (isDestination) {
                // Reconstruct path
                const path = [];
                let traceKey = nk;
                while (traceKey !== startKey) {
                    const tr = Math.floor(traceKey / BOARD_SIZE);
                    const tc = traceKey % BOARD_SIZE;
                    path.push({ row: tr, col: tc });
                    traceKey = parent.get(traceKey);
                }
                path.reverse();
                return path;
            }

            const h = heuristic(nr, nc, destRow, destCol);
            const f = tentativeG + h;

            // Binary search insertion into sorted openSet
            let lo = 0, hi = openSet.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (openSet[mid].f < f) lo = mid + 1;
                else hi = mid;
            }
            openSet.splice(lo, 0, { row: nr, col: nc, key: nk, g: tentativeG, f: f });
        }
    }

    return null; // No path found
};
