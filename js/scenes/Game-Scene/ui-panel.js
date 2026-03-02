// ============================================
// GAME SCENE - UI Panel Module (DOM-based)
// ============================================
// UI panel creation for desktop and mobile layouts.
// All elements are DOM-based — no Phaser containers or game objects.

// ---- Helper: create a text wrapper with setText / setColor / setAlpha ----

function _createTextSpan(text, fontSize, color, extraStyles) {
    const el = document.createElement('span');
    el.style.display = 'block';
    el.style.fontFamily = 'VT323, monospace';
    el.style.fontSize = fontSize;
    el.style.color = color;
    el.style.textTransform = 'uppercase';
    el.style.whiteSpace = 'pre-wrap';
    el.style.wordBreak = 'break-word';
    el.textContent = text;
    if (extraStyles) {
        Object.assign(el.style, extraStyles);
    }
    return {
        el: el,
        setText: function(str) { el.textContent = str; },
        setColor: function(css) { el.style.color = css; },
        setAlpha: function(a) { el.style.opacity = a; },
        setVisible: function(v) { el.style.display = v ? 'block' : 'none'; },
        // Compatibility: some callers access .visible
        get visible() { return el.style.display !== 'none'; }
    };
}

// ---- Main entry point ----

GameScene.prototype.createUIPanel = function() {
    const config = layoutConfig;

    if (config.mobile) {
        this.createMobileUIPanel();
    } else {
        this.createDesktopUIPanel();
    }
};

// ============================================
// DESKTOP PANEL
// ============================================

GameScene.prototype.createDesktopUIPanel = function() {
    const panel = this.uiPanel;

    // Panel styling — neon terminal background with border
    panel.style.background = '#0a0a14';
    panel.style.borderLeft = '2px solid #00d4ff';
    panel.style.boxSizing = 'border-box';
    panel.style.padding = '10px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '0';

    // ---- Turn text ----
    this.turnText = _createTextSpan('TURN: PLAYER 1', '20px', COLORS.textPrimary);
    this.turnText.el.style.marginBottom = '10px';
    panel.appendChild(this.turnText.el);

    // ---- Tech text ----
    this.techText = _createTextSpan('TECH: 0', '18px', COLORS.textSecondary);
    this.techText.el.style.marginBottom = '16px';
    panel.appendChild(this.techText.el);

    // ---- View Players button ----
    this.viewPlayersBtn = this.createButton(0, 0, 'View Players', () => this.showPlayersPopup());
    this.viewPlayersBtn.el.style.marginBottom = '8px';
    panel.appendChild(this.viewPlayersBtn.el);

    // ---- View Relations button ----
    this.viewRelationsBtn = this.createButton(0, 0, 'View Relations', () => this.showRelationsPopup());
    this.viewRelationsBtn.el.style.marginBottom = '20px';
    panel.appendChild(this.viewRelationsBtn.el);

    // Hide player/relations buttons for the first three campaign levels
    if (this.scenarioIndex !== null && this.scenarioIndex <= 2) {
        this.viewPlayersBtn.setVisible(false);
        this.viewRelationsBtn.setVisible(false);
    }

    // ---- Selected label ----
    const selectedLabel = document.createElement('span');
    selectedLabel.style.fontFamily = 'VT323, monospace';
    selectedLabel.style.fontSize = '18px';
    selectedLabel.style.color = COLORS.textPrimary;
    selectedLabel.style.textTransform = 'uppercase';
    selectedLabel.textContent = 'SELECTED:';
    selectedLabel.style.marginBottom = '4px';
    selectedLabel.style.display = 'block';
    panel.appendChild(selectedLabel);

    // ---- Selected info text ----
    this.selectedInfoText = _createTextSpan('None', '16px', COLORS.textSecondary);
    this.selectedInfoText.el.style.marginBottom = '16px';
    this.selectedInfoText.el.style.minHeight = '80px';
    panel.appendChild(this.selectedInfoText.el);

    // ---- Production button (hidden by default, shown when city selected) ----
    this.desktopProductionBtn = this.createButton(0, 0, 'Production', () => this.showProductionPopup());
    this.desktopProductionBtn.setVisible(false);
    this.desktopProductionBtn.el.style.marginBottom = '8px';
    panel.appendChild(this.desktopProductionBtn.el);

    // ---- Settle button (hidden by default, shown when settler selected) ----
    this.settleBtn = this.createButton(0, 0, 'Settle', () => this.settleCity());
    this.settleBtn.setVisible(false);
    this.settleBtn.el.style.marginBottom = '8px';
    panel.appendChild(this.settleBtn.el);

    // ---- Spacer to push Next Turn button to bottom ----
    const spacer = document.createElement('div');
    spacer.style.flexGrow = '1';
    panel.appendChild(spacer);

    // ---- Next Turn button (sound handled by endTurn() after guards) ----
    this.nextTurnBtn = this.createButton(0, 0, 'Next Turn', () => this.endTurn());
    this.nextTurnBtn.el._noAutoSound = true;
    this.nextTurnBtn.el.style.height = '40px';
    panel.appendChild(this.nextTurnBtn.el);

    // ---- Compatibility arrays/objects ----
    this.playerEntries = [];
    this.isMobilePlayersPopup = true;
    this.productionButtons = [];

    // Dummy repeat toggle for compatibility (popup has the real one)
    this.repeatToggle = {
        container: { setVisible: function() {} },
        setEnabled: function() {}
    };

    // Create popups (hidden by default)
    this.createPlayersPopup();
    this.createProductionPopup();
    this.createRelationsPopup();
};

