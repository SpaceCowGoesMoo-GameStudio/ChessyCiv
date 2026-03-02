// ============================================
// GAME SCENE - Input Module (DOM-based)
// ============================================
// Pointer Events on DOM elements replace Phaser's drag/click system.
// Piece sprites are plain object wrappers with x, y setters that
// apply CSS transforms; the TweenManager animates them directly.

GameScene.prototype.setupInput = function() {
    // ---- Remove old listeners (for scene reuse) ----
    // Stored handler refs are used so we can cleanly remove them.
    if (this._inputCleanup) {
        this._inputCleanup();
    }

    // ---- State ----
    let activeMoveHandler = null;
    let activeUpHandler = null;
    let _lastPreviewRow = -1;
    let _lastPreviewCol = -1;
    let _cachedBoardRect = null;

    // ---- Helper: find sprite wrapper from a DOM event ----
    const spriteFromEvent = (event) => {
        const el = event.target.closest('.piece');
        if (!el) return null;
        // Linear scan is fine — typical piece count is < 40
        for (const wrapper of this.pieceSprites.values()) {
            if (wrapper.el === el) return wrapper;
        }
        return null;
    };

    // ---- Helper: board-area-relative coords from a pointer event ----
    const boardCoords = (event) => {
        const rect = _cachedBoardRect || this.boardArea.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    };

    // Invalidate cached rect on resize
    const _onResize = () => { _cachedBoardRect = null; };
    window.addEventListener('resize', _onResize);

    // ---- Helper: tile from board-area-relative pixel coords ----
    const tileFromCoords = (bx, by) => {
        const col = Math.floor((bx - BOARD_OFFSET) / TILE_SIZE);
        const row = Math.floor((by - BOARD_OFFSET) / TILE_SIZE);
        return { row, col };
    };

    // ================================================================
    //  Drag system — pointerdown on pieceContainer
    // ================================================================
    const onPiecePointerDown = (event) => {
        // Block all input while AI is taking its turn
        if (this.isAITurnInProgress) return;

        // Only respond to primary button (left click / single touch)
        if (event.button && event.button !== 0) return;

        const sprite = spriteFromEvent(event);
        if (!sprite) return;

        const piece = sprite.pieceData;

        // Non-draggable pieces (cities, enemy units) can still be selected
        if (piece.ownerId !== this.engine.currentPlayerIndex || piece.type === PIECE_TYPES.CITY) {
            event.preventDefault();

            // If we already have a piece selected, try to attack/move to this target
            if (this.selectedPiece && !this.draggedPiece) {
                const sel = this.selectedPiece.pieceData;
                if (sel.ownerId === this.engine.currentPlayerIndex && sel.type !== PIECE_TYPES.CITY) {
                    const result = this.engine.movePiece(sel, piece.row, piece.col);
                    if (result.success) {
                        this.dequeueMovement(sel.id);
                        this.onMoveSuccessAnimated(sel, result, this.getPlayerWarriorCount(sel.ownerId));
                        return;
                    }
                    // Move failed — try to enqueue multi-turn path to this target
                    if (this.enqueueMovement(sel, piece.row, piece.col)) {
                        this.deselectPiece();
                        return;
                    }
                }
            }

            this.selectPiece(sprite);
            return;
        }

        // Prevent default to avoid text selection / scrolling on touch
        event.preventDefault();

        // Cache bounding rect for the duration of the drag
        _cachedBoardRect = this.boardArea.getBoundingClientRect();

        // Begin drag
        this.draggedPiece = sprite;
        this.originalPosition = { x: sprite.x, y: sprite.y };
        this.hasDragged = false;

        sprite.setDepth(DEPTH_PIECES + 10);
        this.tweens.add({
            targets: sprite,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 100
        });

        this.showValidMoves(piece);

        // ---- pointermove on document ----
        activeMoveHandler = (moveEvent) => {
            if (this.draggedPiece !== sprite) return;
            this.hasDragged = true;

            const coords = boardCoords(moveEvent);
            sprite.x = coords.x;
            sprite.y = coords.y;

            // Throttled drag queue preview — only redraw when hovered tile changes
            const { row: hoverRow, col: hoverCol } = tileFromCoords(coords.x, coords.y);
            if (hoverRow !== _lastPreviewRow || hoverCol !== _lastPreviewCol) {
                _lastPreviewRow = hoverRow;
                _lastPreviewCol = hoverCol;
                // Force redraw to clear previous preview lines (uses cached border canvas)
                this.drawOwnership(true);
                if (this.engine.isValidTile(hoverRow, hoverCol) &&
                    (hoverRow !== piece.row || hoverCol !== piece.col)) {
                    // Only show preview if the tile is beyond immediate move range
                    const canMove = this.engine.canMoveTo(piece, hoverRow, hoverCol);
                    if (!canMove.valid) {
                        this._drawDragQueuePreview(piece, hoverRow, hoverCol);
                    }
                }
            }
        };

        // ---- pointerup on document ----
        activeUpHandler = (upEvent) => {
            // Clean up document-level listeners immediately
            document.removeEventListener('pointermove', activeMoveHandler);
            document.removeEventListener('pointerup', activeUpHandler);
            activeMoveHandler = null;
            activeUpHandler = null;

            // Reset preview state and cached rect
            _lastPreviewRow = -1;
            _lastPreviewCol = -1;
            _cachedBoardRect = null;

            if (this.draggedPiece !== sprite) return;

            // Restore depth and scale
            sprite.setDepth(DEPTH_PIECES);
            this.tweens.add({
                targets: sprite,
                scaleX: 1,
                scaleY: 1,
                duration: 100
            });

            const piece = sprite.pieceData;
            const coords = boardCoords(upEvent);
            const { row: dropRow, col: dropCol } = tileFromCoords(coords.x, coords.y);
            const { row: origRow, col: origCol } = tileFromCoords(
                this.originalPosition.x, this.originalPosition.y
            );

            const droppedOnSameSquare = dropRow === origRow && dropCol === origCol;

            if (droppedOnSameSquare) {
                // Return to exact position and select the piece
                this.returnToOriginal(sprite);
                this.selectPiece(sprite);
            } else if (this.hasDragged) {
                // Attempt the move
                if (this.engine.isValidTile(dropRow, dropCol)) {
                    const result = this.engine.movePiece(piece, dropRow, dropCol);
                    if (result.success) {
                        // Clear any existing queue for this piece on successful move
                        this.dequeueMovement(piece.id);
                        this.onMoveSuccess(piece, result, this.getPlayerWarriorCount(piece.ownerId));
                    } else {
                        // Move failed — try to enqueue multi-turn path
                        if (this.enqueueMovement(piece, dropRow, dropCol)) {
                            // Path enqueued, return piece to original position
                            this.returnToOriginal(sprite);
                        } else {
                            this.returnToOriginal(sprite);
                        }
                    }
                } else {
                    this.returnToOriginal(sprite);
                }

                this.clearHighlights();
            }

            this.draggedPiece = null;
        };

        document.addEventListener('pointermove', activeMoveHandler);
        document.addEventListener('pointerup', activeUpHandler);
    };

    this.pieceContainer.addEventListener('pointerdown', onPiecePointerDown);

    // ================================================================
    //  Click-to-select/move — pointerdown on boardCanvas
    // ================================================================
    const onBoardPointerDown = (event) => {
        // Block all input while AI is taking its turn
        if (this.isAITurnInProgress) return;

        // Ignore if a drag is in progress (the piece handler owns input)
        if (this.draggedPiece) return;

        // Ignore clicks when a popup is open
        if ((this.productionPopup && this.productionPopup.visible) ||
            (this.playersPopup && this.playersPopup.visible) ||
            (this.relationsPopup && this.relationsPopup.visible)) {
            return;
        }

        const coords = boardCoords(event);

        // Only process clicks within the board grid
        const boardLeft = BOARD_OFFSET;
        const boardRight = BOARD_OFFSET + BOARD_SIZE * TILE_SIZE;
        const boardTop = BOARD_OFFSET;
        const boardBottom = BOARD_OFFSET + BOARD_SIZE * TILE_SIZE;

        if (coords.x < boardLeft || coords.x >= boardRight ||
            coords.y < boardTop || coords.y >= boardBottom) {
            return;
        }

        const { row, col } = tileFromCoords(coords.x, coords.y);

        if (!this.engine.isValidTile(row, col)) {
            this.deselectPiece();
            return;
        }

        const clickedPiece = this.engine.board[row][col];

        // If a piece is already selected, try to move to the clicked tile
        if (this.selectedPiece && !this.draggedPiece) {
            const piece = this.selectedPiece.pieceData;

            if (piece.ownerId === this.engine.currentPlayerIndex && piece.type !== PIECE_TYPES.CITY) {
                const result = this.engine.movePiece(piece, row, col);
                if (result.success) {
                    // Clear any existing queue for this piece
                    this.dequeueMovement(piece.id);
                    this.onMoveSuccessAnimated(piece, result, this.getPlayerWarriorCount(piece.ownerId));
                    return;
                }

                // Move failed — try to enqueue multi-turn path
                if (this.enqueueMovement(piece, row, col)) {
                    this.deselectPiece();
                    return;
                }
            }
        }

        // Select clicked piece, or deselect if clicking empty tile
        if (clickedPiece) {
            this.selectPiece(this.pieceSprites.get(clickedPiece.id));
        } else {
            this.deselectPiece();
        }
    };

    this.boardCanvas.addEventListener('pointerdown', onBoardPointerDown);

    // ================================================================
    //  Right-click to cancel queued movement for selected piece
    // ================================================================
    const onContextMenu = (event) => {
        event.preventDefault();
        if (this.isAITurnInProgress) return;
        if (this.selectedPiece) {
            const pieceId = this.selectedPiece.pieceData.id;
            if (this.hasQueuedMovement(pieceId)) {
                this.dequeueMovement(pieceId);
            }
        }
    };

    this.boardArea.addEventListener('contextmenu', onContextMenu);

    // ================================================================
    //  Cheat mode — Alt+pointer for tile claiming, swapping, cloning
    //  Uses DevGame-style direct engine manipulation.
    // ================================================================
    const onCheatPointerDown = (event) => {
        if (!event.altKey) return;
        if (typeof uiController === 'undefined' || !uiController.cheatModeActive) return;

        event.preventDefault();
        event.stopPropagation();

        _cachedBoardRect = this.boardArea.getBoundingClientRect();
        const startCoords = boardCoords(event);
        const start = tileFromCoords(startCoords.x, startCoords.y);

        if (!this.engine.isValidTile(start.row, start.col)) return;

        const piece = this.engine.board[start.row][start.col];
        const tileOwner = this.engine.tileOwnership[start.row][start.col];

        let mode; // 'claim', 'swap', or 'clone'
        let cloneType, cloneOwner;

        if (piece) {
            // Piece on tile — clone mode
            mode = 'clone';
            cloneType = piece.type;
            cloneOwner = piece.ownerId;
        } else if (tileOwner !== null) {
            // Owned tile — swap all owned tiles to this owner
            mode = 'swap';
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    if (this.engine.tileOwnership[r][c] !== null) {
                        this.engine.tileOwnership[r][c] = tileOwner;
                    }
                }
            }
            this.drawOwnership(true);
        } else {
            // Empty unowned tile — claim for player 0
            mode = 'claim';
            this.engine.tileOwnership[start.row][start.col] = 0;
            this.drawOwnership(true);
        }

        let lastR = start.row;
        let lastC = start.col;

        const cheatMoveHandler = (moveEvent) => {
            const mc = boardCoords(moveEvent);
            const { row: r, col: c } = tileFromCoords(mc.x, mc.y);

            if (r === lastR && c === lastC) return;
            if (!this.engine.isValidTile(r, c)) return;
            lastR = r;
            lastC = c;

            if (mode === 'claim') {
                if (this.engine.tileOwnership[r][c] === null && !this.engine.board[r][c]) {
                    this.engine.tileOwnership[r][c] = 0;
                    this.drawOwnership(true);
                }
            } else if (mode === 'swap') {
                const owner = this.engine.tileOwnership[r][c];
                if (owner !== null) {
                    for (let rr = 0; rr < BOARD_SIZE; rr++) {
                        for (let cc = 0; cc < BOARD_SIZE; cc++) {
                            if (this.engine.tileOwnership[rr][cc] !== null) {
                                this.engine.tileOwnership[rr][cc] = owner;
                            }
                        }
                    }
                    this.drawOwnership(true);
                }
            } else if (mode === 'clone') {
                if (!this.engine.board[r][c]) {
                    const np = this.engine.createPiece(cloneType, cloneOwner, r, c);
                    this.engine.pieces.push(np);
                    this.engine.board[r][c] = np;
                    this.engine.tileOwnership[r][c] = cloneOwner;
                    this.createPieceSprite(np);
                    this.drawOwnership(true);
                }
            }
        };

        const cheatUpHandler = () => {
            document.removeEventListener('pointermove', cheatMoveHandler);
            document.removeEventListener('pointerup', cheatUpHandler);
            _cachedBoardRect = null;
        };

        document.addEventListener('pointermove', cheatMoveHandler);
        document.addEventListener('pointerup', cheatUpHandler);
    };

    // Capture phase so it fires before normal piece/board handlers
    this.boardArea.addEventListener('pointerdown', onCheatPointerDown, true);

    // ================================================================
    //  Cleanup function — stored so setupInput() can remove old listeners
    // ================================================================
    this._inputCleanup = () => {
        this.pieceContainer.removeEventListener('pointerdown', onPiecePointerDown);
        this.boardCanvas.removeEventListener('pointerdown', onBoardPointerDown);
        this.boardArea.removeEventListener('contextmenu', onContextMenu);
        this.boardArea.removeEventListener('pointerdown', onCheatPointerDown, true);
        window.removeEventListener('resize', _onResize);
        if (activeMoveHandler) {
            document.removeEventListener('pointermove', activeMoveHandler);
        }
        if (activeUpHandler) {
            document.removeEventListener('pointerup', activeUpHandler);
        }
        activeMoveHandler = null;
        activeUpHandler = null;
        _cachedBoardRect = null;
    };
};

