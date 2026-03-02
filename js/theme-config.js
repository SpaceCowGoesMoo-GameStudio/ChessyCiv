// ============================================
// THEME CONFIG — Central theme registry
// ============================================
// Loads after constants.js. Snapshots original COLORS values and provides
// apply/reset API that mutates COLORS in-place so all rendering code
// picks up new values without extra plumbing.

var ThemeConfig = (function() {
    // Snapshot the default COLORS values at load time
    var _defaults = {};
    for (var key in COLORS) {
        if (COLORS.hasOwnProperty(key)) {
            _defaults[key] = COLORS[key];
        }
    }

    var _activeTheme = null;

    // Theme definitions — each maps COLORS keys to replacement values,
    // plus optional extra keys accessible via ThemeConfig.get()
    var themes = {
        y2k: {
            colors: {
                background:      0x3D0F1C,
                lightTile:       0xFFD1DC,
                darkTile:        0xF8A4B8,
                highlight:       0xFF69B4,
                border:          0xFF1493,
                uiBackground:    0x3D0F1C,
                uiBackgroundAlt: 0x4A1225,
                textPrimary:     '#FF1493',
                textSecondary:   '#FF69B4',
                textMuted:       '#C7819B',
                buttonBg:        0x3D0F1C,
                buttonBorder:    0xFF1493,
                buttonHover:     0xFF69B4,
                accentGreen:     '#FF69B4',
                accentRed:       '#C71585'
            },
            extra: {
                pieceBg:          'rgba(61,15,28,0.95)',
                panelBg:          '#3D0F1C',
                panelBorder:      '#FF1493',
                bodyBg:           '#FFB6C1',
                headerGradient:   'linear-gradient(180deg, #3D0F1C 0%, #4A1225 100%)',
                glowColor:        '#FF1493'
            }
        }
    };

    return {
        apply: function(name) {
            var theme = themes[name];
            if (!theme) return false;

            // Mutate COLORS in-place
            var tc = theme.colors;
            for (var key in tc) {
                if (tc.hasOwnProperty(key) && COLORS.hasOwnProperty(key)) {
                    COLORS[key] = tc[key];
                }
            }

            _activeTheme = name;
            return true;
        },

        reset: function() {
            // Restore all COLORS to original snapshot
            for (var key in _defaults) {
                if (_defaults.hasOwnProperty(key)) {
                    COLORS[key] = _defaults[key];
                }
            }
            _activeTheme = null;
        },

        isActive: function(name) {
            return _activeTheme === name;
        },

        current: function() {
            return _activeTheme;
        },

        get: function(key) {
            if (!_activeTheme || !themes[_activeTheme]) return null;
            var extra = themes[_activeTheme].extra;
            return extra ? (extra[key] || null) : null;
        },

        getDefault: function(key) {
            return _defaults.hasOwnProperty(key) ? _defaults[key] : undefined;
        }
    };
})();
