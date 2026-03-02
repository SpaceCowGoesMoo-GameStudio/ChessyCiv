// ============================================
// SCENE MANAGER
// ============================================
// Lightweight scene management replacing Phaser's scene system.
// Manages show/hide of DOM sections and data passing between scenes.

class SceneManager {
    constructor() {
        this.scenes = new Map();
        this.currentScene = null;
        this.container = document.getElementById('game-container');
    }

    register(name, sceneInstance) {
        sceneInstance.sceneManager = this;
        this.scenes.set(name, sceneInstance);
    }

    /** Trigger a CRT horizontal-sync jitter on the game container */
    triggerCRTJitter() {
        if (!this.container) return;
        const overlay = document.getElementById('crt-overlay');

        // Position jitter on game container (GPU-composited CSS animation)
        this.container.classList.remove('crt-jitter');
        void this.container.offsetWidth;
        this.container.classList.add('crt-jitter');

        // When precomputed mode is active: flash the pre-rendered jitter bitmap
        // instead of running SVG filters, backdrop-filter glitch lines, and RAF loop.
        if (document.body.classList.contains('crt-prerendered')) {
            var jitterEl = document.getElementById('crt-jitter-prerender');
            if (jitterEl) {
                jitterEl.classList.remove('active');
                void jitterEl.offsetWidth; // restart animation
                jitterEl.classList.add('active');
            }
            var self = this;
            setTimeout(function () {
                self.container.classList.remove('crt-jitter');
                if (jitterEl) {
                    jitterEl.classList.remove('active');
                    // Re-randomize glitch band positions for next transition
                    if (jitterEl._regenerate) jitterEl._regenerate();
                }
            }, 400);
            return;
        }

        const wrapper = document.querySelector('.wrapper');
        const redOffset = document.getElementById('crt-red-offset');
        const blueOffset = document.getElementById('crt-blue-offset');

        // Apply SVG chromatic aberration filter + brightness flash to wrapper
        if (wrapper) wrapper.style.filter = 'url(#crt-aberration) brightness(1.3)';

        // Spawn horizontal glitch scan bands at random positions
        const glitchLines = [];
        const lineCount = 4 + Math.floor(Math.random() * 4);
        for (let i = 0; i < lineCount; i++) {
            const line = document.createElement('div');
            line.className = 'crt-glitch-line';
            line.style.top = (Math.random() * 100) + '%';
            line.style.height = (2 + Math.random() * 6) + 'px';
            const xShift = (Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 12);
            line.style.transform = 'translateX(' + xShift + 'px)';
            line._baseOpacity = 0.6 + Math.random() * 0.4;
            line.style.opacity = line._baseOpacity;
            if (overlay) overlay.appendChild(line);
            glitchLines.push(line);
        }

        // Animate: oscillating aberration that decays, brightness settles, lines fade
        const duration = 350;
        const startTime = performance.now();

        const animate = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);

            // Damped oscillation for RGB channel split
            const decay = 1 - t;
            const osc = Math.sin(t * Math.PI * 5); // ~2.5 oscillations
            const dx = osc * decay * decay * 10;    // peak ±10px, fast decay

            if (redOffset) redOffset.setAttribute('dx', -dx);
            if (blueOffset) blueOffset.setAttribute('dx', dx);

            // Brightness flash decays back to 1.0
            if (wrapper) {
                const bright = 1 + 0.3 * decay * decay;
                wrapper.style.filter = 'url(#crt-aberration) brightness(' + bright + ')';
            }

            // Fade glitch lines
            const lineAlpha = decay * decay;
            for (let i = 0; i < glitchLines.length; i++) {
                glitchLines[i].style.opacity = lineAlpha * glitchLines[i]._baseOpacity;
            }

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                // Clean up everything
                if (redOffset) redOffset.setAttribute('dx', 0);
                if (blueOffset) blueOffset.setAttribute('dx', 0);
                if (wrapper) wrapper.style.filter = '';
                for (let i = 0; i < glitchLines.length; i++) glitchLines[i].remove();
                this.container.classList.remove('crt-jitter');
            }
        };

        requestAnimationFrame(animate);
    }

    async startScene(name, data) {
        // Trigger CRT jitter on scene transition
        if (this.currentScene) {
            this.triggerCRTJitter();
        }

        // Destroy current scene
        if (this.currentScene) {
            const current = this.scenes.get(this.currentScene);
            if (current && current.destroy) {
                current.destroy();
            }
            // Hide current scene container
            if (current && current.container) {
                current.container.style.display = 'none';
            }
        }

        const scene = this.scenes.get(name);
        if (!scene) {
            console.error(`Scene '${name}' not found`);
            return;
        }

        this.currentScene = name;

        // Initialize and create the scene
        if (scene.init) scene.init(data || {});
        if (scene.create) await scene.create();
    }

    getScene(name) {
        return this.scenes.get(name);
    }
}

// ============================================
// TWEEN MANAGER
// ============================================
// RAF-based animation system replacing Phaser tweens.

