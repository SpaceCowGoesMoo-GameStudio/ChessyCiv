// ============================================
// CONSTANTS
// ============================================
const BOARD_SIZE = 10;
const BASE_TILE_SIZE = 60;
const BASE_BOARD_OFFSET = 40;
const UI_PANEL_WIDTH = 280;
const UI_PANEL_HEIGHT = 320;

// Depth layers (z-ordering)
const DEPTH_PIECES = 100;
const DEPTH_PIECES_GRAYSCALE = 101;
const DEPTH_POPUPS = 2000;
const DEPTH_TOAST_BG = 2000;
const DEPTH_TOAST_TEXT = 2001;
const DEPTH_SCREEN_OVERLAY = 2999;
const DEPTH_SCREEN_CONTENT = 3000;

// Dynamic values (recalculated based on viewport)
let TILE_SIZE = BASE_TILE_SIZE;
let BOARD_OFFSET = BASE_BOARD_OFFSET;

// Responsive layout detection and calculation
const Layout = {
    isTouchDevice: function() {
        return ('ontouchstart' in window) ||
               (navigator.maxTouchPoints > 0) ||
               (navigator.msMaxTouchPoints > 0);
    },

    isMobile: function() {
        // Traditional mobile detection by screen size
        const smallScreen = window.innerWidth <= 768 ||
                           (window.innerWidth < window.innerHeight && window.innerWidth <= 1024);

        // High-DPI mobile detection: touch device with high pixel ratio in landscape
        // These are typically modern smartphones with wide screens
        const highDPIMobile = this.isTouchDevice() &&
                             window.devicePixelRatio >= 2 &&
                             window.innerWidth <= 1400;

        // Touch device with relatively small screen (even in landscape)
        const touchSmallScreen = this.isTouchDevice() &&
                                 (window.innerWidth <= 900 || window.innerHeight <= 500);

        return smallScreen || highDPIMobile || touchSmallScreen;
    },

    calculate: function() {
        const mobile = this.isMobile();
        const isTouch = this.isTouchDevice();
        const highDPI = window.devicePixelRatio >= 2;

        if (mobile) {
            // Use visualViewport for accurate sizing on real phones
            // (accounts for browser address bar, navigation bar, etc.)
            const vp = window.visualViewport;
            const vpWidth = vp ? vp.width : window.innerWidth;
            const vpHeight = vp ? vp.height : window.innerHeight;

            // Subtract fixed UI: header (40px) + footer (~55px) + small breathing room
            const mobileAvailWidth = vpWidth - 8;
            const mobileAvailHeight = vpHeight - 40 - 55 - 10;

            // Calculate tile size to fit screen width
            const minOffset = 12;
            const maxTileWidth = Math.floor((mobileAvailWidth - minOffset * 2) / BOARD_SIZE);

            // Height constraint: board + UI panel must fit
            const basePanelHeight = Math.max(Math.floor(mobileAvailHeight * 0.22), 130);
            const mobilePanelHeight = Math.min(basePanelHeight, 220);
            const maxBoardHeight = mobileAvailHeight - mobilePanelHeight;
            const maxTileHeight = Math.floor((maxBoardHeight - minOffset * 2) / BOARD_SIZE);

            // Use the smaller of width/height constrained tile sizes
            TILE_SIZE = Math.min(maxTileWidth, maxTileHeight);
            TILE_SIZE = Math.max(TILE_SIZE, 32); // Minimum usable size for touch
            // Allow slightly larger tiles on high-DPI mobile for better visibility
            const maxTile = highDPI ? Math.floor(BASE_TILE_SIZE * 1.1) : BASE_TILE_SIZE;
            TILE_SIZE = Math.min(TILE_SIZE, maxTile);

            // Scale offset proportionally but keep it reasonable
            BOARD_OFFSET = Math.max(Math.floor(TILE_SIZE * 0.3), 12);

            const boardWidth = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;
            const boardHeight = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;

            // Gap between board and panel
            const boardPanelGap = 6;

            // Panel height scales with available space
            const remainingHeight = mobileAvailHeight - boardHeight - boardPanelGap;
            const panelHeight = Math.max(Math.min(remainingHeight, 220), 130);

            return {
                mobile: true,
                isTouch: isTouch,
                highDPI: highDPI,
                gameWidth: boardWidth,
                gameHeight: boardHeight + boardPanelGap + panelHeight,
                boardOffsetX: BOARD_OFFSET,
                boardOffsetY: BOARD_OFFSET,
                panelX: 0,
                panelY: boardHeight + boardPanelGap,
                panelWidth: boardWidth,
                panelHeight: panelHeight,
                tileSize: TILE_SIZE
            };
        } else {
            // Desktop: use base sizes, only scale down if needed
            const availableWidth = window.innerWidth - 24;
            const availableHeight = window.innerHeight - 90;
            const baseBoardSize = BOARD_SIZE * BASE_TILE_SIZE + BASE_BOARD_OFFSET * 2;
            const targetWidth = baseBoardSize + UI_PANEL_WIDTH;
            const targetHeight = baseBoardSize;

            // Only scale if viewport is smaller than target
            const scale = Math.min(
                availableWidth / targetWidth,
                availableHeight / targetHeight,
                1
            );

            TILE_SIZE = Math.floor(BASE_TILE_SIZE * scale);
            BOARD_OFFSET = Math.floor(BASE_BOARD_OFFSET * scale);
            TILE_SIZE = Math.max(TILE_SIZE, 40);
            BOARD_OFFSET = Math.max(BOARD_OFFSET, 25);

            const boardWidth = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;
            const boardHeight = BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2;

            return {
                mobile: false,
                isTouch: isTouch,
                highDPI: highDPI,
                gameWidth: boardWidth + UI_PANEL_WIDTH,
                gameHeight: boardHeight,
                boardOffsetX: BOARD_OFFSET,
                boardOffsetY: BOARD_OFFSET,
                panelX: boardWidth,
                panelY: 0,
                panelWidth: UI_PANEL_WIDTH,
                panelHeight: boardHeight,
                tileSize: TILE_SIZE
            };
        }
    },

    getConfig: function() {
        return this.calculate();
    }
};

