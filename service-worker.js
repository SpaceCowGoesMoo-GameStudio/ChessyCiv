'use strict';

const SW_VERSION = '5cc457c897ea8157ab59765e6a54064492bc7ea302d7981207948cf658ed3336';
const CACHE_NAME = 'civchess-' + SW_VERSION;

// All assets loaded by index.html, plus essential data files.
// Bare paths (no ?v=) — cache matching uses ignoreSearch:true so versioned
// requests like /js/foo.js?v=abc still hit these entries.
const PRE_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/manifest.json',

    // Core utilities
    '/js/hash-check.js',
    '/js/SceneManager.js',
    '/js/time-dial.js',
    '/js/SoundManager.js',
    '/js/constants.js',
    '/js/theme-config.js',
    '/js/GameHistory.js',

    // Game Engine
    '/js/Game-Engine/GameEngine.js',
    '/js/Game-Engine/setup.js',
    '/js/Game-Engine/movement.js',
    '/js/Game-Engine/combat.js',
    '/js/Game-Engine/production.js',
    '/js/Game-Engine/territory.js',
    '/js/Game-Engine/diplomacy.js',
    '/js/Game-Engine/settlers.js',
    '/js/Game-Engine/turns.js',
    '/js/Game-Engine/ai-support.js',
    '/js/Game-Engine/persistence.js',
    '/js/Game-Engine/pathfinding.js',
    '/js/Game-Engine/ml-state-encoder.js',

    // Dev Controls
    '/js/Dev-Controls/DevExport.js',
    '/js/Dev-Controls/DevGame.js',
    '/js/Dev-Controls/state.js',
    '/js/Dev-Controls/pieces.js',
    '/js/Dev-Controls/players.js',
    '/js/Dev-Controls/actions.js',
    '/js/Dev-Controls/ai-control.js',
    '/js/Dev-Controls/game-control.js',
    '/js/Dev-Controls/events.js',
    '/js/Dev-Controls/ml-bridge.js',
    '/js/Dev-Controls/DevManager.js',

    // AI
    '/js/AI/constants.js',
    '/js/AI/CivChessAI.js',
    '/js/AI/AIManager.js',
    '/js/AI/analysis.js',
    '/js/AI/tracking.js',
    '/js/AI/goals.js',
    '/js/AI/diplomacy.js',
    '/js/AI/production.js',
    '/js/AI/objectives.js',
    '/js/AI/pathfinding.js',
    '/js/AI/positioning.js',
    '/js/AI/movement.js',
    '/js/AI/settlers.js',

    // Loading Scene
    '/js/scenes/Loading-Scene/LoadingScene.js',
    '/js/scenes/Loading-Scene/progress-bar.js',
    '/js/scenes/Loading-Scene/transitions.js',

    // Menu Scene
    '/js/scenes/Menu-Scene/MenuScene.js',
    '/js/scenes/Menu-Scene/main-menu.js',
    '/js/scenes/Menu-Scene/new-game-menu.js',
    '/js/scenes/Menu-Scene/new-game-animations.js',
    '/js/scenes/Menu-Scene/new-game.js',
    '/js/scenes/Menu-Scene/load-game.js',
    '/js/scenes/Menu-Scene/how-to-play.js',
    '/js/scenes/Menu-Scene/achievements.js',
    '/js/scenes/Menu-Scene/scenario.js',

    // Game Scene
    '/js/scenes/Game-Scene/GameSceneDOM.js',
    '/js/scenes/Game-Scene/board.js',
    '/js/scenes/Game-Scene/pieces.js',
    '/js/scenes/Game-Scene/ui-panel.js',
    '/js/scenes/Game-Scene/ui-popups.js',
    '/js/scenes/Game-Scene/ui-updates.js',
    '/js/scenes/Game-Scene/input.js',
    '/js/scenes/Game-Scene/movement-queue.js',
    '/js/scenes/Game-Scene/actions.js',
    '/js/scenes/Game-Scene/animations.js',
    '/js/scenes/Game-Scene/ai-turn.js',
    '/js/scenes/Game-Scene/sound.js',
    '/js/scenes/Game-Scene/screens.js',
    '/js/scenes/Game-Scene/scenario-win.js',
    '/js/scenes/Game-Scene/tutorial.js',

    // UI Controller
    '/js/UI-Controller/UIController.js',
    '/js/UI-Controller/settings.js',
    '/js/UI-Controller/header.js',
    '/js/UI-Controller/options-panel.js',
    '/js/UI-Controller/help-panel.js',
    '/js/UI-Controller/how-to-play-panel.js',
    '/js/UI-Controller/achievements-panel.js',
    '/js/UI-Controller/dev-mode.js',
    '/js/UI-Controller/scene-management.js',

    // Achievements
    '/js/Achievements/AchievementManager.js',
    '/js/Achievements/achievement-persistence.js',
    '/js/Achievements/achievement-checks.js',
    '/js/Achievements/achievement-display.js',
    '/js/Achievements/achievement-definitions.js',
    '/js/Achievements/achievement-integration.js',

    '/js/main.js',

    // Campaign levels
    '/levels/manifest.json',
    '/levels/1.json',
    '/levels/2.json',
    '/levels/3.json',
    '/levels/4.json',
    '/levels/5.json',
    '/levels/6.json',
    '/levels/7.json',

    // Pictures
    '/pictures/icon_16.png',
    '/pictures/icon_32.png',
    '/pictures/icon_48.png',
    '/pictures/icon_62.png',

    // Sound — filenames with spaces must be percent-encoded
    '/sound/interface/attack.mp3',
    '/sound/interface/click.mp3',
    '/sound/interface/delete.mp3',
    '/sound/interface/drop-early.mp3',
    '/sound/interface/drop-high.mp3',
    '/sound/interface/drop-rising.mp3',
    '/sound/interface/move-army.mp3',
    '/sound/interface/move-squad.mp3',
    '/sound/interface/1piece%20move.mp3',
    '/sound/interface/founding%202.mp3',
    '/sound/music/LOSE.mp3',
    '/sound/music/WIN.mp3',
    '/sound/music/achievement.mp3',
    '/sound/music/domain%20of%20the%20machine-smol.mp3',
    '/sound/music/new%20game/newgame-complete.mp3',
    '/sound/music/thefallofaciv.mp3',

    // Videos
    '/videos/hotseat-anim.webm',
    '/videos/single-anim.webm',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all(
                PRE_CACHE.map(url =>
                    fetch(new Request(url, { cache: 'reload' }))
                        .then(res => {
                            if (!res.ok) throw new Error(`SW pre-cache failed for ${url}: ${res.status}`);
                            return cache.put(url, res);
                        })
                )
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Network-only: hash check endpoint must always reach the server so that
    // hash-check.js can detect new deployments and trigger a forced reload.
    if (url.pathname.startsWith('/hash/')) {
        return;
    }

    // Network-only: _v= param signals a forced reload from hash-check.js.
    // ignoreSearch:true would otherwise serve stale cached content despite the
    // cache-bust intent, so bypass the SW cache entirely here.
    if (url.searchParams.has('_v')) {
        event.respondWith(fetch(event.request, { cache: 'reload' }));
        return;
    }

    // Cache-first (cache on use) for external CDN assets: pako and VT323 font.
    // These URLs are stable (versioned CDN or font service) so caching on first
    // use is safe.
    if (url.hostname === 'cdn.jsdelivr.net' ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com') {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // Cache-first from pre-cache for all local assets.
    // ignoreSearch:true lets versioned requests (/foo.js?v=abc) match bare
    // pre-cache entries (/foo.js).
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then(cached => {
            if (cached) return cached;
            return fetch(event.request);
        })
    );
});
