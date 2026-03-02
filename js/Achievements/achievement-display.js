// ============================================
// ACHIEVEMENT MANAGER - Display Module
// ============================================
// Unlock animation: massive neon-blue fire eruptions from bottom corners,
// 8-bit gold/white confetti rain, and gold toast notification.
//
// All effects render in a position:fixed full-viewport overlay appended to
// document.body, so they work identically on any page (menu, loading, game)
// and always cover the entire screen regardless of container size.
//
// Scales dynamically for mobile (fewer/smaller particles).
//
// Z-layer order within the wrapper (back to front):
//   Fire canvas     → z-index: 1
//   Confetti canvas → z-index: 2
//   Toast overlay   → z-index: 3

// ------------------------------------------
// Helpers
// ------------------------------------------

AchievementManager.prototype._isMobile = function() {
    return typeof Layout !== 'undefined' && Layout.isMobile();
};

// ------------------------------------------
// Neon-Blue Fire Eruptions
// ------------------------------------------

/**
 * Spawn two massive pixel-art fire eruptions from the bottom corners.
 * Particles fan upward in a wide arc, reaching 60-70% of screen height
 * before gravity pulls them back down.
 *
 * 32-step color gradient gives ~2.7 seconds of particle life at 12fps,
 * combined with high initial velocity (10-25 px/tick) for tall plumes.
 *
 * @param {HTMLElement} container - Full-viewport wrapper element
 * @param {number} duration - Total effect duration in ms
 */
AchievementManager.prototype._spawnFireJets = function(container, duration) {
    if (!container) return { stop: function() {} };

    var mobile = this._isMobile();

    var canvas = document.createElement('canvas');
    var W = container.clientWidth || window.innerWidth;
    var H = container.clientHeight || window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1;image-rendering:pixelated;';
    container.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    if (!ctx) {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        return { stop: function() {} };
    }

    // 32-step neon blue gradient: white-hot core → dead ember
    var FIRE_COLORS = [
        '#ffffff', '#f0ffff', '#e0ffff', '#ccffff',   // 0-3  white-hot core
        '#aaffff', '#88ffff', '#66ffff', '#44ffff',   // 4-7  bright cyan
        '#22eeff', '#00ddff', '#00d4ff', '#00c8f0',   // 8-11 neon blue
        '#00bce0', '#00b0d0', '#00a4c0', '#0098b0',   // 12-15 medium blue
        '#008ca0', '#008090', '#007480', '#006870',   // 16-19 teal-blue
        '#005c66', '#00505c', '#004452', '#003848',   // 20-23 deep blue
        '#002e3e', '#002634', '#001e2a', '#001820',   // 24-27 nearly dead
        '#001218', '#000e12', '#00080c', '#000406'    // 28-31 embers
    ];
    var MAX_LIFE = FIRE_COLORS.length; // 32 ticks = ~2.7s per particle

    var SIZES = mobile ? [3, 4, 5, 5, 6] : [4, 5, 6, 8, 8, 10, 10, 12];
    var TICK = 83; // ~12 fps for 8-bit stepped feel
    var SNAP = 2;

    // Spawn rates per side per tick
    var SPAWN_SUSTAIN = mobile ? 18 : 40;
    var SPAWN_BURST   = mobile ? 30 : 70;
    var BURST_TICKS   = 8;

    // Width of the spawn origin strip along the bottom edge
    var ORIGIN_SPREAD = Math.max(20, Math.floor(W * (mobile ? 0.06 : 0.08)));

    // Fan angle range (radians from vertical)
    // -0.5 sprays slightly outward, 0 = straight up, +0.7 sprays inward
    var ANGLE_MIN = -0.5;
    var ANGLE_MAX = 0.7;

    // Speed range — high values create tall plumes
    var SPEED_MIN = mobile ? 8 : 10;
    var SPEED_MAX = mobile ? 18 : 25;

    // Gravity: delayed onset and gentle pull so particles reach high
    var GRAV_START    = 16;  // ticks before gravity activates
    var GRAV_STRENGTH = 0.5; // added to vy each tick after GRAV_START
    var GRAV_CAP      = 4;   // max downward vy from gravity

    var particles = [];
    var tick = 0;
    var stopped = false;
    var spawnEndTick = Math.floor((duration - 1500) / TICK);

    function spawnBatch(count, side) {
        for (var i = 0; i < count; i++) {
            var angle = ANGLE_MIN + Math.random() * (ANGLE_MAX - ANGLE_MIN);
            var speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);

            // Convert polar to cartesian: angle=0 is straight up
            var vy = -speed * Math.cos(angle);
            var vx = speed * Math.sin(angle) * (side === 0 ? 1 : -1);

            // Ensure at least some upward velocity
            if (vy > -2) vy = -2;

            var ox = side === 0
                ? Math.floor(Math.random() * ORIGIN_SPREAD)
                : W - Math.floor(Math.random() * ORIGIN_SPREAD);
            var oy = H + Math.floor(Math.random() * 8);

            particles.push({
                x: ox, y: oy,
                vx: vx, vy: vy,
                age: 0,
                size: SIZES[Math.floor(Math.random() * SIZES.length)]
            });
        }
    }

    var intervalId = setInterval(function() {
        if (stopped) return;
        tick++;

        // Spawn new particles during the spawn phase
        if (tick <= spawnEndTick) {
            var count = (tick <= BURST_TICKS) ? SPAWN_BURST : SPAWN_SUSTAIN;
            spawnBatch(count, 0); // left corner
            spawnBatch(count, 1); // right corner
        }

        ctx.clearRect(0, 0, W, H);

        var alive = false;
        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.age++;

            if (p.age >= MAX_LIFE) {
                particles[i] = particles[particles.length - 1];
                particles.pop();
                continue;
            }

            alive = true;

            // Stepped movement
            p.x += p.vx;
            p.y += p.vy;

            // Horizontal wobble for fire flickering
            if (tick % 4 === 0) {
                p.vx += (Math.random() > 0.5 ? 1 : -1);
            }

            // Gravity: gentle, delayed — lets particles rise high first
            if (p.age > GRAV_START) {
                p.vy += GRAV_STRENGTH;
                if (p.vy > GRAV_CAP) p.vy = GRAV_CAP;
            }

            // Snap to pixel grid for 8-bit look
            var drawX = Math.round(p.x / SNAP) * SNAP;
            var drawY = Math.round(p.y / SNAP) * SNAP;

            // Skip off-screen particles
            if (drawX + p.size < 0 || drawX > W || drawY + p.size < 0 || drawY > H) continue;

            ctx.fillStyle = FIRE_COLORS[p.age];
            ctx.fillRect(drawX, drawY, p.size, p.size);
        }

        if (tick > spawnEndTick && !alive) {
            cleanup();
        }
    }, TICK);

    var timeoutId = setTimeout(cleanup, duration + 3000);

    function cleanup() {
        if (stopped) return;
        stopped = true;
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    return { stop: cleanup };
};

