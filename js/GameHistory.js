/**
 * GameHistory - Efficient game state persistence with compression
 *
 * Data format: Binary-efficient encoding with gzip compression
 * - Only saves every N rounds to reduce storage overhead
 * - Uses compact numeric representation for positions, ownership, etc.
 * - Compresses data with pako (gzip) before storing in IndexedDB
 */
class GameHistory {
    // IndexedDB configuration
    static DB_NAME = 'civchess_saves_v2';
    static DB_VERSION = 1;
    static STORE_NAME = 'games';
    static MAX_SAVES = 300;
    static SAVE_INTERVAL = 3; // How many rounds must pass before save

    // Cached database connection
    static _db = null;
    static _dbPromise = null;

    // Callback for toast notifications
    static onSaveCallback = null;

    // Pre-set game ID for campaign sessions (consumed once by generateGameId)
    static _nextGameId = null;

    constructor() {
        this.gameId = this.generateGameId();
        this.metadata = {
            startTime: Date.now(),
            endTime: null,
            playerCount: 0,
            players: [],
            winner: null
        };
        this.latestSnapshot = null;
        this.turnNumber = 0;
        this.roundNumber = 0;
        this.lastSavedRound = -1;
        this.pendingSave = false;
        this.saving = false;
        this.savingDisabled = false;
    }

