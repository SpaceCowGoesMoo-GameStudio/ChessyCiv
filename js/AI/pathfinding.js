// ============================================
// A* PATHFINDING
// ============================================

/**
 * Find the best first move for a settler to reach the target using A*.
 * Returns the first step of the shortest path, or null if no path exists.
 * Uses Manhattan distance as heuristic (admissible for orthogonal movement).
 */
CivChessAI.prototype.findSettlerPathAStar = function(settler, target) {
    const startKey = `${settler.row},${settler.col}`;
    const targetKey = `${target.row},${target.col}`;

    if (startKey === targetKey) return null; // Already there

    // Priority queue using array with insertion sort (simple but effective for small boards)
    // Each entry: { row, col, firstMove, gCost, fCost }
    // gCost = actual cost from start, fCost = gCost + heuristic
    const openSet = [];
    const gCosts = new Map(); // Best g cost to reach each position
    gCosts.set(startKey, 0);

    // Get initial valid moves and add to open set
    const initialMoves = this.engine.getValidMoves(settler);
    for (const move of initialMoves) {
        const moveKey = `${move.row},${move.col}`;
        if (moveKey === targetKey) {
            return move; // Can reach target directly
        }
        const gCost = 1; // Each move costs 1 turn
        const hCost = this.getManhattanDistance(move, target);
        const fCost = gCost + hCost;

        gCosts.set(moveKey, gCost);
        this.insertIntoOpenSet(openSet, {
            row: move.row,
            col: move.col,
            firstMove: move,
            gCost: gCost,
            fCost: fCost
        });
    }

    // A* search
    while (openSet.length > 0) {
        // Get node with lowest fCost (first element due to sorted insertion)
        const current = openSet.shift();
        const currentKey = `${current.row},${current.col}`;

        // Generate possible settler moves from current position
        const possibleMoves = this.getSettlerMovesFrom(current.row, current.col);

        for (const nextPos of possibleMoves) {
            const nextKey = `${nextPos.row},${nextPos.col}`;
            const tentativeG = current.gCost + 1;

            // Skip if we've found a better path to this node already
            if (gCosts.has(nextKey) && tentativeG >= gCosts.get(nextKey)) {
                continue;
            }

            // This is a better path
            gCosts.set(nextKey, tentativeG);

            if (nextKey === targetKey) {
                return current.firstMove; // Found path, return first move
            }

            const hCost = this.getManhattanDistance(nextPos, target);
            const fCost = tentativeG + hCost;

            this.insertIntoOpenSet(openSet, {
                row: nextPos.row,
                col: nextPos.col,
                firstMove: current.firstMove,
                gCost: tentativeG,
                fCost: fCost
            });
        }
    }

    return null; // No path found
};

/**
 * Insert a node into the open set maintaining sorted order by fCost.
 * Uses binary search for O(log n) insertion position finding.
 */
CivChessAI.prototype.insertIntoOpenSet = function(openSet, node) {
    // Binary search for insertion position
    let low = 0;
    let high = openSet.length;

    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (openSet[mid].fCost < node.fCost) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    openSet.splice(low, 0, node);
};

/**
 * Get all possible settler moves from a given position (for BFS exploration).
 * Simulates settler movement rules: up to 3 tiles orthogonally.
 */
CivChessAI.prototype.getSettlerMovesFrom = function(row, col) {
    const moves = [];
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]]; // Orthogonal only

    for (const [dr, dc] of directions) {
        for (let dist = 1; dist <= 3; dist++) {
            const newRow = row + dr * dist;
            const newCol = col + dc * dist;

            // Check bounds
            if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE) {
                break; // Can't go further in this direction
            }

            // Check if tile is occupied (blocking further movement)
            const piece = this.engine.board[newRow][newCol];
            if (piece) {
                // Can't pass through or land on occupied tiles
                break;
            }

            moves.push({ row: newRow, col: newCol });
        }
    }

    return moves;
};

/**
 * Find the best first move for a warrior to reach the target using A*,
 * with a strong preference for tiles adjacent to friendly warriors (formation movement).
 * Used by HARD difficulty to make warriors travel in groups.
 * Support tiles (adjacent to own warriors) cost 0.5; danger tiles (adjacent to enemy warriors
 * at war) cost 1.5; all others cost 1.0.
 * Returns the first step of the chosen path, or null if no path exists.
 */