// Easing functions
const Easing = {
    quadOut: t => t * (2 - t),
    quadIn: t => t * t,
    backOut: t => {
        const s = 1.70158;
        const t1 = t - 1;
        return 1 + (s + 1) * t1 * t1 * t1 + s * t1 * t1;
    },
    linear: t => t
};

class TweenManager {
    constructor() {
        this.tweens = [];
        this._rafId = null;
        this._running = false;
        this._lastTime = 0;
        this._external = false; // When true, an external RAF loop drives update()
    }

    /**
     * Add a tween animation.
     * @param {Object} config - { targets, props (key:value pairs), duration, ease, delay, onComplete, onUpdate }
     * targets can be:
     *   - A DOM element (animates style properties: left, top, opacity, transform)
     *   - A plain object (animates its numeric properties directly)
     *   - An array of targets
     */
    add(config) {
        const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
        const duration = config.duration || 300;
        const delay = config.delay || 0;
        const ease = this._getEasing(config.ease || 'Quad.easeOut');
        const onComplete = config.onComplete || null;
        const onUpdate = config.onUpdate || null;

        // Extract animated properties (everything except control keys)
        const controlKeys = new Set(['targets', 'duration', 'ease', 'delay', 'onComplete', 'onUpdate']);
        const props = {};
        for (const key of Object.keys(config)) {
            if (!controlKeys.has(key)) {
                props[key] = config[key];
            }
        }

        for (const target of targets) {
            const startValues = {};
            const endValues = {};

            for (const [key, endVal] of Object.entries(props)) {
                // Get current value from target
                startValues[key] = this._getCurrentValue(target, key);
                endValues[key] = endVal;
            }

            const tween = {
                target,
                startValues,
                endValues,
                duration,
                ease,
                onComplete,
                onUpdate,
                startTime: -1, // Set on first frame
                delay,
                completed: false
            };

            this.tweens.push(tween);
        }

        this._ensureRunning();
        return this;
    }

    _getCurrentValue(target, key) {
        if (target instanceof HTMLElement || target instanceof HTMLCanvasElement) {
            // DOM element
            switch (key) {
                case 'x': return parseFloat(target.dataset.tweenX) || 0;
                case 'y': return parseFloat(target.dataset.tweenY) || 0;
                case 'alpha': return parseFloat(target.dataset.tweenAlpha !== undefined ? target.dataset.tweenAlpha : (target.style.opacity !== '' ? target.style.opacity : 1));
                case 'scale':
                case 'scaleX':
                case 'scaleY': return parseFloat(target.dataset['tween' + key.charAt(0).toUpperCase() + key.slice(1)] || 1);
                case 'rotation': return parseFloat(target.dataset.tweenRotation) || 0;
                default: return parseFloat(target[key]) || 0;
            }
        } else {
            // Plain object
            return target[key] !== undefined ? target[key] : 0;
        }
    }

    _setCurrentValue(target, key, value) {
        if (target instanceof HTMLElement || target instanceof HTMLCanvasElement) {
            switch (key) {
                case 'x':
                    target.dataset.tweenX = value;
                    this._applyTransform(target);
                    break;
                case 'y':
                    target.dataset.tweenY = value;
                    this._applyTransform(target);
                    break;
                case 'alpha':
                    target.dataset.tweenAlpha = value;
                    target.style.opacity = value;
                    break;
                case 'scale':
                    target.dataset.tweenScale = value;
                    target.dataset.tweenScaleX = value;
                    target.dataset.tweenScaleY = value;
                    this._applyTransform(target);
                    break;
                case 'scaleX':
                    target.dataset.tweenScaleX = value;
                    this._applyTransform(target);
                    break;
                case 'scaleY':
                    target.dataset.tweenScaleY = value;
                    this._applyTransform(target);
                    break;
                case 'rotation':
                    target.dataset.tweenRotation = value;
                    this._applyTransform(target);
                    break;
                default:
                    target[key] = value;
                    break;
            }
        } else {
            target[key] = value;
        }
    }

    _applyTransform(el) {
        const x = parseFloat(el.dataset.tweenX) || 0;
        const y = parseFloat(el.dataset.tweenY) || 0;
        const sx = parseFloat(el.dataset.tweenScaleX) || 1;
        const sy = parseFloat(el.dataset.tweenScaleY) || 1;
        const rot = parseFloat(el.dataset.tweenRotation) || 0;
        el.style.transform = `translate(${x}px, ${y}px) scale(${sx}, ${sy}) rotate(${rot}rad)`;
    }

    _getEasing(ease) {
        if (typeof ease === 'function') return ease;
        switch (ease) {
            case 'Quad.easeOut': return Easing.quadOut;
            case 'Quad.easeIn': return Easing.quadIn;
            case 'Back.easeOut': return Easing.backOut;
            case 'Linear': return Easing.linear;
            default: return Easing.quadOut;
        }
    }

