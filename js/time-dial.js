// ============================================
// Time Dial Utility
// ============================================
// Smooth neon-energy circular countdown dial rendered on a <canvas>.
//
// The arc drains clockwise from 12 o'clock as time passes, drawn with
// four concentric passes that simulate a glowing neon tube:
//   1. Wide outer bloom  (transparent, breathes)
//   2. Glow halo         (semi-transparent, breathes)
//   3. Main colored arc  (steady)
//   4. Bright white core (steady, very thin)
// A hot-white energy-tip dot rides the leading edge of the drain.
//
// The canvas element uses half-resolution + image-rendering:pixelated to match
// the territory-border energy aesthetic. CSS box-shadow provides the outer glow.
//
// Default size: 40px (callers set position:absolute with bottom:-50px etc.)

/**
 * Create a neon-energy circular countdown dial.
 *
 * @param {string} color     - Arc color (CSS hex, e.g. '#ff4444').
 * @param {number} duration  - Countdown duration in ms.
 * @param {number} [size=40] - Canvas width/height in px.
 * @returns {{ el: HTMLCanvasElement, canvas: HTMLCanvasElement, stop: function }}
 */
function _makeTimeDial(color, duration, size) {
    size = size || 40;

    var cx  = size / 2;
    var cy  = size / 2;
    var r   = Math.round(size * 0.325);          // ring radius (13 at 40 px)
    var tw  = Math.max(3, Math.round(size * 0.10)); // track / arc line width (4 at 40 px)

    // ── Helpers ─────────────────────────────────────────────────────────
    function rgba(hex, a) {
        return 'rgba(' +
            (parseInt(hex.slice(1, 3), 16) || 0) + ',' +
            (parseInt(hex.slice(3, 5), 16) || 0) + ',' +
            (parseInt(hex.slice(5, 7), 16) || 0) + ',' + a + ')';
    }

    // ── Canvas setup ────────────────────────────────────────────────────
    // A wrapper div provides the smooth circular dark background via CSS
    // border-radius, avoiding the blocky square artefact that appears when
    // a filled circle is drawn on a half-resolution pixelated canvas.
    var wrapper = document.createElement('div');
    wrapper.style.cssText =
        'position:relative;' +
        'width:'           + size + 'px;' +
        'height:'          + size + 'px;' +
        'border-radius:50%;' +
        'background:#060610;' +
        'display:inline-block;pointer-events:none;flex-shrink:0;';

    // Arc canvas — half resolution with pixelated upscaling to match the
    // territory-border energy aesthetic (same technique as glowCanvas).
    var PIXEL_SCALE = 0.5;
    var canvas = document.createElement('canvas');
    canvas.width  = Math.ceil(size * PIXEL_SCALE);
    canvas.height = Math.ceil(size * PIXEL_SCALE);
    canvas.style.cssText =
        'position:absolute;left:0;top:0;' +
        'width:'           + size + 'px;' +
        'height:'          + size + 'px;' +
        'image-rendering:pixelated;' +
        'image-rendering:crisp-edges;' +
        'pointer-events:none;';
    wrapper.appendChild(canvas);

    var glowBoxShadow =
        '0 0 8px '  + rgba(color, 0.75) + ',' +
        '0 0 20px ' + rgba(color, 0.22);

    var ctx = canvas.getContext('2d');
    if (!ctx) return { el: wrapper, canvas: canvas, stop: function() {} };
    ctx.scale(PIXEL_SCALE, PIXEL_SCALE);

    // ── Animation state ─────────────────────────────────────────────────
    var startTime = Date.now();
    var stopped   = false;
    var tid       = null;
    var ANGLE0    = -Math.PI / 2;          // 12 o'clock

    function draw() {
        if (stopped) return;

        var now     = Date.now();
        var elapsed = now - startTime;
        var progress = Math.max(0, 1 - elapsed / duration);
        // Check glow setting each frame so toggling it live is reflected immediately
        var glowOn = typeof uiController === 'undefined' || uiController.settings.glowBorders;
        // Gentle sine breathe on the glow passes (period ≈ 2.2 s)
        var breathe = 0.82 + 0.18 * Math.sin(now / 350);

        // Sync CSS outer glow ring with the setting
        wrapper.style.boxShadow = glowOn ? glowBoxShadow : 'none';

        ctx.clearRect(0, 0, size, size);   // logical coords (ctx is scaled)

        // ── Dim track ring (full circle, shows the drain path) ───────────
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(28,28,68,0.8)';
        ctx.lineWidth   = tw;
        ctx.lineCap     = 'butt';
        ctx.stroke();

        // ── Neon arc (active portion only) ──────────────────────────────
        if (progress > 0) {
            var endAngle = ANGLE0 + progress * Math.PI * 2;

            if (glowOn) {
                // Pass 1 — wide outer bloom (breathes with the sine wave)
                ctx.beginPath();
                ctx.arc(cx, cy, r, ANGLE0, endAngle);
                ctx.strokeStyle = rgba(color, 0.11 * breathe);
                ctx.lineWidth   = tw * 3.2;
                ctx.lineCap     = 'round';
                ctx.stroke();

                // Pass 2 — glow halo (breathes)
                ctx.beginPath();
                ctx.arc(cx, cy, r, ANGLE0, endAngle);
                ctx.strokeStyle = rgba(color, 0.30 * breathe);
                ctx.lineWidth   = tw * 1.9;
                ctx.lineCap     = 'round';
                ctx.stroke();
            }

            // Pass 3 — main colored arc (steady, always visible)
            ctx.beginPath();
            ctx.arc(cx, cy, r, ANGLE0, endAngle);
            ctx.strokeStyle = rgba(color, 0.88);
            ctx.lineWidth   = tw;
            ctx.lineCap     = 'round';
            ctx.stroke();

            // Pass 4 — bright white core (steady, very thin)
            ctx.beginPath();
            ctx.arc(cx, cy, r, ANGLE0, endAngle);
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth   = tw * 0.28;
            ctx.lineCap     = 'round';
            ctx.stroke();

            // ── Energy-tip dot (leading edge of the drain) ──────────────
            var tipX = cx + Math.cos(endAngle) * r;
            var tipY = cy + Math.sin(endAngle) * r;

            if (glowOn) {
                // Tip glow halo
                ctx.beginPath();
                ctx.arc(tipX, tipY, tw * 1.1, 0, Math.PI * 2);
                ctx.fillStyle = rgba(color, 0.35 * breathe);
                ctx.fill();
            }

            // Tip bright core
            ctx.beginPath();
            ctx.arc(tipX, tipY, tw * 0.55, 0, Math.PI * 2);
            ctx.fillStyle    = '#ffffff';
            ctx.globalAlpha  = 0.9;
            ctx.fill();
            ctx.globalAlpha  = 1;

            tid = setTimeout(draw, 33);   // ~30 fps — smooth arc
        }
    }

    draw();

    return {
        el:     wrapper,
        canvas: canvas,
        stop: function() {
            stopped = true;
            if (tid !== null) { clearTimeout(tid); tid = null; }
        }
    };
}
