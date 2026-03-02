/**
 * UIController - Achievements panel (DOM overlay)
 * Prototype extension for UIController
 *
 * Full-screen overlay with an 8-bit styled scrollable container
 * displaying achievement cards in two rows. Cards reflect three states:
 *   - Unlocked (OBTAINED): full color with gold glow
 *   - Locked visible (UNOBTAINED): greyscale / inactive
 *   - Hidden: pixelated neon-blue/grey blur with "HIDDEN ACHIEVEMENT" text
 *
 * Pressing the Test Achievement Effect button from the options panel
 * triggers a preview unlock so the user can see the visual state change.
 */

// ============================================
// Build the Achievements panel DOM structure
// ============================================

UIController.prototype.createAchievementsPanel = function() {
    var overlay = document.createElement('div');
    overlay.id = 'achievements-panel-overlay';
    overlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:linear-gradient(180deg, #0a0a14 0%, #1a1a2e 100%);' +
        'z-index:3000;display:none;font-family:"VT323",monospace;' +
        'flex-direction:column;overflow:hidden;font-size:16px;';

    // ── Header bar ──────────────────────────────────────
    var headerBar = document.createElement('div');
    headerBar.className = 'achievements-header';
    headerBar.style.cssText =
        'flex-shrink:0;display:flex;align-items:center;justify-content:space-between;' +
        'padding:0.75em 1.25em;background:#0a0a14;border-bottom:1px solid rgba(0,212,255,0.3);';

    var backBtn = document.createElement('button');
    backBtn.className = 'achievements-back-btn';
    backBtn.style.cssText =
        'font-family:"VT323",monospace;font-size:1.125em;padding:0.5em 0.75em;' +
        'background:transparent;border:1px solid #00d4ff;color:#00d4ff;' +
        'cursor:pointer;text-transform:uppercase;letter-spacing:0.06em;';
    backBtn.textContent = '\u2190 BACK';
    var self = this;
    backBtn.addEventListener('click', function() {
        self.playClick();
        self.toggleAchievementsPanel();
    });
    headerBar.appendChild(backBtn);

    var title = document.createElement('div');
    title.className = 'achievements-title';
    title.style.cssText =
        'font-size:1.75em;color:#ffc800;text-shadow:0 0 0.6em rgba(255,200,0,0.4);' +
        'text-transform:uppercase;letter-spacing:0.19em;';
    title.textContent = 'ACHIEVEMENTS';
    headerBar.appendChild(title);

    var progressEl = document.createElement('div');
    progressEl.className = 'achievements-progress';
    progressEl.style.cssText =
        'font-size:1em;color:rgba(255,255,255,0.6);letter-spacing:0.06em;';
    progressEl.textContent = '0 / 0 UNLOCKED';
    headerBar.appendChild(progressEl);

    overlay.appendChild(headerBar);

    // ── 8-bit bordered container ────────────────────────
    var container = document.createElement('div');
    container.style.cssText =
        'flex:1;margin:1em;overflow:hidden;position:relative;' +
        'border:0.25em solid #00d4ff;' +
        'box-shadow:inset 0 0 0 0.125em #0088aa, 0 0 0.75em rgba(0,212,255,0.3);' +
        'background:rgba(0,0,0,0.4);image-rendering:pixelated;';

    // Inner pixel border for 8-bit feel
    var innerBorder = document.createElement('div');
    innerBorder.style.cssText =
        'position:absolute;top:0.125em;left:0.125em;right:0.125em;bottom:0.125em;' +
        'border:0.125em solid #005577;pointer-events:none;z-index:1;';
    container.appendChild(innerBorder);

    // Corner decorations (8-bit style)
    var corners = ['top:0;left:0;', 'top:0;right:0;', 'bottom:0;left:0;', 'bottom:0;right:0;'];
    for (var ci = 0; ci < corners.length; ci++) {
        var corner = document.createElement('div');
        corner.style.cssText =
            'position:absolute;' + corners[ci] +
            'width:0.5em;height:0.5em;background:#00d4ff;z-index:2;';
        container.appendChild(corner);
    }

    // Scrollable card area — vertical scroll with responsive grid
    var scrollArea = document.createElement('div');
    scrollArea.style.cssText =
        'position:absolute;top:0.375em;left:0.375em;right:0.375em;bottom:0.375em;' +
        'overflow-y:auto;overflow-x:hidden;' +
        'padding:0.75em;-webkit-overflow-scrolling:touch;';

    // Single grid container — responsive columns via CSS grid
    var grid = document.createElement('div');
    grid.style.cssText =
        'display:grid;' +
        'grid-template-columns:repeat(auto-fill, minmax(10em, 1fr));' +
        'gap:0.625em;justify-items:center;';

    scrollArea.appendChild(grid);
    container.appendChild(scrollArea);
    overlay.appendChild(container);

    document.body.appendChild(overlay);

    // Store references
    this.achievementsOverlay = overlay;
    this.achievementsProgressEl = progressEl;
    this.achievementsScrollArea = scrollArea;
    this.achievementsGrid = grid;
    this.achievementsPanelOpen = false;
};

// ============================================
// Build achievement cards
// ============================================

UIController.prototype._buildAchievementCards = function() {
    var grid = this.achievementsGrid;
    if (!grid) return;

    grid.innerHTML = '';

    if (typeof achievementManager === 'undefined') return;

    var defs = achievementManager.getAllDefs();
    this.achievementsProgressEl.textContent =
        achievementManager.getProgressString() + ' UNLOCKED';

    // Responsive grid — CSS handles column count via auto-fill.
    // On mobile (<768px) clamp to exactly 2 columns.
    var isMobile = window.innerWidth < 768;
    if (isMobile) {
        grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    } else {
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(17em, 1fr))';
    }

    for (var i = 0; i < defs.length; i++) {
        var def = defs[i];
        var unlocked = achievementManager.isUnlocked(def.id);
        var card = this._createAchievementCard(def, unlocked);
        grid.appendChild(card);
    }

    // If no achievements registered, show a placeholder
    if (defs.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText =
            'color:rgba(255,255,255,0.3);font-size:1.25em;text-align:center;' +
            'width:100%;padding:2.5em;grid-column:1/-1;';
        empty.textContent = 'NO ACHIEVEMENTS REGISTERED';
        grid.appendChild(empty);
    }

    // Equalize card heights to the tallest card
    if (defs.length > 0) {
        requestAnimationFrame(function() {
            var cards = grid.children;
            var maxH = 0;
            for (var j = 0; j < cards.length; j++) {
                if (cards[j].offsetHeight > maxH) maxH = cards[j].offsetHeight;
            }
            if (maxH > 0) {
                for (var j = 0; j < cards.length; j++) {
                    cards[j].style.height = maxH + 'px';
                }
            }
        });
    }
};

