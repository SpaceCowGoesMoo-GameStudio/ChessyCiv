// ============================================
// ACHIEVEMENT MANAGER - Persistence Module
// ============================================
// IndexedDB storage for achievement unlock history.
// Uses a separate database from game saves so achievements persist across all games.

/**
 * Open or get the achievement IndexedDB database connection.
 */
AchievementManager.getDB = async function() {
    if (AchievementManager._db) {
        return AchievementManager._db;
    }

    if (AchievementManager._dbPromise) {
        return AchievementManager._dbPromise;
    }

    AchievementManager._dbPromise = new Promise(function(resolve, reject) {
        var request = indexedDB.open(AchievementManager.DB_NAME, AchievementManager.DB_VERSION);

        request.onerror = function() {
            console.error('[Achievements] Failed to open IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = function() {
            AchievementManager._db = request.result;
            resolve(AchievementManager._db);
        };

        request.onupgradeneeded = function(event) {
            var db = event.target.result;
            if (!db.objectStoreNames.contains(AchievementManager.STORE_NAME)) {
                db.createObjectStore(AchievementManager.STORE_NAME, { keyPath: 'id' });
            }
        };
    });

    return AchievementManager._dbPromise;
};

/**
 * Save all unlocked achievements to IndexedDB.
 */
AchievementManager.prototype.saveUnlocked = async function() {
    try {
        var db = await AchievementManager.getDB();
        var transaction = db.transaction([AchievementManager.STORE_NAME], 'readwrite');
        var store = transaction.objectStore(AchievementManager.STORE_NAME);

        var ids = Object.keys(this.unlocked);
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var data = this.unlocked[id];
            store.put({
                id: id,
                unlockedAt: data.unlockedAt,
                gameId: data.gameId,
                details: data.details
            });
        }
    } catch (e) {
        console.warn('[Achievements] Failed to save:', e);
    }
};

/**
 * Load all unlocked achievements from IndexedDB.
 * Called once at startup.
 */
AchievementManager.prototype.loadUnlocked = async function() {
    try {
        var db = await AchievementManager.getDB();
        var transaction = db.transaction([AchievementManager.STORE_NAME], 'readonly');
        var store = transaction.objectStore(AchievementManager.STORE_NAME);

        var all = await new Promise(function(resolve, reject) {
            var request = store.getAll();
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { reject(request.error); };
        });

        this.unlocked = {};
        for (var i = 0; i < all.length; i++) {
            var record = all[i];
            this.unlocked[record.id] = {
                unlockedAt: record.unlockedAt,
                gameId: record.gameId,
                details: record.details
            };
        }

        this.loaded = true;
    } catch (e) {
        console.warn('[Achievements] Failed to load:', e);
        this.loaded = true;
    }
};

/**
 * Clear all achievement progress (reset everything).
 */
AchievementManager.prototype.clearAllProgress = async function() {
    try {
        var db = await AchievementManager.getDB();
        var transaction = db.transaction([AchievementManager.STORE_NAME], 'readwrite');
        var store = transaction.objectStore(AchievementManager.STORE_NAME);

        await new Promise(function(resolve, reject) {
            var request = store.clear();
            request.onsuccess = function() { resolve(); };
            request.onerror = function() { reject(request.error); };
        });

        this.unlocked = {};
    } catch (e) {
        console.warn('[Achievements] Failed to clear progress:', e);
    }
};