// ============================================
// MOBILE PANEL
// ============================================

GameScene.prototype.createMobileUIPanel = function() {
    const panel = this.uiPanel;
    const config = layoutConfig;
    const panelWidth = config.panelWidth || (BOARD_SIZE * TILE_SIZE + BOARD_OFFSET * 2);
    const panelHeight = config.panelHeight || 180;

    // Touch scale factor for high-DPI devices
    const touchScale = (config.isTouch && config.highDPI) ? 1.25 : 1;

    // Panel styling
    panel.style.background = '#0a0a14';
    panel.style.border = '2px solid #00d4ff';
    panel.style.boxSizing = 'border-box';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'row';
    panel.style.overflow = 'hidden';

    const padding = Math.max(Math.floor(panelWidth * 0.03), 8);

    // Scale font sizes based on panel width and touch scale
    const baseFontScale = Math.min(panelWidth / 400, 1) * touchScale;
    const titleFontSize = Math.max(Math.floor(15 * baseFontScale), 12);
    const labelFontSize = Math.max(Math.floor(13 * baseFontScale), 11);
    const smallFontSize = Math.max(Math.floor(12 * baseFontScale), 10);

    // ---- Left column (42%) ----
    const leftCol = document.createElement('div');
    leftCol.style.width = '42%';
    leftCol.style.display = 'flex';
    leftCol.style.flexDirection = 'column';
    leftCol.style.padding = padding + 'px';
    leftCol.style.boxSizing = 'border-box';
    leftCol.style.gap = Math.floor(padding * 0.4) + 'px';
    leftCol.style.overflow = 'hidden';

    // Turn text
    this.turnText = _createTextSpan('TURN: PLAYER 1', titleFontSize + 'px', COLORS.textPrimary);
    leftCol.appendChild(this.turnText.el);

    // Tech text
    this.techText = _createTextSpan('TECH: 0', labelFontSize + 'px', COLORS.textSecondary);
    this.techText.el.style.marginBottom = Math.floor(labelFontSize * 0.6) + 'px';
    leftCol.appendChild(this.techText.el);

    // View Players button
    const btnHeight = Math.max(Math.floor(panelHeight * 0.15 * touchScale), 28);
    this.viewPlayersBtn = this.createButton(0, 0, 'View Players', () => this.showPlayersPopup(), 0, btnHeight);
    leftCol.appendChild(this.viewPlayersBtn.el);

    // View Relations button
    this.viewRelationsBtn = this.createButton(0, 0, 'View Relations', () => this.showRelationsPopup(), 0, btnHeight);
    leftCol.appendChild(this.viewRelationsBtn.el);

    // Hide player/relations buttons for the first three campaign levels
    if (this.scenarioIndex !== null && this.scenarioIndex <= 2) {
        this.viewPlayersBtn.setVisible(false);
        this.viewRelationsBtn.setVisible(false);
    }

    // Mobile Production button (hidden by default)
    this.mobileProductionBtn = this.createButton(0, 0, 'Production', () => this.showProductionPopup(), 0, btnHeight);
    this.mobileProductionBtn.setVisible(false);
    leftCol.appendChild(this.mobileProductionBtn.el);

    // Mobile Settle button (hidden by default)
    this.mobileSettleBtn = this.createButton(0, 0, 'Settle', () => this.settleCity(), 0, btnHeight);
    this.mobileSettleBtn.setVisible(false);
    leftCol.appendChild(this.mobileSettleBtn.el);

    panel.appendChild(leftCol);

    // ---- Right column ----
    const rightCol = document.createElement('div');
    rightCol.style.flex = '1';
    rightCol.style.display = 'flex';
    rightCol.style.flexDirection = 'column';
    rightCol.style.padding = padding + 'px';
    rightCol.style.boxSizing = 'border-box';
    rightCol.style.overflow = 'hidden';
    rightCol.style.borderLeft = '1px solid #00d4ff33';

    // Selected label
    const selectedLabel = document.createElement('span');
    selectedLabel.style.fontFamily = 'VT323, monospace';
    selectedLabel.style.fontSize = labelFontSize + 'px';
    selectedLabel.style.color = COLORS.textPrimary;
    selectedLabel.style.textTransform = 'uppercase';
    selectedLabel.textContent = 'SELECTED:';
    selectedLabel.style.display = 'block';
    rightCol.appendChild(selectedLabel);

    // Selected info text
    this.selectedInfoText = _createTextSpan('None', smallFontSize + 'px', COLORS.textSecondary);
    this.selectedInfoText.el.style.marginBottom = '4px';
    this.selectedInfoText.el.style.minHeight = Math.floor(panelHeight * 0.2) + 'px';
    rightCol.appendChild(this.selectedInfoText.el);

    // Production buttons — responsive grid
    this.productionButtons = [];
    const prodTypes = ['DIPLOMACY', 'SCIENCE', 'WARRIOR', 'SETTLER', 'REPAIR', 'HEAL_WARRIORS'];

    const prodGrid = document.createElement('div');
    prodGrid.style.display = 'flex';
    prodGrid.style.flexWrap = 'wrap';
    prodGrid.style.gap = Math.floor(padding * 0.4) + 'px';

    prodTypes.forEach((type) => {
        const btn = this.createSmallButton(
            0, 0,
            PRODUCTION_TYPES[type].name.substring(0, 7),
            () => this.selectProduction(type)
        );
        btn.setVisible(false);
        btn.el.style.flex = '1 0 28%';
        btn.el.style.maxWidth = '33%';
        prodGrid.appendChild(btn.el);
        this.productionButtons.push({ btn, type });
    });

    rightCol.appendChild(prodGrid);

    // Repeat toggle
    this.repeatToggle = this.createToggleSwitch(0, 0, 'Repeat', (enabled) => this.toggleRepeat(enabled), baseFontScale);
    this.repeatToggle.container.setVisible(false);
    rightCol.appendChild(this.repeatToggle.container.el);

    // Settle button (right column version)
    const prodBtnHeight = Math.max(Math.floor(panelHeight * 0.13 * touchScale), 24);
    this.settleBtn = this.createSmallButton(0, 0, 'Settle', () => this.settleCity());
    this.settleBtn.setVisible(false);
    rightCol.appendChild(this.settleBtn.el);

    panel.appendChild(rightCol);

    // ---- Next Turn button (far right, full height) ----
    const nextBtnWidth = Math.max(Math.floor(panelWidth * 0.19 * touchScale), 80);
    this.nextTurnBtn = this.createButton(0, 0, 'Next\nTurn', () => this.endTurn(), nextBtnWidth, 0, 30);
    this.nextTurnBtn.el._noAutoSound = true;
    this.nextTurnBtn.el.style.flexShrink = '0';
    this.nextTurnBtn.el.style.width = nextBtnWidth + 'px';
    this.nextTurnBtn.el.style.height = 'calc(100% - 8px)';
    this.nextTurnBtn.el.style.margin = '4px 4px 4px 0';
    this.nextTurnBtn.el.style.whiteSpace = 'pre-wrap';
    panel.appendChild(this.nextTurnBtn.el);

    // ---- Compatibility ----
    this.playerEntries = [];
    this.isMobilePlayersPopup = true;

    // Create popups (hidden by default)
    this.createPlayersPopup();
    this.createProductionPopup();
    this.createRelationsPopup();
};