CivChessAI.prototype.findWarriorPathAStarFormation = function(warrior, target) {
    const startRow = warrior.row;
    const startCol = warrior.col;
    const destRow = target.row;
    const destCol = target.col;

    if (startRow === destRow && startCol === destCol) return null;

    const ownerId = this.playerId;
    const player = this.engine.players[ownerId];

    const dirs = [
        [-1,-1],[-1,0],[-1,1],
        [0,-1],         [0,1],
        [1,-1], [1,0],  [1,1]
    ];

    // Precompute danger tiles (tiles adjacent to enemy warriors we're at war with)
    const dangerTiles = new Set();
    for (const p of this.engine.pieces) {
        if (p.type !== PIECE_TYPES.WARRIOR || p.ownerId === ownerId) continue;
        if (player.relations[p.ownerId] === 'peace') continue;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const ar = p.row + dr;
                const ac = p.col + dc;
                if (ar >= 0 && ar < BOARD_SIZE && ac >= 0 && ac < BOARD_SIZE) {
                    dangerTiles.add(ar * BOARD_SIZE + ac);
                }
            }
        }
    }

    // Precompute support tiles (tiles adjacent to other friendly warriors)
    const supportTiles = new Set();
    for (const p of this.engine.pieces) {
        if (p.type !== PIECE_TYPES.WARRIOR || p.ownerId !== ownerId) continue;
        if (p.id === warrior.id) continue;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const ar = p.row + dr;
                const ac = p.col + dc;
                if (ar >= 0 && ar < BOARD_SIZE && ac >= 0 && ac < BOARD_SIZE) {
                    supportTiles.add(ar * BOARD_SIZE + ac);
                }
            }
        }
    }

    const openSet = [];
    const gCosts = new Map();
    const parent = new Map();

    const startKey = startRow * BOARD_SIZE + startCol;
    const destKey = destRow * BOARD_SIZE + destCol;
    gCosts.set(startKey, 0);

    const h0 = Math.max(Math.abs(destRow - startRow), Math.abs(destCol - startCol));
    openSet.push({ row: startRow, col: startCol, key: startKey, g: 0, f: h0 });

    const maxIterations = 200;
    let iterations = 0;

    while (openSet.length > 0 && iterations < maxIterations) {
        iterations++;

        const current = openSet.shift();
        const { row: cr, col: cc, key: ck, g: cg } = current;

        if (cg > gCosts.get(ck)) continue;

        for (const [dr, dc] of dirs) {
            const nr = cr + dr;
            const nc = cc + dc;

            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;

            const nk = nr * BOARD_SIZE + nc;
            const isDestination = (nr === destRow && nc === destCol);

            // Blockade check on diagonal moves
            if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
                if (this.engine.isBlockedByBlockade(cr, cc, nr, nc, ownerId)) continue;
            }

            const occupant = this.engine.board[nr][nc];
            if (occupant) {
                if (isDestination) {
                    if (occupant.ownerId === ownerId) continue;
                    const rel = player.relations[occupant.ownerId];
                    if (rel === 'peace') continue;
                } else {
                    continue;
                }
            }

            // Peace-locked tile check
            const tileOwner = this.engine.tileOwnership[nr][nc];
            if (tileOwner !== null && tileOwner !== ownerId) {
                const rel = player.relations[tileOwner];
                if (rel === 'peace') continue;
            }

            // Support tiles are cheap (formation bonus), danger tiles are expensive
            let moveCost = 1.0;
            if (!isDestination) {
                if (supportTiles.has(nk)) {
                    moveCost = 0.5;
                } else if (dangerTiles.has(nk)) {
                    moveCost = 1.5;
                }
            }

            const tentativeG = cg + moveCost;
            if (gCosts.has(nk) && tentativeG >= gCosts.get(nk)) continue;

            gCosts.set(nk, tentativeG);
            parent.set(nk, ck);

            if (isDestination) {
                // Reconstruct path and return first move
                const path = [];
                let traceKey = nk;
                while (traceKey !== startKey) {
                    const tr = Math.floor(traceKey / BOARD_SIZE);
                    const tc = traceKey % BOARD_SIZE;
                    path.push({ row: tr, col: tc });
                    traceKey = parent.get(traceKey);
                }
                path.reverse();
                return path[0];
            }

            const h = Math.max(Math.abs(destRow - nr), Math.abs(destCol - nc));
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

    return null;
};

/**
 * Find the best first move for a warrior to reach the target using A*.
 * Returns the first step of the shortest path, or null if no path exists.
 * Uses Chebyshev distance as heuristic (admissible for 8-directional movement).
 */
