// ============================================
// MENU SCENE - New Game Button Animations
// ============================================
// Canvas rendering for the animated buttons on the New Game sub-menu.
// Menu layout and navigation is in new-game-menu.js.

// ============================================
// ANIMATION LOOP
// ============================================

/**
 * Start a single requestAnimationFrame loop driving all New Game canvases.
 */
MenuScene.prototype._startNewGameAnimations = function() {
    if (this._animFrameId) return;
    const canvases = this._animCanvases || [];
    if (canvases.length === 0) return;

    const startTime = performance.now();

    const animate = () => {
        const t = (performance.now() - startTime) / 1000;
        for (let i = 0; i < canvases.length; i++) {
            const { ctx, mode, size } = canvases[i];
            if (mode === 'single') {
                this._drawSinglePlayerAnim(ctx, size, size, t);
            } else {
                this._drawHotSeatAnim(ctx, size, size, t);
            }
        }
        this._animFrameId = requestAnimationFrame(animate);
    };
    this._animFrameId = requestAnimationFrame(animate);
};

/**
 * Stop the animation loop and release canvas references.
 * Video elements are recycled back to the hidden holder so the browser
 * keeps their decoder warm — avoids the black-flash / lag on re-open.
 */
MenuScene.prototype._stopNewGameAnimations = function() {
    if (this._animFrameId) {
        cancelAnimationFrame(this._animFrameId);
        this._animFrameId = null;
    }
    this._animCanvases = [];

    // Recycle video elements back to the off-screen holder
    if (this._animVideos && this._animVideos.length > 0) {
        if (!this._prewarmedVideos) this._prewarmedVideos = {};
        var holder = this._videoHolder;

        for (var i = 0; i < this._animVideos.length; i++) {
            var video = this._animVideos[i];
            var key = video.dataset.animMode;
            if (key && holder) {
                // Move back to hidden holder — keep playing so decoder stays warm
                video.style.width = '1px';
                video.style.height = '1px';
                holder.appendChild(video);
                this._prewarmedVideos[key] = video;
            } else {
                // No holder or no mode tag — clean up normally
                video.pause();
                video.removeAttribute('src');
                video.load();
            }
        }
        this._animVideos = [];
    }
};

// ============================================
// SINGLE PLAYER — Radial Sound Visualizer
// ============================================
// A ring of pulsating neon 1s and 0s radiating outward like a music
// visualizer, with an 8-bit pixelated blue-green orb at the center.