// Initial layout calculation
let layoutConfig = Layout.calculate();
const GAME_WIDTH = layoutConfig.gameWidth;
const GAME_HEIGHT = layoutConfig.gameHeight;

// Neon colors for players
const PLAYER_COLORS = [
    { name: 'Cyan', hex: 0x00ffff, css: '#00ffff' },
    { name: 'Magenta', hex: 0xff00ff, css: '#ff00ff' },
    { name: 'Lime', hex: 0x00ff00, css: '#00ff00' },
    { name: 'Orange', hex: 0xff8800, css: '#ff8800' },
    { name: 'Pink', hex: 0xff66b2, css: '#ff66b2' },
    { name: 'Yellow', hex: 0xffff00, css: '#ffff00' }
];

// Dark mode colors - Neon Terminal Style (matches header/options panel)
const COLORS = {
    background: 0x1a1a2e,
    lightTile: 0x3a3a5a,
    darkTile: 0x2d2d44,
    highlight: 0x00ff00,
    border: 0x00d4ff,           // Cyan neon border
    uiBackground: 0x0a0a14,     // Darker terminal background
    uiBackgroundAlt: 0x0d0d1a,  // Slightly lighter for panels
    textPrimary: '#00d4ff',     // Cyan neon text
    textSecondary: '#88ccff',   // Light cyan secondary
    textMuted: '#666666',       // Muted text
    buttonBg: 0x0a0a14,         // Transparent-like dark button
    buttonBorder: 0x00d4ff,     // Cyan button border
    buttonHover: 0x00d4ff,      // Cyan hover (with alpha)
    accentGreen: '#00ff88',     // Green accent for success/enabled
    accentRed: '#ff4444'        // Red accent for danger/war
};

// Piece types
const PIECE_TYPES = {
    CITY: 'city',
    WARRIOR: 'warrior',
    SETTLER: 'settler'
};