    /**
     * Open or get the IndexedDB database connection
     */
    static async getDB() {
        if (GameHistory._db) {
            return GameHistory._db;
        }

        if (GameHistory._dbPromise) {
            return GameHistory._dbPromise;
        }

        GameHistory._dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(GameHistory.DB_NAME, GameHistory.DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                GameHistory._db = request.result;
                resolve(GameHistory._db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(GameHistory.STORE_NAME)) {
                    const store = db.createObjectStore(GameHistory.STORE_NAME, { keyPath: 'gameId' });
                    store.createIndex('startTime', 'metadata.startTime', { unique: false });
                }
            };
        });

        return GameHistory._dbPromise;
    }

    /**
     * Generate a random game ID like "Game a3f2"
     */
    generateGameId() {
        if (GameHistory._nextGameId) {
            const id = GameHistory._nextGameId;
            GameHistory._nextGameId = null;
            return id;
        }
        const randomNum = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        const hash = this.simpleHash(randomNum);
        const lastFour = hash.slice(-4);
        return `Game ${lastFour}`;
    }

    /**
     * Simple hash function to create a short identifier
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    /**
     * Initialize history with game metadata
     */
    initGame(players) {
        this.metadata.playerCount = players.length;
        this.metadata.players = players.map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            isAI: p.isAI || false,
            aiDifficulty: p.aiDifficulty || null,
            personality: p.personality || null
        }));
        this.metadata.startTime = Date.now();
    }

    /**
     * Encode tile ownership grid as a compact string
     * Each cell is 0-9 for player ID or 'n' for null, packed into rows
     */
    encodeTileOwnership(tileOwnership) {
        if (!tileOwnership) return '';
        let encoded = '';
        for (let r = 0; r < tileOwnership.length; r++) {
            for (let c = 0; c < tileOwnership[r].length; c++) {
                const val = tileOwnership[r][c];
                encoded += val === null ? 'n' : val.toString(36);
            }
        }
        return encoded;
    }

    /**
     * Decode tile ownership from compact string
     */
    decodeTileOwnership(encoded, size = 10) {
        if (!encoded) return Array(size).fill(null).map(() => Array(size).fill(null));
        const grid = [];
        let idx = 0;
        for (let r = 0; r < size; r++) {
            const row = [];
            for (let c = 0; c < size; c++) {
                const char = encoded[idx++];
                row.push(char === 'n' ? null : parseInt(char, 36));
            }
            grid.push(row);
        }
        return grid;
    }

    /**
     * Encode pieces array as compact binary-style data
     * Format: type|owner|row|col|hp|maxHp|moved|prod|progress|createdOnRound (cities only)
     */
    encodePieces(pieces) {
        if (!pieces) return [];
        return pieces.map(p => {
            // Type: 0=city, 1=warrior, 2=settler
            const typeCode = p.type === 'city' ? 0 : p.type === 'warrior' ? 1 : 2;
            // Encode as array of numbers for maximum compression
            const encoded = [
                typeCode,
                p.ownerId,
                p.row,
                p.col,
                p.hp,
                p.maxHp,
                p.hasMoved ? 1 : 0,
                p.production ? this.encodeProduction(p.production) : 0,
                p.productionProgress || 0,
                p.productionPaused ? 1 : 0
            ];
            // Add createdOnRound for cities (for automatic border expansion)
            if (p.type === 'city') {
                encoded.push(p.createdOnRound ?? 0);
            }
            return encoded;
        });
    }

    /**
     * Decode pieces from compact format
     */
    decodePieces(encoded) {
        if (!encoded) return [];
        const types = ['city', 'warrior', 'settler'];
        return encoded.map((p, idx) => {
            const piece = {
                id: `piece_${Date.now()}_${idx}`,
                type: types[p[0]],
                ownerId: p[1],
                row: p[2],
                col: p[3],
                hp: p[4],
                maxHp: p[5],
                hasMoved: p[6] === 1,
                production: p[7] ? this.decodeProduction(p[7]) : null,
                productionProgress: p[8] || 0,
                productionPaused: (p[0] !== 0 ? p.length > 9 : p.length > 10) ? p[9] === 1 : false
            };
            // Restore createdOnRound for cities (default 0 for older saves)
            // Old format: index 9 = createdOnRound (array length 10)
            // New format: index 9 = productionPaused, index 10 = createdOnRound (array length 11)
            if (piece.type === 'city') {
                piece.createdOnRound = p.length > 10 ? (p[10] ?? 0) : (p[9] ?? 0);
            }
            return piece;
        });
    }

    /**
     * Encode production type as number
     */
    encodeProduction(prod) {
        const map = { 'DIPLOMACY': 1, 'SCIENCE': 2, 'WARRIOR': 3, 'SETTLER': 4, 'REPAIR': 5, 'HEAL_WARRIORS': 6 };
        return map[prod] || 0;
    }

    /**
     * Decode production type from number
     */
    decodeProduction(code) {
        const map = { 1: 'DIPLOMACY', 2: 'SCIENCE', 3: 'WARRIOR', 4: 'SETTLER', 5: 'REPAIR', 6: 'HEAL_WARRIORS' };
        return map[code] || null;
    }

    /**
     * Encode player relations as compact format
     * Format: array of [playerId, {targetId: relationCode, ...}, {targetId: changedRound, ...}]
     */
    encodeRelations(players) {
        if (!players) return [];
        return players.map(p => {
            const rels = {};
            const changedRounds = {};
            for (const [key, val] of Object.entries(p.relations || {})) {
                // 0=peace, 1=war, 2=peace_proposed
                rels[key] = val === 'peace' ? 0 : val === 'war' ? 1 : 2;
            }
            for (const [key, val] of Object.entries(p.relationsChangedRound || {})) {
                changedRounds[key] = val;
            }
            return [p.id, rels, changedRounds];
        });
    }

    /**
     * Decode player relations
     */
    decodeRelations(encoded) {
        if (!encoded) return [];
        const relMap = { 0: 'peace', 1: 'war', 2: 'peace_proposed' };
        return encoded.map(item => {
            // Handle both old format [playerId, rels] and new format [playerId, rels, changedRounds]
            const playerId = item[0];
            const rels = item[1];
            const changedRounds = item[2] || {};
            return {
                playerId,
                relations: Object.fromEntries(
                    Object.entries(rels).map(([k, v]) => [k, relMap[v] || 'peace'])
                ),
                relationsChangedRound: changedRounds
            };
        });
    }

    /**
     * Encode tech levels as compact array
     */
    encodeTechLevels(players) {
        if (!players) return [];
        return players.map(p => [p.id, p.techScore || 0]);
    }

    /**
     * Decode tech levels
     */
    decodeTechLevels(encoded) {
        if (!encoded) return [];
        return encoded.map(([playerId, techScore]) => ({ playerId, techScore }));
    }

    /**
     * Capture a snapshot of the current game state
     */
    captureSnapshot(engine, actionType, actionDetails = {}) {
        this.turnNumber = engine.turnNumber || 0;
        this.roundNumber = engine.roundNumber || 0;

        // Create compact snapshot
        this.latestSnapshot = {
            t: this.turnNumber,           // turn number
            n: this.roundNumber,          // round number (complete rounds)
            p: engine.currentPlayerIndex, // current player
            o: this.encodeTileOwnership(engine.tileOwnership), // ownership grid
            u: this.encodePieces(engine.pieces),               // units/pieces
            l: this.encodeTechLevels(engine.players),          // tech levels
            r: this.encodeRelations(engine.players)            // relations
        };

        // Include achievement session stats so progress survives save/load
        if (typeof achievementManager !== 'undefined' && achievementManager.engine === engine &&
            achievementManager.sessionStats) {
            this.latestSnapshot.a = achievementManager.sessionStats;
        }

        // Keep warrior kill/loss stats in metadata so scenario conditions
        // (e.g. killWarriors) survive save/load
        engine.players.forEach((p, i) => {
            if (this.metadata.players[i]) {
                this.metadata.players[i].warriorKills = p.warriorKills || 0;
                this.metadata.players[i].warriorsLost = p.warriorsLost || 0;
            }
        });

        // Only save every N rounds (but always save on critical events)
        // Note: MAIN_MENU_EXIT is handled manually in UIController.handleMainMenu with await
        const shouldSave = actionType === 'GAME_START' ||
                          actionType === 'VICTORY' ||
                          actionType === 'SHUTDOWN' ||
                          actionType === 'BROWSER_CLOSE' ||
                          (this.roundNumber - this.lastSavedRound >= GameHistory.SAVE_INTERVAL);

        if (shouldSave) {
            this.saveToIndexedDB();
            this.lastSavedRound = this.roundNumber;
            this.pendingSave = false;
        } else {
            this.pendingSave = true;
        }
    }

    /**
     * Mark game as ended with winner info
     */
    endGame(winner) {
        this.metadata.endTime = Date.now();
        this.metadata.winner = winner;
        this.saveToIndexedDB(true); // Force save
    }

    /**
     * Compress data using pako gzip
     */
    static compress(data) {
        try {
            const jsonStr = JSON.stringify(data);
            const compressed = pako.deflate(jsonStr, { level: 9 });
            // Convert to base64 for storage - chunk to avoid call stack issues
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < compressed.length; i += chunkSize) {
                const chunk = compressed.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, chunk);
            }
            return btoa(binary);
        } catch (e) {
            console.warn('Compression failed, storing raw:', e);
            return JSON.stringify(data);
        }
    }

    /**
     * Decompress data using pako gunzip
     */
    static decompress(compressed) {
        try {
            // Check if it's base64 compressed data
            if (typeof compressed === 'string' && !compressed.startsWith('{')) {
                const binary = atob(compressed);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                const decompressed = pako.inflate(bytes, { to: 'string' });
                return JSON.parse(decompressed);
            }
            // Fallback: already JSON
            return typeof compressed === 'string' ? JSON.parse(compressed) : compressed;
        } catch (e) {
            console.warn('Decompression failed:', e);
            return typeof compressed === 'string' ? JSON.parse(compressed) : compressed;
        }
    }

    /**
     * Calculate approximate size of compressed data in bytes
     */
    static calculateSize(data) {
        try {
            const compressed = GameHistory.compress(data);
            return new Blob([compressed]).size;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Format bytes to human readable string
     */
    static formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    /**
     * Save current history to IndexedDB with compression
     */
    async saveToIndexedDB(forceSave = false) {
        if (this.savingDisabled) return;
        // Prevent concurrent saves
        if (this.saving) {
            return;
        }
        this.saving = true;

        const saveData = {
            s: this.latestSnapshot, // snapshot (compact keys)
            m: {                    // metadata (compact)
                st: this.metadata.startTime,
                et: this.metadata.endTime,
                pc: this.metadata.playerCount,
                ps: this.metadata.players,
                w: this.metadata.winner
            }
        };

        // Include scenario data if this is a campaign game
        if (this.metadata.scenarioData) {
            saveData.sc = this.metadata.scenarioData;
        }

        // Compress the data
        const compressedData = GameHistory.compress(saveData);
        const sizeBytes = new Blob([compressedData]).size;

        const record = {
            gameId: this.gameId,
            metadata: {
                startTime: this.metadata.startTime,
                lastAccessedTime: Date.now(),
                endTime: this.metadata.endTime,
                playerCount: this.metadata.playerCount,
                winner: this.metadata.winner,
                players: this.metadata.players
            },
            compressed: compressedData,
            sizeBytes: sizeBytes
        };

        // Copy campaign info to uncompressed metadata so the load menu
        // can display level name without decompressing the full save
        if (this.metadata.scenarioData) {
            var sd = this.metadata.scenarioData;
            if (sd.levelData && sd.levelData.metadata) {
                record.metadata.campaignLevel = sd.levelData.metadata.name || null;
            }
            if (sd.scenarioIndex != null) {
                record.metadata.campaignIndex = sd.scenarioIndex;
            }
        }

        try {
            const db = await GameHistory.getDB();
            const transaction = db.transaction([GameHistory.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(GameHistory.STORE_NAME);

            await new Promise((resolve, reject) => {
                const request = store.put(record);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            // Enforce max saves limit
            await GameHistory.enforceMaxSaves();

            // Trigger save callback (for toast notification)
            if (GameHistory.onSaveCallback) {
                GameHistory.onSaveCallback(this.gameId, sizeBytes);
            }
        } catch (e) {
            console.warn('Failed to save game history to IndexedDB:', e);
        } finally {
            this.saving = false;
        }
    }

    /**
     * Enforce maximum save limit by deleting oldest saves
     */
    static async enforceMaxSaves() {
        try {
            const db = await GameHistory.getDB();
            const transaction = db.transaction([GameHistory.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(GameHistory.STORE_NAME);
            const index = store.index('startTime');

            // Count total saves
            const countRequest = store.count();
            const count = await new Promise((resolve, reject) => {
                countRequest.onsuccess = () => resolve(countRequest.result);
                countRequest.onerror = () => reject(countRequest.error);
            });

            if (count > GameHistory.MAX_SAVES) {
                // Get all games sorted by startTime (oldest first)
                const getAllRequest = index.getAll();
                const allGames = await new Promise((resolve, reject) => {
                    getAllRequest.onsuccess = () => resolve(getAllRequest.result);
                    getAllRequest.onerror = () => reject(getAllRequest.error);
                });

                // Delete oldest games to get back to MAX_SAVES
                const toDelete = count - GameHistory.MAX_SAVES;
                const deleteTx = db.transaction([GameHistory.STORE_NAME], 'readwrite');
                const deleteStore = deleteTx.objectStore(GameHistory.STORE_NAME);

                for (let i = 0; i < toDelete; i++) {
                    deleteStore.delete(allGames[i].gameId);
                }
            }
        } catch (e) {
            console.warn('Failed to enforce max saves limit:', e);
        }
    }

    /**
     * Load a game history from IndexedDB by gameId
     */
    static async loadFromIndexedDB(gameId) {
        try {
            const db = await GameHistory.getDB();
            const transaction = db.transaction([GameHistory.STORE_NAME], 'readonly');
            const store = transaction.objectStore(GameHistory.STORE_NAME);

            const record = await new Promise((resolve, reject) => {
                const request = store.get(gameId);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            });

            if (!record) return null;

            // Decompress and reconstruct the save data
            const saveData = GameHistory.decompress(record.compressed);

            // Reconstruct to expected format
            const history = new GameHistory();
            history.gameId = gameId;

            // Reconstruct metadata
            const m = saveData.m;
            history.metadata = {
                startTime: m.st,
                endTime: m.et,
                playerCount: m.pc,
                players: m.ps,
                winner: m.w
            };

            // Reconstruct snapshot
            const s = saveData.s;
            const decodedSnapshot = {
                turnNumber: s.t,
                roundNumber: s.n,  // May be undefined for older saves
                currentPlayerIndex: s.p,
                tileOwnership: history.decodeTileOwnership(s.o),
                pieces: history.decodePieces(s.u),
                techLevels: history.decodeTechLevels(s.l),
                playerRelations: history.decodeRelations(s.r),
                achievementStats: s.a || null
            };

            // Return in the format expected by GameEngine.restoreFromSavedGame
            return {
                gameId: gameId,
                metadata: history.metadata,
                snapshots: [decodedSnapshot],
                scenarioData: saveData.sc || null
            };
        } catch (e) {
            console.warn('Failed to load game history from IndexedDB:', e);
            return null;
        }
    }

    /**
     * Get list of all saved games from IndexedDB
     * Returns: { games: Array, count: number }
     */
    static async listSavedGames() {
        try {
            const db = await GameHistory.getDB();
            const transaction = db.transaction([GameHistory.STORE_NAME], 'readonly');
            const store = transaction.objectStore(GameHistory.STORE_NAME);

            const allGames = await new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            const games = allGames.map(data => ({
                gameId: data.gameId,
                startTime: data.metadata?.startTime,
                lastAccessedTime: data.metadata?.lastAccessedTime || null,
                endTime: data.metadata?.endTime,
                playerCount: data.metadata?.playerCount,
                winner: data.metadata?.winner,
                players: data.metadata?.players || [],
                sizeBytes: data.sizeBytes || 0,
                campaignLevel: data.metadata?.campaignLevel || null,
                campaignIndex: data.metadata?.campaignIndex ?? null
            }));

            // Sort by last-accessed time (falling back to start time), most recent first
            games.sort((a, b) => {
                const aTime = a.lastAccessedTime || a.startTime || 0;
                const bTime = b.lastAccessedTime || b.startTime || 0;
                return bTime - aTime;
            });

            return { games, count: games.length };
        } catch (e) {
            console.warn('Failed to list saved games from IndexedDB:', e);
            return { games: [], count: 0 };
        }
    }

    /**
     * Delete a saved game from IndexedDB
     */
    static async deleteSavedGame(gameId) {
        try {
            const db = await GameHistory.getDB();
            const transaction = db.transaction([GameHistory.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(GameHistory.STORE_NAME);

            return new Promise((resolve, reject) => {
                const request = store.delete(gameId);
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.warn('Failed to delete game history:', e);
            return false;
        }
    }

    /**
     * Rename a saved game in IndexedDB
     */
    static async renameSavedGame(oldGameId, newGameId) {
        try {
            const db = await GameHistory.getDB();

            // Check if target name already exists
            const existingTx = db.transaction([GameHistory.STORE_NAME], 'readonly');
            const existingStore = existingTx.objectStore(GameHistory.STORE_NAME);
            const existing = await new Promise((resolve, reject) => {
                const request = existingStore.get(newGameId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (existing) {
                return false;
            }

            // Load old game
            const loadTx = db.transaction([GameHistory.STORE_NAME], 'readonly');
            const loadStore = loadTx.objectStore(GameHistory.STORE_NAME);
            const oldGame = await new Promise((resolve, reject) => {
                const request = loadStore.get(oldGameId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (!oldGame) {
                return false;
            }

            // Update gameId and save as new
            oldGame.gameId = newGameId;

            const saveTx = db.transaction([GameHistory.STORE_NAME], 'readwrite');
            const saveStore = saveTx.objectStore(GameHistory.STORE_NAME);

            await new Promise((resolve, reject) => {
                const request = saveStore.put(oldGame);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            // Delete old entry
            await GameHistory.deleteSavedGame(oldGameId);

            return true;
        } catch (e) {
            console.warn('Failed to rename game history:', e);
            return false;
        }
    }

    /**
     * Update the last-accessed timestamp of a saved game so it sorts to the top
     */
    static async updateLastAccessed(gameId) {
        try {
            const db = await GameHistory.getDB();

            // Load the game
            const loadTx = db.transaction([GameHistory.STORE_NAME], 'readonly');
            const loadStore = loadTx.objectStore(GameHistory.STORE_NAME);
            const gameData = await new Promise((resolve, reject) => {
                const request = loadStore.get(gameId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            if (!gameData) {
                return false;
            }

            // Set last-accessed time (preserves original startTime)
            gameData.metadata.lastAccessedTime = Date.now();

            // Save back
            const transaction = db.transaction([GameHistory.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(GameHistory.STORE_NAME);

            await new Promise((resolve, reject) => {
                const request = store.put(gameData);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            return true;
        } catch (e) {
            console.warn('Failed to update last-accessed timestamp:', e);
            return false;
        }
    }

    /**
     * Update a player's AI personality in the saved metadata
     */
    updatePlayerPersonality(playerIndex, personality) {
        if (this.metadata.players[playerIndex]) {
            this.metadata.players[playerIndex].personality = personality;
            this.saveToIndexedDB();
        }
    }

    /**
     * Get the current game ID
     */
    getGameId() {
        return this.gameId;
    }

    /**
     * Force save the current game state (used for manual saves)
     */
    forceSave() {
        if (this.savingDisabled) return;
        if (this.latestSnapshot) {
            this.saveToIndexedDB(true);
            this.lastSavedRound = this.roundNumber;
            this.pendingSave = false;
        }
    }

    /**
     * Migrate existing saves from old format to new compressed format
     * Also handles migration from localStorage
     */
    static async migrateFromLocalStorage() {
        const MIGRATION_KEY = 'civchess_migration_v2_complete';

        // Check if migration already done
        if (localStorage.getItem(MIGRATION_KEY)) {
            return;
        }

        console.log('[GameHistory] Checking for old saves to migrate...');

        // Try to migrate from old IndexedDB database
        try {
            const oldDbRequest = indexedDB.open('civchess_saves', 1);

            oldDbRequest.onsuccess = async () => {
                const oldDb = oldDbRequest.result;

                if (oldDb.objectStoreNames.contains('games')) {
                    const transaction = oldDb.transaction(['games'], 'readonly');
                    const store = transaction.objectStore('games');

                    const allGames = await new Promise((resolve, reject) => {
                        const request = store.getAll();
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });

                    console.log(`[GameHistory] Found ${allGames.length} old saves to migrate`);

                    for (const oldGame of allGames) {
                        try {
                            // Create new history and migrate data
                            const history = new GameHistory();
                            history.gameId = oldGame.gameId;
                            history.metadata = oldGame.metadata || {};

                            // Get the latest snapshot from old format
                            if (oldGame.snapshots && oldGame.snapshots.length > 0) {
                                const latestOld = oldGame.snapshots[oldGame.snapshots.length - 1];

                                history.latestSnapshot = {
                                    t: latestOld.turnNumber || 0,
                                    p: latestOld.currentPlayerIndex || 0,
                                    o: history.encodeTileOwnership(latestOld.tileOwnership),
                                    u: latestOld.pieces ? latestOld.pieces.map(p => [
                                        p.type === 'city' ? 0 : p.type === 'warrior' ? 1 : 2,
                                        p.ownerId,
                                        p.row,
                                        p.col,
                                        p.hp,
                                        p.maxHp,
                                        p.hasMoved ? 1 : 0,
                                        history.encodeProduction(p.production),
                                        p.productionProgress || 0
                                    ]) : [],
                                    l: latestOld.techLevels ? latestOld.techLevels.map(t => [t.playerId, t.techScore]) : [],
                                    r: latestOld.playerRelations ? latestOld.playerRelations.map(r => {
                                        const rels = {};
                                        for (const [k, v] of Object.entries(r.relations || {})) {
                                            rels[k] = v === 'peace' ? 0 : v === 'war' ? 1 : 2;
                                        }
                                        return [r.playerId, rels];
                                    }) : []
                                };
                            }

                            await history.saveToIndexedDB(true);
                            console.log(`[GameHistory] Migrated: ${oldGame.gameId}`);
                        } catch (e) {
                            console.warn(`[GameHistory] Failed to migrate ${oldGame.gameId}:`, e);
                        }
                    }

                    // Delete old database after successful migration
                    oldDb.close();
                    indexedDB.deleteDatabase('civchess_saves');
                }

                localStorage.setItem(MIGRATION_KEY, 'true');
                console.log('[GameHistory] Migration complete');
            };

            oldDbRequest.onerror = () => {
                localStorage.setItem(MIGRATION_KEY, 'true');
            };
        } catch (e) {
            console.warn('[GameHistory] Migration error:', e);
            localStorage.setItem(MIGRATION_KEY, 'true');
        }
    }

    /**
     * Dev command: fill the save store up to MAX_SAVES with dummy entries.
     * Run via `fillup()` in the browser console.
     */
    static async fillUp() {
        const { count } = await GameHistory.listSavedGames();
        const needed = GameHistory.MAX_SAVES - count;
        if (needed <= 0) {
            console.log(`[fillup] Saves already full: ${count} / ${GameHistory.MAX_SAVES}`);
            return;
        }

        const db = await GameHistory.getDB();
        const transaction = db.transaction([GameHistory.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(GameHistory.STORE_NAME);
        const now = Date.now();

        for (let i = 0; i < needed; i++) {
            store.put({
                gameId: `Game fill_${now}_${i}`,
                metadata: {
                    startTime: now - i * 1000,
                    lastAccessedTime: now - i * 1000,
                    endTime: null,
                    playerCount: 2,
                    winner: null,
                    players: []
                },
                compressed: new Uint8Array(4),
                sizeBytes: 4
            });
        }

        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });

        const { count: newCount } = await GameHistory.listSavedGames();
        console.log(`[fillup] Done: ${newCount} / ${GameHistory.MAX_SAVES} saves`);
    }
}
