// ============================================
// CIVCHESS LEVEL EDITOR
// ============================================
// Single-file editor: board rendering, tools, player management,
// win conditions, diplomacy, import/export, and playtest.

// ============================================
// SECTION: Color Utilities
// ============================================
// (Inlined from SceneManager.js which isn't loaded in the editor)

function _clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function _cssHexToHex(cssHex) {
    return parseInt(cssHex.replace('#', ''), 16);
}

function _rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s, l };
}

function _hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else               { r = c; g = 0; b = x; }
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

function _neonifyColor(cssHex) {
    const hex = _cssHexToHex(cssHex);
    const r = (hex >> 16) & 0xFF, g = (hex >> 8) & 0xFF, b = hex & 0xFF;
    const hsl = _rgbToHsl(r, g, b);
    const rgb = _hslToRgb(hsl.h, 1.0, _clamp(hsl.l, 0.45, 0.6));
    const intHex = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
    const css = '#' + intHex.toString(16).padStart(6, '0');
    return { name: 'Custom', hex: intHex, css };
}

// ============================================
// SECTION: LevelEditor Class
// ============================================

class LevelEditor {
    constructor() {
        // Backing model
        this.devGame = null;
        this.playerConfigs = [];

        // Tool state
        this.currentTool = 'city';
        this.currentPlayer = 0;
        this.selectedPiece = null;

        // Canvas state
        this.canvas = document.getElementById('editorCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.cellSize = this.canvas.width / BOARD_SIZE;
        this.hoverCell = null;
        this.isDragging = false;

        // Native color input elements (cleaned up on re-render)
        this._colorInputEls = [];

        // Win conditions
        this.conditionMode = 'and';
        this.conditions = [{ type: 'captureAllCities' }];

        // Diplomacy lock
        this.diplomacyLocked = false;

        // City selection mode for captureSpecificCities
        this.citySelectConditionIndex = null;

        // Playtest state
        this.ptEngine = null;
        this.ptAIManager = null;
        this.ptPlaying = false;
        this.ptTimer = null;
        this.ptTurnCount = 0;
        this.ptConfigs = [];

        this._init();
    }

    _init() {
        this._initDefaultGame();
        this._bindCanvas();
        this._bindKeyboard();
        this._bindTools();
        this._renderAll();
    }

    // ============================================
    // SECTION: Game Initialization
    // ============================================

    _initDefaultGame() {
        this.playerConfigs = [
            { color: PLAYER_COLORS[0], isAI: false, aiDifficulty: null, personality: null },
            { color: PLAYER_COLORS[1], isAI: true, aiDifficulty: 'hard', personality: 'expansionist' }
        ];
        this._createDevGame();
    }

    _createDevGame() {
        const configs = this.playerConfigs.map(c => ({
            color: c.color,
            isAI: c.isAI,
            aiDifficulty: c.aiDifficulty || 'medium'
        }));
        this.devGame = new DevGame('level-editor', configs);
        this.devGame.setSandboxMode(true);
        this.devGame.setGameEndingEnabled(false);
        this.devGame.setUndoEnabled(true);

        // Clear the default game setup (pieces placed by setupGame)
        this.devGame.clearBoard();
    }

    // ============================================
    // SECTION: Board Rendering
    // ============================================

    _renderBoard() {
        const ctx = this.ctx;
        const cs = this.cellSize;
        const engine = this.devGame.engine;

        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Checkerboard + territory
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const x = c * cs;
                const y = r * cs;

                // Checkerboard
                ctx.fillStyle = (r + c) % 2 === 0 ? '#3a3a5a' : '#2d2d44';
                ctx.fillRect(x, y, cs, cs);

                // Territory overlay
                const owner = engine.tileOwnership[r][c];
                if (owner !== null && this.playerConfigs[owner]) {
                    ctx.fillStyle = this.playerConfigs[owner].color.css + '33';
                    ctx.fillRect(x, y, cs, cs);
                }
            }
        }

