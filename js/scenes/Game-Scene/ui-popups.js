// ============================================
// GAME SCENE - UI Popups Module (DOM-based)
// ============================================
// Popup creation for players, production, and relations.
// All elements are DOM-based — no Phaser containers or game objects.

// ---- Helper: create a popup overlay shell ----
// Returns { overlay, content, setVisible, visible } where overlay is the
// full-screen backdrop div and content is the centered panel div.

function _createPopupShell(scene, title, onClose) {
    const config = layoutConfig;
    const popupWidth = Math.min(config.gameWidth * 0.85, 320);

    // Full-screen overlay
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    overlay.style.display = 'none';
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2000';

    // Backdrop (darkens the game, blocks clicks through)
    const backdrop = document.createElement('div');
    backdrop.className = 'popup-backdrop';
    backdrop.style.position = 'absolute';
    backdrop.style.inset = '0';
    backdrop.style.background = 'rgba(0,0,0,0.7)';
    overlay.appendChild(backdrop);

    // Centered content panel
    const content = document.createElement('div');
    content.className = 'popup-content';
    content.style.position = 'absolute';
    content.style.left = '50%';
    content.style.top = '50%';
    content.style.transform = 'translate(-50%,-50%)';
    content.style.background = '#0a0a14';
    content.style.border = '2px solid #00d4ff';
    content.style.padding = '15px';
    content.style.boxSizing = 'border-box';
    content.style.width = popupWidth + 'px';
    content.style.maxWidth = '85%';
    overlay.appendChild(content);

    // Header row
    const header = document.createElement('div');
    header.className = 'popup-header';
    header.style.position = 'relative';
    header.style.textAlign = 'center';
    header.style.marginBottom = '8px';

    const titleSpan = document.createElement('span');
    titleSpan.style.fontFamily = 'VT323, monospace';
    titleSpan.style.fontSize = '20px';
    titleSpan.style.color = COLORS.textPrimary;
    titleSpan.textContent = title;
    header.appendChild(titleSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'popup-close';
    closeBtn.type = 'button';
    closeBtn.textContent = 'X';
    closeBtn.style.position = 'absolute';
    closeBtn.style.right = '0';
    closeBtn.style.top = '50%';
    closeBtn.style.transform = 'translateY(-50%)';
    closeBtn.style.fontFamily = 'VT323, monospace';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.color = COLORS.textPrimary;
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '4px 10px';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.outline = 'none';
    if (window.matchMedia('(hover: hover)').matches) {
        closeBtn.addEventListener('mouseenter', function() {
            closeBtn.style.color = '#ff4444';
        });
        closeBtn.addEventListener('mouseleave', function() {
            closeBtn.style.color = COLORS.textPrimary;
        });
    }
    closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        scene.playClickSound();
        onClose();
    });
    header.appendChild(closeBtn);

    content.appendChild(header);

    // Divider
    const hr = document.createElement('hr');
    hr.style.border = 'none';
    hr.style.borderTop = '1px solid rgba(0,212,255,0.5)';
    hr.style.margin = '0 0 10px 0';
    content.appendChild(hr);

    // Build wrapper with .visible property
    let _visible = false;
    const wrapper = {
        overlay: overlay,
        content: content,
        setVisible: function(v) {
            _visible = !!v;
            overlay.style.display = _visible ? 'block' : 'none';
        },
        get visible() {
            return _visible;
        }
    };

    return wrapper;
}


// ============================================
// createPlayersPopup
// ============================================

GameScene.prototype.createPlayersPopup = function() {
    const shell = _createPopupShell(this, '// PLAYERS \\\\', () => this.hidePlayersPopup());

    // Fixed height for 4 player entries
    const entryHeight = 60;
    const bodyDiv = document.createElement('div');
    bodyDiv.style.minHeight = (4 * entryHeight) + 'px';
    shell.content.appendChild(bodyDiv);

    // Create player entries
    this.popupPlayerEntries = [];
    for (let i = 0; i < 4; i++) {
        const entry = this.createPopupPlayerEntry(0, 0, i, 0);
        bodyDiv.appendChild(entry.el);
        this.popupPlayerEntries.push(entry);
    }

    // Append overlay to scene container
    this.container.appendChild(shell.overlay);

    // Store as this.playersPopup with .visible / .setVisible
    this.playersPopup = shell;
};