// ------------------------------------------
// 8-Bit Pixel Confetti
// ------------------------------------------

/**
 * Spawn pixel confetti that enters from both sides of the screen and
 * rains down through the full viewport height, exiting at the bottom.
 *
 * Particles start above and outside the visible area with varied delays
 * for a continuous rain effect. Stepped gravity acceleration with a
 * terminal velocity cap gives a natural but chunky falling motion.
 *
 * @param {HTMLElement} container - Full-viewport wrapper element
 * @param {number} duration - Total effect duration in ms
 */
AchievementManager.prototype._spawnConfetti = function(container, duration) {
    if (!container) return { stop: function() {} };

    var mobile = this._isMobile();

    var canvas = document.createElement('canvas');
    var W = container.clientWidth || window.innerWidth;
    var H = container.clientHeight || window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2;image-rendering:pixelated;';
    container.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    if (!ctx) {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        return { stop: function() {} };
    }

    var COLORS_CONFETTI = [
        '#ffc800', '#ffe066', '#ffffff', '#fff5cc',
        '#ffaa00', '#ffdd44', '#ffeebb', '#ffffff'
    ];

    var SIZES = mobile ? [3, 3, 4, 4] : [4, 4, 5, 6, 6];
    var COUNT = mobile ? 50 : 100;
    var SNAP = 2;
    var TICK = 83;

    var particles = [];

    // Side-entry confetti (arc in from left/right edges)
    for (var i = 0; i < COUNT; i++) {
        var fromLeft = i % 2 === 0;

        var startX, startVX;
        if (fromLeft) {
            startX = -(10 + Math.floor(Math.random() * 60));
            startVX = 2 + Math.floor(Math.random() * 5);
        } else {
            startX = W + 10 + Math.floor(Math.random() * 60);
            startVX = -(2 + Math.floor(Math.random() * 5));
        }

        particles.push({
            x: startX,
            y: -(20 + Math.floor(Math.random() * H * 0.5)),
            vx: startVX,
            vy: 3 + Math.floor(Math.random() * 5),
            gravity: 0.5 + Math.random() * 0.3,
            accum: 0,
            size: SIZES[Math.floor(Math.random() * SIZES.length)],
            color: COLORS_CONFETTI[Math.floor(Math.random() * COLORS_CONFETTI.length)],
            delay: Math.floor(Math.random() * 25),
            alive: true
        });
    }

    // Top-drop confetti (rain straight down from above, spread across width)
    var TOP_COUNT = mobile ? 30 : 60;
    for (var t = 0; t < TOP_COUNT; t++) {
        particles.push({
            x: Math.floor(Math.random() * W),
            y: -(10 + Math.floor(Math.random() * H * 0.3)),
            vx: (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 2),
            vy: 2 + Math.floor(Math.random() * 4),
            gravity: 0.4 + Math.random() * 0.3,
            accum: 0,
            size: SIZES[Math.floor(Math.random() * SIZES.length)],
            color: COLORS_CONFETTI[Math.floor(Math.random() * COLORS_CONFETTI.length)],
            delay: Math.floor(Math.random() * 30),
            alive: true
        });
    }

    var tick = 0;
    var stopped = false;

    var intervalId = setInterval(function() {
        if (stopped) return;
        tick++;

        ctx.clearRect(0, 0, W, H);

        var allDead = true;
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            if (!p.alive) continue;
            if (tick < p.delay) { allDead = false; continue; }

            // Accumulate gravity with stepped increments
            p.accum += p.gravity;
            if (p.accum >= 1) {
                var bump = Math.floor(p.accum);
                p.vy += bump;
                p.accum -= bump;
            }
            if (p.vy > 16) p.vy = 16; // terminal velocity

            // Drag on horizontal velocity
            if (tick % 6 === 0 && p.vx !== 0) {
                p.vx += (p.vx > 0) ? -1 : 1;
            }

            p.x += p.vx;
            p.y += p.vy;

            // Sideways wobble
            if (tick % 5 === 0) {
                p.vx += (Math.random() > 0.5 ? 1 : -1);
                if (p.vx > 6) p.vx = 6;
                if (p.vx < -6) p.vx = -6;
            }

            var drawX = Math.round(p.x / SNAP) * SNAP;
            var drawY = Math.round(p.y / SNAP) * SNAP;

            // Kill when well past the bottom edge
            if (drawY > H + 60) {
                p.alive = false;
                continue;
            }

            allDead = false;

            // Draw if within visible canvas bounds
            if (drawY + p.size > 0 && drawY < H && drawX + p.size > 0 && drawX < W) {
                ctx.fillStyle = p.color;
                ctx.fillRect(drawX, drawY, p.size, p.size);
            }
        }

        if (allDead) cleanup();
    }, TICK);

    var timeoutId = setTimeout(cleanup, duration || 8000);

    function cleanup() {
        if (stopped) return;
        stopped = true;
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    return { stop: cleanup };
};

