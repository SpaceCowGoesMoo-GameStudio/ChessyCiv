/**
 * UIController - Help panel (DOM overlay)
 * Prototype extension for UIController
 *
 * Full-screen overlay with section-based navigation for assistance resources.
 * Ported navigation pattern from extras-ald dialog tree.
 * Pressing SPACE or clicking "Clear" triggers a panic flow that hides
 * the overlay and immediately starts a hidden game.
 */

/**
 * Build the help panel DOM structure (called once during init).
 */
UIController.prototype.createHelpPanel = function() {
    const overlay = document.createElement('div');
    overlay.id = 'help-panel-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(180deg, #0a0a14 0%, #1a1a2e 100%);
        z-index: 3000;
        display: none;
        font-family: 'VT323', monospace;
        flex-direction: column;
        overflow: hidden;
    `;

    // Inject scoped styles for centering an odd last item in 2-col grids
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        #help-panel-overlay .help-btn-grid > :last-child:nth-child(odd) {
            grid-column: 1 / -1;
            justify-self: center;
            max-width: calc(50% - 10px);
        }
        @media (max-width: 768px) {
            a.help-tel-active {
                color: #00d4ff !important;
                text-decoration: underline !important;
            }
        }
        @media (pointer: coarse) {
            .help-clear-btn {
                position: relative;
            }
            .help-clear-btn::after {
                content: '';
                position: absolute;
                top: -16px;
                right: -16px;
                bottom: -16px;
                left: -16px;
            }
        }
        @media (max-width: 768px) {
            .help-clear-zone { display: block !important; }
            .help-clear-zone.help-clear-zone-hidden { display: none !important; }
        }
    `;
    overlay.appendChild(styleEl);

    // Shared button styles
    const navBtnStyle = "font-family:'VT323',monospace;font-size:18px;padding:8px 16px;background:transparent;border:1px solid #00d4ff;color:#00d4ff;cursor:pointer;text-transform:uppercase;letter-spacing:1px;";
    const catBtnStyle = "font-family:'VT323',monospace;font-size:20px;padding:14px 24px;background:transparent;border:2px solid #00d4ff;color:#00d4ff;cursor:pointer;letter-spacing:1px;width:100%;max-width:400px;text-align:center;";

    // ── Fixed header bar ─────────────────────────────────────
    const headerBar = document.createElement('div');
    headerBar.style.cssText = `
        flex-shrink: 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 20px;
        background: #0a0a14;
        border-bottom: 1px solid rgba(0, 212, 255, 0.3);
    `;

    const headerBackBtn = document.createElement('button');
    headerBackBtn.className = 'help-nav-btn';
    headerBackBtn.style.cssText = navBtnStyle;
    headerBackBtn.textContent = '\u2190 BACK';

    const headerClearBtn = document.createElement('button');
    headerClearBtn.className = 'help-nav-btn help-clear-btn';
    headerClearBtn.style.cssText = navBtnStyle;
    headerClearBtn.textContent = 'CLEAR';

    headerBar.appendChild(headerBackBtn);
    headerBar.appendChild(headerClearBtn);
    overlay.appendChild(headerBar);

    // ── Mobile-only expanded clear touch zone ─────────────────
    // Covers the top-right quadrant of the screen (header bar + empty space
    // below it) so a panicked tap anywhere in that region triggers clear.
    const clearZone = document.createElement('div');
    clearZone.className = 'help-clear-zone';
    clearZone.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        width: 50%;
        height: 150px;
        z-index: 1;
        display: none;
    `;
    overlay.appendChild(clearZone);
    this._helpClearZone = clearZone;

    // ── Scrollable content area ──────────────────────────────
    const contentArea = document.createElement('div');
    contentArea.style.cssText = 'flex:1;overflow-y:auto;';
    overlay.appendChild(contentArea);

    // ── Main help view ──────────────────────────────────────
    const mainView = document.createElement('div');
    mainView.id = 'help-main-view';
    mainView.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100%;
        padding: 20px 20px 40px;
        box-sizing: border-box;
    `;

    mainView.innerHTML = `
        <h1 style="font-size:56px;color:#00d4ff;text-shadow:0 0 10px #00d4ff,0 0 20px #00d4ff;margin:0 0 30px;text-align:center;">You Are Not Alone</h1>
        <p style="font-size:22px;color:#88ccff;max-width:600px;text-align:center;line-height:1.6;margin:0 0 40px;">
            Press <span style="color:#00d4ff;">SPACE</span> or the <span style="color:#00d4ff;">CLEAR</span> button to wipe this screen immediately and start a new game with 3 AIs on Medium difficulty. You will be the blue player. This page will hide after a game starts and you'll need to reload the site to see it again.
        </p>
        <p style="font-size:20px;color:#88ccff;margin:0 0 24px;text-align:center;">What kind of help are you looking for?</p>
        <div class="help-btn-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;max-width:600px;">
            <button class="help-nav-btn help-cat-btn" data-section="crisis" data-color="#ff4488" style="${catBtnStyle};border-color:#ff4488;color:#ff4488">I'm in crisis right now</button>
            <button class="help-nav-btn help-cat-btn" data-section="safety" data-color="#44aaff" style="${catBtnStyle};border-color:#44aaff;color:#44aaff">Safety from violence, abuse, or coercion</button>
            <button class="help-nav-btn help-cat-btn" data-section="lgbtq" data-color="#aa55ff" style="${catBtnStyle};border-color:#aa55ff;color:#aa55ff">LGBTQ+ support</button>
            <button class="help-nav-btn help-cat-btn" data-section="housing" data-color="#00ff88" style="${catBtnStyle};border-color:#00ff88;color:#00ff88">Housing or basic needs</button>
            <button class="help-nav-btn help-cat-btn" data-section="economic" data-color="#ffaa00" style="${catBtnStyle};border-color:#ffaa00;color:#ffaa00">Financial abuse</button>
            <button class="help-nav-btn help-cat-btn" data-section="legal" data-color="#bbff33" style="${catBtnStyle};border-color:#bbff33;color:#bbff33">Legal aid</button>
            <button class="help-nav-btn help-cat-btn" data-section="mental" data-color="#ff7744" style="${catBtnStyle};border-color:#ff7744;color:#ff7744">Mental health & substance use</button>
            <button class="help-nav-btn help-cat-btn" data-section="all" data-color="#ffdd55" style="${catBtnStyle};border-color:#ffdd55;color:#ffdd55">Show me everything</button>
        </div>
    `;

    contentArea.appendChild(mainView);

    // ── Section views ────────────────────────────────────────
    const sections = [
        {
            id: 'crisis',
            title: 'Crisis Support',
            subtitle: 'These services offer support during difficult times. Hours, availability, and policies vary by service.',
            safetyNote: false
        },
        {
            id: 'safety',
            title: 'Safety and Support',
            subtitle: "You don't have to have everything figured out to reach out. These organizations offer help."
        },
        {
            id: 'lgbtq',
            title: 'LGBTQ+ Support',
            subtitle: 'Support services that understand your experience.'
        },
        {
            id: 'housing',
            title: 'Housing and Basic Needs',
            subtitle: 'If you need a place to stay or help with essentials, start here.',
            safetyNote: false
        },
        {
            id: 'economic',
            title: 'Financial Abuse',
            subtitle: "Economic coercion can be hard to name, but you're not imagining it. These organizations help survivors build financial safety."
        },
        {
            id: 'legal',
            title: 'Legal Aid',
            subtitle: "Free or low-cost civil legal help for housing, benefits, family law, protection orders, and more.",
            safetyNote: false
        },
        {
            id: 'mental',
            title: 'Mental Health & Substance Use',
            subtitle: 'Support for mental health challenges and substance use disorders.',
            safetyNote: false
        },
        {
            id: 'all',
            title: 'All Resources',
            subtitle: "These organizations cover different kinds of situations, and some specialize in difficult experiences. They're here if any of them feel like the right kind of help. Links are locked by default for your privacy."
        }
    ];

    this._helpSections = {};

    sections.forEach(sec => {
        const view = this.createHelpSectionView(sec.id, sec.title, sec.subtitle, navBtnStyle, sec.safetyNote !== false);
        contentArea.appendChild(view.el);
        this._helpSections[sec.id] = view;
    });

    document.body.appendChild(overlay);

    // Store references
    this.helpOverlay = overlay;
    this.helpMainView = mainView;
    this.helpContentArea = contentArea;
    this._helpBackBtn = headerBackBtn;
    this._helpInSection = false;

    // ── Wire up navigation ───────────────────────────────────

    // Header back button (behavior depends on current view)
    headerBackBtn.addEventListener('click', () => {
        if (this._helpInSection) {
            this.showHelpMainView();
        } else {
            this.toggleHelpPanel();
        }
    });

    // Header clear button → panic
    headerClearBtn.addEventListener('click', () => {
        this.helpPanic();
    });

    // Mobile clear touch zone → panic
    clearZone.addEventListener('click', () => {
        this.helpPanic();
    });

    // Category buttons → show section
    mainView.querySelectorAll('.help-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            this.showHelpSection(btn.dataset.section);
        });
    });

    // Hover effects on all nav buttons (skip on touch devices where mouseenter sticks)
    if (window.matchMedia('(hover: hover)').matches) {
        overlay.querySelectorAll('.help-nav-btn').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                var hex = btn.dataset.color || '#00d4ff';
                var r = parseInt(hex.slice(1,3), 16);
                var g = parseInt(hex.slice(3,5), 16);
                var b = parseInt(hex.slice(5,7), 16);
                btn.style.background = 'rgba(' + r + ',' + g + ',' + b + ',0.2)';
                btn.style.boxShadow = '0 0 15px rgba(' + r + ',' + g + ',' + b + ',0.5)';
                btn.style.textShadow = '0 0 10px ' + hex;
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'transparent';
                btn.style.boxShadow = 'none';
                btn.style.textShadow = 'none';
            });
        });
    }

    // Populate contact cards
    this.populateHelpCards();
};