// ============================================
// createPopupPlayerEntry
// ============================================

GameScene.prototype.createPopupPlayerEntry = function(x, y, index, availableWidth) {
    const entryHeight = 55;

    // Entry wrapper
    const entryEl = document.createElement('div');
    entryEl.style.display = 'flex';
    entryEl.style.alignItems = 'center';
    entryEl.style.gap = '8px';
    entryEl.style.padding = '6px 10px';
    entryEl.style.boxSizing = 'border-box';
    entryEl.style.height = entryHeight + 'px';
    entryEl.style.background = 'rgba(26,26,46,0.5)';
    entryEl.style.border = '1px solid rgba(0,212,255,0.3)';
    entryEl.style.marginBottom = '5px';
    entryEl.style.borderRadius = '2px';

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
    textCol.style.overflow = 'hidden';

    const nameSpan = document.createElement('span');
    nameSpan.style.display = 'block';
    nameSpan.style.fontFamily = 'VT323, monospace';
    nameSpan.style.fontSize = '16px';
    nameSpan.style.color = COLORS.textPrimary;
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    nameSpan.style.whiteSpace = 'nowrap';
    textCol.appendChild(nameSpan);

    const techSpan = document.createElement('span');
    techSpan.style.display = 'block';
    techSpan.style.fontFamily = 'VT323, monospace';
    techSpan.style.fontSize = '14px';
    techSpan.style.color = COLORS.textSecondary;
    textCol.appendChild(techSpan);

    entryEl.appendChild(textCol);

    // Diplomacy button
    const diplomacyBtn = this.createSmallButton(0, 0, 'War', () => {
        this.toggleDiplomacyFromPopup(index);
    }, 110, 28);
    diplomacyBtn.setVisible(false);
    diplomacyBtn.el.style.flexShrink = '0';
    entryEl.appendChild(diplomacyBtn.el);

    // Build wrapper with expected API
    const wrapper = {
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
        techText: {
            el: techSpan,
            setText: function(str) { techSpan.textContent = str; },
            setColor: function(css) { techSpan.style.color = css; }
        },
        diplomacyBtn: diplomacyBtn,
        playerIndex: index,
        entryBg: {
            el: entryEl,
            setFillStyle: function(hex) {
                entryEl.style.background = hexToRGBA(hex, 0.5);
            },
            setStrokeStyle: function(w, hex, alpha) {
                entryEl.style.borderWidth = w + 'px';
                entryEl.style.borderStyle = 'solid';
                entryEl.style.borderColor = hexToRGBA(hex, alpha !== undefined ? alpha : 1);
            }
        },
        setVisible: function(v) {
            entryEl.style.display = v ? 'flex' : 'none';
        },
        get visible() {
            return entryEl.style.display !== 'none';
        }
    };

    return wrapper;
};


// ============================================
// createProductionPopup
// ============================================

GameScene.prototype.createProductionPopup = function() {
    const shell = _createPopupShell(this, '// PRODUCTION \\\\', () => this.hideProductionPopup());

    const prodTypes = ['DIPLOMACY', 'SCIENCE', 'WARRIOR', 'SETTLER', 'REPAIR', 'HEAL_WARRIORS'];
    const btnHeight = 40;

    // Production buttons
    this.popupProductionButtons = [];

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.flexDirection = 'column';
    btnContainer.style.gap = '10px';

    prodTypes.forEach((type) => {
        const btn = this.createSmallButton(
            0, 0,
            PRODUCTION_TYPES[type].name,
            () => {
                this.selectProduction(type);
                this.updateProductionPopup();
            },
            0,
            btnHeight
        );
        btnContainer.appendChild(btn.el);
        this.popupProductionButtons.push({ btn, type });
    });

    shell.content.appendChild(btnContainer);

    // Repeat toggle
    const toggleRow = document.createElement('div');
    toggleRow.style.marginTop = '12px';

    this.popupRepeatToggle = this.createToggleSwitch(
        0, 0,
        'Repeat',
        (enabled) => {
            this.toggleRepeat(enabled);
        },
        1
    );
    toggleRow.appendChild(this.popupRepeatToggle.container.el);
    shell.content.appendChild(toggleRow);

    // Append overlay to scene container
    this.container.appendChild(shell.overlay);

    // Store as this.productionPopup with .visible / .setVisible
    this.productionPopup = shell;
};