// ------------------------------------------
// Reverse-Pixelation Toast Assembly
// ------------------------------------------

/**
 * Animate the achievement toast assembling from scattered pixel blocks,
 * mirroring (in reverse) the piece destruction effect used in combat.
 *
 * Pixel blocks start at random positions spread around the viewport
 * and converge into a rectangle matching the toast's size and position.
 * Colors approximate the toast appearance: gold border, dark interior,
 * with scattered gold blocks in the title area.
 *
 * @param {HTMLElement} wrapper  - Container for the canvas
 * @param {HTMLElement} toastEl  - The toast DOM element (hidden, used for measurement)
 * @param {Function}    onComplete - Called when assembly finishes
 */
AchievementManager.prototype._pixelateInToast = function(wrapper, toastEl, onComplete) {
    var mobile = this._isMobile();
    var W = window.innerWidth;
    var H = window.innerHeight;

    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5;image-rendering:pixelated;';
    wrapper.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    if (!ctx) {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (onComplete) onComplete();
        return { stop: function() {} };
    }

    // Measure toast position (it's in the DOM but invisible)
    var rect = toastEl.getBoundingClientRect();
    var toastX = rect.left;
    var toastY = rect.top;
    var toastW = rect.width;
    var toastH = rect.height;
    var centerX = toastX + toastW / 2;
    var centerY = toastY + toastH / 2;

    var BLOCK = mobile ? 10 : 14;
    var gridW = Math.ceil(toastW / BLOCK);
    var gridH = Math.ceil(toastH / BLOCK);

    // Build particle grid
    var particles = [];
    var titleTop = Math.floor(gridH * 0.15);
    var titleBot = Math.floor(gridH * 0.55);

    for (var gy = 0; gy < gridH; gy++) {
        for (var gx = 0; gx < gridW; gx++) {
            var finalX = toastX + gx * BLOCK;
            var finalY = toastY + gy * BLOCK;

            // Color based on position: gold border, dark interior, gold text hints
            var color;
            var isBorder = gx === 0 || gx === gridW - 1 || gy === 0 || gy === gridH - 1;
            if (isBorder) {
                color = '#ffc800';
            } else if (gy >= titleTop && gy <= titleBot && Math.random() < 0.3) {
                color = '#ffc800';
            } else {
                color = '#0a0a14';
            }

            // Scattered start position (radial burst from center, like reverse explosion)
            var dx = finalX + BLOCK / 2 - centerX;
            var dy = finalY + BLOCK / 2 - centerY;
            var angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.0;
            var dist = 200 + Math.random() * 400;

            particles.push({
                fx: finalX, fy: finalY,
                sx: centerX + Math.cos(angle) * dist,
                sy: centerY + Math.sin(angle) * dist,
                color: color,
                appearAt: Math.random() * 0.35
            });
        }
    }

    var TICK = 83;
    var SNAP = 2;
    var TOTAL_TICKS = 10; // ~830ms
    var tick = 0;
    var stopped = false;

    var intervalId = setInterval(function() {
        if (stopped) return;
        tick++;

        // Check completion BEFORE drawing so that errors in canvas ops
        // can never prevent the onComplete callback from firing
        if (tick >= TOTAL_TICKS) {
            stopped = true;
            clearInterval(intervalId);
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
            if (onComplete) onComplete();
            return;
        }

        var t = Math.min(tick / TOTAL_TICKS, 1);
        ctx.clearRect(0, 0, W, H);

        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            if (t < p.appearAt) continue;

            var lt = Math.min((t - p.appearAt) / (1 - p.appearAt), 1);
            // Ease-out cubic: fast start, decelerates into final position
            var et = 1 - Math.pow(1 - lt, 3);

            var x = p.sx + (p.fx - p.sx) * et;
            var y = p.sy + (p.fy - p.sy) * et;

            ctx.fillStyle = p.color;
            ctx.fillRect(
                Math.round(x / SNAP) * SNAP,
                Math.round(y / SNAP) * SNAP,
                BLOCK, BLOCK
            );
        }
    }, TICK);

    return {
        stop: function() {
            if (stopped) return;
            stopped = true;
            clearInterval(intervalId);
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        }
    };
};