/**
 * Create a section view with header, back/clear buttons, and card container.
 * Returns { el, container } where container is the card holder.
 */
UIController.prototype.createHelpSectionView = function(id, title, subtitle, navBtnStyle, showSafetyNote) {
    const view = document.createElement('div');
    view.id = 'help-' + id + '-view';
    view.style.cssText = `
        display: none;
        flex-direction: column;
        align-items: center;
        min-height: 100%;
        padding: 20px 20px 40px;
        box-sizing: border-box;
    `;

    var safetyNoteHTML = showSafetyNote
        ? '<p style="font-size:15px;color:#667799;max-width:500px;text-align:center;line-height:1.4;margin:0 0 30px;">Links are locked by default to protect your privacy. Opening a website can leave traces in your browser history. Calling or texting can leave traces in your call and message logs. If your device is monitored, consider using a private or incognito browser window, or a trusted device.</p>'
        : '';

    view.innerHTML = `
        <h2 style="font-size:40px;color:#00d4ff;text-shadow:0 0 10px #00d4ff;margin:10px 0 10px;text-align:center;">${title}</h2>
        <p style="font-size:18px;color:#88ccff;max-width:500px;text-align:center;line-height:1.5;margin:0 0 ${showSafetyNote ? '20' : '30'}px;">${subtitle}</p>
        ${safetyNoteHTML}
    `;

    const container = document.createElement('div');
    container.id = 'help-' + id + '-cards';
    container.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:20px;width:100%;max-width:860px;';

    view.appendChild(container);

    // SPACE reminder footer
    const footer = document.createElement('p');
    footer.style.cssText = 'font-size:16px;color:#667799;text-align:center;margin:30px 0 40px;';
    footer.innerHTML = 'Press <span style="color:#00d4ff;">SPACE</span> at any time to wipe this screen and start a game.';
    view.appendChild(footer);

    return { el: view, container: container };
};

