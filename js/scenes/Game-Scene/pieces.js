// ============================================
// GAME SCENE - Pieces Module (DOM-based)
// ============================================
// Piece sprite creation, updates, and management.
// Each piece is a DOM element wrapper stored in this.pieceSprites.

// Cached piece rendering constants (computed once per TILE_SIZE)
const PieceRenderCache = {
    _tileSize: 0,
    circlePadding: 0,
    strokeWidth: 0,
    selectedStrokeWidth: 0,
    fontSize: 0,
    healthBarWidth: 0,
    healthBarHeight: 0,
    healthBarY: 0,
    prodFontSize: 0,
    prodY: 0,
    halfTile: 0,
    circleRadius: 0,

    update() {
        if (this._tileSize === TILE_SIZE) return; // Already computed for this size
        this._tileSize = TILE_SIZE;

        this.halfTile = TILE_SIZE / 2;
        this.circlePadding = Math.max(Math.floor(TILE_SIZE * 0.1), 4);
        this.circleRadius = this.halfTile - this.circlePadding;
        this.strokeWidth = Math.max(Math.floor(TILE_SIZE * 0.05), 2);
        this.selectedStrokeWidth = Math.max(Math.floor(TILE_SIZE * 0.07), 3);
        this.fontSize = Math.max(Math.floor(TILE_SIZE * 0.53), 16);
        this.healthBarWidth = TILE_SIZE - Math.floor(TILE_SIZE * 0.27);
        this.healthBarHeight = Math.max(Math.floor(TILE_SIZE * 0.12), 4);
        this.healthBarY = -this.halfTile + Math.floor(TILE_SIZE * 0.13);
        this.prodFontSize = Math.max(Math.floor(TILE_SIZE * 0.22), 11);
        this.prodY = this.halfTile - Math.floor(TILE_SIZE * 0.2);
    }
};

// Piece type symbols (constant)
const PIECE_SYMBOLS = {
    [PIECE_TYPES.CITY]: '\u265C',    // Rook
    [PIECE_TYPES.WARRIOR]: '\u265F', // Pawn
    [PIECE_TYPES.SETTLER]: '\u265E'  // Knight
};

/**
 * Create a DOM-based piece sprite wrapper.
 * The wrapper is a plain object (not an HTMLElement) so the TweenManager
 * treats it as a plain-object target, reading/writing x, y, alpha, scale,
 * scaleX, scaleY, rotation directly via its properties. The setters update
 * the underlying DOM element's CSS transform.
 */
function _createPieceWrapper(el, pieceData) {
    const cache = PieceRenderCache;
    const diameter = cache.circleRadius * 2;

    // Internal state
    let _x = 0;
    let _y = 0;
    let _alpha = 1;
    let _scaleX = 1;
    let _scaleY = 1;
    let _rotation = 0;
    let _depth = DEPTH_PIECES;

    function _applyTransform() {
        // Position the element so its center is at (_x, _y).
        // The element has width/height = TILE_SIZE (enough to contain circle + health bar).
        // translate moves the top-left corner, then we offset by -halfTile to center it.
        const tx = _x - cache.halfTile;
        const ty = _y - cache.halfTile;
        el.style.transform = `translate(${tx}px, ${ty}px) scale(${_scaleX}, ${_scaleY}) rotate(${_rotation}rad)`;
    }

    const wrapper = {
        el: el,
        pieceData: pieceData,

        // Sub-component references — set after construction
        bgCircle: null,
        pieceText: null,
        healthBarBg: null,
        healthBarFill: null,
        healthBarWidth: cache.healthBarWidth,
        prodIndicator: null,

        isGrayscale: false,

        // ---- Position (center coordinates, matching Phaser behavior) ----

        get x() { return _x; },
        set x(val) {
            _x = val;
            _applyTransform();
        },

        get y() { return _y; },
        set y(val) {
            _y = val;
            _applyTransform();
        },

        // ---- Tween-compatible animated properties ----

        get alpha() { return _alpha; },
        set alpha(val) {
            _alpha = val;
            el.style.opacity = val;
        },

        get scaleX() { return _scaleX; },
        set scaleX(val) {
            _scaleX = val;
            _applyTransform();
        },

        get scaleY() { return _scaleY; },
        set scaleY(val) {
            _scaleY = val;
            _applyTransform();
        },

        get scale() { return _scaleX; },
        set scale(val) {
            _scaleX = val;
            _scaleY = val;
            _applyTransform();
        },

        get rotation() { return _rotation; },
        set rotation(val) {
            _rotation = val;
            _applyTransform();
        },

        // ---- Batched position update (no immediate DOM write) ----

        setPositionSilent(newX, newY) {
            _x = newX;
            _y = newY;
        },

        flushTransform() {
            _applyTransform();
        },

        // ---- Phaser-compatible API ----

        setDepth(z) {
            _depth = z;
            el.style.zIndex = z;
        },

        setVisible(visible) {
            el.style.display = visible ? '' : 'none';
        },

        setInteractive(opts) {
            if (opts && opts.draggable) {
                el.classList.add('piece-draggable');
            }
            if (opts && opts.useHandCursor) {
                el.style.cursor = 'grab';
            }
            el.style.pointerEvents = 'auto';
        },

        disableInteractive() {
            el.classList.remove('piece-draggable');
            el.style.cursor = 'default';
            el.style.pointerEvents = 'none';
        },

        setAlpha(a) {
            _alpha = a;
            el.style.opacity = a;
        },

        setSize(w, h) {
            // No-op for DOM — hit area sizing is handled by the element dimensions
        },

        destroy() {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        }
    };

    return wrapper;
}