// ------------------------------------------
// Multi-Card Layout
// ------------------------------------------

/**
 * Compute card widths and scale for a batch. Vertical positions are
 * determined later by _applyCardLayout after cards are in the DOM and
 * their actual heights can be measured.
 *
 * @param {number} count - Number of cards (1-3)
 * @param {number} viewW - Viewport width
 * @returns {Array<{width:number, scale:number}>}
 */
AchievementManager.prototype._computeCardSizes = function(count, viewW) {
    var mobile = this._isMobile();
    var cardW = Math.min(420, viewW * 0.85);

    if (count <= 2) {
        var sizes = [];
        for (var i = 0; i < count; i++) {
            sizes.push({ width: cardW, scale: 1 });
        }
        return sizes;
    }

    // 3 cards: fit two side-by-side
    var gap = mobile ? 12 : 18;
    var margin = mobile ? 8 : 16;
    var scaledW;
    if (mobile) {
        scaledW = Math.floor((viewW - gap - margin * 2) / 2);
    } else {
        scaledW = Math.min(420, viewW * 0.85) * 0.9;
    }
    var sc = scaledW / cardW;
    return [
        { width: scaledW, scale: sc },
        { width: scaledW, scale: sc },
        { width: scaledW, scale: sc }
    ];
};

/**
 * Measure rendered card heights, normalize all to the tallest,
 * then compute and apply final positions.
 *
 * Layout rules:
 *   1 card  — centered vertically and horizontally
 *   2 cards — stacked vertically, centered
 *   3 cards — triangle: 2 on top, 1 centered below
 *
 * @param {Array<HTMLElement>} toasts - Card DOM elements (already in the DOM)
 * @param {number} count - Number of cards
 * @param {number} viewW - Viewport width
 * @param {number} viewH - Viewport height
 * @returns {Array<{left:number, top:number, width:number, scale:number, centerY:boolean}>}
 */
AchievementManager.prototype._applyCardLayout = function(toasts, count, viewW, viewH) {
    var mobile = this._isMobile();
    var gap = mobile ? 12 : 18;

    // Measure actual rendered heights and find the tallest
    var maxH = 0;
    for (var i = 0; i < toasts.length; i++) {
        var h = toasts[i].offsetHeight;
        if (h > maxH) maxH = h;
    }

    // Force all cards to the same height
    for (var i = 0; i < toasts.length; i++) {
        toasts[i].style.height = maxH + 'px';
    }

    var positions = [];

    if (count === 1) {
        var w = parseFloat(toasts[0].style.width);
        positions.push({
            left: (viewW - w) / 2,
            top: (viewH - maxH) / 2,
            width: w, scale: 1, centerY: false
        });
    } else if (count === 2) {
        var w = parseFloat(toasts[0].style.width);
        var totalH = maxH * 2 + gap;
        var startY = (viewH - totalH) / 2;
        for (var i = 0; i < 2; i++) {
            positions.push({
                left: (viewW - w) / 2,
                top: startY + i * (maxH + gap),
                width: w, scale: 1, centerY: false
            });
        }
    } else {
        var colGap = gap;
        var rowGap = gap;
        var w = parseFloat(toasts[0].style.width);
        var topRowW = w * 2 + colGap;
        var totalH = maxH * 2 + rowGap;
        var startY = (viewH - totalH) / 2;
        var topRowLeft = (viewW - topRowW) / 2;
        var sc = parseFloat(toasts[0].dataset.scale) || 1;

        positions.push({ left: topRowLeft, top: startY, width: w, scale: sc, centerY: false });
        positions.push({ left: topRowLeft + w + colGap, top: startY, width: w, scale: sc, centerY: false });
        positions.push({ left: (viewW - w) / 2, top: startY + maxH + rowGap, width: w, scale: sc, centerY: false });
    }

    // Apply final positions
    for (var i = 0; i < toasts.length; i++) {
        toasts[i].style.left = positions[i].left + 'px';
        toasts[i].style.top = positions[i].top + 'px';
    }

    return positions;
};