// ============================================
// createRelationsPopup
// ============================================

GameScene.prototype.createRelationsPopup = function() {
    const shell = _createPopupShell(this, '// RELATIONS \\\\', () => this.hideRelationsPopup());

    // Set a fixed height for the content area
    const diagramHeight = 200;

    // Relations diagram container — holds a canvas for lines and positioned dot elements
    const diagramDiv = document.createElement('div');
    diagramDiv.style.position = 'relative';
    diagramDiv.style.width = '100%';
    diagramDiv.style.height = diagramHeight + 'px';
    diagramDiv.style.margin = '0 auto';
    shell.content.appendChild(diagramDiv);

    // Store reference for updateRelationsPopup
    this.relationsGraphicsContainer = diagramDiv;

    // Track selected players for filtering (empty = show all)
    this.selectedRelationPlayers = new Set();

    // Hint text at the bottom
    const hintText = document.createElement('div');
    hintText.style.fontFamily = 'VT323, monospace';
    hintText.style.fontSize = '14px';
    hintText.style.color = COLORS.textSecondary;
    hintText.style.textAlign = 'center';
    hintText.style.marginTop = '8px';
    hintText.textContent = 'Tap a color to filter relations';
    shell.content.appendChild(hintText);

    // Append overlay to scene container
    this.container.appendChild(shell.overlay);

    // Store as this.relationsPopup with .visible / .setVisible
    this.relationsPopup = shell;
};


// ============================================
// getRelationDotPositions
// ============================================

GameScene.prototype.getRelationDotPositions = function(playerCount) {
    // Returns positions for dots based on player count
    // Centered around (0, 0), with spacing suitable for the popup
    // Each position includes labelAbove to indicate if name should be above the dot
    const spacing = 80;

    if (playerCount === 2) {
        // Linear horizontal - names below
        return [
            { x: -spacing / 2, y: 0, labelAbove: false },
            { x: spacing / 2, y: 0, labelAbove: false }
        ];
    } else if (playerCount === 3) {
        // Triangle (equilateral, pointing up)
        const height = spacing * Math.sqrt(3) / 2;
        return [
            { x: 0, y: -height / 2, labelAbove: true },            // Top - name above
            { x: -spacing / 2, y: height / 2, labelAbove: false }, // Bottom left - name below
            { x: spacing / 2, y: height / 2, labelAbove: false }   // Bottom right - name below
        ];
    } else {
        // Square (4 players)
        const half = spacing / 2;
        return [
            { x: -half, y: -half, labelAbove: true },  // Top left - name above
            { x: half, y: -half, labelAbove: true },   // Top right - name above
            { x: -half, y: half, labelAbove: false },  // Bottom left - name below
            { x: half, y: half, labelAbove: false }    // Bottom right - name below
        ];
    }
};


// ============================================
// updateRelationsPopup
// ============================================