GameScene.prototype.createAllPieces = function() {
    // Ensure render cache is up to date
    PieceRenderCache.update();

    const pieces = this.engine.pieces;
    for (let i = 0, len = pieces.length; i < len; i++) {
        this.createPieceSprite(pieces[i]);
    }
};

GameScene.prototype.createPieceSprite = function(piece) {
    // Ensure render cache is up to date
    PieceRenderCache.update();
    const cache = PieceRenderCache;

    const cx = BOARD_OFFSET + piece.col * TILE_SIZE + cache.halfTile;
    const cy = BOARD_OFFSET + piece.row * TILE_SIZE + cache.halfTile;
    const player = this.engine.players[piece.ownerId];

    const diameter = cache.circleRadius * 2;

    // ---- Root element ----
    const root = document.createElement('div');
    root.className = 'piece';
    root.style.cssText = 'position:absolute;left:0;top:0;pointer-events:auto;cursor:grab;touch-action:none;will-change:transform;';
    root.style.width = TILE_SIZE + 'px';
    root.style.height = TILE_SIZE + 'px';

    // ---- Circle background (pixelated 8-bit style) ----
    const circleEl = document.createElement('div');
    circleEl.className = 'piece-circle';
    circleEl.style.cssText = 'position:relative;border-radius:50%;background:rgba(26,26,58,0.95);border-style:solid;display:flex;align-items:center;justify-content:center;box-sizing:border-box;';
    circleEl.style.width = diameter + 'px';
    circleEl.style.height = diameter + 'px';
    circleEl.style.borderWidth = Math.max(cache.strokeWidth + 1, 3) + 'px';
    circleEl.style.borderColor = hexToCSSHex(player.color.hex);
    circleEl.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.5)';
    // Center the circle inside the root element
    circleEl.style.margin = cache.circlePadding + 'px auto 0 ' + cache.circlePadding + 'px';

    // ---- Piece symbol (pixel art style) ----
    const symbolEl = document.createElement('span');
    symbolEl.className = 'piece-symbol';
    symbolEl.style.cssText = 'font-family:serif;user-select:none;line-height:1;-webkit-font-smoothing:none;-moz-osx-font-smoothing:unset;';
    symbolEl.style.fontSize = cache.fontSize + 'px';
    symbolEl.style.color = player.color.css;
    symbolEl.style.textShadow = '2px 2px 0 rgba(0,0,0,0.7), -1px -1px 0 rgba(0,0,0,0.3)';
    symbolEl.textContent = PIECE_SYMBOLS[piece.type];

    circleEl.appendChild(symbolEl);
    root.appendChild(circleEl);

    // ---- Health bar background ----
    const hbBgEl = document.createElement('div');
    hbBgEl.className = 'piece-healthbar-bg';
    hbBgEl.style.cssText = 'position:absolute;background:rgba(51,51,51,0.7);border:1px solid #666;box-sizing:border-box;';
    hbBgEl.style.width = cache.healthBarWidth + 'px';
    hbBgEl.style.height = cache.healthBarHeight + 'px';
    // Center the health bar horizontally; position vertically at healthBarY (relative to center)
    hbBgEl.style.left = ((TILE_SIZE - cache.healthBarWidth) / 2) + 'px';
    hbBgEl.style.top = (cache.halfTile + cache.healthBarY - cache.healthBarHeight / 2) + 'px';

    // ---- Health bar fill ----
    const healthPercent = piece.hp / piece.maxHp;
    const fillWidth = healthPercent * cache.healthBarWidth;
    const hbFillEl = document.createElement('div');
    hbFillEl.className = 'piece-healthbar-fill';
    hbFillEl.style.cssText = 'height:100%;';
    hbFillEl.style.width = fillWidth + 'px';
    hbFillEl.style.backgroundColor = '#00ff00';

    hbBgEl.appendChild(hbFillEl);
    root.appendChild(hbBgEl);

    // ---- Production indicator (cities only) ----
    let prodEl = null;
    if (piece.type === PIECE_TYPES.CITY) {
        prodEl = document.createElement('span');
        prodEl.className = 'piece-production';
        prodEl.style.cssText = 'position:absolute;font-family:VT323,monospace;color:#00ffcc;white-space:nowrap;text-align:center;user-select:none;text-shadow:0 0 4px #000000,0 0 2px #000000;font-weight:bold;padding:0 2px;border-radius:2px;';
        prodEl.style.fontSize = cache.prodFontSize + 'px';
        prodEl.style.backgroundColor = '#000000cc';
        // Position at prodY (relative to center), horizontally centered
        prodEl.style.top = (cache.halfTile + cache.prodY - cache.prodFontSize / 2) + 'px';
        prodEl.style.left = '50%';
        prodEl.style.transform = 'translateX(-50%)';
        prodEl.style.display = 'none';
        root.appendChild(prodEl);
    }

    // ---- Append to piece container ----
    this.pieceContainer.appendChild(root);

    // ---- Create wrapper ----
    const wrapper = _createPieceWrapper(root, piece);

    // ---- Set up sub-component APIs ----

    // bgCircle: setStrokeStyle(width, hexColor)
    wrapper.bgCircle = {
        setStrokeStyle(width, color) {
            circleEl.style.borderWidth = width + 'px';
            circleEl.style.borderColor = hexToCSSHex(color);
        }
    };

    // pieceText: setColor(cssColor)
    wrapper.pieceText = {
        setColor(css) {
            symbolEl.style.color = css;
        }
    };

    // healthBarBg: setVisible(bool)
    wrapper.healthBarBg = {
        setVisible(visible) {
            hbBgEl.style.display = visible ? '' : 'none';
        }
    };

    // healthBarFill: setVisible(bool), setSize(w, h), setFillStyle(hexColor)
    wrapper.healthBarFill = {
        setVisible(visible) {
            hbFillEl.style.display = visible ? '' : 'none';
        },
        setSize(w, h) {
            hbFillEl.style.width = w + 'px';
            if (h !== undefined) hbFillEl.style.height = h + 'px';
        },
        setFillStyle(hex) {
            hbFillEl.style.backgroundColor = hexToCSSHex(hex);
        },
        // Allow direct x manipulation for positioning within the bar
        set x(_val) {
            // In the DOM version the fill is always left-aligned inside the bg,
            // so width alone controls the visual. No repositioning needed.
        },
        get x() { return 0; }
    };

    // prodIndicator (cities only): setText, setVisible, setBackgroundColor
    if (prodEl) {
        wrapper.prodIndicator = {
            setText(str) {
                prodEl.textContent = str;
            },
            setVisible(visible) {
                prodEl.style.display = visible ? '' : 'none';
            },
            setBackgroundColor(css) {
                prodEl.style.backgroundColor = css;
            }
        };
    }

    // ---- Set initial position ----
    wrapper.setDepth(DEPTH_PIECES);
    wrapper.x = cx;
    wrapper.y = cy;

    // ---- Health bar visibility ----
    const showHealth = piece.hp < piece.maxHp;
    wrapper.healthBarBg.setVisible(showHealth);
    wrapper.healthBarFill.setVisible(showHealth);

    // ---- Make interactive ----
    wrapper.setSize(TILE_SIZE - 10, TILE_SIZE - 10);
    wrapper.setInteractive({ draggable: true, useHandCursor: true });

    // ---- Apply grayscale if piece has already moved ----
    if (piece.hasMoved) {
        this.applyGrayscale(wrapper);
    }

    this.pieceSprites.set(piece.id, wrapper);

    // Initialize production indicator for cities with active production (e.g. after loading a save)
    if (piece.type === PIECE_TYPES.CITY && piece.production && wrapper.prodIndicator) {
        const prodType = PRODUCTION_TYPES[piece.production];
        wrapper.prodIndicator.setText(`${piece.productionProgress}/${prodType.turns}`);
        wrapper.prodIndicator.setVisible(true);
        wrapper.prodIndicator.setBackgroundColor(piece.productionPaused ? '#ff0000cc' : '#000000cc');
    }
};