    update(timestamp) {
        if (this.tweens.length === 0) {
            this._running = false;
            return;
        }

        const toRemove = [];

        for (let i = 0; i < this.tweens.length; i++) {
            const tween = this.tweens[i];
            if (tween.completed) {
                toRemove.push(i);
                continue;
            }

            // Initialize start time on first frame
            if (tween.startTime < 0) {
                tween.startTime = timestamp + tween.delay;
            }

            // Skip if still in delay
            if (timestamp < tween.startTime) continue;

            const elapsed = timestamp - tween.startTime;
            const t = Math.min(elapsed / tween.duration, 1);
            const easedT = tween.ease(t);

            // Interpolate all properties
            for (const key of Object.keys(tween.endValues)) {
                const start = tween.startValues[key];
                const end = tween.endValues[key];
                const current = start + (end - start) * easedT;
                this._setCurrentValue(tween.target, key, current);
            }

            if (tween.onUpdate) tween.onUpdate(t);

            if (t >= 1) {
                tween.completed = true;
                toRemove.push(i);
                if (tween.onComplete) tween.onComplete();
            }
        }

        // Remove completed tweens (filter is O(n) vs O(n*k) for multiple splices)
        if (toRemove.length > 0) {
            this.tweens = this.tweens.filter(t => !t.completed);
        }

        if (this._external) return; // Driven by an external loop
        if (this.tweens.length > 0) {
            this._rafId = requestAnimationFrame(ts => this.update(ts));
        } else {
            this._running = false;
        }
    }

    _ensureRunning() {
        if (this._external) return; // Driven by an external loop
        if (!this._running) {
            this._running = true;
            this._rafId = requestAnimationFrame(ts => this.update(ts));
        }
    }

    killTweensOf(target) {
        const targets = Array.isArray(target) ? target : [target];
        const targetSet = new Set(targets);
        this.tweens = this.tweens.filter(t => !targetSet.has(t.target));
    }

    killAll() {
        this.tweens = [];
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._running = false;
    }
}

// ============================================
// COLOR UTILITIES
// ============================================
// Convert between Phaser hex (0xRRGGBB) and CSS color strings.

function hexToCSS(hex) {
    const r = (hex >> 16) & 0xFF;
    const g = (hex >> 8) & 0xFF;
    const b = hex & 0xFF;
    return `rgb(${r},${g},${b})`;
}

function hexToRGBA(hex, alpha) {
    const r = (hex >> 16) & 0xFF;
    const g = (hex >> 8) & 0xFF;
    const b = hex & 0xFF;
    return `rgba(${r},${g},${b},${alpha})`;
}

function hexToCSSHex(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

// Parse '#rrggbb' CSS hex string to 0xRRGGBB integer
function cssHexToHex(cssHex) {
    return parseInt(cssHex.replace('#', ''), 16);
}

// RGB (0-255) to HSL (h: 0-360, s: 0-1, l: 0-1)
function rgbToHsl(r, g, b) {
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

// HSL (h: 0-360, s: 0-1, l: 0-1) to RGB (0-255)
function hslToRgb(h, s, l) {
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

// Build a { name, hex, css } color object from a CSS hex string like '#ff00aa'
function makeColorObject(cssHex) {
    const hex = cssHexToHex(cssHex);
    return { name: 'Custom', hex, css: cssHex };
}

// Boost any color to full-saturation neon at peak vibrancy (L=0.5).
// Forces S=1.0 and clamps L to [0.45, 0.6] so colors match the original
// PLAYER_COLORS intensity (cyan #00ffff, magenta #ff00ff, etc. are all S=1, L=0.5).
// Returns a { name, hex, css } color object.
function neonifyColor(cssHex) {
    const hex = cssHexToHex(cssHex);
    const r = (hex >> 16) & 0xFF, g = (hex >> 8) & 0xFF, b = hex & 0xFF;
    const hsl = rgbToHsl(r, g, b);
    const rgb = hslToRgb(hsl.h, 1.0, clamp(hsl.l, 0.45, 0.6));
    const intHex = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
    const css = '#' + intHex.toString(16).padStart(6, '0');
    return { name: 'Custom', hex: intHex, css };
}

// Generate `count` maximally-distinct neon colors by rotating hue from a base CSS hex color.
// Returns an array of { name, hex, css } objects.
// All colors (including the base) are forced to full saturation and peak vibrancy
// so borders always look like they're made of light energy on the dark background.
function generateComplementaryColors(baseCSS, count) {
    const hex = cssHexToHex(baseCSS);
    const r = (hex >> 16) & 0xFF, g = (hex >> 8) & 0xFF, b = hex & 0xFF;
    const hsl = rgbToHsl(r, g, b);

    // Neonify the base color so every player glows
    const neonBase = neonifyColor(baseCSS);
    const colors = [neonBase];

    // Full saturation, lightness at peak vibrancy
    const neonLit = clamp(hsl.l, 0.45, 0.6);

    for (let i = 1; i < count; i++) {
        const hue = (hsl.h + (360 / count) * i) % 360;
        const rgb = hslToRgb(hue, 1.0, neonLit);
        const intHex = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
        const css = '#' + intHex.toString(16).padStart(6, '0');
        colors.push({ name: 'Custom', hex: intHex, css });
    }
    return colors;
}