GameScene.prototype.updateRelationsPopup = function() {
    if (!this.relationsGraphicsContainer) return;

    const container = this.relationsGraphicsContainer;

    // Clear existing content
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    // Filter to only active (non-eliminated) players
    const activePlayers = [];
    for (let i = 0; i < this.engine.players.length; i++) {
        if (this.engine.getPlayerCities(i).length > 0) {
            activePlayers.push(i);
        }
    }
    const activeCount = activePlayers.length;
    const positions = this.getRelationDotPositions(activeCount);
    const dotRadius = 18;

    // Get container dimensions for centering
    const containerW = container.offsetWidth || 260;
    const containerH = container.offsetHeight || 200;
    const centerX = containerW / 2;
    const centerY = containerH / 2;

    // Create a canvas for drawing lines between players
    const canvas = document.createElement('canvas');
    canvas.width = containerW;
    canvas.height = containerH;
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.pointerEvents = 'none';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    // Draw lines between players
    for (let ai = 0; ai < activeCount; ai++) {
        for (let aj = ai + 1; aj < activeCount; aj++) {
            const i = activePlayers[ai];
            const j = activePlayers[aj];

            // Check if we should show this relation based on selection
            const showAll = this.selectedRelationPlayers.size === 0;
            const showThisRelation = showAll ||
                this.selectedRelationPlayers.has(i) ||
                this.selectedRelationPlayers.has(j);

            if (!showThisRelation) continue;

            // Get relation state between players i and j
            const playerI = this.engine.players[i];
            const playerJ = this.engine.players[j];
            const relationIJ = playerI.relations[j];
            const relationJI = playerJ.relations[i];

            // At war if either has declared war or proposed peace (still at war until accepted)
            const atWar = relationIJ === 'war' || relationJI === 'war' ||
                          relationIJ === 'peace_proposed' || relationJI === 'peace_proposed';

            // Line color: red for war, white for peace
            const lineColor = atWar ? 'rgba(255,68,68,0.9)' : 'rgba(255,255,255,0.6)';

            const fromX = centerX + positions[ai].x;
            const fromY = centerY + positions[ai].y;
            const toX = centerX + positions[aj].x;
            const toY = centerY + positions[aj].y;

            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
        }
    }

    // Store dot references
    this.relationDots = [];

    // Draw player dots as positioned DOM elements
    for (let ai = 0; ai < activeCount; ai++) {
        const i = activePlayers[ai];
        const pos = positions[ai];
        const player = this.engine.players[i];
        const isSelected = this.selectedRelationPlayers.has(i);

        const dotX = centerX + pos.x;
        const dotY = centerY + pos.y;

        // Dot wrapper for positioning
        const dotWrapper = document.createElement('div');
        dotWrapper.style.position = 'absolute';
        dotWrapper.style.left = (dotX - dotRadius - 5) + 'px';
        dotWrapper.style.top = (dotY - dotRadius - 5) + 'px';
        dotWrapper.style.width = ((dotRadius + 5) * 2) + 'px';
        dotWrapper.style.height = ((dotRadius + 5) * 2) + 'px';
        dotWrapper.style.cursor = 'pointer';

        // Selection ring (shown when selected)
        const ringSize = (dotRadius + 5) * 2;
        const ringEl = document.createElement('div');
        ringEl.style.position = 'absolute';
        ringEl.style.left = '0';
        ringEl.style.top = '0';
        ringEl.style.width = ringSize + 'px';
        ringEl.style.height = ringSize + 'px';
        ringEl.style.borderRadius = '50%';
        ringEl.style.border = isSelected ? '3px solid #ffffff' : '3px solid transparent';
        ringEl.style.boxSizing = 'border-box';
        dotWrapper.appendChild(ringEl);

        // Main color dot
        const dotEl = document.createElement('div');
        const dotSize = dotRadius * 2;
        dotEl.style.position = 'absolute';
        dotEl.style.left = '5px';
        dotEl.style.top = '5px';
        dotEl.style.width = dotSize + 'px';
        dotEl.style.height = dotSize + 'px';
        dotEl.style.borderRadius = '50%';
        dotEl.style.background = hexToCSSHex(player.color.hex);
        dotEl.style.border = '2px solid #000000';
        dotEl.style.boxSizing = 'border-box';
        dotEl.style.transition = 'transform 0.1s';
        dotWrapper.appendChild(dotEl);

        // Player name label - above or below dot based on position
        const nameLabel = document.createElement('div');
        nameLabel.style.position = 'absolute';
        nameLabel.style.left = '50%';
        nameLabel.style.transform = 'translateX(-50%)';
        nameLabel.style.fontFamily = 'VT323, monospace';
        nameLabel.style.fontSize = '14px';
        nameLabel.style.color = COLORS.textPrimary;
        nameLabel.style.whiteSpace = 'nowrap';
        nameLabel.style.textAlign = 'center';
        nameLabel.style.pointerEvents = 'none';
        nameLabel.textContent = player.name;

        if (pos.labelAbove) {
            nameLabel.style.bottom = (ringSize + 4) + 'px';
        } else {
            nameLabel.style.top = (ringSize + 4) + 'px';
        }
        dotWrapper.appendChild(nameLabel);

        // Hover effects (skip on touch devices)
        if (window.matchMedia('(hover: hover)').matches) {
            dotWrapper.addEventListener('mouseenter', function() {
                dotEl.style.transform = 'scale(1.1)';
            });
            dotWrapper.addEventListener('mouseleave', function() {
                dotEl.style.transform = 'scale(1.0)';
            });
        }

        // Click to toggle filter
        const scene = this;
        (function(playerIdx) {
            dotWrapper.addEventListener('click', function(e) {
                e.preventDefault();
                if (scene.selectedRelationPlayers.has(playerIdx)) {
                    scene.selectedRelationPlayers.delete(playerIdx);
                } else {
                    scene.selectedRelationPlayers.add(playerIdx);
                }
                scene.updateRelationsPopup();
            });
        })(i);

        container.appendChild(dotWrapper);
        this.relationDots.push({ container: dotWrapper, dot: dotEl, selectionRing: ringEl, playerIndex: i });
    }
};


