(async function () {
    'use strict';

    const DB_NAME        = 'civchess_hash';
    const STORE          = 'hash_store';
    const KEY            = 'current';
    const HASH_URL       = '/hash/';
    const GUARD_KEY      = 'civchess_hash_guard';
    const MAX_RELOADS    = 3;
    const WINDOW_MS      = 60_000; // 1 minute

    // After a successful hash verification we record a timestamp so that
    // rapid page reloads (F5 storms, dev refreshes) within the same tab
    // session don't each fire a separate no-store fetch to /hash/.
    const VERIFY_KEY      = 'civchess_hash_verified';
    const VERIFY_INTERVAL = 30_000; // 30 s — maximum staleness before re-checking

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
            req.onsuccess      = e => resolve(e.target.result);
            req.onerror        = e => reject(e.target.error);
        });
    }

    function getStored(db) {
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
            req.onsuccess = e => resolve(e.target.result ?? null);
            req.onerror   = e => reject(e.target.error);
        });
    }

    function putHash(db, hash) {
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(hash, KEY);
            req.onsuccess = () => resolve();
            req.onerror   = e => reject(e.target.error);
        });
    }

    function deleteHash(db) {
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY);
            req.onsuccess = () => resolve();
            req.onerror   = e => reject(e.target.error);
        });
    }

    // Rate-limit forced reloads to prevent an infinite loop if a bug causes the
    // hash to always appear mismatched.  Returns true if the reload is allowed.
    function reloadAllowed() {
        try {
            const raw   = localStorage.getItem(GUARD_KEY);
            const guard = raw ? JSON.parse(raw) : { count: 0, windowStart: Date.now() };

            if (Date.now() - guard.windowStart > WINDOW_MS) {
                // Window expired — start a fresh one.
                guard.count       = 0;
                guard.windowStart = Date.now();
            }

            if (guard.count >= MAX_RELOADS) {
                console.error(
                    `[hash-check] Reload loop detected: ${guard.count} forced reloads in the last minute. Aborting.`
                );
                return false;
            }

            guard.count++;
            localStorage.setItem(GUARD_KEY, JSON.stringify(guard));
            return true;
        } catch {
            return true; // localStorage unavailable — allow and hope for the best
        }
    }

    function resetReloadGuard() {
        try { localStorage.removeItem(GUARD_KEY); } catch { /* ignore */ }
    }

    // sessionStorage helpers — one per tab, not shared across tabs.
    // sessionStorage survives location.replace() within a tab, so we must
    // explicitly clear the record before a forced reload.
    function getVerified() {
        try {
            const raw = sessionStorage.getItem(VERIFY_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }
    function setVerified() {
        try { sessionStorage.setItem(VERIFY_KEY, JSON.stringify({ ts: Date.now() })); } catch { /* ignore */ }
    }
    function clearVerified() {
        try { sessionStorage.removeItem(VERIFY_KEY); } catch { /* ignore */ }
    }

    // Remove the cache-busting _v= param from the URL bar so it doesn't
    // persist in browser history or appear in server logs on subsequent requests.
    function stripVersionParam() {
        if (!location.search.includes('_v=')) return;
        const params = new URLSearchParams(location.search);
        params.delete('_v');
        const clean = location.pathname + (params.size ? '?' + params.toString() : '') + location.hash;
        history.replaceState(null, '', clean);
    }

    // Navigate to the current page with a cache-busting timestamp.
    // Using location.replace() triggers a real browser navigation, which
    // gives a fresh JavaScript execution context (avoiding let/const
    // redeclaration errors that occur with document.open/write/close).
    // The stored hash was already deleted, so the next load treats this
    // as a first-load, stores the new hash, and continues normally.
    function forceFullReload() {
        const ts     = Date.now();
        const params = new URLSearchParams(location.search);
        params.set('_v', ts);
        location.replace(location.pathname + '?' + params.toString() + location.hash);
    }

    // Only applicable when served over HTTP(S).  When the page is opened
    // directly from the filesystem (file://) or any other non-HTTP context
    // there is no reachable /hash/ endpoint, so skip the entire check rather
    // than generating a noisy failed-fetch warning.
    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
        stripVersionParam();
        return;
    }

    // Short-circuit: if this tab already verified a matching hash within the
    // last VERIFY_INTERVAL milliseconds, skip the /hash/ network round-trip.
    // This prevents rapid refreshes within a session from flooding the endpoint.
    // The record is cleared before any forced reload, so the reloaded page
    // always performs a full check.
    const prev = getVerified();
    if (prev && Date.now() - prev.ts < VERIFY_INTERVAL) {
        stripVersionParam();
        return;
    }

    try {
        const res = await fetch(HASH_URL, { cache: 'no-store' });
        if (!res.ok) return;

        const text  = await res.text();
        const match = text.match(/([a-f0-9]{64})/);
        if (!match) return;
        const serverHash = match[1];

        const db         = await openDB();
        const storedHash = await getStored(db);

        if (storedHash === null) {
            // First load — persist the hash and continue normally.
            await putHash(db, serverHash);
            resetReloadGuard();
            setVerified();
            stripVersionParam();
        } else if (storedHash !== serverHash) {
            // Project changed — wipe stored hash and reload every asset fresh.
            if (!reloadAllowed()) return;
            await deleteHash(db);
            clearVerified(); // ensure the reloaded page does a full check
            forceFullReload();
        } else {
            // Hash matches — stable load, reset the reload guard and clean URL.
            resetReloadGuard();
            setVerified();
            stripVersionParam();
        }
    } catch (e) {
        // Network error or IDB unavailable — proceed without blocking the game.
        console.warn('[hash-check] Could not verify project hash:', e);
    }
})();
