// ============================================
// GAME SCENE - Board Module
// ============================================
// Static elements (checkerboard tiles, border, coordinates) are rendered
// with DOM elements — guaranteed visible regardless of canvas state.
//
// Dynamic elements (ownership markers, territory borders, move highlights)
// are drawn on the boardCanvas overlay using Canvas 2D.

// ---- roundRect polyfill (Safari <16, Firefox <112) ----
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
        var r = typeof radii === 'number' ? radii
              : Array.isArray(radii) ? (radii[0] || 0)
              : 0;
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        this.moveTo(x + r, y);
        this.arcTo(x + w, y,     x + w, y + h, r);
        this.arcTo(x + w, y + h, x,     y + h, r);
        this.arcTo(x,     y + h, x,     y,     r);
        this.arcTo(x,     y,     x + w, y,     r);
        this.closePath();
        return this;
    };
}

// ============================================
// Static board (DOM elements — created once)
// ============================================

GameScene.prototype.drawBoard = function () {
    // Idempotent — skip if already created
    if (this._tileGrid) return;

    const gridPx   = BOARD_SIZE * TILE_SIZE;
    const light    = hexToCSS(COLORS.lightTile);
    const dark     = hexToCSS(COLORS.darkTile);
    const bw       = Math.max(Math.floor(TILE_SIZE * 0.06), 3);
    const borderCSS = bw + 'px solid ' + hexToCSS(COLORS.border);

    // ---- Tile grid (CSS Grid with 100 cells) ----
    const grid = document.createElement('div');
    grid.style.position = 'absolute';
    grid.style.left     = BOARD_OFFSET + 'px';
    grid.style.top      = BOARD_OFFSET + 'px';
    grid.style.width    = gridPx + 'px';
    grid.style.height   = gridPx + 'px';
    grid.style.display  = 'grid';
    grid.style.gridTemplateColumns = 'repeat(' + BOARD_SIZE + ',' + TILE_SIZE + 'px)';
    grid.style.gridTemplateRows    = 'repeat(' + BOARD_SIZE + ',' + TILE_SIZE + 'px)';
    grid.style.pointerEvents = 'none';
    // Use outline so it doesn't eat into grid dimensions (box-sizing: border-box)
    grid.style.outline       = borderCSS;
    grid.style.outlineOffset = '0px';

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const cell = document.createElement('div');
            cell.style.backgroundColor = (row + col) % 2 === 0 ? light : dark;
            // 8-bit pixel grid lines between tiles
            cell.style.boxShadow = 'inset 1px 1px 0 rgba(255,255,255,0.04), inset -1px -1px 0 rgba(0,0,0,0.15)';
            grid.appendChild(cell);
        }
    }

    // Insert at the start of boardArea so it sits behind canvases
    this.boardArea.insertBefore(grid, this.boardArea.firstChild);
    this._tileGrid = grid;

    // ---- Coordinate labels (DOM text) ----
    const fontSize    = Math.max(Math.floor(BOARD_OFFSET * 0.5), 12);
    const labelOffset = Math.max(Math.floor(BOARD_OFFSET * 0.35), 8);
    const color       = typeof COLORS.textSecondary === 'string'
                      ? COLORS.textSecondary
                      : hexToCSS(COLORS.textSecondary);

    const labelCSS = 'position:absolute;pointer-events:none;' +
        'font:' + fontSize + 'px VT323,monospace;' +
        'color:' + color + ';' +
        'transform:translate(-50%,-50%);';

    for (let i = 0; i < BOARD_SIZE; i++) {
        // Column number (below the board)
        const colLabel = document.createElement('div');
        colLabel.textContent = String(i + 1);
        colLabel.style.cssText = labelCSS +
            'left:' + (BOARD_OFFSET + i * TILE_SIZE + TILE_SIZE / 2) + 'px;' +
            'top:'  + (BOARD_OFFSET + gridPx + labelOffset) + 'px;';
        this.boardArea.appendChild(colLabel);

        // Row number (left of the board)
        const rowLabel = document.createElement('div');
        rowLabel.textContent = String(i + 1);
        rowLabel.style.cssText = labelCSS +
            'left:' + (BOARD_OFFSET - labelOffset) + 'px;' +
            'top:'  + (BOARD_OFFSET + i * TILE_SIZE + TILE_SIZE / 2) + 'px;';
        this.boardArea.appendChild(rowLabel);
    }
};

