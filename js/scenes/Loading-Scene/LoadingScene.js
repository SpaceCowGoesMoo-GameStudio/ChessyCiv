// ============================================
// LOADING SCENE - DOM-based (replaces Phaser.Scene)
// ============================================
// Includes progress bar and fade transition (previously in separate files).

class LoadingScene {
    static pendingConfig = null;

    static setConfig(config) {
        LoadingScene.pendingConfig = config;
    }

    constructor() {
        this.progress = 0;
        this.loadingComplete = false;
        this.loadingTasks = [];
        this.totalWeight = 0;
        this.container = null;
        this.progressFill = null;
        this.barWidth = 0;
        this._rafId = null;

        // Set by SceneManager.register()
        this.sceneManager = null;
    }

    init(data) {
        const config = (data && data.tasks) ? data : (LoadingScene.pendingConfig || {});
        LoadingScene.pendingConfig = null;

        this.targetScene = config.targetScene || null;
        this.targetSceneData = config.targetSceneData || {};
        this.taskDefinitions = config.tasks || [];

        this.progress = 0;
        this.loadingComplete = false;
        this.loadingTasks = [];
        this.totalWeight = 0;
    }

    create() {
        this.container = document.getElementById('loading-scene');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'loading-scene';
            document.getElementById('game-container').appendChild(this.container);
        }
        this.container.style.display = 'block';
        this.container.innerHTML = '';

        this.container.style.position  = 'relative';
        this.container.style.width     = layoutConfig.gameWidth + 'px';
        this.container.style.height    = layoutConfig.gameHeight + 'px';
        this.container.style.backgroundColor = hexToCSS(COLORS.background);
        this.container.style.opacity   = '1';
        this.container.style.transition = '';

        if (this.taskDefinitions.length === 0 || !this.targetScene) {
            this.transitionToTarget();
            return;
        }

        this.createProgressBar();
        this.startLoading();
        this._startUpdateLoop();
    }

    destroy() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this.container) {
            this.container.innerHTML = '';
            this.container.style.display = 'none';
        }
    }

    // ============================================
    // PROGRESS BAR
    // ============================================

    createProgressBar() {
        const config = layoutConfig;
        const centerX = config.gameWidth / 2;
        const centerY = config.gameHeight / 2;
        const mobile  = config.mobile;

        const touchScale = (config.isTouch && config.highDPI) ? 1.3 : 1;
        const scale = mobile ? 0.8 * touchScale : 1;

        const barWidth  = Math.floor(300 * scale);
        const barHeight = Math.floor(30 * scale);
        const borderWidth = 2;

        // Outer border (cyan neon)
        const border = document.createElement('div');
        border.style.position = 'absolute';
        border.style.left   = (centerX - barWidth / 2) + 'px';
        border.style.top    = (centerY - barHeight / 2) + 'px';
        border.style.width  = barWidth + 'px';
        border.style.height = barHeight + 'px';
        border.style.border = `${borderWidth}px solid ${hexToCSS(COLORS.buttonBorder)}`;
        border.style.backgroundColor = hexToCSS(COLORS.uiBackground);
        border.style.boxSizing = 'border-box';
        this.container.appendChild(border);

        // Inner fill (neon green)
        const fill = document.createElement('div');
        fill.style.position = 'absolute';
        fill.style.left   = (centerX - barWidth / 2 + borderWidth) + 'px';
        fill.style.top    = (centerY - (barHeight - borderWidth * 2) / 2) + 'px';
        fill.style.width  = '0px';
        fill.style.height = (barHeight - borderWidth * 2) + 'px';
        fill.style.backgroundColor = hexToCSS(0x00ff88);
        this.container.appendChild(fill);

        this.progressFill = fill;
        this.barWidth = barWidth - borderWidth * 2;
    }

    _startUpdateLoop() {
        const loop = () => {
            this.updateProgressBar();
            if (!this.loadingComplete) {
                this._rafId = requestAnimationFrame(loop);
            }
        };
        this._rafId = requestAnimationFrame(loop);
    }

    updateProgressBar() {
        if (this.progressFill && this.barWidth) {
            const targetWidth  = this.barWidth * this.progress;
            const currentWidth = parseFloat(this.progressFill.style.width) || 0;
            const newWidth     = currentWidth + (targetWidth - currentWidth) * 0.2;
            this.progressFill.style.width = Math.max(0, newWidth) + 'px';
        }
    }

    setProgress(value) {
        this.progress = Math.max(0, Math.min(value, 1));
    }

    // ============================================
    // TASK SYSTEM
    // ============================================

    registerTask(name, weight = 1) {
        const task = {
            name,
            weight,
            completed: false,
            complete: () => {
                if (!task.completed) {
                    task.completed = true;
                    this.onTaskComplete();
                }
            }
        };
        this.loadingTasks.push(task);
        this.totalWeight += weight;
        return task;
    }

    startLoading() {
        for (const taskDef of this.taskDefinitions) {
            const task = this.registerTask(taskDef.name, taskDef.weight || 1);
            Promise.resolve()
                .then(() => taskDef.load())
                .then(() => task.complete())
                .catch(err => {
                    console.error(`Loading task '${taskDef.name}' failed:`, err);
                    task.complete();
                });
        }
    }

    onTaskComplete() {
        if (this.totalWeight === 0) {
            this.setProgress(1);
            this.transitionToTarget();
            return;
        }

        let completedWeight = 0;
        for (const task of this.loadingTasks) {
            if (task.completed) completedWeight += task.weight;
        }

        const newProgress = completedWeight / this.totalWeight;
        this.setProgress(newProgress);

        if (newProgress >= 1 && !this.loadingComplete) {
            this.loadingComplete = true;
            this.transitionToTarget();
        }
    }

    // ============================================
    // TRANSITIONS
    // ============================================

    transitionToTarget() {
        if (this.targetScene) {
            this.fadeOutAndTransition();
        }
    }

    fadeOutAndTransition() {
        const fadeDuration = 300;
        if (this.container) {
            this.container.style.transition = `opacity ${fadeDuration}ms`;
            this.container.style.opacity = '0';
        }
        setTimeout(() => {
            if (this.sceneManager) {
                this.sceneManager.startScene(this.targetScene, this.targetSceneData);
            }
        }, fadeDuration);
    }
}