/**
 * Small helper – play interface click if SoundManager exists.
 */
UIController.prototype.playClick = function() {
    if (typeof soundManager !== 'undefined') {
        soundManager.resumeContext();
        soundManager.playImmediate('sound/interface/click.mp3', 100);
    }
};

/**
 * Disable or re-enable Phaser scene input based on overlay state.
 * Prevents menu buttons from responding while an overlay is visible.
 */
UIController.prototype.updateSceneInput = function() {
    var anyOverlayOpen = this.helpPanelOpen || this.htpPanelOpen || this.achievementsPanelOpen;
    var scene = this.menuScene;
    if (scene && scene.input) {
        scene.input.enabled = !anyOverlayOpen;
    }
};

/**
 * Toggle the help panel on / off.
 */
UIController.prototype.toggleHelpPanel = function() {
    this.helpPanelOpen = !this.helpPanelOpen;

    if (this.helpPanelOpen) {
        // Close options panel if it's open
        if (this.optionsPanelOpen) {
            this.toggleOptionsPanel();
        }

        // Block pointer events until the current click sequence finishes.
        // The menu button fires on pointerdown, so the overlay appears before
        // pointerup/click — which would hit a category button under the cursor.
        this.helpOverlay.style.pointerEvents = 'none';
        var overlay = this.helpOverlay;
        window.addEventListener('pointerup', function() {
            requestAnimationFrame(function() {
                overlay.style.pointerEvents = '';
            });
        }, { once: true });

        this.helpOverlay.style.display = 'flex';
        this.showHelpMainView();

        // Attach keyboard listener for panic
        this._helpKeyHandler = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.helpPanic();
            } else if (e.code === 'Escape') {
                e.preventDefault();
                if (this._helpInSection) {
                    this.showHelpMainView();
                } else {
                    this.toggleHelpPanel();
                }
            }
        };
        document.addEventListener('keydown', this._helpKeyHandler);
    } else {
        this.helpOverlay.style.display = 'none';

        // Remove keyboard listener
        if (this._helpKeyHandler) {
            document.removeEventListener('keydown', this._helpKeyHandler);
            this._helpKeyHandler = null;
        }
    }

    this.updateSceneInput();
};

/**
 * Show the main help view, hide all sections.
 */