// ============================================
// setPieceSpritesInteractive
// ============================================

GameScene.prototype.setPieceSpritesInteractive = function(enabled) {
    this.pieceSprites.forEach(function(sprite) {
        if (enabled) {
            sprite.setInteractive({ draggable: true, useHandCursor: true });
        } else {
            sprite.disableInteractive();
        }
    });
};


// ============================================
// show/hide PlayersPopup
// ============================================

GameScene.prototype.showPlayersPopup = function() {
    if (!this.playersPopup) return;
    this.updatePlayersPopup();
    this.setPieceSpritesInteractive(false);
    this.playersPopup.setVisible(true);
};

GameScene.prototype.hidePlayersPopup = function() {
    if (!this.playersPopup) return;
    this.playersPopup.setVisible(false);
    this.setPieceSpritesInteractive(true);
};


// ============================================
// show/hide ProductionPopup
// ============================================

GameScene.prototype.showProductionPopup = function() {
    if (!this.productionPopup) return;
    // Clear movement highlights so selected piece visuals don't show through the overlay
    this.clearHighlights();
    this.setPieceSpritesInteractive(false);
    this.updateProductionPopup();
    this.productionPopup.setVisible(true);
};

GameScene.prototype.hideProductionPopup = function() {
    if (!this.productionPopup) return;
    this.productionPopup.setVisible(false);
    this.setPieceSpritesInteractive(true);
};


// ============================================
// show/hide RelationsPopup
// ============================================

GameScene.prototype.showRelationsPopup = function() {
    if (!this.relationsPopup) return;
    // Clear selection when opening
    this.selectedRelationPlayers = new Set();
    this.setPieceSpritesInteractive(false);
    // Make visible BEFORE updating so container has real layout dimensions
    this.relationsPopup.setVisible(true);
    this.updateRelationsPopup();
};

GameScene.prototype.hideRelationsPopup = function() {
    if (!this.relationsPopup) return;
    this.relationsPopup.setVisible(false);
    this.setPieceSpritesInteractive(true);
};


// ============================================
// toggleDiplomacyFromPopup
// ============================================

GameScene.prototype.toggleDiplomacyFromPopup = function(targetIndex) {
    this.toggleDiplomacy(targetIndex);
    this.updatePlayersPopup();
};