// ============================================
// Create a single achievement card
// ============================================

UIController.prototype._createAchievementCard = function(def, unlocked) {
    var card = document.createElement('div');

    var isMobile = window.innerWidth < 768;
    card.style.cssText =
        'position:relative;width:100%;' +
        (isMobile ? 'min-height:7.5em;' : 'aspect-ratio:4/3;') +
        'overflow:hidden;font-family:"VT323",monospace;' +
        'image-rendering:pixelated;box-sizing:border-box;padding-bottom:0.75em;';

    if (def.hidden && !unlocked) {
        // ── Hidden achievement: pixelated blur of neon blue and grey ──
        this._buildHiddenCard(card);
    } else if (!unlocked) {
        // ── Unobtained: greyscale inactive card ──
        this._buildUnobtainedCard(card, def);
    } else {
        // ── Obtained: full color with glow ──
        this._buildObtainedCard(card, def);
    }

    return card;
};

// ============================================
// Pixelated emoji icon — renders emoji onto a
// tiny canvas and scales up with pixelated rendering
// ============================================

UIController.prototype._createPixelIcon = function(emoji, size) {
    // Draw emoji at a small resolution, display scaled up
    var res = 20; // low-res canvas pixels
    var canvas = document.createElement('canvas');
    canvas.width = res;
    canvas.height = res;
    canvas.style.cssText =
        'width:' + size + ';height:' + size + ';display:block;margin:0 auto;' +
        'image-rendering:pixelated;image-rendering:crisp-edges;';

    var ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = (res * 0.8) + 'px serif';
        ctx.fillText(emoji, res / 2, res / 2);
    }
    return canvas;
};

