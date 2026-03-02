/**
 * UIController - How to Play panel (DOM overlay)
 * Prototype extension for UIController
 *
 * Multi-page overlay: Overview → Production → Mechanics → UI & Diplomacy.
 * Mechanics pages include looping canvas-based simulated animations
 * that use the same rendering methods as the in-game board.
 */

// ============================================
// Build the How to Play panel DOM structure
// ============================================

UIController.prototype.createHowToPlayPanel = function() {
    var overlay = document.createElement('div');
    overlay.id = 'how-to-play-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(180deg, #0a0a14 0%, #1a1a2e 100%);
        z-index: 3000;
        display: none;
        font-family: 'VT323', monospace;
        flex-direction: column;
        overflow: hidden;
    `;

    var navBtnStyle = "font-family:'VT323',monospace;font-size:18px;padding:8px 12px;background:transparent;border:1px solid #00d4ff;color:#00d4ff;cursor:pointer;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;";

    var isMobile = window.innerWidth < 768;

    // ── Fixed header bar ─────────────────────────────────────
    var headerBar = document.createElement('div');
    headerBar.style.cssText = isMobile
        ? 'flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#0a0a14;border-bottom:1px solid rgba(0,212,255,0.3);'
        : 'flex-shrink:0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:12px 20px;background:#0a0a14;border-bottom:1px solid rgba(0,212,255,0.3);';

    var backBtn = document.createElement('button');
    backBtn.className = 'htp-nav-btn';
    backBtn.style.cssText = navBtnStyle + 'justify-self:start;';
    backBtn.textContent = '\u2190 BACK';
    headerBar.appendChild(backBtn);

    // Page indicator dots
    var dotsContainer = document.createElement('div');
    dotsContainer.style.cssText = 'display:flex;gap:10px;align-items:center;';
    this._htpDots = [];
    var pageNames = ['Overview', 'Production', 'Mechanics', 'UI & Diplomacy'];
    var self = this;
    for (var di = 0; di < pageNames.length; di++) {
        var dot = document.createElement('div');
        dot.style.cssText = 'width:10px;height:10px;border-radius:50%;border:1px solid #00d4ff;cursor:pointer;transition:background 0.2s;';
        dot.title = pageNames[di];
        (function(idx) {
            dot.addEventListener('click', function() {
                self.playClick();
                self._htpGoToPage(idx);
            });
        })(di);
        dotsContainer.appendChild(dot);
        this._htpDots.push(dot);
    }

    // Prev/Next navigation
    var navRight = document.createElement('div');
    navRight.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

    var prevBtn = document.createElement('button');
    prevBtn.className = 'htp-nav-btn';
    prevBtn.style.cssText = navBtnStyle;
    prevBtn.textContent = '\u2190 PREV';
    navRight.appendChild(prevBtn);

    var nextBtn = document.createElement('button');
    nextBtn.className = 'htp-nav-btn';
    nextBtn.style.cssText = navBtnStyle;
    nextBtn.textContent = 'NEXT \u2192';
    navRight.appendChild(nextBtn);

    if (isMobile) {
        // On mobile: header has back + prev/next only; dots go in a footer
        headerBar.appendChild(navRight);
        overlay.appendChild(headerBar);

        // ── Fixed footer bar with dots ───────────────────────────
        var footerBar = document.createElement('div');
        footerBar.style.cssText = 'flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:10px 12px;background:#0a0a14;border-top:1px solid rgba(0,212,255,0.3);';
        footerBar.appendChild(dotsContainer);
        this._htpFooter = footerBar;
    } else {
        // On desktop: header has back + dots + prev/next in a 3-column grid
        headerBar.appendChild(dotsContainer);
        headerBar.appendChild(navRight);
        overlay.appendChild(headerBar);
        this._htpFooter = null;
    }

    // ── Scrollable content area ──────────────────────────────
    var content = document.createElement('div');
    content.style.cssText = `
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 20px 20px 40px;
        box-sizing: border-box;
    `;

    // Build pages
    this._htpPages = [];
    this._htpAnimCanvases = [];

    this._htpPages.push(this._createHtpOverviewPage());
    this._htpPages.push(this._createHtpProductionPage());
    this._htpPages.push(this._createHtpMechanicsPage());
    this._htpPages.push(this._createHtpUIPage());

    this._htpPages.forEach(function(page) { content.appendChild(page); });
    overlay.appendChild(content);
    if (this._htpFooter) overlay.appendChild(this._htpFooter);
    document.body.appendChild(overlay);

    // Store references
    this.htpOverlay = overlay;
    this._htpContent = content;
    this._htpCurrentPage = 0;
    this._htpPrevBtn = prevBtn;
    this._htpNextBtn = nextBtn;

    // ── Wire up events ──────────────────────────────────────
    backBtn.addEventListener('click', function() {
        self.playClick();
        self.toggleHowToPlayPanel();
    });

    prevBtn.addEventListener('click', function() {
        self.playClick();
        self._htpGoToPage(self._htpCurrentPage - 1);
    });

    nextBtn.addEventListener('click', function() {
        self.playClick();
        self._htpGoToPage(self._htpCurrentPage + 1);
    });

    // Hover effects (skip on touch devices where mouseenter sticks)
    if (window.matchMedia('(hover: hover)').matches) {
        overlay.querySelectorAll('.htp-nav-btn').forEach(function(btn) {
            btn.addEventListener('mouseenter', function() {
                btn.style.background = 'rgba(0, 212, 255, 0.2)';
                btn.style.boxShadow = '0 0 15px rgba(0, 212, 255, 0.5)';
                btn.style.textShadow = '0 0 10px #00d4ff';
            });
            btn.addEventListener('mouseleave', function() {
                btn.style.background = 'transparent';
                btn.style.boxShadow = 'none';
                btn.style.textShadow = 'none';
            });
        });
    }

    // Initialize first page
    this._htpGoToPage(0);
};


// ============================================
// Page navigation
// ============================================

UIController.prototype._htpGoToPage = function(pageIndex) {
    var total = this._htpPages.length;
    pageIndex = Math.max(0, Math.min(pageIndex, total - 1));
    this._htpCurrentPage = pageIndex;

    for (var i = 0; i < total; i++) {
        this._htpPages[i].style.display = i === pageIndex ? 'flex' : 'none';
    }

    for (var d = 0; d < this._htpDots.length; d++) {
        this._htpDots[d].style.background = d === pageIndex ? '#00d4ff' : 'transparent';
    }

    this._htpPrevBtn.style.visibility = pageIndex === 0 ? 'hidden' : 'visible';
    this._htpNextBtn.style.visibility = pageIndex === total - 1 ? 'hidden' : 'visible';

    // On the last page, swap PREV to where NEXT sits (right side)
    this._htpPrevBtn.style.order = pageIndex === total - 1 ? '2' : '0';
    this._htpNextBtn.style.order = pageIndex === total - 1 ? '0' : '1';

    this._htpContent.scrollTop = 0;

    if (pageIndex >= 2) {
        this._htpStartAnimations();
    } else {
        this._htpStopAnimations();
    }
};


// ============================================
// Page 1: Overview
// ============================================

UIController.prototype._createHtpOverviewPage = function() {
    var page = document.createElement('div');
    page.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;max-width:600px;';

    var title = document.createElement('h1');
    title.textContent = 'How to Play';
    title.style.cssText = 'font-size:52px;color:#00d4ff;text-shadow:0 0 10px #00d4ff,0 0 30px rgba(0,212,255,0.4);margin:0 0 28px;text-align:center;letter-spacing:3px;';
    page.appendChild(title);

    var intro = document.createElement('p');
    intro.style.cssText = 'font-size:20px;color:#88ccff;max-width:560px;text-align:center;line-height:1.7;margin:0 0 36px;letter-spacing:0.5px;';
    intro.innerHTML =
        'ChessyCiv is a turn-based strategy game where chess civilizations clash on a ' +
        '<span style="color:#00d4ff;">10\u00d710 grid</span>. ' +
        'Build cities, train warriors, send settlers to expand, and conquer your opponents.<br><br>' +
        'Drag pieces to move them. Tap cities to produce units.';
    page.appendChild(intro);

    var piecesContainer = document.createElement('div');
    piecesContainer.style.cssText = 'display:flex;flex-direction:column;gap:24px;width:100%;max-width:520px;margin-bottom:36px;';

    var pieces = [
        { symbol: '\u265C', name: 'City', color: '#00ffff', desc: 'Immovable. Produces warriors, settlers, and technology. Starts with 4 HP. Tap a city to choose what to build.' },
        { symbol: '\u265F', name: 'Warrior', color: '#ff00ff', desc: 'Moves 1 tile in any direction. Attacks enemies and claims territory. Your main fighting force.' },
        { symbol: '\u265E', name: 'Settler', color: '#00ff00', desc: 'Moves up to 3 tiles (up, down, left, and right only). Founds a new city on arrival. Must be at least 1 tile between existing cities.' }
    ];

    pieces.forEach(function(p) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:18px;padding:14px 16px;background:rgba(10,10,20,0.6);border:1px solid rgba(0,212,255,0.15);border-radius:4px;';

        var iconWrapper = document.createElement('div');
        iconWrapper.style.cssText = 'flex-shrink:0;width:56px;height:56px;border-radius:50%;background:#1a1a3a;border:3px solid ' + p.color + ';display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px ' + p.color + '44,inset 0 0 8px rgba(0,0,0,0.4);';
        var iconText = document.createElement('span');
        iconText.textContent = p.symbol;
        iconText.style.cssText = 'font-size:32px;color:' + p.color + ';font-family:serif;line-height:1;text-shadow:0 0 6px ' + p.color + '88;';
        iconWrapper.appendChild(iconText);
        row.appendChild(iconWrapper);

        var textCol = document.createElement('div');
        textCol.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
        var nameEl = document.createElement('div');
        nameEl.textContent = p.name.toUpperCase();
        nameEl.style.cssText = 'font-size:22px;color:' + p.color + ';letter-spacing:2px;text-shadow:0 0 8px ' + p.color + '66;';
        textCol.appendChild(nameEl);
        var descEl = document.createElement('div');
        descEl.textContent = p.desc;
        descEl.style.cssText = 'font-size:17px;color:#88ccff;line-height:1.5;';
        textCol.appendChild(descEl);
        row.appendChild(textCol);
        piecesContainer.appendChild(row);
    });
    page.appendChild(piecesContainer);

    page.appendChild(_htpMkDivider());

    var victory = document.createElement('div');
    victory.textContent = 'CAPTURE ALL CITIES TO WIN';
    victory.style.cssText = 'font-size:28px;color:#00ff88;text-shadow:0 0 10px rgba(0,255,136,0.5);letter-spacing:3px;margin-bottom:16px;text-align:center;';
    page.appendChild(victory);

    var hint = document.createElement('div');
    hint.innerHTML = 'Use <span style="color:#00d4ff;">NEXT \u2192</span> to learn about production and mechanics';
    hint.style.cssText = 'font-size:16px;color:#666666;text-align:center;';
    page.appendChild(hint);

    return page;
};


// ============================================
// Page 2: Production
// ============================================

UIController.prototype._createHtpProductionPage = function() {
    var page = document.createElement('div');
    page.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;max-width:600px;';

    var title = document.createElement('h1');
    title.textContent = 'Production';
    title.style.cssText = 'font-size:44px;color:#00d4ff;text-shadow:0 0 10px #00d4ff,0 0 30px rgba(0,212,255,0.4);margin:0 0 12px;text-align:center;letter-spacing:3px;';
    page.appendChild(title);

    var subtitle = document.createElement('p');
    subtitle.style.cssText = 'font-size:18px;color:#88ccff;text-align:center;margin:0 0 28px;line-height:1.6;max-width:480px;';
    subtitle.textContent = 'Tap a city to choose what it produces. Each option takes a number of turns to complete.';
    page.appendChild(subtitle);

    var productions = [
        { name: 'Warrior',       turns: 4,  icon: '\u265F', desc: 'Trains a warrior unit. Warriors move 1 tile per turn in any direction, attack enemies, and claim territory for your civilization.' },
        { name: 'Settler',       turns: 6,  icon: '\u265E', desc: 'Trains a settler unit. Settlers move up to 3 tiles orthogonally (up, down, left, right) per turn and can found a new city (must have 1 tile of space between cities).' },
        { name: 'Diplomacy',     turns: 4,  icon: '\u2694', desc: 'Claims an unowned tile adjacent to the city as yours. It steals territory and any cities on it if there are no free tiles left.' },
        { name: 'Science',       turns: 10, icon: '\u2699', desc: 'Researches technology. Increases your tech score, which boosts warrior damage and city health.' },
        { name: 'Repair',        turns: 1,  icon: '\u2692', desc: 'Restores 1 HP to the city. Only available when the city is damaged. Fast, single-turn production.' },
        { name: 'Heal Warriors', turns: 2,  icon: '\u2764', desc: 'Heals all friendly warriors adjacent to this city by 1 HP. Only available when wounded warriors are nearby.' }
    ];

    var cardsContainer = document.createElement('div');
    cardsContainer.style.cssText = 'display:flex;flex-direction:column;gap:18px;width:100%;max-width:520px;margin-bottom:24px;';

    productions.forEach(function(prod) {
        var card = document.createElement('div');
        card.style.cssText = 'display:flex;flex-direction:column;background:rgba(10,10,20,0.6);border:1px solid rgba(0,212,255,0.15);border-radius:4px;overflow:hidden;';

        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#00ff88;border-bottom:1px solid #00ff88;';

        var headerLeft = document.createElement('div');
        headerLeft.style.cssText = 'display:flex;align-items:center;gap:10px;';
        var iconEl = document.createElement('span');
        iconEl.textContent = prod.icon;
        iconEl.style.cssText = 'font-size:22px;color:#0a0a14;';
        headerLeft.appendChild(iconEl);
        var nameEl = document.createElement('span');
        nameEl.textContent = prod.name.toUpperCase();
        nameEl.style.cssText = 'font-size:20px;color:#0a0a14;letter-spacing:2px;font-weight:bold;';
        headerLeft.appendChild(nameEl);
        header.appendChild(headerLeft);

        var turnsEl = document.createElement('span');
        turnsEl.textContent = prod.turns + (prod.turns === 1 ? ' TURN' : ' TURNS');
        turnsEl.style.cssText = 'font-size:16px;color:#0a0a14;letter-spacing:1px;background:rgba(0,0,0,0.15);padding:2px 8px;border-radius:2px;';
        header.appendChild(turnsEl);
        card.appendChild(header);

        var body = document.createElement('div');
        body.style.cssText = 'padding:12px 16px;';
        var descEl = document.createElement('div');
        descEl.textContent = prod.desc;
        descEl.style.cssText = 'font-size:17px;color:#88ccff;line-height:1.5;';
        body.appendChild(descEl);
        card.appendChild(body);
        cardsContainer.appendChild(card);
    });

    page.appendChild(cardsContainer);
    return page;
};


// ============================================
// Page 3: Mechanics
// ============================================

UIController.prototype._createHtpMechanicsPage = function() {
    var page = document.createElement('div');
    page.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;max-width:600px;';

    var title = document.createElement('h1');
    title.textContent = 'Mechanics';
    title.style.cssText = 'font-size:44px;color:#00d4ff;text-shadow:0 0 10px #00d4ff,0 0 30px rgba(0,212,255,0.4);margin:0 0 12px;text-align:center;letter-spacing:3px;';
    page.appendChild(title);


    page.appendChild(this._createHtpMechanicSection(
        'Tile Conquest',
        'Moving a warrior onto a tile claims it for your civilization if you are at war with the owner. Territory expands as your warriors advance. ',
        this._createTileConquestAnim.bind(this)
    ));

    page.appendChild(this._createHtpMechanicSection(
        'Blockades',
        'Two warriors from the same player on opposite diagonals of a 2\u00d72 square form a blockade. ' +
        'Enemy pieces cannot cross diagonally between them. Your own pieces pass through freely. ' +
        'Use blockades to defend chokepoints.',
        this._createBlockadeAnim.bind(this)
    ));

    page.appendChild(this._createHtpMechanicSection(
        'Enqueue Movements',
        'Drag a piece beyond its immediate range to set a multi-turn path. ' +
        'A red energy line shows the planned route. When you end your turn, queued pieces ' +
        'auto-move one step along their path. Great for long-distance marches.',
        this._createMovementQueueAnim.bind(this)
    ));

    return page;
};

UIController.prototype._createHtpMechanicSection = function(titleText, description, animCreator) {
    var section = document.createElement('div');
    section.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;max-width:520px;margin-bottom:32px;';

    var titleEl = document.createElement('div');
    titleEl.textContent = titleText.toUpperCase();
    titleEl.style.cssText = 'font-size:24px;color:#00d4ff;letter-spacing:2px;text-shadow:0 0 8px rgba(0,212,255,0.5);margin-bottom:12px;text-align:center;';
    section.appendChild(titleEl);

    var canvasWrapper = document.createElement('div');
    canvasWrapper.style.cssText = 'width:100%;display:flex;justify-content:center;margin-bottom:14px;';
    var animData = animCreator(canvasWrapper);
    this._htpAnimCanvases.push(animData);
    section.appendChild(canvasWrapper);

    var descEl = document.createElement('div');
    descEl.textContent = description;
    descEl.style.cssText = 'font-size:17px;color:#88ccff;line-height:1.6;text-align:center;max-width:460px;';
    section.appendChild(descEl);

    section.appendChild(_htpMkDivider());
    return section;
};


// ============================================
// Animation lifecycle
// ============================================

UIController.prototype._htpStartAnimations = function() {
    if (this._htpAnimRunning) return;
    this._htpAnimRunning = true;
    var canvases = this._htpAnimCanvases;
    var self = this;
    var animate = function(timestamp) {
        if (!self._htpAnimRunning) return;
        for (var i = 0; i < canvases.length; i++) {
            if (canvases[i] && canvases[i].draw) canvases[i].draw(timestamp);
        }
        self._htpAnimFrame = requestAnimationFrame(animate);
    };
    this._htpAnimFrame = requestAnimationFrame(animate);
};

UIController.prototype._htpStopAnimations = function() {
    this._htpAnimRunning = false;
    if (this._htpAnimFrame) {
        cancelAnimationFrame(this._htpAnimFrame);
        this._htpAnimFrame = null;
    }
};


// ============================================
// Animation: Tile Conquest
// ============================================

UIController.prototype._createTileConquestAnim = function(wrapper) {
    var COLS = 6, ROWS = 3, TILE = 40;
    var PAD = Math.max(Math.floor(TILE * 0.06), 3) + 1;
    var W = COLS * TILE + PAD * 2, H = ROWS * TILE + PAD * 2;

    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'max-width:100%;';
    wrapper.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var CYAN = '#00ffff', MAGENTA = '#ff00ff';

    // Warrior path: moves right across row 1
    var path = [
        {row:1,col:0},{row:1,col:1},{row:1,col:2},
        {row:1,col:3},{row:1,col:4},{row:1,col:5}
    ];

    // Static enemy territory (right half)
    var baseEnemyTiles = {};
    var eTiles = [[0,3],[0,4],[0,5],[1,3],[1,4],[1,5],[2,3],[2,4],[2,5]];
    for (var i = 0; i < eTiles.length; i++) baseEnemyTiles[eTiles[i][0]+','+eTiles[i][1]] = true;

    var STEP_MS = 550, PAUSE_MS = 1400;
    var TOTAL_MS = path.length * STEP_MS + PAUSE_MS;

    function draw(timestamp) {
        var t = timestamp % TOTAL_MS;
        var stepFloat = t / STEP_MS;
        var currentStep = Math.min(Math.floor(stepFloat), path.length - 1);
        var stepProgress = Math.min(stepFloat - Math.floor(stepFloat), 1);
        var inMotion = t < path.length * STEP_MS;

        ctx.clearRect(0, 0, W, H);

        // Build ownership grid: only enemy tiles that haven't been conquered
        var own = [];
        for (var r = 0; r < ROWS; r++) {
            own[r] = [];
            for (var c = 0; c < COLS; c++) own[r][c] = null;
        }

        // Enemy territory (unchanged tiles)
        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                if (baseEnemyTiles[r+','+c]) own[r][c] = 1; // magenta
            }
        }

        // Warrior conquers enemy tiles on row 1 as it steps on them
        for (var si = 0; si <= currentStep; si++) {
            var p = path[si];
            if (baseEnemyTiles[p.row+','+p.col]) {
                own[p.row][p.col] = 0; // flip to cyan
            }
        }

        ctx.save();
        ctx.translate(PAD, PAD);

        _htpDrawBoard(ctx, ROWS, COLS, TILE);
        _htpDrawOwnership(ctx, own, ROWS, COLS, TILE, [CYAN, MAGENTA]);
        _htpDrawTerritoryBorders(ctx, own, ROWS, COLS, TILE, [CYAN, MAGENTA]);

        // Enemy city
        _htpDrawPiece(ctx, 0, 5, TILE, '\u265C', MAGENTA);

        // Warrior with interpolation
        var wx, wy;
        if (inMotion && currentStep < path.length - 1) {
            var from = path[currentStep], to = path[currentStep + 1];
            var ease = _htpEaseInOut(stepProgress);
            wx = (from.col + (to.col - from.col) * ease) * TILE + TILE / 2;
            wy = (from.row + (to.row - from.row) * ease) * TILE + TILE / 2;
        } else {
            wx = path[currentStep].col * TILE + TILE / 2;
            wy = path[currentStep].row * TILE + TILE / 2;
        }
        _htpDrawPieceAt(ctx, wx, wy, TILE, '\u265F', CYAN);

        ctx.restore();
    }

    return { draw: draw };
};


// ============================================
// Animation: Blockade
// ============================================

UIController.prototype._createBlockadeAnim = function(wrapper) {
    var COLS = 4, ROWS = 4, TILE = 44;
    var PAD = Math.max(Math.floor(TILE * 0.06), 3) + 1;
    var W = COLS * TILE + PAD * 2, H = ROWS * TILE + PAD * 2;

    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'max-width:100%;';
    wrapper.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var CYAN = '#00ffff', MAGENTA = '#ff00ff';
    var CYCLE_MS = 2800;

    // Static ownership
    var own = [];
    var cyanT = [[0,0],[0,1],[1,0],[1,1],[2,2],[2,3],[3,2],[3,3]];
    var magT  = [[0,2],[0,3],[1,2],[1,3],[2,0],[2,1],[3,0],[3,1]];
    for (var r = 0; r < ROWS; r++) { own[r] = []; for (var c = 0; c < COLS; c++) own[r][c] = null; }
    for (var i = 0; i < cyanT.length; i++) own[cyanT[i][0]][cyanT[i][1]] = 0;
    for (var i = 0; i < magT.length; i++) own[magT[i][0]][magT[i][1]] = 1;

    function draw(timestamp) {
        var t = (timestamp % CYCLE_MS) / CYCLE_MS;
        ctx.clearRect(0, 0, W, H);

        ctx.save();
        ctx.translate(PAD, PAD);

        _htpDrawBoard(ctx, ROWS, COLS, TILE);
        _htpDrawOwnership(ctx, own, ROWS, COLS, TILE, [CYAN, MAGENTA]);
        _htpDrawTerritoryBorders(ctx, own, ROWS, COLS, TILE, [CYAN, MAGENTA]);

        // Blocked diagonal indicator (dashed red line)
        ctx.save();
        ctx.strokeStyle = 'rgba(255,68,68,0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(2 * TILE + TILE / 2, 1 * TILE + TILE / 2);
        ctx.lineTo(1 * TILE + TILE / 2, 2 * TILE + TILE / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Blockade warriors (cyan)
        _htpDrawPiece(ctx, 1, 1, TILE, '\u265F', CYAN);
        _htpDrawPiece(ctx, 2, 2, TILE, '\u265F', CYAN);

        // Animate magenta attacker
        var homeX = 2 * TILE + TILE / 2, homeY = 1 * TILE + TILE / 2;
        var targetX = 1 * TILE + TILE / 2, targetY = 2 * TILE + TILE / 2;
        var midX = (homeX + targetX) / 2, midY = (homeY + targetY) / 2;

        var ax, ay, showBlocked = false;

        if (t < 0.30) {
            var p = t / 0.30;
            var ease = _htpEaseInOut(p);
            ax = homeX + (midX - homeX) * ease;
            ay = homeY + (midY - homeY) * ease;
        } else if (t < 0.50) {
            var p2 = (t - 0.30) / 0.20;
            var s = 1.7;
            var back = 1 + (s + 1) * Math.pow(p2 - 1, 3) + s * Math.pow(p2 - 1, 2);
            ax = midX + (homeX - midX) * Math.min(back, 1);
            ay = midY + (homeY - midY) * Math.min(back, 1);
            showBlocked = true;
        } else {
            ax = homeX;
            ay = homeY;
            showBlocked = t < 0.65;
        }

        _htpDrawPieceAt(ctx, ax, ay, TILE, '\u265F', MAGENTA);

        if (showBlocked) {
            var alpha = t < 0.50 ? 1 : Math.max(0, 1 - (t - 0.50) / 0.15);
            ctx.save();
            ctx.font = Math.floor(TILE * 0.32) + 'px VT323, monospace';
            ctx.fillStyle = 'rgba(255,68,68,' + alpha.toFixed(2) + ')';
            ctx.textAlign = 'center';
            ctx.fillText('BLOCKED', COLS * TILE / 2, ROWS * TILE - 6);
            ctx.restore();
        }

        ctx.restore();
    }

    return { draw: draw };
};


// ============================================
// Animation: Movement Queue
// ============================================

UIController.prototype._createMovementQueueAnim = function(wrapper) {
    var COLS = 6, ROWS = 5, TILE = 38;
    var PAD = Math.max(Math.floor(TILE * 0.06), 3) + 1;
    var W = COLS * TILE + PAD * 2, H = ROWS * TILE + PAD * 2;

    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'max-width:100%;';
    wrapper.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var CYAN = '#00ffff';
    var path = [
        {row:0,col:0},{row:0,col:1},{row:0,col:2},
        {row:1,col:2},{row:2,col:2},{row:2,col:3},
        {row:2,col:4},{row:3,col:4},{row:4,col:4},{row:4,col:5}
    ];

    var STEP_MS = 700, PAUSE_MS = 1800;
    var MOVE_STEPS = path.length - 1;
    var TOTAL_MS = MOVE_STEPS * STEP_MS + PAUSE_MS;

    function draw(timestamp) {
        var t = timestamp % TOTAL_MS;
        var moveTime = MOVE_STEPS * STEP_MS;
        var inMotion = t < moveTime;
        var stepFloat = inMotion ? t / STEP_MS : MOVE_STEPS;
        var currentStep = Math.min(Math.floor(stepFloat), MOVE_STEPS - 1);
        var stepProgress = inMotion ? (stepFloat - currentStep) : 0;
        if (!inMotion) currentStep = MOVE_STEPS;

        ctx.clearRect(0, 0, W, H);

        ctx.save();
        ctx.translate(PAD, PAD);

        _htpDrawBoard(ctx, ROWS, COLS, TILE);

        // Warrior position and remaining queue path (only ahead of the piece)
        var wx, wy, queuePath;
        if (inMotion && currentStep < MOVE_STEPS) {
            var from = path[currentStep], to = path[currentStep + 1];
            var ease = _htpEaseInOut(stepProgress);
            var fracCol = from.col + (to.col - from.col) * ease;
            var fracRow = from.row + (to.row - from.row) * ease;
            wx = fracCol * TILE + TILE / 2;
            wy = fracRow * TILE + TILE / 2;
            queuePath = [{col: fracCol, row: fracRow}];
            for (var pi = currentStep + 1; pi < path.length; pi++) queuePath.push(path[pi]);
        } else {
            var last = path[path.length - 1];
            wx = last.col * TILE + TILE / 2;
            wy = last.row * TILE + TILE / 2;
            queuePath = [];
        }
        _htpDrawQueueLine(ctx, queuePath, TILE, timestamp);
        _htpDrawPieceAt(ctx, wx, wy, TILE, '\u265F', CYAN);

        ctx.restore();
    }

    return { draw: draw };
};


// ============================================
// Page 4: UI & Diplomacy
// ============================================

UIController.prototype._createHtpUIPage = function() {
    var page = document.createElement('div');
    page.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;max-width:600px;';

    var title = document.createElement('h1');
    title.textContent = 'UI & Diplomacy';
    title.style.cssText = 'font-size:44px;color:#00d4ff;text-shadow:0 0 10px #00d4ff,0 0 30px rgba(0,212,255,0.4);margin:0 0 12px;text-align:center;letter-spacing:3px;';
    page.appendChild(title);

    var subtitle = document.createElement('p');
    subtitle.style.cssText = 'font-size:18px;color:#88ccff;text-align:center;margin:0 0 28px;line-height:1.6;max-width:480px;';
    subtitle.textContent = 'The side panel gives you access to all game actions. These are the buttons you will use during gameplay.';
    page.appendChild(subtitle);

    // ── Game Buttons section ──────────────────────────────────
    var buttonsTitle = document.createElement('div');
    buttonsTitle.textContent = 'GAME BUTTONS';
    buttonsTitle.style.cssText = 'font-size:24px;color:#00d4ff;letter-spacing:2px;text-shadow:0 0 8px rgba(0,212,255,0.5);margin-bottom:16px;text-align:center;';
    page.appendChild(buttonsTitle);

    var buttons = [
        { text: 'View Players', desc: 'Opens the Players popup. Shows all players, their tech levels, and diplomacy buttons. Use this to manage war and peace.' },
        { text: 'View Relations', desc: 'Opens the Relations web. A diagram showing all players as colored dots connected by lines - grey for peace, red for war.' },
        { text: 'Production', desc: 'Choose what your city builds: warriors, settlers, diplomacy, science, repair, or heal warriors.', conditional: true },
        { text: 'Settle', desc: 'Founds a new city at the settler\'s location. The settler is consumed. Must have a 1 tile space between existing cities.', conditional: true },
        { text: 'Next Turn', desc: 'Ends your turn. Queued movements execute one step, production advances, then the next player acts.' }
    ];

    var btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex;flex-direction:column;gap:14px;width:100%;max-width:520px;margin-bottom:28px;';

    buttons.forEach(function(b) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:16px;padding:8px 12px;background:rgba(10,10,20,0.6);border:1px solid rgba(0,212,255,0.15);border-radius:4px;';

        // Button mockup matching in-game createButton style exactly
        var btn = document.createElement('div');
        btn.textContent = b.text.toUpperCase();
        btn.style.cssText = 'flex-shrink:0;width:148px;height:36px;display:flex;align-items:center;justify-content:center;background:#0a0a14;border:1px solid #00d4ff;color:#00d4ff;font-family:VT323,monospace;font-size:14px;text-transform:uppercase;box-sizing:border-box;letter-spacing:1px;line-height:1.2;';
        row.appendChild(btn);

        var textCol = document.createElement('div');
        textCol.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

        var descEl = document.createElement('div');
        descEl.textContent = b.desc;
        descEl.style.cssText = 'font-size:16px;color:#88ccff;line-height:1.5;';
        textCol.appendChild(descEl);

        if (b.conditional) {
            var condEl = document.createElement('div');
            condEl.textContent = '(only shown when applicable)';
            condEl.style.cssText = 'font-size:14px;color:#666666;';
            textCol.appendChild(condEl);
        }

        row.appendChild(textCol);
        btnContainer.appendChild(row);
    });
    page.appendChild(btnContainer);
    page.appendChild(_htpMkDivider());

    // ── Diplomacy section ──────────────────────────────────
    var diploTitle = document.createElement('div');
    diploTitle.textContent = 'DIPLOMACY';
    diploTitle.style.cssText = 'font-size:24px;color:#00d4ff;letter-spacing:2px;text-shadow:0 0 8px rgba(0,212,255,0.5);margin-bottom:12px;text-align:center;';
    page.appendChild(diploTitle);

    var diploIntro = document.createElement('div');
    diploIntro.style.cssText = 'font-size:17px;color:#88ccff;line-height:1.6;text-align:center;max-width:460px;margin-bottom:20px;';
    diploIntro.innerHTML =
        'All players start at <span style="color:#ffffff;">peace</span>. ' +
        'You must <span style="color:#ff4444;">declare war</span> before you can attack another player. ' +
        'There is a <span style="color:#00d4ff;">7-turn cooldown</span> between relation changes.';
    page.appendChild(diploIntro);

    // Diplomacy button states with in-game button mockups
    var states = [
        { label: 'Declare War', borderColor: '#00d4ff', textColor: '#00d4ff', desc: 'You are at peace. Press to declare war on this player.' },
        { label: 'Propose Peace', borderColor: '#00d4ff', textColor: '#00d4ff', desc: 'You are at war. Press to offer a peace deal.' },
        { label: 'Accept Peace', borderColor: '#ffffff', textColor: '#ffffff', desc: 'They offered you peace. Press to accept and end the war.' },
        { label: 'Rescind Peace', borderColor: '#ff8800', textColor: '#ff8800', desc: 'You offered peace. Press to take back your offer.' }
    ];

    var statesContainer = document.createElement('div');
    statesContainer.style.cssText = 'display:flex;flex-direction:column;gap:12px;width:100%;max-width:520px;margin-bottom:20px;';

    states.forEach(function(s) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:14px;padding:6px 12px;background:rgba(10,10,20,0.4);border-radius:4px;';

        // Small button mockup matching in-game createSmallButton diplomacy style
        var btn = document.createElement('div');
        btn.textContent = s.label.toUpperCase();
        btn.style.cssText = 'flex-shrink:0;width:148px;height:28px;display:flex;align-items:center;justify-content:center;background:#0a0a14;border:1px solid ' + s.borderColor + ';color:' + s.textColor + ';font-family:VT323,monospace;font-size:14px;text-transform:uppercase;box-sizing:border-box;text-align:center;line-height:1.2;';
        row.appendChild(btn);

        var descEl = document.createElement('div');
        descEl.textContent = s.desc;
        descEl.style.cssText = 'font-size:16px;color:#88ccff;line-height:1.4;';
        row.appendChild(descEl);

        statesContainer.appendChild(row);
    });
    page.appendChild(statesContainer);

    // Displacement warning
    var displacementNote = document.createElement('div');
    displacementNote.style.cssText = 'font-size:16px;color:#88ccff;line-height:1.6;text-align:center;max-width:460px;margin-bottom:28px;';
    displacementNote.innerHTML =
        'When peace is accepted, all your warriors in the other player\u2019s territory are <span style="color:#ff4444;">displaced</span> back to friendly tiles. ' +
        'If no friendly tile is available, they are destroyed.';
    page.appendChild(displacementNote);

    page.appendChild(_htpMkDivider());

    // ── Relations Web section (animated) ──────────────────
    page.appendChild(this._createHtpMechanicSection(
        'Relations Web',
        'The Relations Web shows all players as colored dots connected by lines. ' +
        'Grey lines mean peace, red lines mean war. Tap a player\u2019s dot to filter and see only their relations.',
        this._createRelationsWebAnim.bind(this)
    ));

    return page;
};


// ============================================
// Animation: Relations Web
// ============================================

UIController.prototype._createRelationsWebAnim = function(wrapper) {
    var W = 260, H = 200;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'max-width:100%;';
    wrapper.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var PLAYER_COLORS = ['#00ffff', '#ff00ff', '#00ff00', '#ff8800'];
    var PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
    var DOT_RADIUS = 18;
    var SPACING = 80;
    var half = SPACING / 2;
    var centerX = W / 2, centerY = H / 2;

    // 4 players in a square (matching in-game getRelationDotPositions)
    var positions = [
        { x: -half, y: -half, labelAbove: true },
        { x: half, y: -half, labelAbove: true },
        { x: -half, y: half, labelAbove: false },
        { x: half, y: half, labelAbove: false }
    ];

    var CYCLE_MS = 10000;

    // War timeline: [startTime, endTime, playerA, playerB]
    var warTimeline = [
        [0.15, 0.55, 0, 1],
        [0.35, 0.75, 2, 3],
        [0.55, 0.90, 1, 2]
    ];

    function isAtWar(t, a, b) {
        for (var i = 0; i < warTimeline.length; i++) {
            var w = warTimeline[i];
            if ((w[2] === a && w[3] === b) || (w[2] === b && w[3] === a)) {
                if (t >= w[0] && t < w[1]) return true;
            }
        }
        return false;
    }

    function draw(timestamp) {
        var t = (timestamp % CYCLE_MS) / CYCLE_MS;
        ctx.clearRect(0, 0, W, H);

        // Draw lines between all 6 pairs
        for (var i = 0; i < 4; i++) {
            for (var j = i + 1; j < 4; j++) {
                var fromX = centerX + positions[i].x;
                var fromY = centerY + positions[i].y;
                var toX = centerX + positions[j].x;
                var toY = centerY + positions[j].y;

                var atWar = isAtWar(t, i, j);
                ctx.strokeStyle = atWar ? 'rgba(255,68,68,0.9)' : 'rgba(255,255,255,0.6)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(toX, toY);
                ctx.stroke();
            }
        }

        // Draw player dots (matching in-game style: colored fill + black border)
        for (var i = 0; i < 4; i++) {
            var dx = centerX + positions[i].x;
            var dy = centerY + positions[i].y;

            ctx.beginPath();
            ctx.arc(dx, dy, DOT_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = PLAYER_COLORS[i];
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Name label (VT323 font matching in-game)
            ctx.font = '14px VT323, monospace';
            ctx.fillStyle = '#00d4ff';
            ctx.textAlign = 'center';
            if (positions[i].labelAbove) {
                ctx.fillText(PLAYER_NAMES[i], dx, dy - DOT_RADIUS - 8);
            } else {
                ctx.fillText(PLAYER_NAMES[i], dx, dy + DOT_RADIUS + 16);
            }
        }
    }

    return { draw: draw };
};


// ============================================
// Shared board renderer (matches in-game)
// ============================================

function _htpDrawBoard(ctx, rows, cols, tile) {
    var LIGHT = '#3a3a5a', DARK = '#2d2d44';
    var borderW = Math.max(Math.floor(tile * 0.06), 3);
    var gridW = cols * tile, gridH = rows * tile;

    // Checkerboard
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? LIGHT : DARK;
            ctx.fillRect(c * tile, r * tile, tile, tile);
        }
    }

    // 8-bit pixel grid lines (matches CSS box-shadow: inset 1px 1px white, -1px -1px black)
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var x = c * tile, y = r * tile;
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fillRect(x, y, tile, 1);
            ctx.fillRect(x, y, 1, tile);
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(x, y + tile - 1, tile, 1);
            ctx.fillRect(x + tile - 1, y, 1, tile);
        }
    }

    // Outline border (like CSS outline on the grid)
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = borderW;
    ctx.strokeRect(-borderW / 2, -borderW / 2, gridW + borderW, gridH + borderW);
}


// ============================================
// Ownership markers (matches _drawOwnershipMarkers)
// ============================================

function _htpDrawOwnership(ctx, ownership, rows, cols, tile, colors) {
    var padding = Math.max(Math.floor(tile * 0.05), 1);
    var strokeWidth = Math.max(Math.floor(tile * 0.04), 2);
    var innerSize = tile - padding * 2;

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Group tiles by owner
    var byOwner = {};
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var o = ownership[r][c];
            if (o !== null) {
                if (!byOwner[o]) byOwner[o] = [];
                byOwner[o].push({ row: r, col: c });
            }
        }
    }

    for (var owner in byOwner) {
        var color = colors[owner];
        var tiles = byOwner[owner];

        // Fill — player color at 0.25 alpha
        ctx.fillStyle = _htpColorAlpha(color, 0.25);
        for (var i = 0; i < tiles.length; i++) {
            ctx.fillRect(tiles[i].col * tile + padding, tiles[i].row * tile + padding, innerSize, innerSize);
        }

        // Stroke — player color at 0.5 alpha
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = _htpColorAlpha(color, 0.5);
        for (var i = 0; i < tiles.length; i++) {
            ctx.strokeRect(tiles[i].col * tile + padding, tiles[i].row * tile + padding, innerSize, innerSize);
        }
    }
    ctx.restore();
}


// ============================================
// Territory borders (matches drawTerritoryBorders)
// ============================================

function _htpDrawTerritoryBorders(ctx, ownership, rows, cols, tile, colors) {
    var borderWidth = Math.max(Math.floor(tile * 0.07), 3);
    var radius = Math.max(Math.floor(tile * 0.18), 6);
    var dashLen = Math.max(Math.floor(tile * 0.12), 5);
    var glowWidth = borderWidth * 3;
    var glowAlpha = 0.35;

    // Build tile-edge positions
    var posX = []; for (var i = 0; i <= cols; i++) posX.push(i * tile);
    var posY = []; for (var i = 0; i <= rows; i++) posY.push(i * tile);

    // Collect edges & corners
    var edges = [];
    var corners = {};

    function addCorner(x, y, owner, dir) {
        var key = x + ',' + y;
        if (!corners[key]) corners[key] = { x: x, y: y, owners: {}, edges: {} };
        corners[key].owners[owner] = true;
        corners[key].edges[dir] = owner;
    }

    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            var owner = ownership[r][c];
            if (owner === null) continue;

            var x0 = posX[c], x1 = posX[c + 1];
            var y0 = posY[r], y1 = posY[r + 1];
            var topN   = r > 0         ? ownership[r - 1][c] : -1;
            var botN   = r < rows - 1  ? ownership[r + 1][c] : -1;
            var leftN  = c > 0         ? ownership[r][c - 1] : -1;
            var rightN = c < cols - 1  ? ownership[r][c + 1] : -1;

            if (topN !== owner) { edges.push({ x1:x0,y1:y0,x2:x1,y2:y0,owner:owner,neighbor:topN,horiz:true }); addCorner(x0,y0,owner,'right'); addCorner(x1,y0,owner,'left'); }
            if (botN !== owner) { edges.push({ x1:x0,y1:y1,x2:x1,y2:y1,owner:owner,neighbor:botN,horiz:true }); addCorner(x0,y1,owner,'right'); addCorner(x1,y1,owner,'left'); }
            if (leftN !== owner) { edges.push({ x1:x0,y1:y0,x2:x0,y2:y1,owner:owner,neighbor:leftN,horiz:false }); addCorner(x0,y0,owner,'down'); addCorner(x0,y1,owner,'up'); }
            if (rightN !== owner) { edges.push({ x1:x1,y1:y0,x2:x1,y2:y1,owner:owner,neighbor:rightN,horiz:false }); addCorner(x1,y0,owner,'down'); addCorner(x1,y1,owner,'up'); }
        }
    }

    // Corner radii
    var cornerRadii = {};
    for (var key in corners) {
        var e = corners[key].edges;
        var hasCorner = (e.right !== undefined && e.down !== undefined) ||
                        (e.right !== undefined && e.up !== undefined) ||
                        (e.left !== undefined && e.down !== undefined) ||
                        (e.left !== undefined && e.up !== undefined);
        cornerRadii[key] = hasCorner ? radius : 0;
    }

    function adjustEdge(edge) {
        var r1 = cornerRadii[edge.x1 + ',' + edge.y1] || 0;
        var r2 = cornerRadii[edge.x2 + ',' + edge.y2] || 0;
        return edge.horiz
            ? { ax1: edge.x1 + r1, ay1: edge.y1, ax2: edge.x2 - r2, ay2: edge.y2 }
            : { ax1: edge.x1, ay1: edge.y1 + r1, ax2: edge.x2, ay2: edge.y2 - r2 };
    }

    function ek(e) { return e.x1+','+e.y1+'-'+e.x2+','+e.y2; }
    function rk(e) { return e.x2+','+e.y2+'-'+e.x1+','+e.y1; }

    // Dedup & group by owner
    var drawn = {};
    var edgesByOwner = {};
    var cornersByOwner = {};

    for (var i = 0; i < edges.length; i++) {
        var edge = edges[i];
        var k = ek(edge);
        if (drawn[k] || drawn[rk(edge)]) continue;
        if (!edgesByOwner[edge.owner]) edgesByOwner[edge.owner] = [];
        edgesByOwner[edge.owner].push(edge);
    }

    for (var key in corners) {
        var cr = cornerRadii[key] || 0;
        if (cr === 0) continue;
        var data = corners[key];
        for (var owner in data.owners) {
            if (!cornersByOwner[owner]) cornersByOwner[owner] = [];
            cornersByOwner[owner].push({ data: data, r: cr });
        }
    }

    ctx.save();
    ctx.lineCap = 'square';

    // PASS 1: glow (wide semi-transparent)
    for (var owner in edgesByOwner) {
        var dc = _htpDarken(colors[owner]);
        ctx.lineWidth = glowWidth;
        ctx.strokeStyle = 'rgba(' + dc.r + ',' + dc.g + ',' + dc.b + ',' + glowAlpha + ')';
        ctx.beginPath();
        var oe = edgesByOwner[owner];
        for (var i = 0; i < oe.length; i++) { var adj = adjustEdge(oe[i]); ctx.moveTo(adj.ax1, adj.ay1); ctx.lineTo(adj.ax2, adj.ay2); }
        ctx.stroke();
    }

    for (var owner in cornersByOwner) {
        var dc = _htpDarken(colors[owner]);
        ctx.lineWidth = glowWidth;
        ctx.strokeStyle = 'rgba(' + dc.r + ',' + dc.g + ',' + dc.b + ',' + glowAlpha + ')';
        var oc = cornersByOwner[owner];
        for (var i = 0; i < oc.length; i++) {
            var d = oc[i].data, cr = oc[i].r, e = d.edges;
            if (e.right == owner && e.down == owner) { ctx.beginPath(); ctx.arc(d.x+cr,d.y+cr,cr,Math.PI,Math.PI*1.5,false); ctx.stroke(); }
            if (e.left == owner && e.down == owner) { ctx.beginPath(); ctx.arc(d.x-cr,d.y+cr,cr,Math.PI*1.5,Math.PI*2,false); ctx.stroke(); }
            if (e.right == owner && e.up == owner) { ctx.beginPath(); ctx.arc(d.x+cr,d.y-cr,cr,Math.PI*0.5,Math.PI,false); ctx.stroke(); }
            if (e.left == owner && e.up == owner) { ctx.beginPath(); ctx.arc(d.x-cr,d.y-cr,cr,0,Math.PI*0.5,false); ctx.stroke(); }
        }
    }

    // PASS 2: main border strokes
    drawn = {};
    var solidByOwner = {};
    var dashedList = [];

    for (var i = 0; i < edges.length; i++) {
        var edge = edges[i];
        var k = ek(edge);
        if (drawn[k] || drawn[rk(edge)]) continue;
        drawn[k] = true;
        var adj = adjustEdge(edge);
        var len = edge.horiz ? (adj.ax2 - adj.ax1) : (adj.ay2 - adj.ay1);
        if (len <= 0) continue;

        if (edge.neighbor !== null && edge.neighbor >= 0) {
            dashedList.push({ ax1:adj.ax1,ay1:adj.ay1,ax2:adj.ax2,ay2:adj.ay2,len:len,horiz:edge.horiz,owner:edge.owner,neighbor:edge.neighbor });
        } else {
            if (!solidByOwner[edge.owner]) solidByOwner[edge.owner] = [];
            solidByOwner[edge.owner].push(adj);
        }
    }

    // Solid borders
    for (var owner in solidByOwner) {
        var dc = _htpDarken(colors[owner]);
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = 'rgb(' + dc.r + ',' + dc.g + ',' + dc.b + ')';
        ctx.beginPath();
        var segs = solidByOwner[owner];
        for (var i = 0; i < segs.length; i++) { ctx.moveTo(segs[i].ax1, segs[i].ay1); ctx.lineTo(segs[i].ax2, segs[i].ay2); }
        ctx.stroke();
    }

    // Dashed borders (shared edges — alternating player colours)
    for (var di = 0; di < dashedList.length; di++) {
        var dd = dashedList[di];
        var dc1 = _htpDarken(colors[dd.owner]);
        var dc2 = _htpDarken(colors[dd.neighbor]);
        var n = Math.max(4, Math.round(dd.len / dashLen));
        var seg = dd.len / n;

        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = 'rgb(' + dc1.r + ',' + dc1.g + ',' + dc1.b + ')';
        ctx.beginPath();
        for (var si = 0; si < n; si += 2) {
            if (dd.horiz) { ctx.moveTo(dd.ax1 + si * seg, dd.ay1); ctx.lineTo(dd.ax1 + (si + 1) * seg, dd.ay1); }
            else { ctx.moveTo(dd.ax1, dd.ay1 + si * seg); ctx.lineTo(dd.ax1, dd.ay1 + (si + 1) * seg); }
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgb(' + dc2.r + ',' + dc2.g + ',' + dc2.b + ')';
        ctx.beginPath();
        for (var si = 1; si < n; si += 2) {
            if (dd.horiz) { ctx.moveTo(dd.ax1 + si * seg, dd.ay1); ctx.lineTo(dd.ax1 + (si + 1) * seg, dd.ay1); }
            else { ctx.moveTo(dd.ax1, dd.ay1 + si * seg); ctx.lineTo(dd.ax1, dd.ay1 + (si + 1) * seg); }
        }
        ctx.stroke();
    }

    // Corner arcs (main stroke)
    for (var owner in cornersByOwner) {
        var dc = _htpDarken(colors[owner]);
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = 'rgb(' + dc.r + ',' + dc.g + ',' + dc.b + ')';
        var oc = cornersByOwner[owner];
        for (var i = 0; i < oc.length; i++) {
            var d = oc[i].data, cr = oc[i].r, e = d.edges;
            if (e.right == owner && e.down == owner) { ctx.beginPath(); ctx.arc(d.x+cr,d.y+cr,cr,Math.PI,Math.PI*1.5,false); ctx.stroke(); }
            if (e.left == owner && e.down == owner) { ctx.beginPath(); ctx.arc(d.x-cr,d.y+cr,cr,Math.PI*1.5,Math.PI*2,false); ctx.stroke(); }
            if (e.right == owner && e.up == owner) { ctx.beginPath(); ctx.arc(d.x+cr,d.y-cr,cr,Math.PI*0.5,Math.PI,false); ctx.stroke(); }
            if (e.left == owner && e.up == owner) { ctx.beginPath(); ctx.arc(d.x-cr,d.y-cr,cr,0,Math.PI*0.5,false); ctx.stroke(); }
        }
    }

    ctx.restore();
}


// ============================================
// Queue line renderer (matches _drawMovementQueueLines)
// ============================================

function _htpDrawQueueLine(ctx, path, tile, timestamp) {
    if (!path || path.length < 2) return;
    var halfTile = tile / 2;

    // Build pixel points
    var points = [];
    for (var i = 0; i < path.length; i++) {
        points.push({ x: path[i].col * tile + halfTile, y: path[i].row * tile + halfTile });
    }

    // Segment lengths
    var totalLen = 0, segLens = [];
    for (var i = 1; i < points.length; i++) {
        var dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
        var len = Math.sqrt(dx * dx + dy * dy);
        segLens.push(len);
        totalLen += len;
    }
    if (totalLen <= 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Base thin solid red line
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,68,68,0.5)';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();

    // Wider glow with Gaussian energy pulse (sub-segment rendering)
    var CYCLE_MS = 1500;
    var SIGMA = tile * 2;
    var INV_2S2 = 1 / (2 * SIGMA * SIGMA);
    var phase = (timestamp % CYCLE_MS) / CYCLE_MS;
    var pulseCenter = phase * totalLen;
    var SUB_LEN = tile * 0.4;

    ctx.lineWidth = 5;
    var dist = 0;
    for (var seg = 0; seg < segLens.length; seg++) {
        var sLen = segLens[seg];
        var p0 = points[seg], p1 = points[seg + 1];
        var nSubs = Math.max(1, Math.round(sLen / SUB_LEN));
        var subLen = sLen / nSubs;

        for (var s = 0; s < nSubs; s++) {
            var segMid = dist + (s + 0.5) * subLen;
            var d = Math.abs(segMid - pulseCenter);
            if (d > totalLen * 0.5) d = totalLen - d;
            var gaussian = Math.exp(-(d * d) * INV_2S2);
            var glowAlpha = 0.15 + gaussian * 0.45;

            var t0 = s / nSubs, t1 = (s + 1) / nSubs;
            var x0 = p0.x + (p1.x - p0.x) * t0, y0 = p0.y + (p1.y - p0.y) * t0;
            var x1 = p0.x + (p1.x - p0.x) * t1, y1 = p0.y + (p1.y - p0.y) * t1;

            ctx.strokeStyle = 'rgba(255,68,68,' + glowAlpha.toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
        }
        dist += sLen;
    }

    // Destination circles (outer glow + inner core)
    var dest = points[points.length - 1];
    var pulse = Math.sin(timestamp * 0.004) * 0.5 + 0.5;
    var outerR = halfTile * 0.4 + pulse * halfTile * 0.15;
    var innerR = outerR * 0.6;

    ctx.beginPath();
    ctx.arc(dest.x, dest.y, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,68,68,' + (0.2 + pulse * 0.3).toFixed(3) + ')';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(dest.x, dest.y, innerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,68,68,' + (0.5 + pulse * 0.3).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}


// ============================================
// Piece renderer (matches createPieceSprite)
// ============================================

function _htpDrawPiece(ctx, row, col, tile, symbol, color) {
    _htpDrawPieceAt(ctx, col * tile + tile / 2, row * tile + tile / 2, tile, symbol, color);
}

function _htpDrawPieceAt(ctx, cx, cy, tile, symbol, color) {
    var circlePadding = Math.max(Math.floor(tile * 0.1), 4);
    var radius = tile / 2 - circlePadding;
    var strokeW = Math.max(Math.floor(tile * 0.05) + 1, 3);

    ctx.save();

    // Circle background
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(26,26,58,0.95)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeW;
    ctx.stroke();

    // Piece symbol (pixel art style text shadow)
    var fontSize = Math.max(Math.floor(tile * 0.53), 16);
    ctx.font = fontSize + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadows (2px 2px dark, -1px -1px lighter)
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(symbol, cx + 2, cy + 2 + 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillText(symbol, cx - 1, cy - 1 + 1);

    // Main symbol with glow
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.fillText(symbol, cx, cy + 1);
    ctx.shadowBlur = 0;

    ctx.restore();
}


// ============================================
// Utility helpers
// ============================================

function _htpMkDivider() {
    var div = document.createElement('div');
    div.style.cssText = 'width:200px;height:1px;background:linear-gradient(90deg,transparent,#00d4ff,transparent);margin:4px 0 28px;';
    return div;
}

function _htpColorAlpha(cssHex, alpha) {
    var hex = parseInt(cssHex.slice(1), 16);
    return 'rgba(' + ((hex >> 16) & 0xFF) + ',' + ((hex >> 8) & 0xFF) + ',' + (hex & 0xFF) + ',' + alpha + ')';
}

function _htpDarken(cssHex) {
    var hex = parseInt(cssHex.slice(1), 16);
    return {
        r: ((hex >> 16) & 0xFF) * 0.7 | 0,
        g: ((hex >> 8) & 0xFF) * 0.7 | 0,
        b: (hex & 0xFF) * 0.7 | 0
    };
}

function _htpEaseInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}


// ============================================
// Toggle the How to Play panel on / off
// ============================================

UIController.prototype.toggleHowToPlayPanel = function() {
    this.htpPanelOpen = !this.htpPanelOpen;

    if (this.htpPanelOpen) {
        if (this.optionsPanelOpen) {
            this.toggleOptionsPanel();
        }
        this.htpOverlay.style.display = 'flex';
        this._htpGoToPage(0);
    } else {
        this.htpOverlay.style.display = 'none';
        this._htpStopAnimations();
    }

    this.updateSceneInput();
};