/**
 * Create a toast DOM element for an achievement definition.
 * Positioned absolutely at (0,0) initially — final position is set
 * by _applyCardLayout after all cards are measured.
 *
 * @param {Object} def  - Achievement definition { name, description, icon }
 * @param {Object} size - { width, scale } from _computeCardSizes
 * @returns {HTMLElement} The toast element (opacity:0, ready for layout + pixelation)
 */
AchievementManager.prototype._createToastElement = function(def, size) {
    // Scale padding and font sizes for smaller cards (e.g. 3-card mobile)
    var compact = size.scale < 0.7;
    var padV = compact ? 10 : 20;
    var padH = compact ? 12 : 40;
    var headerSize = compact ? 12 : 16;
    var headerSpacing = compact ? 2 : 4;
    var nameSize = compact ? 20 : 28;
    var descSize = compact ? 14 : 18;

    var toast = document.createElement('div');
    toast.dataset.scale = size.scale;
    toast.style.cssText =
        'position:absolute;left:0;top:0;' +
        'width:' + size.width + 'px;box-sizing:border-box;' +
        'padding:' + padV + 'px ' + padH + 'px;' +
        'background:#0a0a14;border:2px solid #ffc800;' +
        'box-shadow:0 0 30px rgba(255,200,0,0.5), 0 0 60px rgba(255,200,0,0.2);' +
        'text-align:center;opacity:0;overflow:visible;';

    var header = document.createElement('div');
    header.style.cssText = 'font-family:VT323,monospace;font-size:' + headerSize + 'px;letter-spacing:' + headerSpacing + 'px;color:#ffc800;text-transform:uppercase;margin-bottom:' + (compact ? 4 : 8) + 'px;';
    header.textContent = 'ACHIEVEMENT UNLOCKED';

    var nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-family:VT323,monospace;font-size:' + nameSize + 'px;color:#ffc800;text-shadow:0 0 12px rgba(255,200,0,0.7), 0 0 24px rgba(255,200,0,0.3);text-transform:uppercase;letter-spacing:' + (compact ? 1 : 2) + 'px;margin-bottom:' + (compact ? 3 : 6) + 'px;';
    nameEl.textContent = def.name;

    var desc = document.createElement('div');
    desc.style.cssText = 'font-family:VT323,monospace;font-size:' + descSize + 'px;color:#ffffff;text-shadow:0 0 4px rgba(255,255,255,0.3);white-space:pre-line;';
    desc.textContent = def.description;

    toast.appendChild(header);
    if (def.imageIcon) {
        // Render at low resolution then scale up for pixel-art effect
        var imgEm = compact ? '3em' : '4.5em';
        var PW = 30, PH = 20;
        var pixCanvas = document.createElement('canvas');
        pixCanvas.width = PW;
        pixCanvas.height = PH;
        var emNum = parseFloat(imgEm);
        var cssH = (emNum * PH / PW).toFixed(2) + 'em';
        pixCanvas.style.cssText =
            'width:' + imgEm + ';height:' + cssH + ';display:block;' +
            'margin:0 auto ' + (compact ? '4px' : '8px') + ';' +
            'image-rendering:pixelated;image-rendering:crisp-edges;';
        var pxCtx = pixCanvas.getContext('2d');
        if (pxCtx) {
            var svgImg = new Image();
            svgImg.onload = function() { pxCtx.drawImage(svgImg, 0, 0, PW, PH); };
            svgImg.src = def.imageIcon;
        }
        toast.appendChild(pixCanvas);
    } else if (def.icon) {
        var iconEm = compact ? '2.5em' : '4em';
        var pxRes = 20;
        var pxCanvas = document.createElement('canvas');
        pxCanvas.width = pxRes;
        pxCanvas.height = pxRes;
        pxCanvas.style.cssText =
            'width:' + iconEm + ';height:' + iconEm + ';display:block;margin:0 auto ' + (compact ? 4 : 8) + 'px auto;' +
            'image-rendering:pixelated;image-rendering:crisp-edges;';
        var pxCtx = pxCanvas.getContext('2d');
        if (pxCtx) {
            pxCtx.textAlign = 'center';
            pxCtx.textBaseline = 'middle';
            pxCtx.font = (pxRes * 0.8) + 'px serif';
            pxCtx.fillText(def.icon, pxRes / 2, pxRes / 2);
        }
        toast.appendChild(pxCanvas);
    }
    toast.appendChild(nameEl);
    toast.appendChild(desc);

    return toast;
};

// ------------------------------------------
// 8-Bit Shockwave Transition
// ------------------------------------------

