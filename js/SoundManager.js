/**
 * SoundManager - Manages audio playback for the game
 * Provides functions for playing sounds once, queued, or in loops
 * Handles missing files gracefully without spamming errors
 */

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.initialized = false;
        this.initPromise = null;
        this.volume = 100; // Master volume 0-100

        // Queue for playOnceQueued
        this.queue = [];
        this.isQueuePlaying = false;

        // Loop system
        this.loopItems = []; // Array of {path, position, relativeVolume, startDelay}
        this.loopActive = false;
        this.loopTimeouts = [];
        this.loopAudioElements = [];

        // Audio buffer cache (for Web Audio API)
        this.bufferCache = new Map();

        // Track files that failed to load (to avoid spamming errors)
        this.failedFiles = new Set();

        // Track files currently being loaded
        this.loadingFiles = new Map();

        // Background suspension flag — when true, auto-resume is blocked
        this._backgroundSuspended = false;

        // Try to initialize immediately (may fail without user interaction)
        this._tryAutoInit();
    }

    /**
     * Try to auto-initialize the audio context
     * May fail on some browsers without user interaction
     */
    _tryAutoInit() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioContext.state === 'running') {
                this.initialized = true;
                console.log('SoundManager auto-initialized');
            }
        } catch (err) {
            // Silent fail - will initialize on user interaction
        }
    }

    /**
     * Initialize the audio system - call on user interaction if not already initialized
     * Also handles resuming a suspended context on mobile
     * @returns {Promise<void>}
     */
    async initialize() {
        // If already initialized and running, nothing to do
        if (this.initialized && this.audioContext && this.audioContext.state === 'running') {
            return;
        }

        // If context exists but is suspended, just resume it
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                this.initialized = true;
                console.log('SoundManager resumed from suspended state');
                return;
            } catch (error) {
                console.warn('Failed to resume audio context:', error);
            }
        }

        // Full initialization
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }

                // Resume if suspended
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }

                this.initialized = true;
                console.log('SoundManager initialized');
            } catch (error) {
                console.error('Failed to initialize SoundManager:', error);
                this.initPromise = null;
                throw error;
            }
        })();

        return this.initPromise;
    }

    /**
     * Ensure audio is initialized and context is running
     * On mobile, the context can become suspended again, so we need to check and resume
     * @returns {Promise<boolean>}
     */
    async _ensureInitialized() {
        // Don't resume if intentionally suspended for background tab
        if (this._backgroundSuspended) return false;

        if (!this.initialized) {
            try {
                await this.initialize();
            } catch (err) {
                return false;
            }
        }

        // On mobile, context can become suspended again - always check and resume if needed
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (err) {
                console.warn('SoundManager: Failed to resume audio context:', err);
                return false;
            }
        }

        return this.initialized && this.audioContext && this.audioContext.state === 'running';
    }

    /**
     * Synchronously attempt to resume the audio context
     * MUST be called during a user gesture (click/touch) on mobile
     * This is a fire-and-forget method - it doesn't wait for completion
     */
    resumeContext() {
        // Don't resume if intentionally suspended for background tab
        if (this._backgroundSuspended) return;

        // Create context if it doesn't exist
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                if (this.audioContext.state === 'running') {
                    this.initialized = true;
                }
            } catch (err) {
                console.warn('SoundManager: Failed to create audio context:', err);
                return;
            }
        }

        // Resume if suspended - call is sync but returns promise
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                this.initialized = true;
            }).catch(err => {
                console.warn('SoundManager: Failed to resume context:', err);
            });
        }
    }

    /**
     * Suspend audio for background tab — blocks all playback and auto-resume
     * until resumeFromBackground() is called.
     */
    suspendForBackground() {
        this._backgroundSuspended = true;
        if (this.audioContext && this.audioContext.state === 'running') {
            this.audioContext.suspend();
        }
    }

    /**
     * Resume audio after returning from a background tab.
     */
    resumeFromBackground() {
        this._backgroundSuspended = false;
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                this.initialized = true;
            }).catch(err => {
                console.warn('SoundManager: Failed to resume from background:', err);
            });
        }
    }

    /**
     * Calculate actual volume from relative volume
     * @param {number} relativeVolume - Volume 0-100 relative to master
     * @returns {number} - Actual volume 0-1
     */
    _calculateVolume(relativeVolume) {
        const rel = Math.max(0, Math.min(100, relativeVolume || 100));
        return (this.volume / 100) * (rel / 100) * 2.0;
    }

    /**
     * Load an audio file and cache its buffer
     * @param {string} path - Path to audio file
     * @returns {Promise<AudioBuffer|null>}
     */
    async _loadBuffer(path) {
        if (!path) return null;

        // Return cached buffer if available
        if (this.bufferCache.has(path)) {
            return this.bufferCache.get(path);
        }

        // Skip files that already failed
        if (this.failedFiles.has(path)) {
            return null;
        }

        // Wait if this file is currently being loaded
        if (this.loadingFiles.has(path)) {
            return this.loadingFiles.get(path);
        }

        // Start loading
        const loadPromise = (async () => {
            try {
                const response = await fetch(path);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

                this.bufferCache.set(path, audioBuffer);
                this.loadingFiles.delete(path);
                return audioBuffer;
            } catch (err) {
                // Only log once per file
                if (!this.failedFiles.has(path)) {
                    console.warn(`SoundManager: Could not load "${path}" - file may not exist yet`);
                    this.failedFiles.add(path);
                }
                this.loadingFiles.delete(path);
                return null;
            }
        })();

        this.loadingFiles.set(path, loadPromise);
        return loadPromise;
    }

    /**
     * Play an audio buffer
     * @param {AudioBuffer} buffer - The audio buffer to play
     * @param {number} volume - Volume 0-1
     * @returns {AudioBufferSourceNode}
     */
    _playBuffer(buffer, volume) {
        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();

        source.buffer = buffer;
        gainNode.gain.value = volume;

        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        source.start(0);
        return source;
    }

    /**
     * Set the master volume
     * @param {number} volume - Volume level 0-100
     */
    setVolume(volume) {
        if (typeof volume !== 'number') {
            throw new Error('Volume must be a number');
        }
        this.volume = Math.max(0, Math.min(100, Math.round(volume)));
    }

    /**
     * Get the current master volume
     * @returns {number}
     */
    getVolume() {
        return this.volume;
    }

    /**
     * Preload audio files for faster playback later
     * @param {string|string[]} paths - Path or array of paths to preload
     * @returns {Promise<void>}
     */
    async preload(paths) {
        if (!await this._ensureInitialized()) return;

        const pathArray = Array.isArray(paths) ? paths : [paths];
        await Promise.all(pathArray.map(path => this._loadBuffer(path)));
    }

    /**
     * Play a sound immediately in the background
     * @param {string} path - Path to audio file
     * @param {number} relativeVolume - Volume 0-100 relative to master (default 100)
     * @returns {Promise<void>}
     */
    async playImmediate(path, relativeVolume = 100) {
        if (!await this._ensureInitialized()) return;
        if (!path) return;

        const buffer = await this._loadBuffer(path);
        if (!buffer) return;

        const volume = this._calculateVolume(relativeVolume);
        this._playBuffer(buffer, volume);
    }

    /**
     * Add a sound to the queue and play one at a time
     * @param {string} resPath - Path to audio file
     * @param {number} relativeVolume - Volume 0-100 relative to master (default 100)
     * @param {number} loopCt - How many times to play before moving to next in queue (default 1)
     * @param {number} delay - Delay in ms before allowing next queued item (default 0)
     */
    playOnceQueued(resPath, relativeVolume = 100, loopCt = 1, delay = 0) {
        this.queue.push({
            path: resPath,
            relativeVolume,
            loopCt: Math.max(1, loopCt || 1),
            delay: delay || 0
        });

        if (!this.isQueuePlaying) {
            this._processQueue();
        }
    }

    /**
     * Process the sound queue
     */
    async _processQueue() {
        if (this.queue.length === 0) {
            this.isQueuePlaying = false;
            return;
        }

        this.isQueuePlaying = true;

        if (!await this._ensureInitialized()) {
            this.isQueuePlaying = false;
            this.queue = [];
            return;
        }

        const item = this.queue.shift();

        // Load the buffer
        const buffer = item.path ? await this._loadBuffer(item.path) : null;

        if (buffer) {
            const volume = this._calculateVolume(item.relativeVolume);

            // Play the sound loopCt times
            for (let i = 0; i < item.loopCt; i++) {
                await new Promise((resolve) => {
                    const source = this._playBuffer(buffer, volume);
                    source.onended = resolve;
                });
            }
        }

        // Wait for delay then process next item
        setTimeout(() => {
            this._processQueue();
        }, item.delay);
    }

    /**
     * Add items to the loop sequence
     * @param {string|Array} pathOrArray - Path to audio file, or array of loop items
     * @param {number} position - Position in sequence (integer, can overlap)
     * @param {number} relativeVolume - Volume 0-100 relative to master (default 100)
     * @param {number} startDelay - Delay in ms before starting this item (default 0)
     */
    addLoop(pathOrArray, position, relativeVolume = 100, startDelay = 0) {
        // Handle array input
        if (Array.isArray(pathOrArray)) {
            for (const item of pathOrArray) {
                if (Array.isArray(item)) {
                    // Array format: [path, position, relativeVolume, startDelay]
                    this.addLoop(item[0], item[1], item[2], item[3]);
                } else if (typeof item === 'object') {
                    // Object format: {path, position, relativeVolume, startDelay}
                    this.addLoop(item.path, item.position, item.relativeVolume, item.startDelay);
                }
            }
            return;
        }

        // Add single item
        this.loopItems.push({
            path: pathOrArray || null,
            position: position || 0,
            relativeVolume: relativeVolume || 100,
            startDelay: startDelay || 0
        });

        // Start loop if not already running
        if (!this.loopActive && this.loopItems.length > 0) {
            this._startLoop();
        }
    }

    /**
     * Start the loop playback
     */
    async _startLoop() {
        if (this.loopActive) return;
        if (this.loopItems.length === 0) return;

        if (!await this._ensureInitialized()) return;

        this.loopActive = true;

        // Preload all loop files
        const paths = this.loopItems.map(item => item.path).filter(p => p);
        await Promise.all(paths.map(path => this._loadBuffer(path)));

        this._playLoopCycle();
    }

    /**
     * Play one cycle of the loop
     */
    async _playLoopCycle() {
        if (!this.loopActive || this.loopItems.length === 0) {
            this.loopActive = false;
            return;
        }

        // Group items by position
        const positionGroups = new Map();
        for (const item of this.loopItems) {
            const pos = item.position;
            if (!positionGroups.has(pos)) {
                positionGroups.set(pos, []);
            }
            positionGroups.get(pos).push(item);
        }

        // Sort positions
        const positions = Array.from(positionGroups.keys()).sort((a, b) => a - b);

        // Play each position sequentially
        for (const pos of positions) {
            if (!this.loopActive) return;

            const items = positionGroups.get(pos);
            const playPromises = [];

            for (const item of items) {
                // Schedule item with its startDelay
                const promise = new Promise((resolve) => {
                    const timeoutId = setTimeout(async () => {
                        if (!this.loopActive) {
                            resolve();
                            return;
                        }

                        if (item.path) {
                            const buffer = this.bufferCache.get(item.path);
                            if (buffer) {
                                const volume = this._calculateVolume(item.relativeVolume);
                                const source = this._playBuffer(buffer, volume);
                                this.loopAudioElements.push(source);

                                source.onended = () => {
                                    const idx = this.loopAudioElements.indexOf(source);
                                    if (idx > -1) this.loopAudioElements.splice(idx, 1);
                                    resolve();
                                };
                                return;
                            }
                        }
                        // No path or no buffer - just resolve after startDelay acted as delay
                        resolve();
                    }, item.startDelay);

                    this.loopTimeouts.push(timeoutId);
                });

                playPromises.push(promise);
            }

            // Wait for all items at this position to finish
            await Promise.all(playPromises);
        }

        // Restart the loop if still active
        if (this.loopActive) {
            this._playLoopCycle();
        }
    }

    /**
     * Stop all loops and clear loop items
     */
    stopLoop() {
        this.loopActive = false;

        // Clear all pending timeouts
        for (const timeoutId of this.loopTimeouts) {
            clearTimeout(timeoutId);
        }
        this.loopTimeouts = [];

        // Stop all playing audio sources
        for (const source of this.loopAudioElements) {
            try {
                source.stop();
            } catch (err) {
                // Ignore errors on stop (source may have already ended)
            }
        }
        this.loopAudioElements = [];

        // Clear loop items
        this.loopItems = [];
    }

    /**
     * Clear the failed files cache (useful if files become available later)
     */
    clearFailedCache() {
        this.failedFiles.clear();
    }

    /**
     * Check if the sound manager is initialized and ready
     * On mobile, context can become suspended, so also check state
     * @returns {boolean}
     */
    isReady() {
        return this.initialized && this.audioContext && this.audioContext.state === 'running';
    }
}

// Create singleton instance
const soundManager = new SoundManager();

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SoundManager, soundManager };
}