// Production types
const PRODUCTION_TYPES = {
    DIPLOMACY: { name: 'Diplomacy', turns: 4 },
    SCIENCE: { name: 'Science', turns: 10 },
    WARRIOR: { name: 'Warrior', turns: 4 },
    SETTLER: { name: 'Settler', turns: 6 },
    REPAIR: { name: 'Repair', turns: 1 },
    HEAL_WARRIORS: { name: 'Heal Warriors', turns: 2 }
};

// Minimum turns before war/peace can be changed
const RELATION_MIN_TURNS = 7;

// ============================================
// CRT PRE-RENDER MODULE
// ============================================
// Bakes CSS pixel-grid, scanlines, vignette, and jitter flash into
// bitmap images. Exposes enable()/disable() for the settings toggle.
// On mobile, auto-enables unless the user has explicitly turned it off.
var _crtPrerender = (function() {
    var overlay = null;
    var jitterEl = null;
    var resizeTimer = 0;
    var active = false;

    // ── CRT overlay bitmap (pixel grid + scanlines + vignette) ──

    function renderOverlay() {
        overlay = document.getElementById('crt-overlay');
        if (!overlay) return;

        var W = window.innerWidth;
        var H = window.innerHeight;
        var dpr = window.devicePixelRatio || 1;
        var scale = 0.5;
        var cw = (W * dpr * scale) | 0;
        var ch = (H * dpr * scale) | 0;
        if (cw === 0 || ch === 0) return;

        var cvs = document.createElement('canvas');
        cvs.width = cw;
        cvs.height = ch;
        var ctx = cvs.getContext('2d');

        // Pixel grid (3×3 CSS px → scaled)
        var gridStep = (3 * dpr * scale) | 0 || 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var x = 0; x < cw; x += gridStep) {
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, ch);
        }
        for (var y = 0; y < ch; y += gridStep) {
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(cw, y + 0.5);
        }
        ctx.stroke();

        // Scanlines (every 2 CSS px → scaled)
        var scanStep = (2 * dpr * scale) | 0 || 1;
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (var y2 = 0; y2 < ch; y2 += scanStep * 2) {
            ctx.fillRect(0, y2 + scanStep, cw, scanStep);
        }

        // Vignette (elliptical radial gradient)
        var cx = cw / 2;
        var cy = ch / 2;
        var r = Math.max(cw, ch) / Math.SQRT2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(cw / (r * 2), ch / (r * 2));
        var grad = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = grad;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();

        cvs.toBlob(function(blob) {
            if (!active) return;
            if (!blob) return;
            if (overlay._crtBlobURL) URL.revokeObjectURL(overlay._crtBlobURL);
            var url = URL.createObjectURL(blob);
            overlay._crtBlobURL = url;
            overlay.style.backgroundImage = 'url(' + url + ')';
            overlay.style.backgroundSize = '100% 100%';
            document.body.classList.add('crt-prerendered');
        }, 'image/png');
    }

    // ── Jitter flash bitmap (aberration + brightness + glitch bands) ──

    function renderJitter() {
        if (!jitterEl) return;
        var W = window.innerWidth;
        var H = window.innerHeight;
        var dpr = window.devicePixelRatio || 1;
        var sc = 0.5;
        var cw = (W * dpr * sc) | 0;
        var ch = (H * dpr * sc) | 0;
        if (cw === 0 || ch === 0) return;

        var cvs = document.createElement('canvas');
        cvs.width = cw;
        cvs.height = ch;
        var ctx = cvs.getContext('2d');

        // Brightness flash
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(0, 0, cw, ch);

        // Chromatic aberration fringe
        var fringeW = (15 * dpr * sc) | 0;
        var rg = ctx.createLinearGradient(0, 0, fringeW, 0);
        rg.addColorStop(0, 'rgba(255,0,0,0.15)');
        rg.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, fringeW, ch);

        var bg = ctx.createLinearGradient(cw - fringeW, 0, cw, 0);
        bg.addColorStop(0, 'rgba(0,0,255,0)');
        bg.addColorStop(1, 'rgba(0,0,255,0.15)');
        ctx.fillStyle = bg;
        ctx.fillRect(cw - fringeW, 0, fringeW, ch);

        var fringeH = (fringeW * 0.7) | 0;
        var tg = ctx.createLinearGradient(0, 0, 0, fringeH);
        tg.addColorStop(0, 'rgba(0,255,0,0.06)');
        tg.addColorStop(1, 'rgba(0,255,0,0)');
        ctx.fillStyle = tg;
        ctx.fillRect(0, 0, cw, fringeH);

        var btg = ctx.createLinearGradient(0, ch - fringeH, 0, ch);
        btg.addColorStop(0, 'rgba(0,255,0,0)');
        btg.addColorStop(1, 'rgba(0,255,0,0.06)');
        ctx.fillStyle = btg;
        ctx.fillRect(0, ch - fringeH, cw, fringeH);

        // Glitch scan bands
        var lineCount = 4 + ((Math.random() * 4) | 0);
        for (var i = 0; i < lineCount; i++) {
            var gy = (Math.random() * ch) | 0;
            var h = ((2 + Math.random() * 6) * dpr * sc) | 0 || 1;
            var xShift = ((Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 12) * dpr * sc) | 0;

            var pad = (dpr * sc) | 0;
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(0, gy - pad, cw, h + pad * 2);

            var x0 = Math.max(0, xShift);
            var x1 = Math.min(cw, cw + xShift);
            var lg = ctx.createLinearGradient(x0, 0, x1, 0);
            lg.addColorStop(0, 'transparent');
            lg.addColorStop(0.1, 'rgba(0,212,255,0.15)');
            lg.addColorStop(0.5, 'rgba(255,255,255,0.22)');
            lg.addColorStop(0.9, 'rgba(0,212,255,0.15)');
            lg.addColorStop(1, 'transparent');
            ctx.fillStyle = lg;
            ctx.fillRect(0, gy, cw, h);
        }

        cvs.toBlob(function(blob) {
            if (!active || !jitterEl) return;
            if (!blob) return;
            if (jitterEl._blobURL) URL.revokeObjectURL(jitterEl._blobURL);
            var url = URL.createObjectURL(blob);
            jitterEl._blobURL = url;
            jitterEl.style.backgroundImage = 'url(' + url + ')';
        }, 'image/png');
    }

    // ── Public API ──

    function enable() {
        if (active) return;
        active = true;
        overlay = document.getElementById('crt-overlay');
        if (!overlay) { active = false; return; }

        if (!jitterEl) {
            jitterEl = document.createElement('div');
            jitterEl.id = 'crt-jitter-prerender';
            document.body.appendChild(jitterEl);
        }
        jitterEl._regenerate = renderJitter;

        renderOverlay();
        renderJitter();
    }

    function disable() {
        if (!active) return;
        active = false;
        document.body.classList.remove('crt-prerendered');
        if (overlay) {
            if (overlay._crtBlobURL) URL.revokeObjectURL(overlay._crtBlobURL);
            overlay._crtBlobURL = null;
            overlay.style.backgroundImage = '';
            overlay.style.backgroundSize = '';
        }
        if (jitterEl) {
            if (jitterEl._blobURL) URL.revokeObjectURL(jitterEl._blobURL);
            jitterEl.remove();
            jitterEl = null;
        }
    }

    // Resize handler — only regenerates when active
    window.addEventListener('resize', function() {
        if (!active) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            renderOverlay();
            renderJitter();
        }, 500);
    });

    // Auto-enable on mobile if settings allow
    if (layoutConfig.mobile) {
        var shouldEnable = true;
        try {
            var saved = localStorage.getItem('civchess_ui_settings');
            if (saved) {
                var s = JSON.parse(saved);
                if (s.precomputedEffects === false) shouldEnable = false;
                if (s.crtEffects === false) shouldEnable = false;
            }
        } catch (_) {}
        if (shouldEnable) enable();
    }

    return { enable: enable, disable: disable };
})();