/**
 * Thick pixel-block expanding ring used as a transition between batches.
 * Renders pixel blocks at ~12fps with grid-snapping, matching the fire
 * and confetti aesthetic. Creates its own full-viewport wrapper so it
 * can overlap the outgoing and incoming batches.
 *
 * @returns {{ stop: Function }}
 */
AchievementManager.prototype._spawnShockwave = function() {
    var mobile = this._isMobile();
    var W = window.innerWidth;
    var H = window.innerHeight;
    var cx = W / 2;
    var cy = H / 2;

    var baseZ = 9000;

    // Own wrapper — lives independently of batch wrappers
    var wrapper = document.createElement('div');
    wrapper.className = 'achievement-shockwave-wrapper';
    wrapper.style.cssText = 'position:fixed;left:0;top:0;width:' + W + 'px;height:' + H + 'px;pointer-events:none;overflow:hidden;z-index:' + (baseZ + 2) + ';';
    document.body.appendChild(wrapper);

    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;';
    wrapper.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    if (!ctx) {
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        return { stop: function() {} };
    }

    var BLOCK = mobile ? 6 : 10;
    var SNAP = 2;
    var TICK = 83; // ~12fps, same as fire + confetti
    var BAND_BLOCKS = mobile ? 3 : 4;
    var BAND = BAND_BLOCKS * BLOCK;
    // Enough radius to clear the screen corners
    var MAX_RADIUS = Math.sqrt(W * W + H * H) / 2 + BAND;
    var TOTAL_TICKS = mobile ? 10 : 12;
    var ANGLE_STEPS = 120;
    var ANGLE_INC = (Math.PI * 2) / ANGLE_STEPS;

    // Gold/white gradient per block layer (inner → outer)
    var PRIMARY_COLORS  = ['#ffffff', '#ffe066', '#ffc800', '#ffaa00'];
    var TRAILING_COLORS = ['#fff5cc', '#ffc800', '#ffaa00', '#ff8800'];

    var tick = 0;
    var stopped = false;

    function drawRing(centerRadius, alpha, colors) {
        ctx.globalAlpha = alpha;
        for (var a = 0; a < ANGLE_STEPS; a++) {
            var angle = a * ANGLE_INC;
            var cosA = Math.cos(angle);
            var sinA = Math.sin(angle);

            for (var b = 0; b < BAND_BLOCKS; b++) {
                var r = centerRadius - BAND / 2 + b * BLOCK;
                if (r < 0) continue;

                var x = cx + cosA * r;
                var y = cy + sinA * r;

                var drawX = Math.round(x / SNAP) * SNAP;
                var drawY = Math.round(y / SNAP) * SNAP;

                if (drawX + BLOCK < 0 || drawX > W || drawY + BLOCK < 0 || drawY > H) continue;

                ctx.fillStyle = colors[b % colors.length];
                ctx.fillRect(drawX, drawY, BLOCK, BLOCK);
            }
        }
        ctx.globalAlpha = 1;
    }

    var intervalId = setInterval(function() {
        if (stopped) return;
        tick++;

        if (tick > TOTAL_TICKS) {
            cleanup();
            return;
        }

        var t = Math.min(tick / TOTAL_TICKS, 1);
        // Ease-out quadratic — fast start, decelerates
        var et = 1 - (1 - t) * (1 - t);
        var radius = et * MAX_RADIUS;
        var alpha = Math.max(0, 1 - t * 0.7);

        ctx.clearRect(0, 0, W, H);

        // Primary ring
        drawRing(radius, alpha, PRIMARY_COLORS);

        // Trailing ring (20% delayed, dimmer)
        var t2 = Math.max(0, (t - 0.2) / 0.8);
        if (t2 > 0) {
            var et2 = 1 - (1 - t2) * (1 - t2);
            var r2 = et2 * MAX_RADIUS;
            var a2 = Math.max(0, 1 - t2 * 0.8) * 0.6;
            drawRing(r2, a2, TRAILING_COLORS);
        }
    }, TICK);

    var timeoutId = setTimeout(cleanup, (TOTAL_TICKS + 2) * TICK);

    function cleanup() {
        if (stopped) return;
        stopped = true;
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    }

    return { stop: cleanup };
};

// ------------------------------------------
// Unlock Notification (fire + confetti + batched toasts)
// ------------------------------------------

/**
 * Show the next batch of queued achievement notifications.
 *
 * Drains up to 3 items from the queue and displays them simultaneously
 * using _computeCardPositions for layout. Overflow items display in
 * the next batch after this one fades.
 *
 * First batch: full fire + confetti + sound + pixelation (6.5s).
 * Follow-up batches: pixelation cards only, no effects or sound (4s).
 *
 * @param {boolean} [isFollowUp=false] - True for subsequent batches
 */