GameScene.prototype.applyGrayscale = function(sprite) {
    if (sprite.isGrayscale) return;
    sprite.isGrayscale = true;

    sprite.el.style.filter = 'grayscale(1)';
    sprite.setDepth(DEPTH_PIECES_GRAYSCALE);
};

GameScene.prototype.removeGrayscale = function(sprite) {
    if (!sprite.isGrayscale) return;
    sprite.isGrayscale = false;

    sprite.el.style.filter = '';
    sprite.setDepth(DEPTH_PIECES);
};

GameScene.prototype.updatePieceSprite = function(piece) {
    const sprite = this.pieceSprites.get(piece.id);
    if (!sprite) return;

    // Ensure render cache is up to date
    PieceRenderCache.update();
    const cache = PieceRenderCache;

    const player = this.engine.players[piece.ownerId];

    // Update position
    sprite.x = BOARD_OFFSET + piece.col * TILE_SIZE + cache.halfTile;
    sprite.y = BOARD_OFFSET + piece.row * TILE_SIZE + cache.halfTile;

    // Update color (chunky pixel border)
    sprite.bgCircle.setStrokeStyle(Math.max(cache.strokeWidth + 1, 3), player.color.hex);
    sprite.pieceText.setColor(player.color.css);

    // Update health bar visibility
    const showHealth = piece.hp < piece.maxHp;
    sprite.healthBarBg.setVisible(showHealth);
    sprite.healthBarFill.setVisible(showHealth);

    if (showHealth) {
        const healthPercent = piece.hp / piece.maxHp;
        const barWidth = sprite.healthBarWidth;
        const barHeight = cache.healthBarHeight - 2;
        sprite.healthBarFill.setSize(barWidth * healthPercent, barHeight);

        // Color based on health
        const color = healthPercent < 0.3 ? 0xff0000 : healthPercent < 0.6 ? 0xffff00 : 0x00ff00;
        sprite.healthBarFill.setFillStyle(color);
    }

    // Update production indicator
    if (piece.type === PIECE_TYPES.CITY && sprite.prodIndicator) {
        if (piece.production) {
            const prodType = PRODUCTION_TYPES[piece.production];
            sprite.prodIndicator.setText(`${piece.productionProgress}/${prodType.turns}`);
            sprite.prodIndicator.setVisible(true);
            sprite.prodIndicator.setBackgroundColor(piece.productionPaused ? '#ff0000cc' : '#000000cc');
        } else {
            sprite.prodIndicator.setVisible(false);
        }
    }

    // Update grayscale based on movement state
    if (piece.hasMoved) {
        this.applyGrayscale(sprite);
    } else {
        this.removeGrayscale(sprite);
    }
};