// No-ops — border and coordinates are now DOM-based, created by drawBoard()
GameScene.prototype.addCoordinates = function () {};

// ============================================
// Dynamic overlay (boardCanvas — cleared & redrawn)
// ============================================

GameScene.prototype.drawOwnership = function (force) {
    const currentHash = this._computeOwnershipHash();
    if (!force && !this._ownershipDirty && currentHash === this._lastOwnershipHash) {
        return;
    }

    const hashChanged = this._ownershipDirty || currentHash !== this._lastOwnershipHash;
    this._ownershipDirty = false;
    this._lastOwnershipHash = currentHash;

    const ctx = this.boardCtx;
    if (!ctx) return;

    // Wipe the overlay — reset transform to clear actual pixel buffer, then restore
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.boardCanvas.width, this.boardCanvas.height);
    ctx.restore();

    if (hashChanged || !this._cachedBorderCanvas) {
        // Full redraw: markers + territory borders
        this._drawOwnershipMarkers(ctx);
        this.drawTerritoryBorders();
        // Snapshot markers+borders to offscreen canvas for reuse on force-redraws
        this._cachedBorderCanvas = document.createElement('canvas');
        this._cachedBorderCanvas.width = this.boardCanvas.width;
        this._cachedBorderCanvas.height = this.boardCanvas.height;
        const offCtx = this._cachedBorderCanvas.getContext('2d');
        offCtx.drawImage(this.boardCanvas, 0, 0);
    } else {
        // Ownership unchanged — blit cached markers+borders (skip full recalculation)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this._cachedBorderCanvas, 0, 0);
        ctx.restore();
    }

    // 3. Restore active move highlights (if any)
    if (this._lastHighlightMoves) {
        this._renderHighlightRects(this._lastHighlightMoves);
    }
};

// ============================================
// Ownership markers (semi-transparent rounded rects on canvas)
// ============================================

GameScene.prototype._drawOwnershipMarkers = function (ctx) {
    const ownership = this.engine.tileOwnership;
    const players   = this.engine.players;

    const padding      = Math.max(Math.floor(TILE_SIZE * 0.05), 1);
    const strokeWidth  = Math.max(Math.floor(TILE_SIZE * 0.04), 2);
    const innerSize    = TILE_SIZE - padding * 2;

    // Batch tiles by owner to minimise fillStyle/strokeStyle switches
    const tilesByOwner = new Map();
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const owner = ownership[row][col];
            if (owner !== null && players[owner]) {
                if (!tilesByOwner.has(owner)) tilesByOwner.set(owner, []);
                tilesByOwner.get(owner).push({ row, col });
            }
        }
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const [owner, tiles] of tilesByOwner) {
        const color = players[owner].color.hex;

        // Fills — sharp pixel rectangles (no rounded corners)
        ctx.fillStyle = hexToRGBA(color, 0.25);
        for (let i = 0; i < tiles.length; i++) {
            const x = BOARD_OFFSET + tiles[i].col * TILE_SIZE + padding;
            const y = BOARD_OFFSET + tiles[i].row * TILE_SIZE + padding;
            ctx.fillRect(x, y, innerSize, innerSize);
        }

        // Strokes — sharp pixel borders
        ctx.lineWidth   = strokeWidth;
        ctx.strokeStyle = hexToRGBA(color, 0.5);
        for (let i = 0; i < tiles.length; i++) {
            const x = BOARD_OFFSET + tiles[i].col * TILE_SIZE + padding;
            const y = BOARD_OFFSET + tiles[i].row * TILE_SIZE + padding;
            ctx.strokeRect(x, y, innerSize, innerSize);
        }
    }
    ctx.restore();
};

// ============================================
// Territory borders (glow + solid/dashed lines + rounded corners)
// ============================================