AchievementManager.prototype._showNextNotification = function(isFollowUp) {
    if (!this._notifQueue || this._notifQueue.length === 0) {
        this._activeNotif = null;
        return;
    }

    // Drain up to 3 valid items from the queue
    var batch = [];
    while (batch.length < 3 && this._notifQueue.length > 0) {
        var id = this._notifQueue.shift();
        var def = this.registry[id];
        if (def) {
            batch.push(def);
        }
    }

    if (batch.length === 0) {
        this._activeNotif = null;
        return;
    }

    var self = this;
    var baseZ = 9000;
    var viewW = window.innerWidth;
    var viewH = window.innerHeight;

    // First batch gets fire + confetti + sound
    var effectsWrapper = null;
    var fireHandle = null;
    var confettiHandle = null;

    if (!isFollowUp) {
        var EFFECT_DURATION = 5000;

        // Play achievement music once
        if (typeof soundManager !== 'undefined') {
            soundManager.resumeContext();
            soundManager.playImmediate('sound/music/achievement.mp3', 80);
        }

        // Effects wrapper (fire + confetti) — fades out first
        effectsWrapper = document.createElement('div');
        effectsWrapper.className = 'achievement-effects-wrapper';
        effectsWrapper.style.cssText = 'position:fixed;left:0;top:0;width:' + viewW + 'px;height:' + viewH + 'px;pointer-events:none;overflow:hidden;z-index:' + baseZ + ';';
        document.body.appendChild(effectsWrapper);

        fireHandle = this._spawnFireJets(effectsWrapper, EFFECT_DURATION);
        confettiHandle = this._spawnConfetti(effectsWrapper, EFFECT_DURATION + 2000);
    }

    // Toast wrapper (always present)
    var toastWrapper = document.createElement('div');
    toastWrapper.className = 'achievement-toast-wrapper';
    toastWrapper.style.cssText = 'position:fixed;left:0;top:0;width:' + viewW + 'px;height:' + viewH + 'px;pointer-events:none;overflow:hidden;z-index:' + (baseZ + 1) + ';';
    document.body.appendChild(toastWrapper);

    // Phase 1: Create cards with width/scale, append to DOM for measurement
    var sizes = this._computeCardSizes(batch.length, viewW);
    var toasts = [];
    for (var i = 0; i < batch.length; i++) {
        var toast = this._createToastElement(batch[i], sizes[i]);
        toastWrapper.appendChild(toast);
        toasts.push(toast);
    }

    // Phase 2: Measure real heights, normalize, compute final positions
    var positions = this._applyCardLayout(toasts, batch.length, viewW, viewH);

    // Track handles
    this._activeNotif = {
        effectsWrapper: effectsWrapper,
        toastWrapper: toastWrapper,
        fire: fireHandle,
        confetti: confettiHandle,
        pixelates: []
    };

    // How long cards stay visible before the wrapper fades (dial counts down this window)
    var dialDuration = isFollowUp ? 3000 : 5500;

    // Single dial per batch — added once, below the bottom-most card, centered to the batch
    var dialAdded = false;
    function addBatchDial() {
        if (dialAdded || typeof _makeTimeDial !== 'function') return;
        dialAdded = true;

        // Find the bottom edge of the lowest card using the computed positions
        var bottomOfBatch = 0;
        for (var pi = 0; pi < positions.length; pi++) {
            var cardBottom = positions[pi].top + toasts[pi].offsetHeight;
            if (cardBottom > bottomOfBatch) bottomOfBatch = cardBottom;
        }

        var dial = _makeTimeDial('#ffc800', dialDuration);
        dial.el.style.position  = 'absolute';
        dial.el.style.top       = (bottomOfBatch + 6) + 'px';
        dial.el.style.left      = '50%';
        dial.el.style.transform = 'translateX(-50%)';
        toastWrapper.appendChild(dial.el);
    }

    // Reveal logic
    function revealCard(index) {
        var t = toasts[index];
        if (!t) return;
        t.style.opacity = '1';

        setTimeout(function() {
            t.style.borderColor = '#ffee66';
            t.style.boxShadow = '0 0 40px rgba(255,200,0,0.8), 0 0 80px rgba(255,200,0,0.4)';
        }, 100);
        setTimeout(function() {
            t.style.borderColor = '#ffc800';
            t.style.boxShadow = '0 0 30px rgba(255,200,0,0.5), 0 0 60px rgba(255,200,0,0.2)';
        }, 500);
    }

    function onCardAssembled(index) {
        revealCard(index);
        addBatchDial();
    }

    // Run reverse-pixelation assembly for each card in parallel after layout
    requestAnimationFrame(function() {
        for (var i = 0; i < toasts.length; i++) {
            (function(idx) {
                var pixelHandle = self._pixelateInToast(toastWrapper, toasts[idx], function() {
                    onCardAssembled(idx);
                });
                if (self._activeNotif) self._activeNotif.pixelates.push(pixelHandle);
            })(i);
        }
    });

    // Backup: ensure all toasts are visible even if pixelation animation fails
    setTimeout(function() {
        for (var i = 0; i < toasts.length; i++) {
            if (toasts[i].style.opacity === '0') {
                onCardAssembled(i);
            }
        }
    }, 1500);

    if (!isFollowUp) {
        // First batch: fade fire + confetti at 3.8s
        setTimeout(function() {
            if (!effectsWrapper) return;
            effectsWrapper.style.transition = 'opacity 1.2s ease-in';
            effectsWrapper.style.opacity = '0';
            setTimeout(function() {
                if (effectsWrapper.parentNode) effectsWrapper.parentNode.removeChild(effectsWrapper);
                if (fireHandle) fireHandle.stop();
                if (confettiHandle) confettiHandle.stop();
            }, 1300);
        }, 3800);

        // First batch: fade toasts at ~6.5s
        setTimeout(function() {
            var hasMore = self._notifQueue && self._notifQueue.length > 0;
            if (hasMore) {
                self._transitionShockwave = self._spawnShockwave();
            }
            toastWrapper.style.transition = 'opacity 0.8s ease-in';
            toastWrapper.style.opacity = '0';
            setTimeout(function() {
                if (toastWrapper.parentNode) toastWrapper.parentNode.removeChild(toastWrapper);
                self._activeNotif = null;
                self._showNextNotification(true);
            }, 900);
        }, 6500);
    } else {
        // Follow-up batch: shorter display, cards only — fade at ~4s
        setTimeout(function() {
            var hasMore = self._notifQueue && self._notifQueue.length > 0;
            if (hasMore) {
                self._transitionShockwave = self._spawnShockwave();
            }
            toastWrapper.style.transition = 'opacity 0.8s ease-in';
            toastWrapper.style.opacity = '0';
            setTimeout(function() {
                if (toastWrapper.parentNode) toastWrapper.parentNode.removeChild(toastWrapper);
                self._activeNotif = null;
                self._showNextNotification(true);
            }, 900);
        }, 4000);
    }
};