// ============================================
// Selection
// ============================================

GameScene.prototype.selectPiece = function(sprite) {
    // Ensure render cache is up to date
    PieceRenderCache.update();

    // Deselect previous piece (restore its owner border color)
    if (this.selectedPiece) {
        this.selectedPiece.bgCircle.setStrokeStyle(PieceRenderCache.strokeWidth,
            this.engine.players[this.selectedPiece.pieceData.ownerId].color.hex);
    }

    this.selectedPiece = sprite;
    sprite.bgCircle.setStrokeStyle(PieceRenderCache.selectedStrokeWidth, 0xffffff);

    const piece = sprite.pieceData;
    this.clearHighlights();
    if (piece.ownerId === this.engine.currentPlayerIndex && piece.type !== PIECE_TYPES.CITY) {
        this.showValidMoves(piece);
    }

    this.updateSelectedInfo();
};

GameScene.prototype.deselectPiece = function() {
    // Ensure render cache is up to date
    PieceRenderCache.update();

    if (this.selectedPiece) {
        this.selectedPiece.bgCircle.setStrokeStyle(PieceRenderCache.strokeWidth,
            this.engine.players[this.selectedPiece.pieceData.ownerId].color.hex);
    }
    this.selectedPiece = null;
    this.clearHighlights();
    this.updateSelectedInfo();
    // Close production popup on mobile when deselecting
    this.hideProductionPopup();
};