        // Grid lines
        ctx.strokeStyle = '#00d4ff26';
        ctx.lineWidth = 1;
        for (let i = 0; i <= BOARD_SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cs, 0);
            ctx.lineTo(i * cs, this.canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * cs);
            ctx.lineTo(this.canvas.width, i * cs);
            ctx.stroke();
        }

        // Pieces
        engine.pieces.forEach(piece => {
            this._renderPiece(ctx, piece, cs);
        });

        // Hover ghost preview
        if (this.hoverCell && this.currentTool !== 'select') {
            this._renderHoverPreview(ctx, this.hoverCell.row, this.hoverCell.col, cs);
        }

        // Selection highlight
        if (this.selectedPiece) {
            const sx = this.selectedPiece.col * cs;
            const sy = this.selectedPiece.row * cs;
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 1, sy + 1, cs - 2, cs - 2);
        }

        // City-select mode markers
        if (this.citySelectConditionIndex !== null) {
            const cond = this.conditions[this.citySelectConditionIndex];
            if (cond && cond.cities) {
                cond.cities.forEach(c => {
                    const mx = c.col * cs + cs / 2;
                    const my = c.row * cs + cs / 2;
                    ctx.strokeStyle = '#ffff00';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(mx, my, cs * 0.45, 0, Math.PI * 2);
                    ctx.stroke();
                });
            }
        }
    }

    _renderPiece(ctx, piece, cs) {
        const cx = piece.col * cs + cs / 2;
        const cy = piece.row * cs + cs / 2;
        const radius = cs * 0.35;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = this.playerConfigs[piece.ownerId]
            ? this.playerConfigs[piece.ownerId].color.css
            : '#fff';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const letter = piece.type === 'city' ? 'C' : piece.type === 'warrior' ? 'W' : 'S';
        ctx.fillStyle = '#000';
        ctx.font = 'bold ' + Math.floor(cs * 0.4) + 'px VT323';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, cx, cy + 1);

        // City HP bar
        if (piece.type === 'city' && piece.hp < piece.maxHp) {
            const barW = cs * 0.6;
            const barH = 3;
            const barX = cx - barW / 2;
            const barY = cy + radius + 3;
            ctx.fillStyle = '#ff4444';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = '#00ff88';
            ctx.fillRect(barX, barY, barW * (piece.hp / piece.maxHp), barH);
        }
    }

    _renderHoverPreview(ctx, row, col, cs) {
        const x = col * cs + cs / 2;
        const y = row * cs + cs / 2;

        if (this.currentTool === 'erase') {
            // Red X preview
            ctx.strokeStyle = '#ff444488';
            ctx.lineWidth = 2;
            const s = cs * 0.25;
            ctx.beginPath();
            ctx.moveTo(x - s, y - s);
            ctx.lineTo(x + s, y + s);
            ctx.moveTo(x + s, y - s);
            ctx.lineTo(x - s, y + s);
            ctx.stroke();
        } else if (this.currentTool === 'territory') {
            // Territory fill preview
            ctx.fillStyle = (this.playerConfigs[this.currentPlayer]
                ? this.playerConfigs[this.currentPlayer].color.css : '#00d4ff') + '44';
            ctx.fillRect(col * cs, row * cs, cs, cs);
        } else if (['city', 'warrior', 'settler'].includes(this.currentTool)) {
            // Ghost piece
            const radius = cs * 0.35;
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = this.playerConfigs[this.currentPlayer]
                ? this.playerConfigs[this.currentPlayer].color.css : '#fff';
            ctx.fill();
            const letter = this.currentTool === 'city' ? 'C' : this.currentTool === 'warrior' ? 'W' : 'S';
            ctx.fillStyle = '#000';
            ctx.font = 'bold ' + Math.floor(cs * 0.4) + 'px VT323';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(letter, x, y + 1);
            ctx.globalAlpha = 1;
        }
    }

    // ============================================
    // SECTION: Canvas Input Handling
    // ============================================

    _bindCanvas() {
        this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        this.canvas.addEventListener('mouseup', () => this._onMouseUp());
        this.canvas.addEventListener('mouseleave', () => {
            this.hoverCell = null;
            this._renderBoard();
        });
        this.canvas.addEventListener('contextmenu', e => {
            e.preventDefault();
            const cell = this._getCellFromEvent(e);
            if (cell) this._eraseAt(cell.row, cell.col);
        });
    }

    _getCellFromEvent(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
        return { row, col };
    }

    _onMouseMove(e) {
        const cell = this._getCellFromEvent(e);
        this.hoverCell = cell;
        if (cell) {
            this._updateTileInfo(cell.row, cell.col);
            if (this.isDragging) {
                this._applyToolDrag(cell.row, cell.col);
            }
        }
        this._renderBoard();
    }

    _onMouseDown(e) {
        if (e.button !== 0) return;
        const cell = this._getCellFromEvent(e);
        if (!cell) return;

        // City-select mode intercept
        if (this.citySelectConditionIndex !== null) {
            this._toggleCitySelect(cell.row, cell.col);
            return;
        }

        this.isDragging = true;
        this._applyTool(cell.row, cell.col);
    }

    _onMouseUp() {
        this.isDragging = false;
    }

    _applyTool(row, col) {
        const engine = this.devGame.engine;
        switch (this.currentTool) {
            case 'city':
                if (!engine.board[row][col]) {
                    this.devGame.createCity(this.currentPlayer, row, col);
                }
                break;
            case 'warrior':
                if (!engine.board[row][col]) {
                    // _placePiece auto-claims territory; preserve existing ownership
                    const prevOwner = engine.tileOwnership[row][col];
                    this.devGame.createWarrior(this.currentPlayer, row, col);
                    engine.tileOwnership[row][col] = prevOwner;
                }
                break;
            case 'settler':
                if (!engine.board[row][col]) {
                    const prevOwner = engine.tileOwnership[row][col];
                    this.devGame.createSettler(this.currentPlayer, row, col);
                    engine.tileOwnership[row][col] = prevOwner;
                }
                break;
            case 'territory':
                this.devGame.setTileOwner(row, col, this.currentPlayer);
                break;
            case 'erase':
                this._eraseAt(row, col);
                break;
            case 'select':
                this._selectPieceAt(row, col);
                break;
        }
        this._renderAll();
    }

    _applyToolDrag(row, col) {
        if (this.currentTool === 'territory') {
            this.devGame.setTileOwner(row, col, this.currentPlayer);
            this._renderBoard();
            this._updatePieceCount();
        } else if (this.currentTool === 'erase') {
            this._eraseAt(row, col);
            this._renderBoard();
            this._updatePieceCount();
        }
    }

    _eraseAt(row, col) {
        this.devGame.removePiece(row, col);
        this.devGame.setTileOwner(row, col, null);
        if (this.selectedPiece && this.selectedPiece.row === row && this.selectedPiece.col === col) {
            this.selectedPiece = null;
            this._hidePieceInfo();
        }
        this._renderAll();
    }

    _selectPieceAt(row, col) {
        const piece = this.devGame.engine.board[row][col];
        if (piece) {
            this.selectedPiece = piece;
            this._showPieceInfo(piece);
        } else {
            this.selectedPiece = null;
            this._hidePieceInfo();
        }
    }

    _toggleCitySelect(row, col) {
        const cond = this.conditions[this.citySelectConditionIndex];
        if (!cond) return;
        const piece = this.devGame.engine.board[row][col];
        if (!piece || piece.type !== 'city') return;

        if (!cond.cities) cond.cities = [];
        const idx = cond.cities.findIndex(c => c.row === row && c.col === col);
        if (idx >= 0) {
            cond.cities.splice(idx, 1);
        } else {
            cond.cities.push({ row, col });
        }
        this._renderBoard();
        this._renderConditions();
    }

    // ============================================
    // SECTION: Piece Info Panel
    // ============================================

    _showPieceInfo(piece) {
        const panel = document.getElementById('pieceInfoPanel');
        const content = document.getElementById('pieceInfoContent');
        panel.style.display = '';

        const color = this.playerConfigs[piece.ownerId]
            ? this.playerConfigs[piece.ownerId].color.css : '#fff';

        let html = '<div class="info-row"><span class="info-label">Type:</span>'
            + '<span class="info-value">' + piece.type + '</span></div>';
        html += '<div class="info-row"><span class="info-label">Owner:</span>'
            + '<span class="info-value" style="color:' + color + '">P' + (piece.ownerId + 1) + '</span></div>';
        html += '<div class="info-row"><span class="info-label">Position:</span>'
            + '<span class="info-value">(' + piece.row + ',' + piece.col + ')</span></div>';

        if (piece.type === 'city') {
            html += '<div class="info-row"><span class="info-label">HP:</span>'
                + '<input type="number" min="1" max="' + piece.maxHp + '" value="' + piece.hp
                + '" onchange="editor.setPieceHp(' + piece.row + ',' + piece.col + ',this.value)"></div>';
            html += '<div class="info-row"><span class="info-label">Max HP:</span>'
                + '<input type="number" min="1" max="20" value="' + piece.maxHp
                + '" onchange="editor.setPieceMaxHp(' + piece.row + ',' + piece.col + ',this.value)"></div>';
        }

        content.innerHTML = html;
    }

    _hidePieceInfo() {
        document.getElementById('pieceInfoPanel').style.display = 'none';
    }

    setPieceHp(row, col, val) {
        this.devGame.setPieceHp(row, col, parseInt(val) || 1);
        this._renderBoard();
    }

    setPieceMaxHp(row, col, val) {
        this.devGame.setPieceMaxHp(row, col, parseInt(val) || 1);
        const piece = this.devGame.engine.board[row][col];
        if (piece) this._showPieceInfo(piece);
        this._renderBoard();
    }

    // ============================================
    // SECTION: Toolbar & Keyboard
    // ============================================

    _bindTools() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._setTool(btn.dataset.tool);
            });
        });
    }

    _setTool(tool) {
        this.currentTool = tool;
        // Exit city-select mode when switching tools
        this.citySelectConditionIndex = null;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        if (tool !== 'select') {
            this.selectedPiece = null;
            this._hidePieceInfo();
        }
        this._renderBoard();
    }

    _bindKeyboard() {
        document.addEventListener('keydown', e => {
            // Don't intercept when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

            switch (e.key) {
                case '1': this._setTool('city'); break;
                case '2': this._setTool('warrior'); break;
                case '3': this._setTool('settler'); break;
                case '4': this._setTool('territory'); break;
                case '5': this._setTool('erase'); break;
                case '6': this._setTool('select'); break;
                case 'z':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (e.shiftKey) this.redo();
                        else this.undo();
                    }
                    break;
                case 'Escape':
                    this.citySelectConditionIndex = null;
                    this._renderBoard();
                    break;
            }
        });
    }

    // ============================================
    // SECTION: Player Management
    // ============================================

    _renderPlayerList() {
        // Clean up previous native color inputs
        if (this._colorInputEls) {
            this._colorInputEls.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
        }
        this._colorInputEls = [];

        const container = document.getElementById('playerList');
        let html = '';
        this.playerConfigs.forEach((cfg, i) => {
            const active = i === this.currentPlayer ? ' active' : '';
            const isAI = cfg.isAI;
            html += '<div class="player-item' + active + '" onclick="editor.selectPlayer(' + i + ')" data-player="' + i + '">';
            // Color input placeholder — native input will be positioned over this
            html += '<span class="player-color-wrap" id="colorWrap' + i + '"></span>';
            html += '<span class="player-name" style="color:' + cfg.color.css + '">P' + (i + 1) + '</span>';
            if (isAI) html += '<span class="player-ai-badge">AI</span>';
            if (this.playerConfigs.length > 2) {
                html += '<button class="player-remove" onclick="event.stopPropagation();editor.removePlayer(' + i + ')">x</button>';
            }
            html += '</div>';
        });
        container.innerHTML = html;

        // Create native <input type="color"> for each player, positioned inside the wrap
        this.playerConfigs.forEach((cfg, i) => {
            const wrap = document.getElementById('colorWrap' + i);
            if (!wrap) return;
            const input = document.createElement('input');
            input.type = 'color';
            input.value = cfg.color.css;
            input.className = 'player-color-input';
            input.dataset.player = i;
            input.title = 'Pick color for P' + (i + 1);
            input.addEventListener('click', e => e.stopPropagation());
            input.addEventListener('input', e => {
                this.setPlayerColor(parseInt(e.target.dataset.player), e.target.value);
            });
            wrap.appendChild(input);
            this._colorInputEls.push(input);
        });

        // Show/hide add button
        document.getElementById('addPlayerBtn').style.display =
            this.playerConfigs.length >= 4 ? 'none' : '';

        this._renderStartingPlayerSelect();
    }

    selectPlayer(index) {
        this.currentPlayer = index;
        this._renderPlayerList();
    }

    setPlayerColor(playerIndex, cssHex) {
        // Neonify the picked color so it glows on the dark background
        const color = _neonifyColor(cssHex);
        this.playerConfigs[playerIndex].color = color;
        // Update the engine's player color too so export picks it up
        const enginePlayer = this.devGame.engine.players[playerIndex];
        if (enginePlayer) enginePlayer.color = color;
        // Render board/diplomacy/conditions without rebuilding the player list
        // (rebuilding would destroy the active color picker dialog)
        this._renderBoard();
        this._renderDiplomacy();
        this._renderConditions();
        this._updatePieceCount();
        // Update just the label color and input value in-place
        this._syncPlayerColorInputs();
    }

    _syncPlayerColorInputs() {
        if (!this._colorInputEls) return;
        this._colorInputEls.forEach(el => {
            const i = parseInt(el.dataset.player);
            const cfg = this.playerConfigs[i];
            if (!cfg) return;
            el.value = cfg.color.css;
        });
        // Update name label colors
        this.playerConfigs.forEach((cfg, i) => {
            const item = document.querySelector('.player-item[data-player="' + i + '"]');
            if (!item) return;
            const name = item.querySelector('.player-name');
            if (name) name.style.color = cfg.color.css;
        });
        this._renderStartingPlayerSelect();
    }

    addPlayer() {
        if (this.playerConfigs.length >= 4) return;
        // Pick the first color not already in use
        const usedCss = new Set(this.playerConfigs.map(c => c.color.css));
        const color = PLAYER_COLORS.find(pc => !usedCss.has(pc.css)) || PLAYER_COLORS[this.playerConfigs.length];
        this.playerConfigs.push({
            color: color,
            isAI: true,
            aiDifficulty: 'hard',
            personality: 'expansionist'
        });
        this.devGame.addPlayer({ isAI: true, aiDifficulty: 'hard' });
        // Sync the engine player's color
        const newPlayer = this.devGame.engine.players[this.playerConfigs.length - 1];
        if (newPlayer) newPlayer.color = color;
        this._renderAll();
    }

    removePlayer(index) {
        if (this.playerConfigs.length <= 2) return;

        const engine = this.devGame.engine;

        // Snapshot current board state
        const savedPieces = engine.pieces
            .filter(p => p.ownerId !== index)
            .map(p => ({ type: p.type, ownerId: p.ownerId, row: p.row, col: p.col, hp: p.hp, maxHp: p.maxHp }));
        const savedOwnership = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            savedOwnership.push([]);
            for (let c = 0; c < BOARD_SIZE; c++) {
                savedOwnership[r].push(engine.tileOwnership[r][c]);
            }
        }
        // Snapshot diplomacy for surviving players
        const savedRelations = {};
        engine.players.forEach((p, i) => {
            if (i !== index) savedRelations[i] = { ...p.relations };
        });

        // Remap IDs: players after the removed index shift down by 1
        const remap = id => id > index ? id - 1 : id;
        savedPieces.forEach(p => { p.ownerId = remap(p.ownerId); });
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const o = savedOwnership[r][c];
                if (o === index) savedOwnership[r][c] = null;
                else if (o !== null) savedOwnership[r][c] = remap(o);
            }
        }

        // Remove from playerConfigs
        this.playerConfigs.splice(index, 1);
        if (this.currentPlayer >= this.playerConfigs.length) {
            this.currentPlayer = this.playerConfigs.length - 1;
        } else if (this.currentPlayer > index) {
            this.currentPlayer--;
        }

        // Recreate DevGame with new player count
        this._createDevGame();

        // Restore diplomacy with remapped IDs
        for (const oldId in savedRelations) {
            const newId = remap(parseInt(oldId));
            const rels = savedRelations[oldId];
            for (const oldTarget in rels) {
                const ti = parseInt(oldTarget);
                if (ti === index) continue;
                const newTarget = remap(ti);
                this.devGame.setPlayerRelation(newId, newTarget, rels[oldTarget]);
            }
        }

        // Restore pieces first (this auto-claims territory per tile)
        savedPieces.forEach(p => {
            this.devGame._placePiece(p.type, p.ownerId, p.row, p.col, p.hp, p.maxHp);
        });

        // Then restore tile ownership, overriding auto-claims
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                this.devGame.engine.tileOwnership[r][c] = savedOwnership[r][c];
            }
        }

        // Remap win condition player references
        this.conditions.forEach(cond => {
            if (cond.type === 'eliminatePlayer' && cond.playerId !== undefined) {
                if (cond.playerId === index) cond.playerId = 0;
                else cond.playerId = remap(cond.playerId);
            }
        });

        this.devGame.clearUndoHistory();
        this._renderAll();
    }

    // ============================================
    // SECTION: Diplomacy Panel
    // ============================================

    _renderDiplomacy() {
        const container = document.getElementById('diplomacyList');
        const players = this.devGame.engine.players;
        let html = '';

        // Lock toggle
        html += '<div class="diplo-lock-row">';
        html += '<label class="diplo-lock-label">';
        html += '<input type="checkbox" id="diplomacyLockToggle"'
            + (this.diplomacyLocked ? ' checked' : '')
            + ' onchange="editor.toggleDiplomacyLock(this.checked)">';
        html += ' Lock relations</label>';
        html += '<span class="diplo-lock-hint">Prevent changes in-game</span>';
        html += '</div>';

        for (let i = 0; i < players.length; i++) {
            if (players[i].eliminated) continue;
            for (let j = i + 1; j < players.length; j++) {
                if (players[j].eliminated) continue;
                const rel = players[i].relations[j] || 'peace';
                const isWar = rel === 'war';
                html += '<div class="diplo-row">';
                html += '<span class="diplo-label">'
                    + '<span style="color:' + this.playerConfigs[i].color.css + '">P' + (i + 1) + '</span>'
                    + ' ↔ '
                    + '<span style="color:' + this.playerConfigs[j].color.css + '">P' + (j + 1) + '</span>'
                    + '</span>';
                html += '<button class="diplo-toggle' + (isWar ? ' war' : '') + '" '
                    + 'onclick="editor.toggleDiplomacy(' + i + ',' + j + ')">'
                    + rel + '</button>';
                html += '</div>';
            }
        }

        if (players.filter(p => !p.eliminated).length < 2) {
            html += '<div style="color:#666;font-size:14px">Add more players for diplomacy</div>';
        }
        container.innerHTML = html;
    }

    toggleDiplomacyLock(locked) {
        this.diplomacyLocked = locked;
    }

    toggleDiplomacy(i, j) {
        const players = this.devGame.engine.players;
        const current = players[i].relations[j] || 'peace';
        const next = current === 'peace' ? 'war' : 'peace';
        this.devGame.setPlayerRelationSymmetric(i, j, next);
        this._renderDiplomacy();
    }

    // ============================================
    // SECTION: Win Conditions
    // ============================================

    _renderConditions() {
        const container = document.getElementById('conditionList');
        let html = '';

        this.conditions.forEach((cond, idx) => {
            html += '<div class="condition-item">';
            html += '<div class="condition-header">';
            html += '<span class="condition-type">' + this._conditionLabel(cond.type) + '</span>';
            html += '<button class="condition-remove" onclick="editor.removeCondition(' + idx + ')">x</button>';
            html += '</div>';
            html += '<div class="condition-params">';
            html += this._conditionParamsHTML(cond, idx);
            html += '</div></div>';
        });

        if (!html) html = '<div style="color:#666;font-size:14px">No win conditions (freeplay)</div>';
        container.innerHTML = html;

        // Mode buttons
        document.getElementById('modeAnd').classList.toggle('active', this.conditionMode === 'and');
        document.getElementById('modeOr').classList.toggle('active', this.conditionMode === 'or');
    }

    _conditionLabel(type) {
        const labels = {
            captureAllCities: 'Capture All Cities',
            captureSpecificCities: 'Capture Specific Cities',
            eliminatePlayer: 'Eliminate Player',
            controlTerritory: 'Control Territory %',
            surviveTurns: 'Survive N Turns',
            reachTechLevel: 'Reach Tech Level',
            killWarriors: 'Kill N Warriors'
        };
        return labels[type] || type;
    }

    _conditionParamsHTML(cond, idx) {
        const players = this.devGame.engine.players;
        switch (cond.type) {
            case 'captureAllCities':
                return '<span style="color:#666;font-size:13px">Standard victory</span>';

            case 'captureSpecificCities': {
                const count = (cond.cities || []).length;
                const selecting = this.citySelectConditionIndex === idx;
                return '<span style="font-size:13px">' + count + ' cities selected</span>'
                    + '<button class="btn btn-sm' + (selecting ? ' active' : '') + '" '
                    + 'onclick="editor.toggleCitySelectMode(' + idx + ')">'
                    + (selecting ? 'Done Selecting' : 'Select Cities') + '</button>';
            }

            case 'eliminatePlayer': {
                let opts = '';
                players.forEach((p, i) => {
                    if (!p.eliminated) {
                        opts += '<option value="' + i + '"' + (cond.playerId === i ? ' selected' : '') + '>'
                            + 'P' + (i + 1) + ' - ' + (this.playerConfigs[i] ? this.playerConfigs[i].color.name : '') + '</option>';
                    }
                });
                return '<label>Target Player</label><select onchange="editor.updateCondition(' + idx + ',\'playerId\',parseInt(this.value))">' + opts + '</select>';
            }

            case 'controlTerritory':
                return '<label>Percentage</label><input type="number" min="10" max="100" value="' + (cond.percentage || 50)
                    + '" onchange="editor.updateCondition(' + idx + ',\'percentage\',parseInt(this.value))">';

            case 'surviveTurns':
                return '<label>Turns</label><input type="number" min="1" max="999" value="' + (cond.turns || 30)
                    + '" onchange="editor.updateCondition(' + idx + ',\'turns\',parseInt(this.value))">';

            case 'reachTechLevel':
                return '<label>Tech Level</label><input type="number" min="1" max="100" value="' + (cond.level || 10)
                    + '" onchange="editor.updateCondition(' + idx + ',\'level\',parseInt(this.value))">';

            case 'killWarriors':
                return '<label>Kill Count</label><input type="number" min="1" max="999" value="' + (cond.count || 10)
                    + '" onchange="editor.updateCondition(' + idx + ',\'count\',parseInt(this.value))">';

            default:
                return '';
        }
    }

    setConditionMode(mode) {
        this.conditionMode = mode;
        this._renderConditions();
    }

    addCondition() {
        // Show a type picker via simple prompt-style dropdown
        const types = [
            'captureAllCities', 'captureSpecificCities', 'eliminatePlayer',
            'controlTerritory', 'surviveTurns', 'reachTechLevel', 'killWarriors'
        ];

        // Create a temporary select element
        const sel = document.createElement('select');
        sel.className = 'field-input';
        sel.style.position = 'fixed';
        sel.style.top = '50%';
        sel.style.left = '50%';
        sel.style.transform = 'translate(-50%,-50%)';
        sel.style.zIndex = '10000';
        sel.style.width = '250px';
        sel.style.fontSize = '18px';

        const placeholder = document.createElement('option');
        placeholder.textContent = '-- Select condition type --';
        placeholder.value = '';
        sel.appendChild(placeholder);

        types.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = this._conditionLabel(t);
            sel.appendChild(opt);
        });

        document.body.appendChild(sel);
        sel.focus();

        sel.addEventListener('change', () => {
            const type = sel.value;
            if (type) {
                const cond = { type };
                if (type === 'captureSpecificCities') cond.cities = [];
                if (type === 'eliminatePlayer') cond.playerId = 0;
                if (type === 'controlTerritory') cond.percentage = 50;
                if (type === 'surviveTurns') cond.turns = 30;
                if (type === 'reachTechLevel') cond.level = 10;
                if (type === 'killWarriors') cond.count = 10;
                this.conditions.push(cond);
                this._renderConditions();
            }
            sel.remove();
        });

        sel.addEventListener('blur', () => {
            setTimeout(() => sel.remove(), 100);
        });
    }

    removeCondition(index) {
        if (this.citySelectConditionIndex === index) {
            this.citySelectConditionIndex = null;
        }
        this.conditions.splice(index, 1);
        this._renderConditions();
        this._renderBoard();
    }

    updateCondition(index, key, value) {
        if (this.conditions[index]) {
            this.conditions[index][key] = value;
        }
    }

    toggleCitySelectMode(index) {
        if (this.citySelectConditionIndex === index) {
            this.citySelectConditionIndex = null;
        } else {
            this.citySelectConditionIndex = index;
        }
        this._renderConditions();
        this._renderBoard();
    }

    // ============================================
    // SECTION: Starting Player
    // ============================================

    _renderStartingPlayerSelect() {
        const sel = document.getElementById('startingPlayer');
        let html = '';
        this.playerConfigs.forEach((cfg, i) => {
            const player = this.devGame.engine.players[i];
            if (player && !player.eliminated) {
                html += '<option value="' + i + '"'
                    + (this.devGame.engine.currentPlayerIndex === i ? ' selected' : '') + '>'
                    + 'P' + (i + 1) + ' - ' + cfg.color.name + '</option>';
            }
        });
        sel.innerHTML = html;
    }

    setStartingPlayer() {
        const val = parseInt(document.getElementById('startingPlayer').value);
        this.devGame.setCurrentPlayer(val);
    }

    // ============================================
    // SECTION: Status Bar
    // ============================================

    _updateTileInfo(row, col) {
        const engine = this.devGame.engine;
        const piece = engine.board[row][col];
        const owner = engine.tileOwnership[row][col];
        let text = '(' + row + ',' + col + ')';
        if (owner !== null) text += ' Owner: P' + (owner + 1);
        if (piece) text += ' | ' + piece.type + ' [P' + (piece.ownerId + 1) + ']';
        document.getElementById('tileInfo').textContent = text;
    }

    _updatePieceCount() {
        const pieces = this.devGame.engine.pieces;
        const cities = pieces.filter(p => p.type === 'city').length;
        const warriors = pieces.filter(p => p.type === 'warrior').length;
        const settlers = pieces.filter(p => p.type === 'settler').length;
        document.getElementById('pieceCount').textContent =
            'C:' + cities + ' W:' + warriors + ' S:' + settlers;
    }

    // ============================================
    // SECTION: Undo / Redo
    // ============================================

    undo() {
        const result = this.devGame.undo();
        if (result && result.success) {
            this.selectedPiece = null;
            this._hidePieceInfo();
            this._renderAll();
        }
    }

    redo() {
        const result = this.devGame.redo();
        if (result && result.success) {
            this.selectedPiece = null;
            this._hidePieceInfo();
            this._renderAll();
        }
    }

    // ============================================
    // SECTION: New Level
    // ============================================

    newLevel() {
        if (!confirm('Clear current level and start fresh?')) return;
        this.selectedPiece = null;
        this._hidePieceInfo();
        this.conditions = [{ type: 'captureAllCities' }];
        this.conditionMode = 'and';
        this.diplomacyLocked = false;
        this.citySelectConditionIndex = null;
        document.getElementById('levelName').value = '';
        document.getElementById('levelDesc').value = '';
        document.getElementById('levelAuthor').value = '';
        this._initDefaultGame();
        this._renderAll();
    }

    // ============================================
    // SECTION: Import / Export
    // ============================================

    exportLevel() {
        const level = this._buildLevelJSON();
        const blob = new Blob([JSON.stringify(level, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (level.metadata.name || 'untitled-level') + '.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    importLevel() {
        document.getElementById('importFileInput').click();
    }

    handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);
                this._loadLevelJSON(data);
            } catch (err) {
                alert('Failed to import level: ' + err.message);
            }
        };
        reader.readAsText(file);
        // Reset input so same file can be re-imported
        event.target.value = '';
    }

    _buildLevelJSON() {
        const engine = this.devGame.engine;
        const players = [];

        engine.players.forEach((p, i) => {
            if (p.eliminated) return;
            const cfg = this.playerConfigs[i] || {};
            const relations = {};
            for (const key in p.relations) {
                const targetPlayer = engine.players[parseInt(key)];
                if (targetPlayer && !targetPlayer.eliminated) {
                    relations[key] = p.relations[key];
                }
            }
            players.push({
                id: i,
                name: p.name || ('Player ' + (i + 1)),
                color: { name: cfg.color.name, css: cfg.color.css, hex: cfg.color.hex },
                isAI: cfg.isAI || false,
                aiDifficulty: cfg.aiDifficulty || null,
                techScore: p.techScore || 0,
                relations: relations
            });
        });

        const pieces = engine.pieces.map(p => ({
            type: p.type,
            ownerId: p.ownerId,
            row: p.row,
            col: p.col,
            hp: p.hp,
            maxHp: p.maxHp
        }));

        const tileOwnership = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            tileOwnership.push([]);
            for (let c = 0; c < BOARD_SIZE; c++) {
                tileOwnership[r].push(engine.tileOwnership[r][c]);
            }
        }

        return {
            format: 'civchess-level-v1',
            metadata: {
                name: document.getElementById('levelName').value || 'Untitled Level',
                description: document.getElementById('levelDesc').value || '',
                author: document.getElementById('levelAuthor').value || 'Anonymous',
                created: new Date().toISOString()
            },
            players: players,
            board: {
                pieces: pieces,
                tileOwnership: tileOwnership
            },
            winConditions: {
                mode: this.conditionMode,
                conditions: JSON.parse(JSON.stringify(this.conditions))
            },
            diplomacyLocked: this.diplomacyLocked,
            startingPlayer: engine.currentPlayerIndex
        };
    }

    _loadLevelJSON(data) {
        if (data.format !== 'civchess-level-v1') {
            alert('Unknown level format: ' + (data.format || 'none'));
            return;
        }

        // Rebuild player configs, restoring saved colors or falling back to defaults
        this.playerConfigs = data.players.map((p, i) => {
            const idx = p.id !== undefined ? p.id : i;
            let color = PLAYER_COLORS[idx] || PLAYER_COLORS[0];
            if (p.color && p.color.css) {
                // Try to match to a known PLAYER_COLORS entry, otherwise use as-is
                const match = PLAYER_COLORS.find(pc => pc.css === p.color.css);
                color = match || { name: p.color.name || 'Custom', css: p.color.css, hex: p.color.hex || 0xffffff };
            }
            return {
                color: color,
                isAI: p.isAI || false,
                aiDifficulty: p.aiDifficulty || 'hard',
                personality: p.isAI ? 'expansionist' : null
            };
        });

        // Create DevGame with correct player count
        const configs = this.playerConfigs.map(c => ({
            color: c.color,
            isAI: c.isAI,
            aiDifficulty: c.aiDifficulty || 'medium'
        }));
        this.devGame = new DevGame('level-editor', configs);
        this.devGame.setSandboxMode(true);
        this.devGame.setGameEndingEnabled(false);
        this.devGame.setUndoEnabled(true);
        this.devGame.clearBoard();

        // Set player data
        data.players.forEach(p => {
            const idx = p.id !== undefined ? p.id : data.players.indexOf(p);
            if (p.techScore) this.devGame.setPlayerTechScore(idx, p.techScore);
            if (p.relations) {
                for (const targetId in p.relations) {
                    this.devGame.setPlayerRelation(idx, parseInt(targetId), p.relations[targetId]);
                }
            }
        });

        // Place pieces first (this auto-claims territory per tile)
        if (data.board.pieces) {
            data.board.pieces.forEach(p => {
                this.devGame._placePiece(p.type, p.ownerId, p.row, p.col, p.hp, p.maxHp);
            });
        }

        // Then apply saved tile ownership, overriding auto-claims
        if (data.board.tileOwnership) {
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    if (data.board.tileOwnership[r]) {
                        this.devGame.engine.tileOwnership[r][c] = data.board.tileOwnership[r][c];
                    }
                }
            }
        }

        // Starting player
        if (data.startingPlayer !== undefined) {
            this.devGame.setCurrentPlayer(data.startingPlayer);
        }

        // Win conditions
        if (data.winConditions) {
            this.conditionMode = data.winConditions.mode || 'and';
            this.conditions = data.winConditions.conditions || [{ type: 'captureAllCities' }];
        }

        // Diplomacy lock
        this.diplomacyLocked = !!data.diplomacyLocked;

        // Metadata
        if (data.metadata) {
            document.getElementById('levelName').value = data.metadata.name || '';
            document.getElementById('levelDesc').value = data.metadata.description || '';
            document.getElementById('levelAuthor').value = data.metadata.author || '';
        }

        this.currentPlayer = 0;
        this.selectedPiece = null;
        this._hidePieceInfo();
        this.citySelectConditionIndex = null;
        this.devGame.clearUndoHistory();
        this._renderAll();
    }

    // ============================================
    // SECTION: Playtest
    // ============================================

    startPlaytest() {
        const engine = this.devGame.engine;
        const activePlayers = engine.players.filter(p => !p.eliminated);
        if (activePlayers.length < 2) {
            alert('Need at least 2 active players for playtest');
            return;
        }

        // Build level and create a fresh game from it
        const level = this._buildLevelJSON();
        this._initPlaytest(level);

        document.getElementById('playtestOverlay').style.display = '';
    }

    _initPlaytest(level) {
        this.ptTurnCount = 0;
        this.ptPlaying = false;
        this._ptGameEnded = false;
        if (this.ptTimer) { clearTimeout(this.ptTimer); this.ptTimer = null; }

        // Human turn state
        this._ptSelectedPiece = null;
        this._ptValidMoves = [];
        this._ptHumanTurn = false;

        // Create player configs — respect isAI from level data
        this.ptConfigs = level.players.map(p => ({
            color: p.color || PLAYER_COLORS[p.id] || PLAYER_COLORS[0],
            isAI: p.isAI,
            aiDifficulty: p.aiDifficulty || 'hard',
            personality: 'expansionist'
        }));

        // Create engine — all passed as AI to avoid engine's human-turn logic
        const engineConfigs = this.ptConfigs.map(c => ({
            color: c.color,
            isAI: true,
            aiDifficulty: c.aiDifficulty
        }));
        this.ptEngine = new GameEngine();
        this.ptEngine.setupGame(engineConfigs);

        // Clear default setup and load level board
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                this.ptEngine.board[r][c] = null;
                this.ptEngine.tileOwnership[r][c] = null;
            }
        }
        this.ptEngine.pieces.length = 0;

        // Load tile ownership
        if (level.board.tileOwnership) {
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    if (level.board.tileOwnership[r] && level.board.tileOwnership[r][c] !== null) {
                        this.ptEngine.tileOwnership[r][c] = level.board.tileOwnership[r][c];
                    }
                }
            }
        }

        // Place pieces
        level.board.pieces.forEach(p => {
            const piece = this.ptEngine.createPiece(p.type, p.ownerId, p.row, p.col);
            if (p.hp !== undefined) piece.hp = p.hp;
            if (p.maxHp !== undefined) piece.maxHp = p.maxHp;
            this.ptEngine.pieces.push(piece);
            this.ptEngine.board[p.row][p.col] = piece;
        });

        // Set relations
        level.players.forEach(p => {
            if (p.relations) {
                for (const tid in p.relations) {
                    this.ptEngine.players[p.id].relations[parseInt(tid)] = p.relations[tid];
                }
            }
            if (p.techScore) this.ptEngine.players[p.id].techScore = p.techScore;
        });

        // Starting player
        this.ptEngine.currentPlayerIndex = level.startingPlayer || 0;

        // Register AI only for AI players
        this.ptAIManager = new AIManager(this.ptEngine);
        level.players.forEach(p => {
            if (p.isAI) {
                this.ptAIManager.registerAIPlayer(p.id, p.aiDifficulty || 'hard', 'expansionist');
            }
        });

        // Lock diplomacy if set
        if (level.diplomacyLocked) {
            this.ptEngine.canChangeRelation = function() {
                return { canChange: false, roundsRemaining: 999 };
            };
        }

        // Store win conditions for checking
        this._ptWinConditions = level.winConditions;
        this._ptKillCounts = {};
        level.players.forEach(p => { this._ptKillCounts[p.id] = 0; });

        // Bind playtest canvas click
        this._ptBindCanvas();

        this._ptRender();
        this._ptUpdateSide();
        this._ptUpdateHumanUI();
        this._ptUpdateInfo('Ready');
    }

    stopPlaytest() {
        this.ptPlaying = false;
        this._ptHumanTurn = false;
        if (this.ptTimer) { clearTimeout(this.ptTimer); this.ptTimer = null; }
        // Unbind canvas click
        const canvas = document.getElementById('playtestCanvas');
        if (this._ptCanvasHandler) {
            canvas.removeEventListener('click', this._ptCanvasHandler);
            this._ptCanvasHandler = null;
        }
        document.getElementById('playtestOverlay').style.display = 'none';
        document.getElementById('ptPlay').textContent = 'Play';
        document.getElementById('ptEndTurn').style.display = 'none';
    }

    ptTogglePlay() {
        if (!this.ptEngine || this._ptIsOver()) return;
        if (this._ptHumanTurn) return; // can't auto-play during human turn
        if (this.ptPlaying) {
            this.ptPlaying = false;
            if (this.ptTimer) { clearTimeout(this.ptTimer); this.ptTimer = null; }
            document.getElementById('ptPlay').textContent = 'Play';
        } else {
            this.ptPlaying = true;
            document.getElementById('ptPlay').textContent = 'Pause';
            this._ptPlayLoop();
        }
    }

    _ptIsOver() {
        return this.ptEngine.gameOver || this._ptGameEnded;
    }

    _ptPlayLoop() {
        if (!this.ptPlaying || !this.ptEngine || this._ptIsOver()) {
            this.ptPlaying = false;
            document.getElementById('ptPlay').textContent = 'Play';
            return;
        }
        // If it's a human player's turn, pause auto-play and wait
        const cp = this.ptEngine.currentPlayerIndex;
        if (!this.ptConfigs[cp].isAI && !this.ptEngine.players[cp].eliminated) {
            this.ptPlaying = false;
            document.getElementById('ptPlay').textContent = 'Play';
            this._ptStartHumanTurn();
            return;
        }
        this.ptStep();
        const speed = parseInt(document.getElementById('ptSpeed').value) || 200;
        this.ptTimer = setTimeout(() => this._ptPlayLoop(), speed);
    }

    ptStep() {
        if (!this.ptEngine || this._ptIsOver()) return;
        const cp = this.ptEngine.currentPlayerIndex;
        const player = this.ptEngine.players[cp];

        // If it's a human player's turn and not already in human-turn mode, start it
        if (!this.ptConfigs[cp].isAI && !player.eliminated) {
            this._ptStartHumanTurn();
            return;
        }

        // Track kills before turn
        const killsBefore = player.warriorKills || 0;

        if (!player.eliminated) {
            try {
                this.ptAIManager.executeAITurn(cp);
            } catch (e) {
                console.error('Playtest AI error:', e);
            }
        }

        // Track kills after turn
        const killsAfter = player.warriorKills || 0;
        if (killsAfter > killsBefore) {
            this._ptKillCounts[cp] = (this._ptKillCounts[cp] || 0) + (killsAfter - killsBefore);
        }

        this._ptFinishTurn();
    }

    _ptFinishTurn() {
        this.ptEngine.endTurn();
        this.ptTurnCount++;

        this._ptCheckAndUpdate();
    }

    /** Check win conditions, update render and info bar. Called after each turn and after human moves. */
    _ptCheckAndUpdate() {
        // Check win conditions
        const winResult = this._checkWinConditions();

        this._ptRender();
        this._ptUpdateSide();

        let info = 'Round: ' + this.ptEngine.roundNumber + ' | Turn: ' + this.ptTurnCount
            + ' | Current: P' + (this.ptEngine.currentPlayerIndex + 1);

        if (this.ptEngine.gameOver && !this._ptGameEnded) {
            info += ' | GAME OVER - Winner: P' + (this.ptEngine.winner + 1);
            this._ptGameEnded = true;
            this.ptPlaying = false;
            document.getElementById('ptPlay').textContent = 'Play';
        } else if (winResult) {
            info += ' | WIN CONDITION MET: ' + winResult;
            this._ptGameEnded = true;
            this.ptEngine.gameOver = true;
            this.ptPlaying = false;
            document.getElementById('ptPlay').textContent = 'Play';
        } else if (this._ptGameEnded) {
            info += ' | GAME OVER';
        }

        this._ptUpdateHumanUI();
        this._ptUpdateInfo(info);
    }

    // ---- Human turn input ----

    _ptStartHumanTurn() {
        this._ptHumanTurn = true;
        this._ptSelectedPiece = null;
        this._ptValidMoves = [];
        this._ptUpdateHumanUI();
        document.getElementById('playtestCanvas').style.cursor = 'pointer';
        this._ptRender();
        const cp = this.ptEngine.currentPlayerIndex;
        const color = this.ptConfigs[cp] ? this.ptConfigs[cp].color.name : '';
        this._ptUpdateInfo('YOUR TURN (P' + (cp + 1) + ' ' + color + ') - click a piece to move, then End Turn');
    }

    ptEndHumanTurn() {
        if (!this._ptHumanTurn) return;
        this._ptHumanTurn = false;
        this._ptSelectedPiece = null;
        this._ptValidMoves = [];
        document.getElementById('playtestCanvas').style.cursor = 'default';
        this._ptFinishTurn();
        // If auto-play was on, continue
        if (this.ptPlaying) {
            this._ptPlayLoop();
        }
    }

    _ptUpdateHumanUI() {
        const endBtn = document.getElementById('ptEndTurn');
        endBtn.style.display = this._ptHumanTurn ? '' : 'none';
    }

    _ptBindCanvas() {
        const canvas = document.getElementById('playtestCanvas');
        // Remove old handler if any
        if (this._ptCanvasHandler) {
            canvas.removeEventListener('click', this._ptCanvasHandler);
        }
        this._ptCanvasHandler = e => this._ptOnCanvasClick(e);
        canvas.addEventListener('click', this._ptCanvasHandler);
    }

    _ptOnCanvasClick(e) {
        if (!this._ptHumanTurn || this._ptIsOver()) return;
        const canvas = document.getElementById('playtestCanvas');
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        const cs = canvas.width / BOARD_SIZE;
        const col = Math.floor(x / cs);
        const row = Math.floor(y / cs);
        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;

        const engine = this.ptEngine;
        const cp = engine.currentPlayerIndex;

        // If we have a selected piece, check if clicking a valid move target
        if (this._ptSelectedPiece) {
            const isValid = this._ptValidMoves.some(m => m.row === row && m.col === col);
            if (isValid) {
                // Execute move
                const piece = this._ptSelectedPiece;
                if (piece.type === 'settler') {
                    // If settler clicks own tile and can build, build city
                    const canBuild = engine.canSettlerBuildCity(piece);
                    if (row === piece.row && col === piece.col && canBuild.valid) {
                        engine.settlerBuildCity(piece);
                    } else {
                        engine.movePiece(piece, row, col);
                    }
                } else {
                    engine.movePiece(piece, row, col);
                }
                this._ptSelectedPiece = null;
                this._ptValidMoves = [];
                // Check win conditions immediately after each move
                this._ptCheckAndUpdate();
                if (this._ptGameEnded) {
                    this._ptHumanTurn = false;
                    document.getElementById('playtestCanvas').style.cursor = 'default';
                }
                return;
            }
            // Clicking elsewhere deselects
            this._ptSelectedPiece = null;
            this._ptValidMoves = [];
        }

        // Select a piece owned by current player
        const piece = engine.board[row][col];
        if (piece && piece.ownerId === cp && !piece.hasMoved && piece.type !== 'city') {
            this._ptSelectedPiece = piece;
            this._ptValidMoves = engine.getValidMoves(piece);
            // For settlers, add current tile if can build
            if (piece.type === 'settler') {
                const canBuild = engine.canSettlerBuildCity(piece);
                if (canBuild.valid) {
                    this._ptValidMoves.push({ row: piece.row, col: piece.col, settle: true });
                }
            }
        }

        this._ptRender();
    }

    // ---- Win conditions ----

    _checkWinConditions() {
        if (!this._ptWinConditions || !this._ptWinConditions.conditions.length) return null;

        const engine = this.ptEngine;
        const mode = this._ptWinConditions.mode;
        const results = [];

        for (const cond of this._ptWinConditions.conditions) {
            results.push(this._evaluateCondition(cond, engine));
        }

        if (mode === 'and') {
            return results.every(r => r !== null) ? results.filter(r => r).join(', ') || 'All conditions met' : null;
        } else {
            const met = results.find(r => r !== null);
            return met || null;
        }
    }

    _evaluateCondition(cond, engine) {
        switch (cond.type) {
            case 'captureAllCities': {
                // Check if any single player owns all cities
                const cityOwners = new Set(engine.pieces.filter(p => p.type === 'city').map(p => p.ownerId));
                if (cityOwners.size === 1) return 'P' + ([...cityOwners][0] + 1) + ' captured all cities';
                return null;
            }

            case 'captureSpecificCities': {
                if (!cond.cities || cond.cities.length === 0) return null;
                // Check if any player owns all specified cities
                for (let pid = 0; pid < engine.players.length; pid++) {
                    if (engine.players[pid].eliminated) continue;
                    const ownsAll = cond.cities.every(c => {
                        const piece = engine.board[c.row][c.col];
                        return piece && piece.type === 'city' && piece.ownerId === pid;
                    });
                    if (ownsAll) return 'P' + (pid + 1) + ' captured target cities';
                }
                return null;
            }

            case 'eliminatePlayer': {
                const target = engine.players[cond.playerId];
                if (target && target.eliminated) return 'P' + (cond.playerId + 1) + ' eliminated';
                return null;
            }

            case 'controlTerritory': {
                const total = BOARD_SIZE * BOARD_SIZE;
                for (let pid = 0; pid < engine.players.length; pid++) {
                    if (engine.players[pid].eliminated) continue;
                    let count = 0;
                    for (let r = 0; r < BOARD_SIZE; r++) {
                        for (let c = 0; c < BOARD_SIZE; c++) {
                            if (engine.tileOwnership[r][c] === pid) count++;
                        }
                    }
                    if ((count / total * 100) >= (cond.percentage || 50)) {
                        return 'P' + (pid + 1) + ' controls ' + Math.round(count / total * 100) + '% territory';
                    }
                }
                return null;
            }

            case 'surviveTurns': {
                if (this.ptTurnCount >= (cond.turns || 30)) return 'Survived ' + this.ptTurnCount + ' turns';
                return null;
            }

            case 'reachTechLevel': {
                for (let pid = 0; pid < engine.players.length; pid++) {
                    if (engine.players[pid].eliminated) continue;
                    if (engine.players[pid].techScore >= (cond.level || 10)) {
                        return 'P' + (pid + 1) + ' reached tech ' + engine.players[pid].techScore;
                    }
                }
                return null;
            }

            case 'killWarriors': {
                for (let pid = 0; pid < engine.players.length; pid++) {
                    const kills = engine.players[pid].warriorKills || 0;
                    if (kills >= (cond.count || 10)) {
                        return 'P' + (pid + 1) + ' killed ' + kills + ' warriors';
                    }
                }
                return null;
            }

            default:
                return null;
        }
    }

    _ptRender() {
        const canvas = document.getElementById('playtestCanvas');
        const ctx = canvas.getContext('2d');
        const size = canvas.width;
        const cs = size / BOARD_SIZE;
        const engine = this.ptEngine;

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, size, size);

        // Territory
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const owner = engine.tileOwnership[r][c];
                if (owner !== null && this.ptConfigs[owner]) {
                    ctx.fillStyle = this.ptConfigs[owner].color.css + '33';
                    ctx.fillRect(c * cs, r * cs, cs, cs);
                }
            }
        }

        // Grid
        ctx.strokeStyle = '#00d4ff26';
        ctx.lineWidth = 1;
        for (let i = 0; i <= BOARD_SIZE; i++) {
            ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, size); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(size, i * cs); ctx.stroke();
        }

        // Valid move highlights (drawn before pieces so pieces render on top)
        if (this._ptHumanTurn && this._ptValidMoves.length > 0) {
            this._ptValidMoves.forEach(m => {
                const mx = m.col * cs;
                const my = m.row * cs;
                // Fill with semi-transparent color
                ctx.fillStyle = m.settle ? '#ffaa0044' : '#00ff8844';
                ctx.fillRect(mx, my, cs, cs);
                // Border
                ctx.strokeStyle = m.settle ? '#ffaa00' : '#00ff88';
                ctx.lineWidth = 2;
                ctx.strokeRect(mx + 1, my + 1, cs - 2, cs - 2);
                // Dot in center for move targets
                if (!m.settle) {
                    ctx.beginPath();
                    ctx.arc(mx + cs / 2, my + cs / 2, cs * 0.12, 0, Math.PI * 2);
                    ctx.fillStyle = '#00ff8888';
                    ctx.fill();
                } else {
                    // "B" marker for build/settle
                    ctx.fillStyle = '#ffaa00';
                    ctx.font = 'bold ' + Math.floor(cs * 0.3) + 'px VT323';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('B', mx + cs / 2, my + cs / 2);
                }
            });
        }

        // Pieces
        engine.pieces.forEach(piece => {
            const cx = piece.col * cs + cs / 2;
            const cy = piece.row * cs + cs / 2;
            const radius = cs * 0.35;
            // Dim pieces that already moved during human turn
            const isHumanPiece = this._ptHumanTurn && piece.ownerId === engine.currentPlayerIndex;
            const dimmed = isHumanPiece && piece.hasMoved && piece.type !== 'city';
            if (dimmed) ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = this.ptConfigs[piece.ownerId] ? this.ptConfigs[piece.ownerId].color.css : '#fff';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            const letter = piece.type === 'city' ? 'C' : piece.type === 'warrior' ? 'W' : 'S';
            ctx.fillStyle = '#000';
            ctx.font = 'bold ' + Math.floor(cs * 0.4) + 'px VT323';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(letter, cx, cy + 1);
            if (piece.type === 'city' && piece.hp < piece.maxHp) {
                const barW = cs * 0.6, barH = 3, barX = cx - barW / 2, barY = cy + radius + 3;
                ctx.fillStyle = '#ff4444';
                ctx.fillRect(barX, barY, barW, barH);
                ctx.fillStyle = '#00ff88';
                ctx.fillRect(barX, barY, barW * (piece.hp / piece.maxHp), barH);
            }
            if (dimmed) ctx.globalAlpha = 1.0;
        });

        // Selected piece highlight (drawn after pieces so it appears on top)
        if (this._ptHumanTurn && this._ptSelectedPiece) {
            const sp = this._ptSelectedPiece;
            const sx = sp.col * cs;
            const sy = sp.row * cs;
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 3;
            ctx.strokeRect(sx + 1, sy + 1, cs - 2, cs - 2);
            // Pulsing glow effect
            ctx.shadowColor = '#00d4ff';
            ctx.shadowBlur = 8;
            ctx.strokeRect(sx + 1, sy + 1, cs - 2, cs - 2);
            ctx.shadowBlur = 0;
        }
    }

    _ptUpdateSide() {
        const panel = document.getElementById('ptSidePanel');
        const engine = this.ptEngine;
        let html = '';

        engine.players.forEach((p, i) => {
            const cities = engine.pieces.filter(pp => pp.type === 'city' && pp.ownerId === i).length;
            const warriors = engine.pieces.filter(pp => pp.type === 'warrior' && pp.ownerId === i).length;
            const settlers = engine.pieces.filter(pp => pp.type === 'settler' && pp.ownerId === i).length;
            let territory = 0;
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    if (engine.tileOwnership[r][c] === i) territory++;
                }
            }
            const colorCss = this.ptConfigs[i] ? this.ptConfigs[i].color.css : '#fff';
            html += '<div class="player-card' + (p.eliminated ? ' eliminated' : '') + '" style="border-color:' + colorCss + '44">';
            html += '<div class="name" style="color:' + colorCss + '">P' + (i + 1) + '</div><div class="stats">';
            html += 'Cities: <span>' + cities + '</span> | Warriors: <span>' + warriors + '</span> | Settlers: <span>' + settlers + '</span><br>';
            html += 'Territory: <span>' + territory + '</span> | Tech: <span>' + p.techScore + '</span>';
            if (p.eliminated) html += '<br><span style="color:#ff4444">ELIMINATED</span>';
            html += '</div><div class="relations-list">';
            engine.players.forEach((other, j) => {
                if (i !== j && !other.eliminated) {
                    const rel = p.relations[j] || 'peace';
                    html += 'vs P' + (j + 1) + ': <span class="' + rel + '">' + rel + '</span> ';
                }
            });
            html += '</div></div>';
        });

        panel.innerHTML = html;
    }

    _ptUpdateInfo(text) {
        document.getElementById('ptInfo').textContent = text;
    }

    // ============================================
    // SECTION: Render All
    // ============================================

    _renderAll() {
        this._renderBoard();
        this._renderPlayerList();
        this._renderDiplomacy();
        this._renderConditions();
        this._updatePieceCount();
    }
}

// ============================================
// SECTION: Initialize
// ============================================

let editor;
function _initEditor() {
    if (editor) return;
    editor = new LevelEditor();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initEditor);
} else {
    _initEditor();
}