GameScene.prototype.removePieceSprite = function(pieceId) {
    const sprite = this.pieceSprites.get(pieceId);
    if (!sprite) return;

    const size = TILE_SIZE;
    const cache = PieceRenderCache;
    const piece = sprite.pieceData;
    const player = this.engine.players[piece.ownerId];
    const originX = sprite.x;
    const originY = sprite.y;

    // --- Snapshot the piece to sample pixel colors (hard edges, no glow) ---
    const snapshot = document.createElement('canvas');
    snapshot.width = size;
    snapshot.height = size;
    const snapCtx = snapshot.getContext('2d');
    snapCtx.imageSmoothingEnabled = false;

    snapCtx.beginPath();
    snapCtx.arc(cache.halfTile, cache.halfTile, cache.circleRadius, 0, Math.PI * 2);
    snapCtx.fillStyle = 'rgba(26,26,58,0.95)';
    snapCtx.fill();
    snapCtx.lineWidth = Math.max(cache.strokeWidth + 1, 3);
    snapCtx.strokeStyle = player.color.css;
    snapCtx.stroke();

    snapCtx.font = cache.fontSize + 'px serif';
    snapCtx.fillStyle = player.color.css;
    snapCtx.textAlign = 'center';
    snapCtx.textBaseline = 'middle';
    snapCtx.fillText(PIECE_SYMBOLS[piece.type], cache.halfTile, cache.halfTile);

    // --- Sample snapshot into a 6x6 grid of chunky pixel-block particles ---
    const gridSize = 6;
    const blockSize = Math.floor(size / gridSize);
    const gridSnap = blockSize; // positions snap to this grid
    const imgData = snapCtx.getImageData(0, 0, size, size);
    const particles = [];

    for (let gy = 0; gy < gridSize; gy++) {
        for (let gx = 0; gx < gridSize; gx++) {
            const sx = Math.floor((gx + 0.5) * blockSize);
            const sy = Math.floor((gy + 0.5) * blockSize);
            const idx = (sy * size + sx) * 4;
            const a = imgData.data[idx + 3];
            if (a < 30) continue;

            // Quantize color to 8-bit palette (3-bit per channel: 8 levels)
            const r = (imgData.data[idx] >> 5) * 36;
            const g = (imgData.data[idx + 1] >> 5) * 36;
            const b = (imgData.data[idx + 2] >> 5) * 36;

            const px = gx * blockSize - size / 2 + blockSize / 2;
            const py = gy * blockSize - size / 2 + blockSize / 2;
            const angle = Math.atan2(py, px) + (Math.random() - 0.5) * 1.0;
            const speed = 15 + Math.random() * 25;

            // Discrete vanish time — block pops out of existence at this t
            const vanishAt = 0.4 + Math.random() * 0.5;

            particles.push({
                x: px, y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: 'rgb(' + r + ',' + g + ',' + b + ')',
                size: blockSize,
                delay: Math.random() * 0.15,
                vanishAt: vanishAt
            });
        }
    }

    // --- Single particle canvas, positioned over the piece ---
    const spread = 50;
    const canvasW = size + spread * 2;
    const canvasH = size + spread * 2;
    const particleCanvas = document.createElement('canvas');
    particleCanvas.width = canvasW;
    particleCanvas.height = canvasH;
    particleCanvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges;z-index:100;';
    particleCanvas.style.width = canvasW + 'px';
    particleCanvas.style.height = canvasH + 'px';
    particleCanvas.style.transform = 'translate(' + (originX - canvasW / 2) + 'px,' + (originY - canvasH / 2) + 'px)';
    this.pieceContainer.appendChild(particleCanvas);
    const pCtx = particleCanvas.getContext('2d');
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    // Remove original sprite immediately
    sprite.destroy();
    this.pieceSprites.delete(pieceId);

    // Extend notification hold to cover this derez + 1 second, so achievement
    // toasts cannot appear while the derez animation is still playing.
    if (typeof achievementManager !== 'undefined') {
        achievementManager._notifHoldUntil = Math.max(
            achievementManager._notifHoldUntil || 0,
            Date.now() + 600 + 500
        );
    }

    // --- Drive the particle animation with a single tween ---
    const timer = { t: 0 };
    this.tweens.add({
        targets: timer,
        t: 1,
        duration: 600,
        ease: 'Linear',
        onUpdate: (t) => {
            pCtx.clearRect(0, 0, canvasW, canvasH);

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                const localT = t <= p.delay ? 0 : (t - p.delay) / (1 - p.delay);

                // Block pops out of existence at its vanish time
                if (localT >= p.vanishAt) continue;

                // Snap position to grid for 8-bit stepped movement
                const rawX = p.x + p.vx * localT;
                const rawY = p.y + p.vy * localT + 15 * localT * localT;
                const px = Math.round(rawX / gridSnap) * gridSnap;
                const py = Math.round(rawY / gridSnap) * gridSnap;

                pCtx.globalAlpha = 1;
                pCtx.fillStyle = p.color;
                pCtx.fillRect(
                    cx + px - p.size / 2,
                    cy + py - p.size / 2,
                    p.size, p.size
                );
            }
            pCtx.globalAlpha = 1;
        },
        onComplete: () => {
            if (particleCanvas.parentNode) {
                particleCanvas.parentNode.removeChild(particleCanvas);
            }
        }
    });
};

GameScene.prototype.refreshPieceSprites = function() {
    const existingIds = new Set(this.pieceSprites.keys());
    const pieces = this.engine.pieces;
    const currentPieceIds = new Set();

    // Single pass: collect current IDs and create new sprites
    for (let i = 0, len = pieces.length; i < len; i++) {
        const piece = pieces[i];
        currentPieceIds.add(piece.id);
        if (!existingIds.has(piece.id)) {
            this.createPieceSprite(piece);
        }
    }

    // Remove destroyed pieces
    for (const id of existingIds) {
        if (!currentPieceIds.has(id)) {
            const sprite = this.pieceSprites.get(id);
            if (sprite) {
                sprite.destroy();
                this.pieceSprites.delete(id);
            }
        }
    }

    // Update all existing pieces
    for (let i = 0, len = pieces.length; i < len; i++) {
        this.updatePieceSprite(pieces[i]);
    }

    // Signal the update loop that pieces may need position syncing
    this._pieceMoving = true;
};