// ============================================
// Valid move highlights
// ============================================

GameScene.prototype.showValidMoves = function(piece) {
    this.clearHighlights();

    const moves = this.engine.getValidMoves(piece);
    if (moves.length === 0) return;

    // Store moves so drawOwnership can redraw them after a board repaint
    this._lastHighlightMoves = moves;
    this._renderHighlightRects(moves);
};

/**
 * Render highlight rectangles on the board canvas.
 * Does NOT call drawOwnership — the caller is responsible for ensuring the
 * board is already drawn cleanly before invoking this.
 * Called from drawOwnership() to restore highlights after repainting the board.
 */
GameScene.prototype._renderHighlightRects = function(moves) {
    PieceRenderCache.update();
    const strokeWidth = PieceRenderCache.strokeWidth;
    const padding = Math.max(Math.floor(TILE_SIZE * 0.03), 1);
    const innerSize = TILE_SIZE - padding * 2;

    const ctx = this.boardCtx;
    ctx.save();
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = hexToRGBA(COLORS.highlight, 0.8);

    for (let i = 0, len = moves.length; i < len; i++) {
        const move = moves[i];
        const x = BOARD_OFFSET + move.col * TILE_SIZE + padding;
        const y = BOARD_OFFSET + move.row * TILE_SIZE + padding;
        ctx.strokeRect(x, y, innerSize, innerSize);
    }

    ctx.restore();
};

GameScene.prototype.clearHighlights = function() {
    this._lastHighlightMoves = null;
    // Redraw board to remove highlight rectangles
    this.drawOwnership(true);
};

// ============================================
// Return to original position
// ============================================

GameScene.prototype.returnToOriginal = function(sprite) {
    this.tweens.add({
        targets: sprite,
        x: this.originalPosition.x,
        y: this.originalPosition.y,
        duration: 200,
        ease: 'Back.easeOut'
    });
};