UIController.prototype.showHelpMainView = function() {
    this.helpMainView.style.display = 'flex';
    Object.values(this._helpSections).forEach(sec => {
        sec.el.style.display = 'none';
    });
    this._helpInSection = false;
    if (this._helpClearZone) this._helpClearZone.classList.remove('help-clear-zone-hidden');
    this.helpContentArea.scrollTop = 0;
};

/**
 * Show a specific section view, hide main and other sections.
 */
UIController.prototype.showHelpSection = function(sectionId) {
    this.helpMainView.style.display = 'none';
    Object.entries(this._helpSections).forEach(([id, sec]) => {
        sec.el.style.display = id === sectionId ? 'flex' : 'none';
    });
    this.helpContentArea.scrollTop = 0;
    this._helpInSection = true;
    if (this._helpClearZone) this._helpClearZone.classList.add('help-clear-zone-hidden');
};

/**
 * Panic: hide the overlay and start a hidden game immediately.
 */
UIController.prototype.helpPanic = function() {
    // ── Instant content wipe ──────────────────────────────────────────
    // The help overlay is ALREADY rendered full-screen with a dark background.
    // Creating a new shield element requires layout + paint of a brand-new node
    // which can lag a full second on slow devices.  Instead, repurpose the
    // overlay itself: hide its children (a composite-only change on nodes that
    // are already in the render tree) and let the overlay's own background
    // serve as the shield.  This is the fastest possible visual wipe.
    var children = this.helpOverlay.children;
    for (var i = 0; i < children.length; i++) {
        children[i].style.visibility = 'hidden';
    }
    this.helpOverlay.style.background = '#0a0a14';
    this.helpOverlay.style.zIndex = '5000';

    // Detach keyboard listener and mark panel closed without hiding it —
    // the overlay stays visible as the shield until the game scene loads.
    if (this._helpKeyHandler) {
        document.removeEventListener('keydown', this._helpKeyHandler);
        this._helpKeyHandler = null;
    }
    this.helpPanelOpen = false;
    this.updateSceneInput();

    // Build player configs directly — bypass MenuScene state entirely so the
    // panic button works regardless of what menu screen was active.
    var colors = typeof PLAYER_COLORS !== 'undefined'
        ? PLAYER_COLORS.slice(0, 4)
        : [{ hex: 0x00ffff, css: '#00ffff' }, { hex: 0xff00ff, css: '#ff00ff' },
           { hex: 0x00ff00, css: '#00ff00' }, { hex: 0xff8800, css: '#ff8800' }];
    var difficulty = typeof AI_DIFFICULTY !== 'undefined' ? AI_DIFFICULTY.MEDIUM : 'medium';

    var playerConfigs = [
        { color: colors[0], isAI: false },
        { color: colors[1], isAI: true, aiDifficulty: difficulty },
        { color: colors[2], isAI: true, aiDifficulty: difficulty },
        { color: colors[3], isAI: true, aiDifficulty: difficulty }
    ];

    // Start the game scene directly via the scene manager, then tear down
    // the overlay-shield once the scene has finished creating.
    var overlay = this.helpOverlay;
    var sm = (this.menuScene && this.menuScene.sceneManager)
        || (typeof sceneManager !== 'undefined' ? sceneManager : null);
    if (sm) {
        sm.startScene('GameScene', { playerConfigs: playerConfigs }).then(function() {
            overlay.style.display = 'none';
            // Reset for potential future use
            overlay.style.zIndex = '';
            overlay.style.background = '';
            var ch = overlay.children;
            for (var j = 0; j < ch.length; j++) {
                ch[j].style.visibility = '';
            }
        });
    }
};

/**
 * Create a single DOM-based contact card.
 * Returns the card element.
 */