/**
 * Trigger the achievement effect for preview/testing.
 * @param {number} [count=1] - Number of cards to preview (1-9).
 *   First 3 display together, remainder in subsequent batches of up to 3.
 */
AchievementManager.prototype.previewEffect = function(count) {
    if (count === undefined) count = 1;
    count = Math.max(1, Math.min(9, count));

    var PREVIEW_NAMES = [
        'TESSSSSSSSST', 'SECOND CARD', 'THIRD CARD',
        'FOURTH CARD', 'FIFTH CARD', 'SIXTH CARD',
        'SEVENTH CARD', 'EIGHTH CARD', 'NINTH CARD'
    ];
    var PREVIEW_DESCS = [
        'This is a preview of the unlock effect',
        'Another achievement unlocked!',
        'Triple achievement combo!',
        'The hits keep coming!',
        'Achievement overload!',
        'Is there no end?',
        'Lucky number seven!',
        'Octuple threat!',
        'The final frontier!'
    ];

    var previewIds = [];
    for (var i = 0; i < count; i++) {
        var pid = '__preview_' + i + '__';
        previewIds.push(pid);
        this.registry[pid] = {
            id: pid,
            name: PREVIEW_NAMES[i],
            description: PREVIEW_DESCS[i],
            category: 'preview',
            icon: '',
            hidden: false
        };
        // Push all synchronously so batching groups them
        this._notifQueue.push(pid);
    }

    if (!this._activeNotif && !this._batchPending) {
        this._batchPending = true;
        var self = this;
        setTimeout(function() {
            self._batchPending = false;
            if (!self._activeNotif) {
                self._showNextNotification();
            }
        }, 0);
    }

    var self = this;
    setTimeout(function() {
        for (var i = 0; i < previewIds.length; i++) {
            delete self.registry[previewIds[i]];
        }
    }, 10000);
};

/**
 * Clean up active and pending achievement notifications.
 */
AchievementManager.prototype._clearNotifications = function() {
    if (this._activeNotif) {
        if (this._activeNotif.fire) this._activeNotif.fire.stop();
        if (this._activeNotif.confetti) this._activeNotif.confetti.stop();
        if (this._activeNotif.pixelates) {
            for (var i = 0; i < this._activeNotif.pixelates.length; i++) {
                if (this._activeNotif.pixelates[i]) this._activeNotif.pixelates[i].stop();
            }
        }
        // Legacy: single pixelate handle from old code paths
        if (this._activeNotif.pixelate) this._activeNotif.pixelate.stop();
        if (this._activeNotif.effectsWrapper && this._activeNotif.effectsWrapper.parentNode) {
            this._activeNotif.effectsWrapper.parentNode.removeChild(this._activeNotif.effectsWrapper);
        }
        if (this._activeNotif.toastWrapper && this._activeNotif.toastWrapper.parentNode) {
            this._activeNotif.toastWrapper.parentNode.removeChild(this._activeNotif.toastWrapper);
        }
    }
    // Stop any in-flight transition shockwave
    if (this._transitionShockwave) {
        this._transitionShockwave.stop();
        this._transitionShockwave = null;
    }
    this._activeNotif = null;
    this._batchPending = false;
    if (this._notifQueue) {
        this._notifQueue.length = 0;
    }
};

