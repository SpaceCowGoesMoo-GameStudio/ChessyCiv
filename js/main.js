// ============================================
// GAME INITIALIZATION
// ============================================

// Create scene manager and register scenes
const sceneManager = new SceneManager();
const menuScene = new MenuScene();
sceneManager.register('LoadingScene', new LoadingScene());
sceneManager.register('MenuScene', menuScene);
sceneManager.register('GameScene', new GameScene());

// Configure initial loading — track fonts and full menu preparation
// so the loading screen stays visible until the menu is ready to display
LoadingScene.setConfig({
    targetScene: 'MenuScene',
    tasks: [
        {
            name: 'fonts',
            weight: 1,
            load: () => document.fonts.ready
        },
        {
            name: 'videos',
            weight: 1,
            load: () => {
                // Fetch animation videos as blobs so they play instantly
                // from memory when the menu creates <video> elements.
                var files = {
                    single: 'videos/single-anim.webm',
                    hotseat: 'videos/hotseat-anim.webm'
                };
                var cache = {};
                var promises = Object.keys(files).map(function(key) {
                    return fetch(files[key])
                        .then(function(r) { return r.blob(); })
                        .then(function(blob) {
                            cache[key] = URL.createObjectURL(blob);
                        })
                        .catch(function() {
                            // Video unavailable — canvas fallback will handle it
                        });
                });
                return Promise.all(promises).then(function() {
                    menuScene._videoCache = cache;
                    menuScene._prewarmVideos();
                });
            }
        },
        {
            name: 'menu',
            weight: 3,
            load: () => menuScene.preload()
        }
    ]
});

// Pause sound when the browser tab is hidden, resume when visible
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        soundManager.suspendForBackground();
    } else {
        soundManager.resumeFromBackground();
    }
});

// Start with loading scene
sceneManager.startScene('LoadingScene');