UIController.prototype.createContactCardDOM = function(title, desc, contactLines, url, defaultUnlocked) {
    const card = document.createElement('div');
    card.style.cssText = `
        background: #0a0a14;
        border: 2px solid #00d4ff;
        padding: 20px;
        width: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        user-select: text;
        -webkit-user-select: text;
    `;

    // Title
    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.cssText = 'font-size:24px;color:#00d4ff;text-align:center;margin-bottom:10px;';
    card.appendChild(titleEl);

    // Description
    const descEl = document.createElement('div');
    descEl.textContent = desc;
    descEl.style.cssText = 'font-size:18px;color:#88ccff;text-align:center;margin-bottom:12px;';
    card.appendChild(descEl);

    // Contact lines — collect tel: links so lock/unlock can gate them
    var telLinks = [];
    contactLines.forEach(line => {
        const lineEl = document.createElement('div');
        lineEl.style.cssText = 'font-size:20px;color:#ffffff;text-align:center;margin-bottom:6px;';

        // Extract phone number for tel: link on callable lines.
        // Skip text-only lines (e.g. "Text HOME to 741741").
        var isTextOnly = /^Text\s/i.test(line);
        var phoneMatch = null;
        if (!isTextOnly) {
            phoneMatch = line.match(/(?:Call(?:\s+or\s+text)?|Dial|TTY)\s+([\d\s()-]+)/i);
        }

        if (phoneMatch) {
            var digits = phoneMatch[1].replace(/[^\d]/g, '');
            var telHref;
            if (digits.length <= 3) {
                // Short codes like 988, 211
                telHref = 'tel:' + digits;
            } else if (digits.length >= 11 && digits[0] === '1') {
                // Already has country code (1-800-...)
                telHref = 'tel:+' + digits;
            } else {
                // 10-digit US number
                telHref = 'tel:+1' + digits;
            }
            var matchStart = line.indexOf(phoneMatch[1]);
            var prefix = line.slice(0, matchStart);
            var suffix = line.slice(matchStart + phoneMatch[1].length);

            if (prefix) lineEl.appendChild(document.createTextNode(prefix));
            var link = document.createElement('a');
            link.textContent = phoneMatch[1].trim();
            link.style.cssText = 'color:#ffffff;text-decoration:none;';
            telLinks.push({ el: link, href: telHref });
            lineEl.appendChild(link);
            if (suffix) lineEl.appendChild(document.createTextNode(suffix));
        } else {
            lineEl.textContent = line;
        }

        card.appendChild(lineEl);
    });

    // Button row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;margin-top:auto;padding-top:16px;justify-content:center;';

    if (defaultUnlocked) {
        // Crisis-style: tel links always active
        telLinks.forEach(info => {
            info.el.href = info.href;
            info.el.classList.add('help-tel-active');
        });

        // Single centered open button, no lock
        const linkBtn = document.createElement('button');
        linkBtn.textContent = 'OPEN LINK';
        linkBtn.style.cssText = `
            flex:0 1 auto;min-width:60%;font-family:'VT323',monospace;font-size:18px;padding:10px 20px;
            background:#0a0a14;border:1px solid #00d4ff;color:#00d4ff;cursor:pointer;
        `;
        linkBtn.addEventListener('click', () => { window.open(url, '_blank', 'noopener,noreferrer'); });
        btnRow.appendChild(linkBtn);
    } else {
        // Standard: lock toggle + open link
        let isLocked = true;

        const lockBtn = document.createElement('button');
        lockBtn.textContent = '\uD83D\uDD12 UNLOCK LINK';
        lockBtn.style.cssText = `
            flex:1;font-family:'VT323',monospace;font-size:18px;padding:10px;
            background:#0a0a14;border:1px solid #ff4444;color:#ff4444;cursor:pointer;
        `;

        const linkBtn = document.createElement('button');
        linkBtn.textContent = 'OPEN LINK';
        linkBtn.style.cssText = `
            flex:1;font-family:'VT323',monospace;font-size:18px;padding:10px;
            background:#0a0a14;border:1px solid #666666;color:#666666;cursor:default;
        `;

        const updateButtons = () => {
            if (isLocked) {
                lockBtn.textContent = '\uD83D\uDD12 UNLOCK LINK';
                lockBtn.style.borderColor = '#ff4444';
                lockBtn.style.color = '#ff4444';
                linkBtn.style.borderColor = '#666666';
                linkBtn.style.color = '#666666';
                linkBtn.style.cursor = 'default';
            } else {
                lockBtn.textContent = '\uD83D\uDD13 UNLOCKED';
                lockBtn.style.borderColor = '#00d4ff';
                lockBtn.style.color = '#00d4ff';
                linkBtn.style.borderColor = '#44ff88';
                linkBtn.style.color = '#44ff88';
                linkBtn.style.cursor = 'pointer';
            }
            // Gate tel: links on lock state
            telLinks.forEach(info => {
                if (isLocked) {
                    info.el.removeAttribute('href');
                    info.el.classList.remove('help-tel-active');
                } else {
                    info.el.href = info.href;
                    info.el.classList.add('help-tel-active');
                }
            });
        };

        lockBtn.addEventListener('click', () => {
            isLocked = !isLocked;
            updateButtons();
        });

        linkBtn.addEventListener('click', () => {
            if (!isLocked) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        });

        btnRow.appendChild(lockBtn);
        btnRow.appendChild(linkBtn);
    }

    card.appendChild(btnRow);

    return card;
};

/**
 * Populate all section card containers with resource data.
 */