CivChessAI.prototype.findWarriorPathAStar = function(warrior, target) {
    const startKey = `${warrior.row},${warrior.col}`;
    const targetKey = `${target.row},${target.col}`;

    if (startKey === targetKey) return null; // Already there

    // Priority queue using array with insertion sort
    const openSet = [];
    const gCosts = new Map(); // Best g cost to reach each position
    gCosts.set(startKey, 0);

    // Get initial valid moves and add to open set
    const initialMoves = this.engine.getValidMoves(warrior);
    for (const move of initialMoves) {
        const moveKey = `${move.row},${move.col}`;
        if (moveKey === targetKey) {
            return move; // Can reach target directly
        }
        const gCost = 1;
        const hCost = this.getDistance(move, target); // Chebyshev distance
        const fCost = gCost + hCost;

        gCosts.set(moveKey, gCost);
        this.insertIntoOpenSet(openSet, {
            row: move.row,
            col: move.col,
            firstMove: move,
            gCost: gCost,
            fCost: fCost
        });
    }

    // A* search with iteration limit to prevent long searches
    const maxIterations = 100;
    let iterations = 0;

    while (openSet.length > 0 && iterations < maxIterations) {
        iterations++;
        const current = openSet.shift();
        const currentKey = `${current.row},${current.col}`;

        // Generate possible warrior moves from current position (8 directions, 1 tile)
        const possibleMoves = this.getWarriorMovesFrom(current.row, current.col);

        for (const nextPos of possibleMoves) {
            const nextKey = `${nextPos.row},${nextPos.col}`;
            const tentativeG = current.gCost + 1;

            if (gCosts.has(nextKey) && tentativeG >= gCosts.get(nextKey)) {
                continue;
            }

            gCosts.set(nextKey, tentativeG);

            if (nextKey === targetKey) {
                return current.firstMove; // Found path, return first move
            }

            const hCost = this.getDistance(nextPos, target);
            const fCost = tentativeG + hCost;

            this.insertIntoOpenSet(openSet, {
                row: nextPos.row,
                col: nextPos.col,
                firstMove: current.firstMove,
                gCost: tentativeG,
                fCost: fCost
            });
        }
    }

    return null; // No path found
};

/**
 * Get all possible warrior moves from a given position (8 directions, 1 tile each).
 */
CivChessAI.prototype.getWarriorMovesFrom = function(row, col) {
    const moves = [];
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],          [0, 1],
        [1, -1],  [1, 0],  [1, 1]
    ];

    for (const [dr, dc] of directions) {
        const newRow = row + dr;
        const newCol = col + dc;

        // Check bounds
        if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE) {
            continue;
        }

        // Check if tile is occupied by a friendly piece (can't pass through)
        const piece = this.engine.board[newRow][newCol];
        if (piece && piece.ownerId === this.playerId) {
            continue; // Can't move through friendly pieces
        }

        moves.push({ row: newRow, col: newCol });
    }

    return moves;
};

/**
 * Check if a position is a good city spot for our settlers
 */
CivChessAI.prototype.isSettleableTile = function(row, col) {
    return this.expansionHeatmap[row][col] > 0 &&
           this.engine.tileOwnership[row][col] === this.playerId;
};

/**
 * Check if we have settlers that need paths cleared
 */
CivChessAI.prototype.getActiveSettlers = function() {
    return this.gameState.ownPieces.settlers.filter(s => {
        const engineSettler = this.engine.pieces.find(p => p.id === s.id);
        return engineSettler && !engineSettler.hasMoved;
    });
};

/**
 * Check if a warrior is blocking a settler's path to their destination
 */
CivChessAI.prototype.isBlockingSettlerPath = function(warrior) {
    const settlers = this.getActiveSettlers();
    if (settlers.length === 0) return false;

    for (const settler of settlers) {
        const validSpots = this.findValidCitySpots();
        const engineSettler = this.engine.pieces.find(p => p.id === settler.id);
        if (!engineSettler) continue;

        for (const spot of validSpots) {
            // Check if warrior is in the orthogonal path between settler and spot
            if (this.isInOrthogonalPath(warrior, engineSettler, spot)) {
                return true;
            }
        }
    }

    return false;
};

/**
 * Check if a position is in the orthogonal path between settler and target
 */
CivChessAI.prototype.isInOrthogonalPath = function(pos, settler, target) {
    // Check horizontal path
    if (pos.row === settler.row && pos.row === target.row) {
        const minCol = Math.min(settler.col, target.col);
        const maxCol = Math.max(settler.col, target.col);
        if (pos.col > minCol && pos.col < maxCol) return true;
    }

    // Check vertical path
    if (pos.col === settler.col && pos.col === target.col) {
        const minRow = Math.min(settler.row, target.row);
        const maxRow = Math.max(settler.row, target.row);
        if (pos.row > minRow && pos.row < maxRow) return true;
    }

    // Check if in L-shaped path (horizontal then vertical or vice versa)
    // Path 1: settler -> (settler.row, target.col) -> target
    if ((pos.row === settler.row &&
         ((pos.col > settler.col && pos.col <= target.col) ||
          (pos.col < settler.col && pos.col >= target.col))) ||
        (pos.col === target.col &&
         ((pos.row > settler.row && pos.row <= target.row) ||
          (pos.row < settler.row && pos.row >= target.row)))) {
        return true;
    }

    // Path 2: settler -> (target.row, settler.col) -> target
    if ((pos.col === settler.col &&
         ((pos.row > settler.row && pos.row <= target.row) ||
          (pos.row < settler.row && pos.row >= target.row))) ||
        (pos.row === target.row &&
         ((pos.col > settler.col && pos.col <= target.col) ||
          (pos.col < settler.col && pos.col >= target.col)))) {
        return true;
    }

    return false;
};