MenuScene.prototype._drawSinglePlayerAnim = function(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);

    // Dark background fill
    const _y2k = typeof ThemeConfig !== 'undefined' && ThemeConfig.isActive('y2k');
    ctx.fillStyle = _y2k ? '#3D0F1C' : '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const numBars = 24;
    const maxR = Math.min(w, h) * 0.44;
    const minR = Math.min(w, h) * 0.2;
    const charSize = Math.max(8, Math.floor(w / 16));

    ctx.font = `${charSize}px VT323, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Radial bars of neon 1s and 0s
    for (let i = 0; i < numBars; i++) {
        const angle = (i / numBars) * Math.PI * 2 - Math.PI / 2;

        // Multi-frequency sine for simulated audio levels
        const level = 0.3
            + 0.25 * Math.sin(t * 2.3 + i * 0.65)
            + 0.2  * Math.sin(t * 3.7 + i * 1.2)
            + 0.25 * Math.abs(Math.sin(t * 1.5 + i * 0.4));

        const barLen = minR + (maxR - minR) * Math.max(0, Math.min(1, level));
        const step = charSize * 1.15;
        const count = Math.max(1, Math.floor((barLen - minR) / step));

        for (let j = 0; j <= count; j++) {
            const dist = minR + j * step;
            const x = cx + Math.cos(angle) * dist;
            const y = cy + Math.sin(angle) * dist;
            const char = ((i + j + Math.floor(t * 3)) & 1) ? '1' : '0';

            const fade = 0.35 + 0.65 * (1 - j / Math.max(count, 1));
            // Hue shifts: pink range for Y2K, cyan-teal for default
            const hue = _y2k
                ? 330 + 20 * Math.sin(t * 0.8 + i * 0.3)
                : 165 + 25 * Math.sin(t * 0.8 + i * 0.3);

            ctx.shadowBlur = 8 * fade;
            ctx.shadowColor = `hsla(${hue}, 100%, 55%, ${fade * 0.9})`;
            ctx.fillStyle = `hsla(${hue}, 100%, 70%, ${fade})`;
            ctx.fillText(char, x, y);
        }
    }

    // Central 8-bit pulsating orb
    const orbPulse = 0.85 + 0.15 * Math.sin(t * 3);
    const orbR = Math.min(w, h) * 0.1 * orbPulse;
    const px = Math.max(2, Math.floor(w / 40));

    ctx.shadowBlur = 18;
    ctx.shadowColor = _y2k ? 'rgba(255, 105, 180, 0.8)' : 'rgba(0, 230, 210, 0.8)';

    for (let gx = -orbR; gx <= orbR; gx += px) {
        for (let gy = -orbR; gy <= orbR; gy += px) {
            if (gx * gx + gy * gy <= orbR * orbR) {
                const d = Math.sqrt(gx * gx + gy * gy) / orbR;
                const b = 1 - d * 0.4;
                if (_y2k) {
                    const red = Math.floor(255 * b);
                    const green = Math.floor(105 * b + 20);
                    const blue = Math.floor(180 * b + 40);
                    ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
                } else {
                    const green = Math.floor(210 * b + 40);
                    const blue = Math.floor(200 * b + 55);
                    ctx.fillStyle = `rgb(0, ${green}, ${blue})`;
                }
                ctx.fillRect(
                    cx + gx - px / 2,
                    cy + gy - px / 2,
                    px, px
                );
            }
        }
    }

    ctx.shadowBlur = 0;
};

// ============================================
// HOT SEAT — DNA Double Helix (Desmos math)
// ============================================
// 3D double helix projected to 2D via basis vectors.
//
// Desmos parameters:
//   o = 1.7          strand phase offset
//   p = 3            rung spacing divisor
//   a, c             view rotation angles
//
// Basis:
//   F = |sec(a)sec(c)| · √|cos(a−c)cos(a+c)|
//   e1 = (F·cos(c),  sin(a)tan(a)sin(c) + cos(a)sin(c),  0)
//   e2 = (tan(a)tan(c),  −sin(a)·F,  cos(a)·F)
//
// Projection:
//   h_x(x,y) = cos(x+y)·e1x + sin(x+y)·e1y + x·e1z
//   h_y(x,y) = cos(x+y)·e2x + sin(x+y)·e2y + x·e2z
//
// Strands: (h_x(t,0), h_y(t,0))  and  (h_x(t,o), h_y(t,o))
// Rungs:   b = [0..q],  q = 6.4πp,  connecting strands at x = b/p

MenuScene.prototype._drawHotSeatAnim = function(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const _y2kHS = typeof ThemeConfig !== 'undefined' && ThemeConfig.isActive('y2k');
    ctx.fillStyle = _y2kHS ? '#3D0F1C' : '#0a0a14';
    ctx.fillRect(0, 0, w, h);

    // ============================================
    // Falling binary rain (background layer)
    // ============================================
    const binCols = 14;
    const binCharSize = Math.max(6, Math.floor(w / 24));
    ctx.font = `${binCharSize}px VT323, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let col = 0; col < binCols; col++) {
        const x = (col + 0.5) / binCols * w;
        // Each column falls at a different speed
        const speed = 30 + (((col * 7 + 3) % 11) / 11) * 40;
        const spacing = binCharSize * 1.5;
        const numDigits = Math.ceil(h / spacing) + 1;
        // Stagger columns so they don't all start aligned
        const colOffset = ((col * 37 + 13) % 19) / 19 * h;

        for (let row = 0; row < numDigits; row++) {
            const rawY = (row * spacing + t * speed + colOffset) % (numDigits * spacing);
            const y = rawY - spacing;
            const char = ((col + row + Math.floor(t * 2.5)) & 1) ? '1' : '0';

            // Dimmer toward edges, brighter near center columns
            const edgeFade = 1 - 0.4 * Math.abs(col - binCols / 2) / (binCols / 2);
            const alpha = 0.07 + 0.06 * edgeFade;
            const hue = _y2kHS
                ? 330 + 15 * Math.sin(t * 0.4 + col * 0.6)
                : 170 + 15 * Math.sin(t * 0.4 + col * 0.6);

            ctx.shadowBlur = 2;
            ctx.shadowColor = `hsla(${hue},100%,55%,${alpha * 0.5})`;
            ctx.fillStyle = `hsla(${hue},100%,65%,${alpha})`;
            ctx.fillText(char, x, y);
        }
    }
    ctx.shadowBlur = 0;

    // ============================================
    // Helix drawing helper (reusable for all 3)
    // ============================================
    const drawHelix = (centerX, scale, alphaMul, speed, phase) => {
        const o = 1.7;
        const p = 3;
        const uMax = 3.5 * Math.PI;
        const q = uMax * p;

        const a = 0;
        const c = t * speed + phase;

        const cosA = Math.cos(a), sinA = Math.sin(a);
        const cosC = Math.cos(c), sinC = Math.sin(c);
        const absCosACosC = Math.abs(cosA * cosC);
        const F = absCosACosC > 1e-10
            ? Math.sqrt(Math.abs(Math.cos(a - c) * Math.cos(a + c))) / absCosACosC
            : 1;
        const tanA = Math.abs(cosA) > 1e-10 ? sinA / cosA : 0;
        const tanC = Math.abs(cosC) > 1e-10 ? sinC / cosC : 0;

        const e1x = F * cosC;
        const e1y = sinA * tanA * sinC + cosA * sinC;
        const e1z = 0;
        const e2x = tanA * tanC;
        const e2y = -sinA * F;
        const e2z = cosA * F;

        const hx = (x, y) => Math.cos(x + y) * e1x + Math.sin(x + y) * e1y + x * e1z;
        const hy = (x, y) => Math.cos(x + y) * e2x + Math.sin(x + y) * e2y + x * e2z;

        const e3x = e1y * e2z - e1z * e2y;
        const e3y = e1z * e2x - e1x * e2z;
        const e3z = e1x * e2y - e1y * e2x;
        const depthAt = (x, y) => Math.cos(x + y) * e3x + Math.sin(x + y) * e3y + x * e3z;

        // Canvas mapping (scaled)
        const pad = h * 0.02;
        const R = w * 0.25 * scale;
        const toSX = (v) => centerX + v * R;
        const toSY = (v) => pad + (v / uMax) * (h - 2 * pad);

        // Precompute strand points (fewer for small helixes)
        const res = scale < 0.8 ? 80 : 150;
        const pts = [new Array(res + 1), new Array(res + 1)];
        for (let i = 0; i <= res; i++) {
            const u = (i / res) * uMax;
            for (let s = 0; s < 2; s++) {
                const off = s === 0 ? 0 : o;
                pts[s][i] = {
                    sx: toSX(hx(u, off)),
                    sy: toSY(hy(u, off)),
                    d: depthAt(u, off)
                };
            }
        }

        // Precompute rungs
        const numRungs = Math.floor(q);
        const rungs = new Array(numRungs + 1);
        for (let b = 0; b <= numRungs; b++) {
            const u = b / p;
            rungs[b] = {
                x1: toSX(hx(u, 0)),  y1: toSY(hy(u, 0)),
                x2: toSX(hx(u, o)),  y2: toSY(hy(u, o)),
                d: (depthAt(u, 0) + depthAt(u, o)) / 2
            };
        }

        // Colors & line widths scale with size
        const S1 = _y2kHS ? '255,105,180' : '80,170,255';
        const S2 = _y2kHS ? '199,21,133'  : '0,210,150';
        const RC = _y2kHS ? '255,20,147'  : '0,212,255';
        const frontLW = scale < 0.8 ? 1.5 : 3;
        const backLW = scale < 0.8 ? 1 : 2;
        const rungFrontLW = scale < 0.8 ? 1 : 2;
        const rungBackLW = scale < 0.8 ? 0.75 : 1.5;

        // Strand drawing helper
        const drawStrand = (sIdx, front) => {
            const rgb = sIdx === 0 ? S1 : S2;
            const points = pts[sIdx];
            ctx.beginPath();
            let pen = false;

            for (let i = 0; i <= res; i++) {
                if ((points[i].d > 0) === front) {
                    if (!pen) { ctx.moveTo(points[i].sx, points[i].sy); pen = true; }
                    else ctx.lineTo(points[i].sx, points[i].sy);
                } else {
                    pen = false;
                }
            }

            ctx.lineCap = 'round';
            if (front) {
                ctx.strokeStyle = `rgba(${rgb},${0.9 * alphaMul})`;
                ctx.lineWidth = frontLW;
                ctx.shadowBlur = 8 * alphaMul;
                ctx.shadowColor = `rgba(${rgb},${0.5 * alphaMul})`;
            } else {
                ctx.strokeStyle = `rgba(${rgb},${0.25 * alphaMul})`;
                ctx.lineWidth = backLW;
                ctx.shadowBlur = 0;
            }
            ctx.stroke();
        };

        // Back pass
        drawStrand(0, false);
        drawStrand(1, false);

        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let b = 0; b <= numRungs; b++) {
            if (rungs[b].d <= 0) {
                ctx.moveTo(rungs[b].x1, rungs[b].y1);
                ctx.lineTo(rungs[b].x2, rungs[b].y2);
            }
        }
        ctx.strokeStyle = `rgba(${RC},${0.2 * alphaMul})`;
        ctx.lineWidth = rungBackLW;
        ctx.shadowBlur = 0;
        ctx.stroke();

        // Front pass
        ctx.beginPath();
        for (let b = 0; b <= numRungs; b++) {
            if (rungs[b].d > 0) {
                ctx.moveTo(rungs[b].x1, rungs[b].y1);
                ctx.lineTo(rungs[b].x2, rungs[b].y2);
            }
        }
        ctx.strokeStyle = `rgba(${RC},${0.8 * alphaMul})`;
        ctx.lineWidth = rungFrontLW;
        ctx.shadowBlur = 5 * alphaMul;
        ctx.shadowColor = `rgba(${RC},${0.4 * alphaMul})`;
        ctx.stroke();

        drawStrand(0, true);
        drawStrand(1, true);

        ctx.shadowBlur = 0;
    };

    // ============================================
    // Render helixes: background pair, then main
    // ============================================
    drawHelix(w * 0.13, 0.38, 0.22, 0.3,  1.0);
    drawHelix(w * 0.87, 0.38, 0.22, 0.35, 2.5);
    drawHelix(w * 0.5,  1.0,  1.0,  0.4,  0);
};