// ============================================
// Pixelated image icon — renders image onto a
// tiny canvas and scales up with pixelated rendering
// ============================================

UIController.prototype._createPixelImageIcon = function(src, size) {
    // Square canvas — same dimensions as emoji icons
    var PW = 30, PH = 30;
    var canvas = document.createElement('canvas');
    canvas.width = PW;
    canvas.height = PH;
    canvas.style.cssText =
        'width:' + size + ';height:' + size + ';display:block;margin:0 auto;' +
        'image-rendering:pixelated;image-rendering:crisp-edges;';
    var ctx = canvas.getContext('2d');
    if (ctx) {
        var img = new Image();
        img.onload = function() {
            var scale = Math.min(PW / img.naturalWidth, PH / img.naturalHeight);
            var w = img.naturalWidth * scale;
            var h = img.naturalHeight * scale;
            ctx.drawImage(img, (PW - w) / 2, (PH - h) / 2, w, h);
        };
        img.src = src;
    }
    return canvas;
};

// ============================================
// Hidden achievement card
// ============================================

UIController.prototype._buildHiddenCard = function(card) {
    card.className = 'achv-card achv-card-hidden';
    // Pixelated neon blue and grey background via canvas
    var canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 32;
    canvas.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'image-rendering:pixelated;';

    var ctx = canvas.getContext('2d');
    if (ctx) {
        var blues = ['#00d4ff', '#0088aa', '#005577', '#003344'];
        var greys = ['#444444', '#555555', '#333333', '#666666', '#2a2a3a'];
        var allColors = blues.concat(greys);
        for (var y = 0; y < 32; y++) {
            for (var x = 0; x < 40; x++) {
                ctx.fillStyle = allColors[Math.floor(Math.random() * allColors.length)];
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }
    card.appendChild(canvas);

    // Dark overlay for readability
    var overlay = document.createElement('div');
    overlay.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(0,0,0,0.45);';
    card.appendChild(overlay);

    // Border
    var border = document.createElement('div');
    border.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'border:0.125em solid #555555;box-sizing:border-box;';
    card.appendChild(border);

    // Centered text with black outline for readability
    var label = document.createElement('div');
    label.style.cssText =
        'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'color:rgba(255,255,255,0.85);font-size:1em;text-align:center;' +
        'text-transform:uppercase;letter-spacing:0.125em;line-height:1.4;' +
        'text-shadow:' +
            '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, ' +
            '0 0 0.5em rgba(0,212,255,0.4);';
    label.textContent = 'HIDDEN\nACHIEVEMENT';
    label.style.whiteSpace = 'pre-line';
    card.appendChild(label);

    // Question mark icon with black outline
    var qmark = document.createElement('div');
    qmark.style.cssText =
        'position:absolute;bottom:0.5em;left:50%;transform:translateX(-50%);' +
        'font-size:1.5em;color:rgba(0,212,255,0.5);' +
        'text-shadow:-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;';
    qmark.textContent = '?';
    card.appendChild(qmark);
};

// ============================================
// Unobtained (visible but locked) card
// ============================================

UIController.prototype._buildUnobtainedCard = function(card, def) {
    card.className = 'achv-card achv-card-unobtained';
    // Inactive dark background
    card.style.background = '#1a1a2a';
    card.style.border = '0.125em solid #333344';

    // Status badge — upper right
    var badge = document.createElement('div');
    badge.className = 'achv-badge';
    badge.style.cssText =
        'position:absolute;top:0.375em;right:0.375em;font-size:0.7em;color:#666677;' +
        'text-transform:uppercase;letter-spacing:0.06em;';
    badge.textContent = 'UNOBTAINED';
    card.appendChild(badge);

    // Centered content wrapper
    var contentWrap = document.createElement('div');
    contentWrap.style.cssText =
        'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'width:100%;height:100%;';
    card.appendChild(contentWrap);

    // Icon (greyscale, pixelated)
    var iconWrap = document.createElement('div');
    iconWrap.style.cssText =
        'filter:grayscale(100%);opacity:0.3;';
    if (def.imageIcon) {
        iconWrap.appendChild(this._createPixelImageIcon(def.imageIcon, '5em'));
    } else {
        iconWrap.appendChild(this._createPixelIcon(def.icon || '', '3.5em'));
    }
    contentWrap.appendChild(iconWrap);

    // Name (greyed out)
    var name = document.createElement('div');
    name.className = 'achv-name';
    name.style.cssText =
        'font-size:1em;color:#555566;text-align:center;margin-top:0.5em;' +
        'text-transform:uppercase;letter-spacing:0.06em;padding:0 0.5em;';
    name.textContent = def.name;
    contentWrap.appendChild(name);

    // Description (greyed out)
    var desc = document.createElement('div');
    desc.className = 'achv-desc';
    desc.style.cssText =
        'font-size:0.75em;color:#444455;text-align:center;margin-top:0.25em;' +
        'padding:0 0.5em;line-height:1.3;white-space:pre-line;';
    desc.textContent = def.description;
    contentWrap.appendChild(desc);
};

// ============================================
// Obtained (unlocked) card
// ============================================

UIController.prototype._buildObtainedCard = function(card, def) {
    card.className = 'achv-card achv-card-obtained';
    // Full color with achievement glow
    card.style.background = 'linear-gradient(180deg, #1a1020 0%, #0a0a14 100%)';
    card.style.border = '0.125em solid #ffc800';
    card.style.boxShadow =
        '0 0 0.75em rgba(255,200,0,0.3), inset 0 0 1.25em rgba(255,200,0,0.05)';

    // Status badge — upper right
    var badge = document.createElement('div');
    badge.className = 'achv-badge';
    badge.style.cssText =
        'position:absolute;top:0.375em;right:0.375em;font-size:0.7em;color:#ffc800;' +
        'text-transform:uppercase;letter-spacing:0.06em;' +
        'text-shadow:0 0 0.375em rgba(255,200,0,0.5);';
    badge.textContent = 'OBTAINED';
    card.appendChild(badge);

    // Centered content wrapper
    var contentWrap = document.createElement('div');
    contentWrap.style.cssText =
        'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'width:100%;height:100%;';
    card.appendChild(contentWrap);

    // Icon (full color, pixelated)
    var iconWrap = document.createElement('div');
    if (def.imageIcon) {
        iconWrap.appendChild(this._createPixelImageIcon(def.imageIcon, '5em'));
    } else {
        iconWrap.appendChild(this._createPixelIcon(def.icon || '', '3.5em'));
    }
    contentWrap.appendChild(iconWrap);

    // Name (gold)
    var name = document.createElement('div');
    name.className = 'achv-name';
    name.style.cssText =
        'font-size:1em;color:#ffc800;text-align:center;margin-top:0.5em;' +
        'text-transform:uppercase;letter-spacing:0.06em;padding:0 0.5em;' +
        'text-shadow:0 0 0.5em rgba(255,200,0,0.4);';
    name.textContent = def.name;
    contentWrap.appendChild(name);

    // Description (white)
    var desc = document.createElement('div');
    desc.className = 'achv-desc';
    desc.style.cssText =
        'font-size:0.75em;color:rgba(255,255,255,0.8);text-align:center;margin-top:0.25em;' +
        'padding:0 0.5em;line-height:1.3;white-space:pre-line;';
    desc.textContent = def.description;
    contentWrap.appendChild(desc);
};

// ============================================
// Toggle the Achievements panel on / off
// ============================================

UIController.prototype.toggleAchievementsPanel = function() {
    this.achievementsPanelOpen = !this.achievementsPanelOpen;

    if (this.achievementsPanelOpen) {
        if (this.optionsPanelOpen) {
            this.toggleOptionsPanel();
        }
        // Show overlay first so layout occurs, then measure and build cards
        this.achievementsOverlay.style.display = 'flex';
        var self = this;
        requestAnimationFrame(function() {
            self._buildAchievementCards();
        });
    } else {
        this.achievementsOverlay.style.display = 'none';
    }

    this.updateSceneInput();
};