GameScene.prototype.drawTerritoryBorders = function () {
    const ctx = this.boardCtx;
    if (!ctx) return;

    const ownership = this.engine.tileOwnership;
    const pos = this._tilePositions;
    if (!pos) return;

    const borderWidth = Math.max(Math.floor(TILE_SIZE * 0.07), 3);
    const radius      = Math.max(Math.floor(TILE_SIZE * 0.18), 6);
    const dashLen     = Math.max(Math.floor(TILE_SIZE * 0.12), 5);
    const glowWidth   = borderWidth * 3;
    const glowAlpha   = 0.35;

    const getColor = (pid) => this._getDarkenedColor(pid);

    // ---- Collect border edges & corners in a single grid pass ----
    const edges   = [];
    const corners = new Map();

    const addCorner = (x, y, owner, dir) => {
        const key = x * 10000 + y;
        if (!corners.has(key)) corners.set(key, { x, y, owners: new Set(), edges: {} });
        const c = corners.get(key);
        c.owners.add(owner);
        c.edges[dir] = owner;
    };

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const owner = ownership[r][c];
            if (owner === null) continue;

            const x0 = pos[c], x1 = pos[c + 1];
            const y0 = pos[r], y1 = pos[r + 1];

            const topN   = r > 0              ? ownership[r - 1][c] : -1;
            const botN   = r < BOARD_SIZE - 1  ? ownership[r + 1][c] : -1;
            const leftN  = c > 0              ? ownership[r][c - 1] : -1;
            const rightN = c < BOARD_SIZE - 1  ? ownership[r][c + 1] : -1;

            if (topN !== owner) {
                edges.push({ x1: x0, y1: y0, x2: x1, y2: y0, owner, neighbor: topN, horiz: true });
                addCorner(x0, y0, owner, 'right');
                addCorner(x1, y0, owner, 'left');
            }
            if (botN !== owner) {
                edges.push({ x1: x0, y1: y1, x2: x1, y2: y1, owner, neighbor: botN, horiz: true });
                addCorner(x0, y1, owner, 'right');
                addCorner(x1, y1, owner, 'left');
            }
            if (leftN !== owner) {
                edges.push({ x1: x0, y1: y0, x2: x0, y2: y1, owner, neighbor: leftN, horiz: false });
                addCorner(x0, y0, owner, 'down');
                addCorner(x0, y1, owner, 'up');
            }
            if (rightN !== owner) {
                edges.push({ x1: x1, y1: y0, x2: x1, y2: y1, owner, neighbor: rightN, horiz: false });
                addCorner(x1, y0, owner, 'down');
                addCorner(x1, y1, owner, 'up');
            }
        }
    }

    // ---- Corner radii (use !== undefined to handle player-0 correctly) ----
    const cornerRadii = new Map();
    for (const [key, data] of corners) {
        const e = data.edges;
        const hasCorner =
            (e.right !== undefined && e.down !== undefined) ||
            (e.right !== undefined && e.up   !== undefined) ||
            (e.left  !== undefined && e.down !== undefined) ||
            (e.left  !== undefined && e.up   !== undefined);
        cornerRadii.set(key, hasCorner ? radius : 0);
    }

    const adjustEdge = (edge) => {
        const { x1, y1, x2, y2, horiz } = edge;
        const r1 = cornerRadii.get(x1 * 10000 + y1) || 0;
        const r2 = cornerRadii.get(x2 * 10000 + y2) || 0;
        return horiz
            ? { ax1: x1 + r1, ay1: y1, ax2: x2 - r2, ay2: y2 }
            : { ax1: x1, ay1: y1 + r1, ax2: x2, ay2: y2 - r2 };
    };

    // ---- Deduplicate & group edges ----
    const drawn = new Set();
    const ek    = (e) => `${e.x1},${e.y1}-${e.x2},${e.y2}`;
    const rk    = (e) => `${e.x2},${e.y2}-${e.x1},${e.y1}`;

    const edgesByOwner = new Map();
    for (const edge of edges) {
        const k = ek(edge);
        if (drawn.has(k) || drawn.has(rk(edge))) continue;
        if (!edgesByOwner.has(edge.owner)) edgesByOwner.set(edge.owner, []);
        edgesByOwner.get(edge.owner).push(edge);
    }

    const cornersByOwner = new Map();
    for (const [key, data] of corners) {
        const cr = cornerRadii.get(key) || 0;
        if (cr === 0) continue;
        for (const owner of data.owners) {
            if (!cornersByOwner.has(owner)) cornersByOwner.set(owner, []);
            cornersByOwner.get(owner).push({ data, r: cr });
        }
    }

    ctx.save();
    ctx.lineCap = 'square';  // 8-bit pixel art — sharp square line ends

    // ==== PASS 1: glow (wide, semi-transparent strokes) ====

    for (const [owner, ownerEdges] of edgesByOwner) {
        ctx.lineWidth   = glowWidth;
        ctx.strokeStyle = hexToRGBA(getColor(owner), glowAlpha);
        ctx.beginPath();
        for (const edge of ownerEdges) {
            const { ax1, ay1, ax2, ay2 } = adjustEdge(edge);
            ctx.moveTo(ax1, ay1);
            ctx.lineTo(ax2, ay2);
        }
        ctx.stroke();
    }

    for (const [owner, oc] of cornersByOwner) {
        ctx.lineWidth   = glowWidth;
        ctx.strokeStyle = hexToRGBA(getColor(owner), glowAlpha);
        for (const { data, r } of oc) {
            const { x, y, edges: e } = data;
            if (e.right === owner && e.down === owner) { ctx.beginPath(); ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false); ctx.stroke(); }
            if (e.left  === owner && e.down === owner) { ctx.beginPath(); ctx.arc(x - r, y + r, r, Math.PI * 1.5, Math.PI * 2, false); ctx.stroke(); }
            if (e.right === owner && e.up   === owner) { ctx.beginPath(); ctx.arc(x + r, y - r, r, Math.PI * 0.5, Math.PI, false); ctx.stroke(); }
            if (e.left  === owner && e.up   === owner) { ctx.beginPath(); ctx.arc(x - r, y - r, r, 0, Math.PI * 0.5, false); ctx.stroke(); }
        }
    }

    // ==== PASS 2: main border strokes ====

    const solidByOwner = new Map();
    const dashedList   = [];

    for (const edge of edges) {
        const k = ek(edge);
        if (drawn.has(k) || drawn.has(rk(edge))) continue;
        drawn.add(k);

        const adj = adjustEdge(edge);
        const len = edge.horiz ? (adj.ax2 - adj.ax1) : (adj.ay2 - adj.ay1);
        if (len <= 0) continue;

        if (edge.neighbor !== null && edge.neighbor >= 0) {
            dashedList.push({ ax1: adj.ax1, ay1: adj.ay1, ax2: adj.ax2, ay2: adj.ay2,
                              len, horiz: edge.horiz, owner: edge.owner, neighbor: edge.neighbor });
        } else {
            if (!solidByOwner.has(edge.owner)) solidByOwner.set(edge.owner, []);
            solidByOwner.get(edge.owner).push(adj);
        }
    }

    // Solid borders batched by owner
    for (const [owner, segs] of solidByOwner) {
        ctx.lineWidth   = borderWidth;
        ctx.strokeStyle = hexToCSS(getColor(owner));
        ctx.beginPath();
        for (const { ax1, ay1, ax2, ay2 } of segs) {
            ctx.moveTo(ax1, ay1);
            ctx.lineTo(ax2, ay2);
        }
        ctx.stroke();
    }

    // Dashed borders (shared edges — alternating player colours)
    for (const { ax1, ay1, len, horiz, owner, neighbor } of dashedList) {
        const c1 = getColor(owner), c2 = getColor(neighbor);
        const n  = Math.max(4, Math.round(len / dashLen));
        const d  = len / n;

        ctx.lineWidth = borderWidth;

        // Even segments — owner colour
        ctx.strokeStyle = hexToCSS(c1);
        ctx.beginPath();
        for (let i = 0; i < n; i += 2) {
            if (horiz) { ctx.moveTo(ax1 + i * d, ay1); ctx.lineTo(ax1 + (i + 1) * d, ay1); }
            else       { ctx.moveTo(ax1, ay1 + i * d); ctx.lineTo(ax1, ay1 + (i + 1) * d); }
        }
        ctx.stroke();

        // Odd segments — neighbour colour
        ctx.strokeStyle = hexToCSS(c2);
        ctx.beginPath();
        for (let i = 1; i < n; i += 2) {
            if (horiz) { ctx.moveTo(ax1 + i * d, ay1); ctx.lineTo(ax1 + (i + 1) * d, ay1); }
            else       { ctx.moveTo(ax1, ay1 + i * d); ctx.lineTo(ax1, ay1 + (i + 1) * d); }
        }
        ctx.stroke();
    }

    // Corner arcs (main stroke)
    for (const [owner, oc] of cornersByOwner) {
        ctx.lineWidth   = borderWidth;
        ctx.strokeStyle = hexToCSS(getColor(owner));
        for (const { data, r } of oc) {
            const { x, y, edges: e } = data;
            if (e.right === owner && e.down === owner) { ctx.beginPath(); ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false); ctx.stroke(); }
            if (e.left  === owner && e.down === owner) { ctx.beginPath(); ctx.arc(x - r, y + r, r, Math.PI * 1.5, Math.PI * 2, false); ctx.stroke(); }
            if (e.right === owner && e.up   === owner) { ctx.beginPath(); ctx.arc(x + r, y - r, r, Math.PI * 0.5, Math.PI, false); ctx.stroke(); }
            if (e.left  === owner && e.up   === owner) { ctx.beginPath(); ctx.arc(x - r, y - r, r, 0, Math.PI * 0.5, false); ctx.stroke(); }
        }
    }

    // ---- Cache border geometry for glow animation ----
    this._cachedBorderEdges = new Map();
    this._cachedBorderCorners = new Map();
    this._cachedGlowColors = new Map();

    // Cache adjusted edges per owner (reuse edgesByOwner from dedup pass)
    for (const [owner, ownerEdges] of edgesByOwner) {
        const cached = [];
        for (const edge of ownerEdges) {
            const { ax1, ay1, ax2, ay2 } = adjustEdge(edge);
            const len = edge.horiz ? (ax2 - ax1) : (ay2 - ay1);
            if (len > 0) {
                cached.push({ ax1, ay1, ax2, ay2, len, horiz: edge.horiz });
            }
        }
        if (cached.length > 0) {
            this._cachedBorderEdges.set(owner, cached);
        }
    }

    // Cache corner arcs per owner
    for (const [owner, oc] of cornersByOwner) {
        const cached = [];
        for (const { data, r } of oc) {
            const { x, y, edges: e } = data;
            if (e.right === owner && e.down === owner) cached.push({ cx: x + r, cy: y + r, r, startAngle: Math.PI,       endAngle: Math.PI * 1.5 });
            if (e.left  === owner && e.down === owner) cached.push({ cx: x - r, cy: y + r, r, startAngle: Math.PI * 1.5, endAngle: Math.PI * 2 });
            if (e.right === owner && e.up   === owner) cached.push({ cx: x + r, cy: y - r, r, startAngle: Math.PI * 0.5, endAngle: Math.PI });
            if (e.left  === owner && e.up   === owner) cached.push({ cx: x - r, cy: y - r, r, startAngle: 0,             endAngle: Math.PI * 0.5 });
        }
        if (cached.length > 0) {
            this._cachedBorderCorners.set(owner, cached);
        }
    }

    // Pre-cache total perimeter length per owner (avoids recalculation every frame in _drawGlowAnimation)
    this._cachedBorderTotalLen = new Map();
    for (const [owner, ownerEdges] of this._cachedBorderEdges) {
        let totalLen = 0;
        for (let i = 0; i < ownerEdges.length; i++) totalLen += ownerEdges[i].len;
        const ownerCorners = this._cachedBorderCorners.get(owner) || [];
        for (let i = 0; i < ownerCorners.length; i++) {
            const c = ownerCorners[i];
            totalLen += c.r * Math.abs(c.endAngle - c.startAngle);
        }
        this._cachedBorderTotalLen.set(owner, totalLen);
    }

    // Cache decomposed RGB colors per owner
    const allOwners = new Set([...this._cachedBorderEdges.keys(), ...this._cachedBorderCorners.keys()]);
    for (const owner of allOwners) {
        const hex = getColor(owner);
        this._cachedGlowColors.set(owner, {
            r: (hex >> 16) & 0xFF,
            g: (hex >> 8) & 0xFF,
            b: hex & 0xFF
        });
    }

    // ---- Pre-compute glow animation constants ----
    // Replace per-frame Math.exp() Gaussian with distance threshold comparisons.
    // The Gaussian exp(-d²/(2σ²)) is quantized to 5 levels (0..4). The boundary
    // between level q and q-1 occurs at exp(-d²/(2σ²)) = (q-0.5)/4, so:
    //   d_threshold = σ * sqrt(-2 * ln((q-0.5)/4))
    // Sub-segments beyond D1 have q=0 and are skipped entirely.
    const SIGMA = TILE_SIZE * 2.5;
    const s2x2 = 2 * SIGMA * SIGMA;
    this._glowThresholds = new Float64Array(4);
    this._glowThresholds[0] = Math.sqrt(-Math.log(0.875) * s2x2); // d < D4 → q=4
    this._glowThresholds[1] = Math.sqrt(-Math.log(0.625) * s2x2); // d < D3 → q=3
    this._glowThresholds[2] = Math.sqrt(-Math.log(0.375) * s2x2); // d < D2 → q=2
    this._glowThresholds[3] = Math.sqrt(-Math.log(0.125) * s2x2); // d < D1 → q=1

    // Pre-compute the 4 RGBA color strings per owner (one per brightness bucket).
    // Eliminates per-frame string concatenation and allocation.
    const MAX_ALPHA = 0.7;
    this._cachedGlowRGBA = new Map();
    for (const owner of allOwners) {
        const c = this._cachedGlowColors.get(owner);
        if (!c) continue;
        const strs = new Array(4);
        for (let i = 0; i < 4; i++) {
            const a = ((i + 1) / 4) * MAX_ALPHA;
            strs[i] = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
        }
        this._cachedGlowRGBA.set(owner, strs);
    }

    ctx.restore();
};