// ============================================
// createButton
// ============================================
// Creates a DOM <button> styled as a neon terminal button.
// x, y are IGNORED (kept for signature compatibility) — buttons
// flow in DOM layout. Returns a wrapper object with the same
// API surface that the rest of the codebase expects.

GameScene.prototype.createButton = function(x, y, text, callback, width, height, size) {
    width = width || 0;   // 0 = auto (100%)
    height = height || 36;
    size = size || 0;

    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = text.toUpperCase();

    // Core styling
    el.style.display = 'block';
    el.style.width = width > 0 ? width + 'px' : '100%';
    el.style.height = height > 0 ? height + 'px' : 'auto';
    el.style.padding = '4px 8px';
    el.style.boxSizing = 'border-box';
    el.style.background = '#0a0a14';
    el.style.border = '1px solid #00d4ff';
    el.style.color = COLORS.textPrimary;
    el.style.fontFamily = 'VT323, monospace';
    el.style.textTransform = 'uppercase';
    el.style.cursor = 'pointer';
    el.style.outline = 'none';
    el.style.whiteSpace = 'pre-wrap';
    el.style.lineHeight = '1.2';
    el.style.transition = 'background 0.1s';

    // Font size: explicit, or based on height
    let fontSize = size;
    if (fontSize === 0) {
        fontSize = height > 0 ? Math.max(Math.floor(height * 0.4), 10) : 14;
    }
    el.style.fontSize = fontSize + 'px';

    // Hover effect (skip on touch devices where mouseenter sticks)
    if (window.matchMedia('(hover: hover)').matches) {
        el.addEventListener('mouseenter', function() {
            el.style.background = 'rgba(0,212,255,0.2)';
        });
        el.addEventListener('mouseleave', function() {
            el.style.background = '#0a0a14';
        });
    }

    // Store scene reference for click sound
    const scene = this;
    el.addEventListener('click', function(e) {
        e.preventDefault();
        if (!el._noAutoSound) scene.playClickSound();
        callback();
    });

    // ---- Build wrapper ----
    const wrapper = {
        el: el,

        // bg sub-object — manipulates the button element's CSS
        bg: {
            setFillStyle: function(hex) {
                el.style.background = hexToCSSHex(hex);
            },
            setAlpha: function(a) {
                el.style.opacity = a;
            },
            setStrokeStyle: function(w, hex) {
                el.style.borderWidth = w + 'px';
                el.style.borderStyle = 'solid';
                el.style.borderColor = hexToCSSHex(hex);
            }
        },

        // label sub-object — manipulates the button text
        label: {
            setText: function(str) {
                el.textContent = str.toUpperCase();
            },
            setColor: function(css) {
                el.style.color = css;
            },
            setAlpha: function(a) {
                // Apply opacity only to text (use color alpha channel)
                // Since the element opacity affects bg too, we use a combined approach:
                // set the overall element opacity if bg also needs it, or just text color.
                // For simplicity, set the button's opacity (matches old Phaser behavior)
                el.style.opacity = a;
            }
        },

        setVisible: function(v) {
            el.style.display = v ? 'block' : 'none';
        },

        get visible() {
            return el.style.display !== 'none';
        },

        setInteractive: function(opts) {
            el.disabled = false;
            if (opts && opts.useHandCursor) {
                el.style.cursor = 'pointer';
            }
            el.style.pointerEvents = 'auto';
        },

        disableInteractive: function() {
            el.disabled = true;
            el.style.cursor = 'default';
            el.style.pointerEvents = 'none';
        },

        setDepth: function(z) {
            el.style.zIndex = z;
        },

        on: function(event, fn) {
            // Map Phaser-style event names to DOM events
            const map = {
                'pointerover': 'mouseenter',
                'pointerout': 'mouseleave',
                'pointerdown': 'mousedown',
                'pointerup': 'mouseup'
            };
            el.addEventListener(map[event] || event, fn);
        }
    };

    return wrapper;
};

