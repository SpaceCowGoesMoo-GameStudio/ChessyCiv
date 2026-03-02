// ============================================
// MENU SCENE - DOM-based (replaces Phaser.Scene)
// ============================================
// Provides a Phaser-compatible API surface using DOM elements so that
// prototype-extension files (main-menu.js, new-game.js, load-game.js,
// cabhair.js, how-to-play.js) require minimal changes.

class MenuScene {
    constructor() {
        this.humanPlayers = 1;
        this.aiPlayers = 1;
        this.selectedDifficulty = AI_DIFFICULTY.MEDIUM;
        this.randomStart = true;
        this.showingMainMenu = true;
        this.mainMenuElements = [];
        this.newGameMenuElements = [];
        this.newGameElements = [];
        this.loadGameElements = [];
        this.scenarioElements = [];
        this.singlePlayerMenuElements = [];
        this.playerColors = PLAYER_COLORS.slice(0, 4).map(c => ({ ...c }));
        this._colorInputEls = [];

        // DOM references
        this.container = null;

        // Resize tracking
        this._currentScreen = null;
        this._resizeTimer = null;
        this._resizeHandler = null;

        // Input tracking for cleanup
        this._inputHandlers = [];
        this._keyHandlers = [];

        // Build Phaser-compatible API surface
        const self = this;

        this.add = {
            text:      (x, y, text, style) => self._createText(x, y, text, style),
            rectangle: (x, y, w, h, fill, alpha) => self._createRect(x, y, w, h, fill, alpha),
            container: (x, y) => self._createContainer(x, y),
            circle:    (x, y, radius, fill) => self._createCircle(x, y, radius, fill)
        };

        this.make = {
            graphics: () => self._createMaskGraphics()
        };

        this.cameras = {
            main: {
                setBackgroundColor: (color) => {
                    if (self.container) {
                        self.container.style.backgroundColor =
                            typeof color === 'number' ? hexToCSS(color) : color;
                    }
                }
            }
        };

        this.scene = {
            start: (name, data) => {
                if (self.sceneManager) return self.sceneManager.startScene(name, data);
            }
        };

        this.input = {
            _enabled: true,
            get enabled() { return this._enabled; },
            set enabled(v) {
                this._enabled = v;
                if (self.container) {
                    self.container.style.pointerEvents = v ? 'auto' : 'none';
                }
            },
            on:  (event, fn) => self._addInputListener(event, fn),
            off: (event, fn) => self._removeInputListener(event, fn),
            keyboard: {
                on:  (event, fn) => self._addKeyListener(event, fn),
                off: (event, fn) => self._removeKeyListener(event, fn)
            }
        };

        // Set by SceneManager.register()
        this.sceneManager = null;
    }

    init() {
        this.humanPlayers = 1;
        this.aiPlayers = 1;
        this.selectedDifficulty = AI_DIFFICULTY.MEDIUM;
        this.randomStart = true;
        this.showingMainMenu = true;
        this._aiOnlyMode = false;
        this.newGameMenuElements = [];
        this.scenarioElements = [];
        this.singlePlayerMenuElements = [];
        this.playerColors = PLAYER_COLORS.slice(0, 4).map(c => ({ ...c }));
        this._colorInputEls = [];

        if (this.cleanupScrolling) {
            this.cleanupScrolling();
        }
    }

    /**
     * Preload the menu scene behind the loading screen.
     * Sets up the container (hidden), migrates saves, and builds the full
     * menu DOM so that everything is ready before the loading screen fades.
     */
    async preload() {
        this._setupContainer();
        // Keep the container in the layout tree but visually hidden so the
        // browser computes layout for all menu elements during loading.
        // Using visibility:hidden (instead of display:none) allows layout
        // computation without the z-index stacking context issues that
        // break button hit-testing.
        this.container.style.display = 'block';
        this.container.style.visibility = 'hidden';

        await GameHistory.migrateFromLocalStorage();

        if (typeof uiController !== 'undefined' && uiController) {
            uiController.setMenuMode();
            uiController.registerMenuScene(this);
        }

        await this.showMainMenu();

        // Wait for the browser to fully lay out the menu.
        // Double-rAF: first frame processes layout, second confirms paint.
        await new Promise(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });

        this._preloaded = true;
        this._installResizeHandler();
    }

    _setupContainer() {
        this.container = document.getElementById('menu-scene');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'menu-scene';
            document.getElementById('game-container').appendChild(this.container);
        }
        this.container.innerHTML = '';

        // Use layoutConfig dimensions for initial setup (preload runs before
        // the CSS menu-mode class is applied). create() will apply the class
        // and read the CSS-computed size into _menuWidth/_menuHeight.
        this._menuWidth = layoutConfig.gameWidth;
        this._menuHeight = layoutConfig.gameHeight;

        this.container.style.position = 'relative';
        this.container.style.width  = this._menuWidth + 'px';
        this.container.style.height = this._menuHeight + 'px';
        this.container.style.backgroundColor = hexToCSS(COLORS.background);
        this.container.style.overflow = 'hidden';
        this.container.style.touchAction = 'none';
        this.container.style.opacity = '1';
        this.container.style.transition = '';
        this.container.style.visibility = '';
    }

    _applyMenuMode() {
        const gc = document.getElementById('game-container');
        if (gc) gc.classList.add('menu-mode');
        if (this.container) {
            // Force reflow so CSS dimensions take effect
            void this.container.offsetWidth;
            this._menuWidth = this.container.offsetWidth || this._menuWidth;
            this._menuHeight = this.container.offsetHeight || this._menuHeight;
        }
    }

    async create() {
        // If preloaded during loading screen, just reveal the container
        if (this._preloaded) {
            this._preloaded = false;
            if (this.container) {
                this.container.style.display = 'block';
                this.container.style.visibility = '';
            }
            this._applyMenuMode();
            return;
        }

        this._setupContainer();
        this.container.style.display = 'block';
        this._applyMenuMode();

        await GameHistory.migrateFromLocalStorage();

        if (typeof uiController !== 'undefined' && uiController) {
            uiController.setMenuMode();
            uiController.registerMenuScene(this);
        }

        this.showMainMenu();
        this._installResizeHandler();
    }

    _installResizeHandler() {
        if (this._resizeHandler) return;
        this._resizeHandler = () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => {
                layoutConfig = Layout.calculate();
                this._menuWidth = this.container.offsetWidth || layoutConfig.gameWidth;
                this._menuHeight = this.container.offsetHeight || layoutConfig.gameHeight;
                if (this._currentScreen) this._currentScreen();
            }, 150);
        };
        window.addEventListener('resize', this._resizeHandler);
    }

    _removeResizeHandler() {
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        clearTimeout(this._resizeTimer);
    }

    destroy() {
        this._removeResizeHandler();
        if (this._stopNewGameAnimations) this._stopNewGameAnimations();
        if (this.cleanupScrolling) this.cleanupScrolling();
        if (this._removeCampaignOverlay) this._removeCampaignOverlay();
        this.clearElements(this.newGameMenuElements || []);
        this.newGameMenuElements = [];
        this.clearElements(this.scenarioElements || []);
        this.scenarioElements = [];
        this.clearElements(this.singlePlayerMenuElements || []);
        this.singlePlayerMenuElements = [];

        // Remove native color input elements
        if (this._colorInputEls) {
            this._colorInputEls.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
            this._colorInputEls = [];
        }

        this._inputHandlers.forEach(({ domEvent, handler, el }) => {
            el.removeEventListener(domEvent, handler);
        });
        this._inputHandlers = [];

        this._keyHandlers.forEach(({ handler }) => {
            document.removeEventListener('keydown', handler);
        });
        this._keyHandlers = [];

        const gc = document.getElementById('game-container');
        if (gc) gc.classList.remove('menu-mode');

        if (this.container) {
            this.container.innerHTML = '';
            this.container.style.display = 'none';
        }
    }

    // ============================================
    // DOM FACTORY METHODS
    // ============================================

    _mapEvent(event) {
        switch (event) {
            case 'pointerover': return 'pointerenter';
            case 'pointerout':  return 'pointerleave';
            default: return event;
        }
    }

    /**
     * Create a positioned text element (mirrors Phaser.GameObjects.Text).
     */
    _createText(x, y, text, style) {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.left = x + 'px';
        el.style.top  = y + 'px';
        el.style.whiteSpace = 'pre';
        el.style.pointerEvents = 'none';
        el.style.userSelect = 'none';
        el.textContent = text;

        if (style) {
            if (style.fontSize) el.style.fontSize = style.fontSize;
            el.style.fontFamily = style.fontFamily || 'VT323, monospace';
            if (style.color) el.style.color = style.color;
            if (style.align) el.style.textAlign = style.align;
            if (style.wordWrap && style.wordWrap.width) {
                el.style.whiteSpace = 'pre-wrap';
                el.style.maxWidth = style.wordWrap.width + 'px';
                el.style.wordBreak = 'break-word';
            }
        }

        this.container.appendChild(el);

        const wrapper = {
            el,
            _originX: 0,
            _originY: 0,
            setOrigin(ox, oy) {
                this._originX = ox;
                this._originY = oy !== undefined ? oy : ox;
                el.style.transform = `translate(${-(this._originX * 100)}%, ${-(this._originY * 100)}%)`;
                return this;
            },
            setText(t) { el.textContent = t; return this; },
            setColor(c) { el.style.color = c; return this; },
            setFontSize(s) {
                el.style.fontSize = typeof s === 'number' ? s + 'px' : s;
                return this;
            },
            setAlpha(a) { el.style.opacity = a; return this; },
            get x() { return parseFloat(el.style.left); },
            set x(v) { el.style.left = v + 'px'; },
            get y() { return parseFloat(el.style.top); },
            set y(v) { el.style.top = v + 'px'; },
            destroy() { if (el.parentNode) el.parentNode.removeChild(el); }
        };

        return wrapper;
    }

    /**
     * Create a positioned rectangle (mirrors Phaser.GameObjects.Rectangle).
     * Default origin is (0.5, 0.5) so the element is centered at (x, y).
     */
    _createRect(x, y, w, h, fill, alpha) {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.left = (x - w / 2) + 'px';
        el.style.top  = (y - h / 2) + 'px';
        el.style.width  = w + 'px';
        el.style.height = h + 'px';
        el.style.boxSizing = 'border-box';

        if (fill !== undefined) {
            el.style.backgroundColor = alpha !== undefined
                ? (typeof fill === 'number' ? hexToRGBA(fill, alpha) : fill)
                : (typeof fill === 'number' ? hexToCSS(fill) : fill);
        }

        this.container.appendChild(el);

        const self = this;
        const wrapper = {
            el,
            _x: x, _y: y, _width: w, _height: h,
            _listeners: {},

            setStrokeStyle(lineWidth, color) {
                const c = typeof color === 'number' ? hexToCSS(color) : color;
                el.style.border = `${lineWidth}px solid ${c}`;
                return this;
            },
            setFillStyle(fill) {
                el.style.backgroundColor = typeof fill === 'number' ? hexToCSS(fill) : fill;
                return this;
            },
            setAlpha(a) { el.style.opacity = a; return this; },

            setInteractive(config) {
                el.style.cursor = config && config.useHandCursor ? 'pointer' : 'default';
                el.style.pointerEvents = 'auto';
                return this;
            },
            removeInteractive() {
                el.style.cursor = 'default';
                el.style.pointerEvents = 'none';
                return this;
            },

            on(event, fn) {
                const domEvent = self._mapEvent(event);
                const handler = (e) => {
                    if (e.type === 'pointerenter' || e.type === 'pointerleave') {
                        fn({ pointerType: e.pointerType });
                    } else {
                        const cr = self.container.getBoundingClientRect();
                        fn({ x: e.clientX - cr.left, y: e.clientY - cr.top, pointerType: e.pointerType });
                    }
                };
                el.addEventListener(domEvent, handler);
                if (!this._listeners[event]) this._listeners[event] = [];
                this._listeners[event].push({ fn, handler, domEvent });
                return this;
            },
            off(event, fn) {
                if (!this._listeners[event]) return this;
                if (fn === undefined) {
                    this._listeners[event].forEach(h => el.removeEventListener(h.domEvent, h.handler));
                    this._listeners[event] = [];
                } else {
                    const idx = this._listeners[event].findIndex(h => h.fn === fn);
                    if (idx >= 0) {
                        el.removeEventListener(this._listeners[event][idx].domEvent,
                                               this._listeners[event][idx].handler);
                        this._listeners[event].splice(idx, 1);
                    }
                }
                return this;
            },

            get x()  { return this._x; },
            set x(v) { this._x = v; el.style.left = (v - this._width / 2) + 'px'; },
            get y()  { return this._y; },
            set y(v) { this._y = v; el.style.top = (v - this._height / 2) + 'px'; },
            get width()  { return this._width; },
            set width(v) { this._width = v; el.style.width = v + 'px'; },

            destroy() {
                for (const evt in this._listeners) {
                    this._listeners[evt].forEach(h => el.removeEventListener(h.domEvent, h.handler));
                }
                this._listeners = {};
                if (el.parentNode) el.parentNode.removeChild(el);
            }
        };

        return wrapper;
    }

    /**
     * Create a positioned container (mirrors Phaser.GameObjects.Container).
     * Uses an inner div so that (0,0) in local coords = the container's position.
     */
    _createContainer(x, y) {
        const outer = document.createElement('div');
        outer.style.position = 'absolute';
        outer.style.left = x + 'px';
        outer.style.top  = y + 'px';
        outer.style.overflow = 'visible';

        // Inner origin div — children are positioned relative to this point
        const inner = document.createElement('div');
        inner.style.position = 'absolute';
        inner.style.left = '0px';
        inner.style.top  = '0px';
        outer.appendChild(inner);

        this.container.appendChild(outer);

        const self = this;
        const wrapper = {
            el: outer,
            _inner: inner,
            _x: x, _y: y,
            _sized: false,
            _clipWrapper: null,
            _maskOffsetX: 0, _maskOffsetY: 0,
            _listeners: {},
            _children: [],
            selected: false,
            bg: null,
            label: null,

            add(children) {
                const items = Array.isArray(children) ? children : [children];
                items.forEach(child => {
                    if (child && child.el) {
                        inner.appendChild(child.el);
                        this._children.push(child);
                    }
                });
                return this;
            },

            setSize(w, h) {
                this._sized = true;
                outer.style.width  = w + 'px';
                outer.style.height = h + 'px';
                outer.style.transform = 'translate(-50%, -50%)';
                // Shift inner so local (0,0) maps to the center of the container
                inner.style.left = (w / 2) + 'px';
                inner.style.top  = (h / 2) + 'px';
                return this;
            },

            setInteractive(config) {
                outer.style.cursor = config && config.useHandCursor ? 'pointer' : 'default';
                outer.style.pointerEvents = 'auto';
                return this;
            },
            disableInteractive() {
                outer.style.cursor = 'default';
                outer.style.pointerEvents = 'none';
                return this;
            },

            setDepth(d)  { outer.style.zIndex = d; return this; },

            setScale(s) {
                const base = this._sized ? 'translate(-50%, -50%) ' : '';
                outer.style.transform = base + `scale(${s})`;
                return this;
            },

            setMask(mask) {
                if (mask && mask._rect) {
                    const r = mask._rect;
                    const clipWrapper = document.createElement('div');
                    clipWrapper.style.position = 'absolute';
                    clipWrapper.style.left   = r.x + 'px';
                    clipWrapper.style.top    = r.y + 'px';
                    clipWrapper.style.width  = r.w + 'px';
                    clipWrapper.style.height = r.h + 'px';
                    clipWrapper.style.overflow = 'hidden';

                    const parent = outer.parentNode;
                    parent.appendChild(clipWrapper);
                    clipWrapper.appendChild(outer);

                    // Adjust position so world coordinates are preserved
                    outer.style.left = (this._x - r.x) + 'px';
                    outer.style.top  = (this._y - r.y) + 'px';

                    this._clipWrapper   = clipWrapper;
                    this._maskOffsetX   = r.x;
                    this._maskOffsetY   = r.y;
                }
                return this;
            },

            on(event, fn) {
                const domEvent = self._mapEvent(event);
                const handler = (e) => {
                    if (e.type === 'pointerenter' || e.type === 'pointerleave') {
                        fn({ pointerType: e.pointerType });
                    } else {
                        const cr = self.container.getBoundingClientRect();
                        fn({ x: e.clientX - cr.left, y: e.clientY - cr.top, pointerType: e.pointerType });
                    }
                };
                outer.addEventListener(domEvent, handler);
                if (!this._listeners[event]) this._listeners[event] = [];
                this._listeners[event].push({ fn, handler, domEvent });
                return this;
            },
            off(event, fn) {
                if (!this._listeners[event]) return this;
                if (fn === undefined) {
                    this._listeners[event].forEach(h =>
                        outer.removeEventListener(h.domEvent, h.handler));
                    this._listeners[event] = [];
                } else {
                    const idx = this._listeners[event].findIndex(h => h.fn === fn);
                    if (idx >= 0) {
                        outer.removeEventListener(
                            this._listeners[event][idx].domEvent,
                            this._listeners[event][idx].handler);
                        this._listeners[event].splice(idx, 1);
                    }
                }
                return this;
            },

            get x()  { return this._x; },
            set x(v) {
                this._x = v;
                outer.style.left = this._clipWrapper
                    ? (v - this._maskOffsetX) + 'px'
                    : v + 'px';
            },
            get y()  { return this._y; },
            set y(v) {
                this._y = v;
                outer.style.top = this._clipWrapper
                    ? (v - this._maskOffsetY) + 'px'
                    : v + 'px';
            },

            destroy() {
                for (const evt in this._listeners) {
                    this._listeners[evt].forEach(h =>
                        outer.removeEventListener(h.domEvent, h.handler));
                }
                this._listeners = {};
                this._children.forEach(c => { if (c && c.destroy) c.destroy(); });
                this._children = [];
                if (this._clipWrapper && this._clipWrapper.parentNode) {
                    this._clipWrapper.parentNode.removeChild(this._clipWrapper);
                } else if (outer.parentNode) {
                    outer.parentNode.removeChild(outer);
                }
            }
        };

        return wrapper;
    }

    /**
     * Create a circle element (mirrors Phaser.GameObjects.Arc).
     */
    _createCircle(x, y, radius, fill) {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.left   = (x - radius) + 'px';
        el.style.top    = (y - radius) + 'px';
        el.style.width  = (radius * 2) + 'px';
        el.style.height = (radius * 2) + 'px';
        el.style.borderRadius = '50%';
        el.style.boxSizing = 'border-box';
        if (fill !== undefined) {
            el.style.backgroundColor = typeof fill === 'number' ? hexToCSS(fill) : fill;
        }

        this.container.appendChild(el);

        const self = this;
        const wrapper = {
            el,
            _listeners: {},

            setStrokeStyle(lineWidth, color) {
                const c = typeof color === 'number' ? hexToCSS(color) : color;
                el.style.border = `${lineWidth}px solid ${c}`;
                return this;
            },
            setFillStyle(fill) {
                el.style.backgroundColor = typeof fill === 'number' ? hexToCSS(fill) : fill;
                return this;
            },
            setAlpha(a) { el.style.opacity = a; return this; },
            setScale(s) { el.style.transform = `scale(${s})`; return this; },

            setInteractive(config) {
                el.style.cursor = config && config.useHandCursor ? 'pointer' : 'default';
                el.style.pointerEvents = 'auto';
                return this;
            },
            removeInteractive() {
                el.style.cursor = 'default';
                el.style.pointerEvents = 'none';
                return this;
            },

            on(event, fn) {
                const domEvent = self._mapEvent(event);
                const handler = () => fn();
                el.addEventListener(domEvent, handler);
                if (!this._listeners[event]) this._listeners[event] = [];
                this._listeners[event].push({ fn, handler, domEvent });
                return this;
            },
            off(event, fn) {
                if (!this._listeners[event]) return this;
                if (fn === undefined) {
                    this._listeners[event].forEach(h =>
                        el.removeEventListener(h.domEvent, h.handler));
                    this._listeners[event] = [];
                }
                return this;
            },

            destroy() {
                for (const evt in this._listeners) {
                    this._listeners[evt].forEach(h =>
                        el.removeEventListener(h.domEvent, h.handler));
                }
                if (el.parentNode) el.parentNode.removeChild(el);
            }
        };

        return wrapper;
    }

    /**
     * Lightweight graphics stub for creating masks (overflow-based).
     */
    _createMaskGraphics() {
        let rect = null;
        return {
            fillStyle()             { /* no-op */ },
            fillRect(x, y, w, h)    { rect = { x, y, w, h }; },
            createGeometryMask()     { return { _rect: rect }; },
            destroy()               { /* no-op */ }
        };
    }

    // ============================================
    // INPUT MANAGEMENT
    // ============================================

    _addInputListener(event, fn) {
        if (!this.container) return;
        let domEvent, handler;

        if (event === 'wheel') {
            domEvent = 'wheel';
            handler = (e) => {
                e.preventDefault();
                fn(null, null, e.deltaX, e.deltaY);
            };
            this.container.addEventListener(domEvent, handler, { passive: false });
        } else {
            domEvent = event; // pointerdown, pointermove, pointerup
            handler = (e) => {
                const r = this.container.getBoundingClientRect();
                fn({ x: e.clientX - r.left, y: e.clientY - r.top });
            };
            this.container.addEventListener(domEvent, handler);
        }

        this._inputHandlers.push({ event, fn, handler, domEvent, el: this.container });
    }

    _removeInputListener(event, fn) {
        const idx = this._inputHandlers.findIndex(h => h.event === event && h.fn === fn);
        if (idx >= 0) {
            const h = this._inputHandlers[idx];
            h.el.removeEventListener(h.domEvent, h.handler);
            this._inputHandlers.splice(idx, 1);
        }
    }

    _addKeyListener(event, fn) {
        const keyPart = event.replace('keydown-', '');
        const handler = (e) => {
            if (keyPart === 'SPACE' && (e.code === 'Space' || e.key === ' ')) fn();
        };
        document.addEventListener('keydown', handler);
        this._keyHandlers.push({ event, fn, handler });
    }

    _removeKeyListener(event, fn) {
        const idx = this._keyHandlers.findIndex(h => h.event === event && h.fn === fn);
        if (idx >= 0) {
            document.removeEventListener('keydown', this._keyHandlers[idx].handler);
            this._keyHandlers.splice(idx, 1);
        }
    }

    // ============================================
    // UTILITY METHODS
    // ============================================

    clearElements(elements) {
        elements.forEach(el => {
            if (el && el.destroy) el.destroy();
        });
    }

    createButton(x, y, text, callback, width = 60, height = 40) {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width, height, COLORS.buttonBg);
        bg.setStrokeStyle(1, COLORS.buttonBorder);

        const baseFontSize = Math.max(Math.floor(height * 0.45), 14);
        const label = this.add.text(0, 0, text.toUpperCase(), {
            fontSize: `${baseFontSize}px`,
            fontFamily: 'VT323, monospace',
            color: COLORS.textPrimary
        }).setOrigin(0.5);
        label.el.style.whiteSpace = 'nowrap';

        container.add([bg, label]);
        container.setSize(width, height);
        container.setInteractive({ useHandCursor: true });

        container.selected = false;
        container.on('pointerover', () => {
            if (!container.selected) {
                bg.setFillStyle(0x00d4ff);
                bg.setAlpha(0.2);
            }
        });
        container.on('pointerout', () => {
            if (!container.selected) {
                bg.setFillStyle(COLORS.buttonBg);
                bg.setAlpha(1);
            }
        });
        container.on('pointerdown', () => {
            if (typeof soundManager !== 'undefined') {
                soundManager.resumeContext();
                soundManager.playImmediate('sound/interface/click.mp3', 100);
            }
            callback();
        });
        // Reset hover glow on touch release (pointerleave doesn't fire reliably on mobile)
        container.on('pointerup', (e) => {
            if (e.pointerType === 'touch' && !container.selected) {
                bg.setFillStyle(COLORS.buttonBg);
                bg.setAlpha(1);
            }
        });

        container.bg = bg;
        container.label = label;
        return container;
    }

    createColoredButton(x, y, text, color, callback, width = 70, height = 32) {
        const container = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, width, height, color);
        bg.setStrokeStyle(2, 0xffffff);

        const fontSize = Math.max(Math.floor(height * 0.5), 12);
        const label = this.add.text(0, 0, text.toUpperCase(), {
            fontSize: `${fontSize}px`,
            fontFamily: 'VT323, monospace',
            color: '#000000'
        }).setOrigin(0.5);
        label.el.style.whiteSpace = 'nowrap';

        container.add([bg, label]);
        container.setSize(width, height);
        container.setInteractive({ useHandCursor: true });

        container.on('pointerover', () => { bg.setAlpha(0.8); });
        container.on('pointerout',  () => { bg.setAlpha(1); });
        container.on('pointerdown', () => {
            if (typeof soundManager !== 'undefined') {
                soundManager.resumeContext();
                soundManager.playImmediate('sound/interface/click.mp3', 100);
            }
            callback();
        });
        // Reset hover dim on touch release (pointerleave doesn't fire reliably on mobile)
        container.on('pointerup', (e) => {
            if (e.pointerType === 'touch') {
                bg.setAlpha(1);
            }
        });

        container.bg = bg;
        container.label = label;
        return container;
    }
}

MenuScene.prototype.addHelpParagraph = function(content, x, y, scale = 1) {
    const mobile = layoutConfig.mobile;
    const fontSize = mobile ? `${Math.floor(16 * scale)}px` : '18px';

    const textObj = this.add.text(x, y, content, {
        fontSize: fontSize,
        fontFamily: 'VT323, monospace',
        color: COLORS.textSecondary,
        align: 'center',
        wordWrap: { width: (this._menuWidth || layoutConfig.gameWidth) * 0.8 }
    }).setOrigin(0.5);

    return textObj;
};

MenuScene.prototype.addHelpLink = function(label, url, x, y, scale = 1) {
    const mobile = layoutConfig.mobile;
    const width  = mobile ? Math.floor(200 * scale) : 250;
    const height = mobile ? Math.floor(35 * scale)  : 40;

    const btn = this.createButton(x, y, label, () => {
        window.open(url, '_blank');
    }, width, height);

    return btn;
};