// ============================================
// Animated energy pulse along territory borders
// ============================================

GameScene.prototype._drawGlowAnimation = function (timestamp) {
    const gCtx = this.glowCtx;
    if (!gCtx || !this._cachedBorderEdges) return;

    // Clear glow canvas (reset transform to clear actual pixels, then restore)
    gCtx.save();
    gCtx.setTransform(1, 0, 0, 1, 0, 0);
    gCtx.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    gCtx.restore();

    const DT = this._glowThresholds;
    if (!DT) return;

    const CYCLE_MS = 2000;
    const BW       = Math.max(Math.floor(TILE_SIZE * 0.07), 3);
    const GLOW_LW  = BW * 2.5;
    // Larger sub-segments on mobile — halves the iteration count with no
    // visible quality loss since the Gaussian is quantized to only 4 levels.
    const SUB_LEN  = layoutConfig.mobile ? TILE_SIZE : TILE_SIZE * 0.5;

    // Distance thresholds (pre-computed in drawTerritoryBorders)
    const D4 = DT[0], D3 = DT[1], D2 = DT[2], D1 = DT[3];

    // Reuse bucket arrays across frames (clear by resetting length)
    if (!this._glowBucketPool) {
        this._glowBucketPool = [[], [], [], []];
    }
    const pool = this._glowBucketPool;

    gCtx.save();
    gCtx.lineCap = 'round';

    for (const [owner, ownerEdges] of this._cachedBorderEdges) {
        const rgbaStrs = this._cachedGlowRGBA ? this._cachedGlowRGBA.get(owner) : null;
        if (!rgbaStrs) continue;

        const ownerCorners = this._cachedBorderCorners.get(owner) || [];
        const totalLen = this._cachedBorderTotalLen ? this._cachedBorderTotalLen.get(owner) : 0;
        if (!totalLen || totalLen <= 0) continue;

        const halfLen = totalLen * 0.5;
        const phase = (timestamp % CYCLE_MS) / CYCLE_MS;
        const pulseCenter = phase * totalLen;

        // Clear reusable buckets
        pool[0].length = 0;
        pool[1].length = 0;
        pool[2].length = 0;
        pool[3].length = 0;

        let dist = 0;

        // Process edges — distance threshold comparisons replace Math.exp()
        for (let ei = 0; ei < ownerEdges.length; ei++) {
            const edge = ownerEdges[ei];
            const nSubs = Math.max(1, Math.round(edge.len / SUB_LEN));
            const subLen = edge.len / nSubs;

            for (let s = 0; s < nSubs; s++) {
                const segMid = dist + (s + 0.5) * subLen;

                // Wrapped distance from pulse center
                let d = Math.abs(segMid - pulseCenter);
                if (d > halfLen) d = totalLen - d;

                // Quantize via pre-computed distance thresholds
                // (replaces Math.exp + Math.round — pure comparisons)
                if (d >= D1) continue; // q=0, skip
                const bi = d < D4 ? 3 : d < D3 ? 2 : d < D2 ? 1 : 0;

                const t0 = s / nSubs, t1 = (s + 1) / nSubs;
                if (edge.horiz) {
                    pool[bi].push(
                        edge.ax1 + t0 * edge.len, edge.ay1,
                        edge.ax1 + t1 * edge.len, edge.ay1
                    );
                } else {
                    pool[bi].push(
                        edge.ax1, edge.ay1 + t0 * edge.len,
                        edge.ax1, edge.ay1 + t1 * edge.len
                    );
                }
            }
            dist += edge.len;
        }

        // Process corner arcs
        for (let ci = 0; ci < ownerCorners.length; ci++) {
            const c = ownerCorners[ci];
            const arcLen = c.r * Math.abs(c.endAngle - c.startAngle);
            const nSubs = Math.max(1, Math.round(arcLen / SUB_LEN));
            const subArc = (c.endAngle - c.startAngle) / nSubs;
            const subDist = arcLen / nSubs;

            for (let s = 0; s < nSubs; s++) {
                const segMid = dist + (s + 0.5) * subDist;

                let d = Math.abs(segMid - pulseCenter);
                if (d > halfLen) d = totalLen - d;

                if (d >= D1) continue;
                const bi = d < D4 ? 3 : d < D3 ? 2 : d < D2 ? 1 : 0;

                // NaN sentinel distinguishes arc segments from line segments
                pool[bi].push(
                    NaN, c.cx, c.cy, c.r,
                    c.startAngle + s * subArc,
                    c.startAngle + (s + 1) * subArc
                );
            }
            dist += arcLen;
        }

        // Draw batched by brightness level (pre-computed RGBA strings)
        gCtx.lineWidth = GLOW_LW;
        for (let bi = 0; bi < 4; bi++) {
            const bucket = pool[bi];
            if (bucket.length === 0) continue;

            gCtx.strokeStyle = rgbaStrs[bi];

            gCtx.beginPath();
            let i = 0;
            while (i < bucket.length) {
                // NaN self-inequality is faster than isNaN()
                if (bucket[i] !== bucket[i]) {
                    // Arc segment: NaN, cx, cy, r, startAngle, endAngle
                    gCtx.moveTo(
                        bucket[i + 1] + bucket[i + 3] * Math.cos(bucket[i + 4]),
                        bucket[i + 2] + bucket[i + 3] * Math.sin(bucket[i + 4])
                    );
                    gCtx.arc(bucket[i + 1], bucket[i + 2], bucket[i + 3], bucket[i + 4], bucket[i + 5]);
                    i += 6;
                } else {
                    // Line segment: x1, y1, x2, y2
                    gCtx.moveTo(bucket[i], bucket[i + 1]);
                    gCtx.lineTo(bucket[i + 2], bucket[i + 3]);
                    i += 4;
                }
            }
            gCtx.stroke();
        }
    }

    gCtx.restore();
};