// ============================================
// createSmallButton
// ============================================
// Same as createButton but with smaller default sizing and a
// `.selected` property for toggle highlighting.

GameScene.prototype.createSmallButton = function(x, y, text, callback, width, height) {
    width = width || 0;
    height = height || 24;

    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = text.toUpperCase();

    // Font size based on button height
    const fontSize = Math.max(Math.floor(height * 0.5), 8);

    // Core styling
    el.style.display = 'block';
    el.style.width = width > 0 ? width + 'px' : '100%';
    el.style.height = height > 0 ? height + 'px' : 'auto';
    el.style.padding = '2px 6px';
    el.style.boxSizing = 'border-box';
    el.style.background = '#0a0a14';
    el.style.border = '1px solid #00d4ff';
    el.style.color = COLORS.textPrimary;
    el.style.fontFamily = 'VT323, monospace';
    el.style.fontSize = fontSize + 'px';
    el.style.textTransform = 'uppercase';
    el.style.cursor = 'pointer';
    el.style.outline = 'none';
    el.style.transition = 'background 0.1s';
    el.style.lineHeight = '1.2';
    el.style.textAlign = 'center';

    let _selected = false;

    // Hover effect (skip on touch devices where mouseenter sticks)
    if (window.matchMedia('(hover: hover)').matches) {
        el.addEventListener('mouseenter', function() {
            if (!_selected) {
                el.style.background = 'rgba(0,212,255,0.2)';
            }
        });
        el.addEventListener('mouseleave', function() {
            if (!_selected) {
                el.style.background = '#0a0a14';
            }
        });
    }

    // Click
    const scene = this;
    el.addEventListener('click', function(e) {
        e.preventDefault();
        scene.playClickSound();
        callback();
    });

    // ---- Build wrapper ----
    const wrapper = {
        el: el,

        get selected() { return _selected; },
        set selected(v) { _selected = v; },

        bg: {
            setFillStyle: function(hex) {
                el.style.background = hexToCSSHex(hex);
            },
            setAlpha: function(a) {
                el.style.opacity = a;
            },
            setStrokeStyle: function(w, hex) {
                el.style.borderWidth = w + 'px';
                el.style.borderStyle = 'solid';
                el.style.borderColor = hexToCSSHex(hex);
            }
        },

        label: {
            setText: function(str) {
                el.textContent = str.toUpperCase();
            },
            setColor: function(css) {
                el.style.color = css;
            },
            setAlpha: function(a) {
                el.style.opacity = a;
            }
        },

        setVisible: function(v) {
            el.style.display = v ? 'block' : 'none';
        },

        get visible() {
            return el.style.display !== 'none';
        },

        setInteractive: function(opts) {
            el.disabled = false;
            if (opts && opts.useHandCursor) {
                el.style.cursor = 'pointer';
            }
            el.style.pointerEvents = 'auto';
        },

        disableInteractive: function() {
            el.disabled = true;
            el.style.cursor = 'default';
            el.style.pointerEvents = 'none';
        },

        setDepth: function(z) {
            el.style.zIndex = z;
        },

        on: function(event, fn) {
            const map = {
                'pointerover': 'mouseenter',
                'pointerout': 'mouseleave',
                'pointerdown': 'mousedown',
                'pointerup': 'mouseup'
            };
            el.addEventListener(map[event] || event, fn);
        }
    };

    return wrapper;
};