UIController.prototype.populateHelpCards = function() {

    // ── Resource definitions ─────────────────────────────────
    const R = {
        lifeline988: {
            title: '988 Suicide and Crisis Lifeline',
            desc: 'Free, 24/7 support for anyone in crisis.',
            lines: ['Call or text 988'],
            url: 'https://988lifeline.org/'
        },
        crisisText: {
            title: 'Crisis Text Line',
            desc: 'Text-based support with a trained counselor.',
            lines: ['Text HOME or HOLA to 741741'],
            url: 'https://www.crisistextline.org/'
        },
        trevor: {
            title: 'The Trevor Project',
            desc: 'Crisis support for LGBTQ+ young people.',
            lines: ['Call 866-488-7386', 'Text START to 678678'],
            url: 'https://www.thetrevorproject.org/'
        },
        transLifeline: {
            title: 'Trans Lifeline',
            desc: 'Peer support by and for trans people.',
            lines: ['Call 877-565-8860'],
            url: 'https://translifeline.org/'
        },
        dvHotline: {
            title: 'National Domestic Violence Hotline',
            desc: 'Trained advocates for safety planning and local options.',
            lines: ['Call 800-799-7233', 'Text START to 88788'],
            url: 'https://www.thehotline.org/'
        },
        loveIsRespect: {
            title: 'Love Is Respect',
            desc: 'Support for young people experiencing dating abuse or unhealthy relationships.',
            lines: ['Call 1-866-331-9474', 'Text LOVEIS to 22522'],
            url: 'https://www.loveisrespect.org/'
        },
        rainn: {
            title: 'RAINN Sexual Assault Hotline',
            desc: 'Confidential support and next steps.',
            lines: ['Call 800-656-4673', 'Text HOPE to 64673'],
            url: 'https://www.rainn.org/'
        },
        trafficking: {
            title: 'National Human Trafficking Hotline',
            desc: 'Help, information, or report a tip.',
            lines: ['Call 888-373-7888', 'Text 233733 (Reply HELP for help or STOP to cancel at any time)', 'TTY 711'],
            url: 'https://humantraffickinghotline.org/'
        },
        victimConnect: {
            title: 'VictimConnect Resource Center',
            desc: "A referral hotline to help you learn about your rights and options. A good place to start if you're unsure.",
            lines: ['Call or text 855-484-2846'],
            url: 'https://victimconnect.org/'
        },
        line211: {
            title: '211 Help Line',
            desc: 'Local help for housing, food, utilities, and more.',
            lines: ['Call 211'],
            url: 'https://211.org/'
        },
        findhelp: {
            title: 'findhelp.org',
            desc: 'Search for shelters, food, transit, and other support by zip code.',
            lines: [],
            url: 'https://www.findhelp.org/'
        },
        womensLawFinancial: {
            title: 'Financial Abuse — WomensLaw.org',
            desc: 'Answers common questions about financial abuse — what it is, how to recognize it, and practical steps like how to obtain your credit report.',
            lines: [],
            url: 'https://www.womenslaw.org/about-abuse/forms-abuse/financial-abuse/all'
        },
        oashFinancial: {
            title: 'Financial Abuse — Office on Women\'s Health',
            desc: 'Covers financial abuse and related topics, including what it is and financial considerations when preparing to leave, among others.',
            lines: [],
            url: 'https://womenshealth.gov/relationships-and-safety/other-types/financial-abuse'
        },
        lsc: {
            title: 'Legal Services Corporation',
            desc: 'Find free civil legal aid near you for housing, benefits, family law, protection orders, and more.',
            lines: [],
            url: 'https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help'
        },
        lawHelp: {
            title: 'LawHelp.org',
            desc: 'Find free legal help in your state for low-income individuals and families.',
            lines: [],
            url: 'https://www.lawhelp.org/find-help'
        },
        samhsa: {
            title: 'SAMHSA National Helpline',
            desc: 'Free, 24/7 treatment referral and information for substance use and mental health disorders.',
            lines: ['Call 1-800-662-4357', 'TTY 1-800-487-4889', 'Text HELP4U to 435748 for confidential treatment referral'],
            url: 'https://www.samhsa.gov/find-help/helplines/national-helpline'
        },
        veteransCrisis: {
            title: 'Veterans Crisis Line',
            desc: 'Free, confidential crisis support for Veterans, service members, and their families.',
            lines: ['Dial 988, then press 1', 'Text 838255'],
            url: 'https://www.veteranscrisisline.net'
        },
        stronghearts: {
            title: 'StrongHearts Native Helpline',
            desc: 'Confidential support for Native Americans and Alaska Natives affected by domestic and sexual violence.',
            lines: ['Call or text 1-844-762-8483'],
            url: 'https://strongheartshelpline.org'
        },
        childhelp: {
            title: 'Childhelp National Child Abuse Hotline',
            desc: 'Crisis intervention and support for children and adults dealing with child abuse.',
            lines: ['Call 1-800-422-4453', 'Text GO to 1-800-422-4453'],
            url: 'https://www.childhelphotline.org'
        },
        lgbtHotline: {
            title: 'LGBT National Hotline',
            desc: 'Free, confidential peer support and local resources for the LGBTQ+ community.',
            lines: ['Call 1-888-843-4564 (General Hotline)', 'Call 800-246-7743 (Youth Hotline)', 'Call 888-234-7243 (Senior Hotline)'],
            url: 'https://lgbthotline.org'
        },
        sage: {
            title: 'SAGE LGBTQ+ Elder Hotline',
            desc: 'Resources and support for LGBTQ+ older adults.',
            lines: [],
            url: 'https://www.sageusa.org'
        },
        runaway: {
            title: 'National Runaway Safeline',
            desc: 'Crisis services for youth ages 12-21 who have run away or are experiencing homelessness.',
            lines: ['Call 1-800-786-2929', 'Text 1-800-786-2929'],
            url: 'https://www.1800runaway.org'
        },
        nami: {
            title: 'NAMI HelpLine',
            desc: 'Support, information, and referrals for people living with mental health conditions and their families.',
            lines: ['Call 1-800-950-6264', 'Text NAMI to 62640'],
            url: 'https://www.nami.org/support-education/nami-helpline/'
        },
        womenslaw: {
            title: 'WomensLaw.org',
            desc: 'Plain-language legal information and email support. Available to anyone regardless of sex with questions or concerns about domestic violence, sexual assault, or any other topic covered on their site.',
            lines: [],
            url: 'https://www.womenslaw.org'
        },
        boystown: {
            title: 'Boys Town National Hotline',
            desc: '24/7 crisis support for children, teens, and parents dealing with abuse, bullying, or suicidal thoughts.',
            lines: ['Call 1-800-448-3000', 'Text VOICE to 20121'],
            url: 'https://www.boystown.org/get-help-now'
        },
        disasterDistress: {
            title: 'Disaster Distress Helpline',
            desc: 'Crisis support for people experiencing distress related to natural or human-caused disasters.',
            lines: ['Call or text 1-800-985-5990'],
            url: 'https://www.samhsa.gov/find-help/helplines/disaster-distress-helpline'
        },
        eldercare: {
            title: 'Eldercare Locator',
            desc: 'Connects older Americans and caregivers with local services for transportation, housing, benefits, and elder abuse prevention.',
            lines: ['Call or text 1-800-677-1116'],
            url: 'https://eldercare.acl.gov'
        },
        maternalMH: {
            title: 'National Maternal Mental Health Hotline',
            desc: 'Free, 24/7 support for pregnant and postpartum individuals experiencing mental health challenges.',
            lines: ['Call or text 833-852-6262'],
            url: 'https://mchb.hrsa.gov/programs-impact/national-maternal-mental-health-hotline'
        },
        neda: {
            title: 'National Eating Disorders Association',
            desc: 'The largest nonprofit supporting individuals and families affected by eating disorders, providing education, early intervention, and research for lasting well-being and recovery.',
            lines: [],
            url: 'https://www.nationaleatingdisorders.org'
        }
    };

    // Helper to add a card to a container by ID
    const addCard = (containerId, r, unlocked) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.appendChild(
            this.createContactCardDOM(r.title, r.desc, r.lines, r.url, unlocked)
        );
    };

    // Helper to add a sub-section header inside a card grid
    const addHeader = (containerId, text) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const header = document.createElement('div');
        header.classList.add('help-sub-header');
        header.style.cssText = 'grid-column:1/-1;font-size:26px;color:#88ccff;margin:20px 0 6px;padding-bottom:6px;border-bottom:1px solid rgba(0,212,255,0.2);font-family:"VT323",monospace;';
        if (container.children.length === 0) header.style.marginTop = '0';
        header.textContent = text;
        container.appendChild(header);
    };

    // ── Crisis (unlocked, no sub-sections for fast access) ──
    addCard('help-crisis-cards', R.lifeline988, true);
    addCard('help-crisis-cards', R.crisisText, true);
    addCard('help-crisis-cards', R.veteransCrisis, true);
    addCard('help-crisis-cards', R.disasterDistress, true);
    addCard('help-crisis-cards', R.trevor, true);
    addCard('help-crisis-cards', R.transLifeline, true);
    addCard('help-crisis-cards', R.boystown, true);

    // ── Safety & Protection (locked) ─────────────────────────
    addHeader('help-safety-cards', 'Domestic & Sexual Violence');
    addCard('help-safety-cards', R.dvHotline);
    addCard('help-safety-cards', R.loveIsRespect);
    addCard('help-safety-cards', R.rainn);
    addCard('help-safety-cards', R.stronghearts);

    addHeader('help-safety-cards', 'Trafficking & Child Abuse');
    addCard('help-safety-cards', R.trafficking);
    addCard('help-safety-cards', R.childhelp);

    addHeader('help-safety-cards', 'General Support & Advocacy');
    addCard('help-safety-cards', R.victimConnect);

    // ── LGBTQ+ (locked) ─────────────────────────────────────
    addHeader('help-lgbtq-cards', 'Crisis Lines');
    addCard('help-lgbtq-cards', R.trevor);
    addCard('help-lgbtq-cards', R.transLifeline);

    addHeader('help-lgbtq-cards', 'Community Support');
    addCard('help-lgbtq-cards', R.lgbtHotline);
    addCard('help-lgbtq-cards', R.sage);

    // ── Housing & Basic Needs (unlocked) ─────────────────────
    addHeader('help-housing-cards', 'Find Local Help');
    addCard('help-housing-cards', R.line211, true);
    addCard('help-housing-cards', R.findhelp, true);
    addCard('help-housing-cards', R.eldercare, true);

    addHeader('help-housing-cards', 'Youth & Runaway');
    addCard('help-housing-cards', R.runaway, true);

    // ── Financial Abuse (locked) ─────────────────────────────
    addCard('help-economic-cards', R.womensLawFinancial);
    addCard('help-economic-cards', R.oashFinancial);

    // ── Legal Aid (unlocked, except DV-specific) ─────────────
    addHeader('help-legal-cards', 'Find Legal Help');
    addCard('help-legal-cards', R.lsc, true);
    addCard('help-legal-cards', R.lawHelp, true);

    addHeader('help-legal-cards', 'For Survivors of Violence');
    addCard('help-legal-cards', R.womenslaw);

    // ── Mental Health & Substance Use (unlocked) ─────────────
    addHeader('help-mental-cards', 'Mental Health');
    addCard('help-mental-cards', R.nami, true);
    addCard('help-mental-cards', R.maternalMH, true);

    addHeader('help-mental-cards', 'Substance Use');
    addCard('help-mental-cards', R.samhsa, true);

    addHeader('help-mental-cards', 'Eating Disorders');
    addCard('help-mental-cards', R.neda, true);

    // ── All resources (organized with sub-headers) ───────────
    addHeader('help-all-cards', 'Crisis Support');
    addCard('help-all-cards', R.lifeline988, true);
    addCard('help-all-cards', R.crisisText, true);
    addCard('help-all-cards', R.veteransCrisis, true);
    addCard('help-all-cards', R.disasterDistress, true);
    addCard('help-all-cards', R.boystown, true);

    addHeader('help-all-cards', 'Safety & Protection');
    addCard('help-all-cards', R.dvHotline);
    addCard('help-all-cards', R.loveIsRespect);
    addCard('help-all-cards', R.rainn);
    addCard('help-all-cards', R.trafficking);
    addCard('help-all-cards', R.stronghearts);
    addCard('help-all-cards', R.childhelp);
    addCard('help-all-cards', R.victimConnect);

    addHeader('help-all-cards', 'LGBTQ+ Support');
    addCard('help-all-cards', R.trevor);
    addCard('help-all-cards', R.transLifeline);
    addCard('help-all-cards', R.lgbtHotline);
    addCard('help-all-cards', R.sage);

    addHeader('help-all-cards', 'Housing & Basic Needs');
    addCard('help-all-cards', R.line211, true);
    addCard('help-all-cards', R.findhelp, true);
    addCard('help-all-cards', R.eldercare, true);
    addCard('help-all-cards', R.runaway, true);

    addHeader('help-all-cards', 'Financial & Legal');
    addCard('help-all-cards', R.womensLawFinancial);
    addCard('help-all-cards', R.oashFinancial);
    addCard('help-all-cards', R.lsc, true);
    addCard('help-all-cards', R.lawHelp, true);
    addCard('help-all-cards', R.womenslaw);

    addHeader('help-all-cards', 'Mental Health & Wellness');
    addCard('help-all-cards', R.samhsa, true);
    addCard('help-all-cards', R.nami, true);
    addCard('help-all-cards', R.maternalMH, true);
    addCard('help-all-cards', R.neda, true);

    // ── Center last card in groups with an odd number of cards ──
    const containerIds = [
        'help-crisis-cards', 'help-safety-cards', 'help-lgbtq-cards',
        'help-housing-cards', 'help-economic-cards', 'help-legal-cards',
        'help-mental-cards', 'help-all-cards'
    ];
    containerIds.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        let groupCards = [];
        const centerLastIfOdd = () => {
            if (groupCards.length > 0 && groupCards.length % 2 === 1) {
                const lastCard = groupCards[groupCards.length - 1];
                lastCard.style.gridColumn = '1 / -1';
                lastCard.style.justifySelf = 'center';
                lastCard.style.maxWidth = 'calc(50% - 10px)';
            }
            groupCards = [];
        };
        Array.from(container.children).forEach(child => {
            if (child.classList.contains('help-sub-header')) {
                centerLastIfOdd();
            } else {
                groupCards.push(child);
            }
        });
        centerLastIfOdd();
    });
};