// ============================================
// createToggleSwitch
// ============================================
// Creates a DOM toggle switch element.

GameScene.prototype.createToggleSwitch = function(x, y, labelText, callback, scale) {
    scale = scale || 1;

    const fontSize = Math.max(Math.floor(12 * scale), 9);
    const switchWidth = Math.floor(40 * scale);
    const switchHeight = Math.floor(20 * scale);
    const knobDiameter = Math.floor(16 * scale);

    // Outer wrapper
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '8px';
    wrapper.style.cursor = 'pointer';
    wrapper.style.userSelect = 'none';
    wrapper.style.margin = '4px 0';

    // Label
    const label = document.createElement('span');
    label.style.fontFamily = 'VT323, monospace';
    label.style.fontSize = fontSize + 'px';
    label.style.color = COLORS.textSecondary;
    label.style.textTransform = 'uppercase';
    label.textContent = labelText.toUpperCase();
    wrapper.appendChild(label);

    // Switch track
    const track = document.createElement('div');
    track.style.width = switchWidth + 'px';
    track.style.height = switchHeight + 'px';
    track.style.borderRadius = (switchHeight / 2) + 'px';
    track.style.background = '#0a0a14';
    track.style.border = '1px solid rgba(0,212,255,0.4)';
    track.style.position = 'relative';
    track.style.transition = 'background 0.15s, border-color 0.15s';
    track.style.flexShrink = '0';
    wrapper.appendChild(track);

    // Knob
    const knob = document.createElement('div');
    knob.style.width = knobDiameter + 'px';
    knob.style.height = knobDiameter + 'px';
    knob.style.borderRadius = '50%';
    knob.style.background = '#444444';
    knob.style.position = 'absolute';
    knob.style.top = ((switchHeight - knobDiameter) / 2) + 'px';
    knob.style.left = '2px';
    knob.style.transition = 'left 0.15s, background 0.15s';
    track.appendChild(knob);

    let enabled = false;

    const knobOffLeft = '2px';
    const knobOnLeft = (switchWidth - knobDiameter - 2) + 'px';

    function applyState() {
        if (enabled) {
            knob.style.left = knobOnLeft;
            knob.style.background = '#00ff88';
            track.style.background = 'rgba(0,255,136,0.3)';
            track.style.borderColor = '#00ff88';
        } else {
            knob.style.left = knobOffLeft;
            knob.style.background = '#444444';
            track.style.background = '#0a0a14';
            track.style.borderColor = 'rgba(0,212,255,0.4)';
        }
    }

    const scene = this;
    wrapper.addEventListener('click', function(e) {
        e.preventDefault();
        enabled = !enabled;
        applyState();
        scene.playClickSound();
        callback(enabled);
    });

    // Build the container wrapper with setVisible
    const containerWrapper = {
        el: wrapper,
        setVisible: function(v) {
            wrapper.style.display = v ? 'flex' : 'none';
        },
        get visible() {
            return wrapper.style.display !== 'none';
        }
    };

    return {
        container: containerWrapper,
        setEnabled: function(val) {
            enabled = val;
            applyState();
        }
    };
};

// ============================================
// createPlayerEntry
// ============================================
// Creates a player entry DOM element with color dot, name, relation
// text, and diplomacy button. Returns a wrapper with the expected
// sub-properties.

GameScene.prototype.createPlayerEntry = function(x, y, index, compact, availableWidth, touchScale) {
    compact = compact || false;
    availableWidth = availableWidth || 200;
    touchScale = touchScale || 1;

    const entryEl = document.createElement('div');
    entryEl.style.display = 'flex';
    entryEl.style.alignItems = 'center';
    entryEl.style.gap = '6px';
    entryEl.style.padding = '2px 4px';
    entryEl.style.boxSizing = 'border-box';
    entryEl.style.width = '100%';
    entryEl.style.position = 'relative';

    if (compact) {
        const baseScale = Math.min(availableWidth / 180, 1);
        const scale = baseScale * touchScale;
        const dotSize = Math.max(Math.floor(5 * scale), 4);
        const fontSize = Math.max(Math.floor(13 * scale), 10);
        const smallFontSize = Math.max(Math.floor(12 * scale), 9);

        // Color dot
        const dotEl = document.createElement('div');
        dotEl.style.width = (dotSize * 2) + 'px';
        dotEl.style.height = (dotSize * 2) + 'px';
        dotEl.style.borderRadius = '50%';
        dotEl.style.background = '#ffffff';
        dotEl.style.flexShrink = '0';
        entryEl.appendChild(dotEl);

        // Text column
        const textCol = document.createElement('div');
        textCol.style.flex = '1';
        textCol.style.minWidth = '0';

        const nameSpan = document.createElement('span');
        nameSpan.style.display = 'block';
        nameSpan.style.fontFamily = 'VT323, monospace';
        nameSpan.style.fontSize = fontSize + 'px';
        nameSpan.style.color = COLORS.textPrimary;
        nameSpan.style.overflow = 'hidden';
        nameSpan.style.textOverflow = 'ellipsis';
        nameSpan.style.whiteSpace = 'nowrap';
        textCol.appendChild(nameSpan);

        const relationSpan = document.createElement('span');
        relationSpan.style.display = 'block';
        relationSpan.style.fontFamily = 'VT323, monospace';
        relationSpan.style.fontSize = smallFontSize + 'px';
        relationSpan.style.color = COLORS.textSecondary;
        textCol.appendChild(relationSpan);

        entryEl.appendChild(textCol);

        // Diplomacy button
        const btnWidth = Math.max(Math.floor(48 * scale), 40);
        const btnHeight = Math.max(Math.floor(22 * scale), 20);
        const diplomacyBtn = this.createSmallButton(0, 0, 'War', () => {
            this.toggleDiplomacy(index);
        }, btnWidth, btnHeight);
        diplomacyBtn.setVisible(false);
        diplomacyBtn.el.style.flexShrink = '0';
        entryEl.appendChild(diplomacyBtn.el);

        // Build entry wrapper
        const entryWrapper = {
            el: entryEl,
            colorDot: {
                el: dotEl,
                setFillStyle: function(hex) {
                    dotEl.style.background = hexToCSSHex(hex);
                }
            },
            nameText: {
                el: nameSpan,
                setText: function(str) { nameSpan.textContent = str; },
                setColor: function(css) { nameSpan.style.color = css; }
            },
            relationText: {
                el: relationSpan,
                setText: function(str) { relationSpan.textContent = str; },
                setColor: function(css) { relationSpan.style.color = css; }
            },
            diplomacyBtn: diplomacyBtn,
            playerIndex: index,
            compact: true,
            setVisible: function(v) {
                entryEl.style.display = v ? 'flex' : 'none';
            },
            get visible() {
                return entryEl.style.display !== 'none';
            }
        };

        return entryWrapper;

    } else {
        // Desktop layout

        // Color dot
        const dotEl = document.createElement('div');
        dotEl.style.width = '16px';
        dotEl.style.height = '16px';
        dotEl.style.borderRadius = '50%';
        dotEl.style.background = '#ffffff';
        dotEl.style.flexShrink = '0';
        entryEl.appendChild(dotEl);

        // Text column
        const textCol = document.createElement('div');
        textCol.style.flex = '1';
        textCol.style.minWidth = '0';

        const nameSpan = document.createElement('span');
        nameSpan.style.display = 'block';
        nameSpan.style.fontFamily = 'VT323, monospace';
        nameSpan.style.fontSize = '16px';
        nameSpan.style.color = COLORS.textPrimary;
        nameSpan.style.overflow = 'hidden';
        nameSpan.style.textOverflow = 'ellipsis';
        nameSpan.style.whiteSpace = 'nowrap';
        textCol.appendChild(nameSpan);

        const relationSpan = document.createElement('span');
        relationSpan.style.display = 'block';
        relationSpan.style.fontFamily = 'VT323, monospace';
        relationSpan.style.fontSize = '14px';
        relationSpan.style.color = COLORS.textSecondary;
        textCol.appendChild(relationSpan);

        entryEl.appendChild(textCol);

        // Diplomacy button
        const diplomacyBtn = this.createSmallButton(0, 0, 'War', () => {
            this.toggleDiplomacy(index);
        }, 110, 24);
        diplomacyBtn.setVisible(false);
        diplomacyBtn.el.style.flexShrink = '0';
        entryEl.appendChild(diplomacyBtn.el);

        // Build entry wrapper
        const entryWrapper = {
            el: entryEl,
            colorDot: {
                el: dotEl,
                setFillStyle: function(hex) {
                    dotEl.style.background = hexToCSSHex(hex);
                }
            },
            nameText: {
                el: nameSpan,
                setText: function(str) { nameSpan.textContent = str; },
                setColor: function(css) { nameSpan.style.color = css; }
            },
            relationText: {
                el: relationSpan,
                setText: function(str) { relationSpan.textContent = str; },
                setColor: function(css) { relationSpan.style.color = css; }
            },
            diplomacyBtn: diplomacyBtn,
            playerIndex: index,
            compact: false,
            setVisible: function(v) {
                entryEl.style.display = v ? 'flex' : 'none';
            },
            get visible() {
                return entryEl.style.display !== 'none';
            }
        };

        return entryWrapper;
    }
};
