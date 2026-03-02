// ============================================
// ACHIEVEMENT SYSTEM TESTS
// ============================================
// Tests for achievement tracking, unlocking, and save/load persistence.

// Shared setup/teardown for achievement tests
var _achEngine;

function achSetup(numPlayers, humanIndex) {
    if (numPlayers === undefined) numPlayers = 2;
    if (humanIndex === undefined) humanIndex = 0;
    AchievementManager._db = null;
    AchievementManager._dbPromise = null;
    achievementManager.unlocked = {};
    achievementManager._notifQueue = [];
    achievementManager._activeNotif = null;
    achievementManager._batchPending = false;

    _achEngine = createScenario(numPlayers);
    // Set the specified player as human, all others AI
    for (var i = 0; i < numPlayers; i++) {
        if (i === humanIndex) {
            _achEngine.players[i].isAI = false;
            _achEngine.players[i].isHuman = true;
        } else {
            _achEngine.players[i].isAI = true;
            _achEngine.players[i].isHuman = false;
        }
    }
    achievementManager.attachToGame({ engine: _achEngine });
    return _achEngine;
}

function achTeardown() {
    achievementManager.detachFromGame();
    achievementManager.unlocked = {};
    _achEngine = null;
}

// ── Registration ────────────────────────────────

describe('Achievement Registration', function() {

    beforeEach(function() { achSetup(); });
    afterEach(function() { achTeardown(); });

    it('should have all 20 achievements registered', function() {
        assert.equal(achievementManager.getTotalCount(), 20);
    });

    it('should look up definitions by id', function() {
        var def = achievementManager.getDef('first_blood');
        assert.ok(def, 'first_blood should be registered');
        assert.equal(def.category, 'combat');
    });

    it('should filter by category', function() {
        var combat = achievementManager.getByCategory('combat');
        assert.equal(combat.length, 4);
    });

    it('should report 0 unlocked at start', function() {
        assert.equal(achievementManager.getUnlockedCount(), 0);
        assert.equal(achievementManager.getProgressString(), '0 / 20');
    });
});

// ── Session Stats Tracking ──────────────────────

describe('Achievement Session Stats', function() {

    beforeEach(function() { achSetup(); });
    afterEach(function() { achTeardown(); });

    it('should initialize all session stats to zero', function() {
        var s = achievementManager.sessionStats;
        assert.equal(s.kills, 0);
        assert.equal(s.losses, 0);
        assert.equal(s.citiesCaptured, 0);
        assert.equal(s.citiesLost, 0);
        assert.equal(s.citiesFounded, 0);
        assert.equal(s.playersEliminated, 0);
        assert.equal(s.warsDeclared, 0);
        assert.equal(s.peacesFormed, 0);
        assert.equal(s.unitsProduced, 0);
        assert.equal(s.techResearched, 0);
        assert.equal(s.tilesOwned, 0);
        assert.equal(s.turnsPlayed, 0);
        assert.equal(s.roundsPlayed, 0);
    });

    it('should track kills on human warrior combat', function() {
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var d = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 5, 6);

        _achEngine.resolveCombat(a, d);

        assert.equal(achievementManager.sessionStats.kills, 1);
    });

    it('should not increment kills when human destroys a settler', function() {
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var s = placePiece(_achEngine, PIECE_TYPES.SETTLER, 1, 5, 6);

        _achEngine.resolveCombat(a, s);

        assert.equal(achievementManager.sessionStats.kills, 0);
    });

    it('should not increment kills when capturing an enemy city', function() {
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var city = placePiece(_achEngine, PIECE_TYPES.CITY, 1, 5, 6);
        city.hp = 1;

        _achEngine.resolveCombat(a, city);

        assert.equal(achievementManager.sessionStats.kills, 0);
    });

    it('should track city captures on human combat', function() {
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var city = placePiece(_achEngine, PIECE_TYPES.CITY, 1, 5, 6);
        city.hp = 1;

        _achEngine.resolveCombat(a, city);

        assert.greaterThan(achievementManager.sessionStats.citiesCaptured, 0,
            'citiesCaptured should increase');
    });

    it('should track city losses when AI captures human city', function() {
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.currentPlayerIndex = 1;

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 5, 5);
        var city = placePiece(_achEngine, PIECE_TYPES.CITY, 0, 5, 6);
        city.hp = 1;

        _achEngine.resolveCombat(a, city);

        assert.greaterThan(achievementManager.sessionStats.citiesLost, 0,
            'citiesLost should increase');
    });

    it('should not track kills for AI offensive combat', function() {
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.currentPlayerIndex = 1;

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 5, 5);
        var d = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 6);

        _achEngine.resolveCombat(a, d);

        assert.equal(achievementManager.sessionStats.kills, 0);
    });

    it('should track war declarations via declareWar', function() {
        _achEngine.declareWar(0, 1);
        assert.equal(achievementManager.sessionStats.warsDeclared, 1);
    });

    it('should not track AI war declarations', function() {
        _achEngine.declareWar(1, 0);
        assert.equal(achievementManager.sessionStats.warsDeclared, 0);
    });

    it('should track peace via acceptPeace', function() {
        // acceptPeace requires target to have peace_proposed
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'peace_proposed';
        _achEngine.roundNumber = 100;
        _achEngine.players[0].relationsChangedRound[1] = 0;
        _achEngine.players[1].relationsChangedRound[0] = 0;

        _achEngine.acceptPeace(0, 1);

        assert.equal(achievementManager.sessionStats.peacesFormed, 1);
    });

    it('should track unit production completions', function() {
        achievementManager.onProductionComplete({
            city: { ownerId: 0 }, type: 'WARRIOR'
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.unitsProduced, 1);
    });

    it('should track settler production completions', function() {
        achievementManager.onProductionComplete({
            city: { ownerId: 0 }, type: 'SETTLER'
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.unitsProduced, 1);
    });

    it('should track science research', function() {
        achievementManager.onProductionComplete({
            city: { ownerId: 0 }, type: 'SCIENCE'
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.techResearched, 1);
    });

    it('should not track AI production', function() {
        achievementManager.onProductionComplete({
            city: { ownerId: 1 }, type: 'WARRIOR'
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.unitsProduced, 0);
    });

    it('should track city founding', function() {
        achievementManager.onCityFounded({
            city: { ownerId: 0 }, row: 5, col: 5
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.citiesFounded, 1);
    });

    it('should not track AI city founding', function() {
        achievementManager.onCityFounded({
            city: { ownerId: 1 }, row: 5, col: 5
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.citiesFounded, 0);
    });

    it('should track turns played on endTurn', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        _achEngine.endTurn();

        assert.equal(achievementManager.sessionStats.turnsPlayed, 1);
    });

    it('should track tile ownership on endTurn', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);
        _achEngine.tileOwnership[0][0] = 0;
        _achEngine.tileOwnership[0][1] = 0;
        _achEngine.tileOwnership[1][0] = 0;

        _achEngine.endTurn();

        assert.equal(achievementManager.sessionStats.tilesOwned, 3);
    });

    it('should track rounds played on endTurn', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);
        _achEngine.roundNumber = 7;

        _achEngine.endTurn();

        assert.equal(achievementManager.sessionStats.roundsPlayed, 7);
    });

    it('should track player eliminations by human', function() {
        achievementManager.onElimination({
            eliminated: true, playerId: 1, conquerer: 0
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.playersEliminated, 1);
    });

    it('should not track eliminations by AI', function() {
        achievementManager.onElimination({
            eliminated: true, playerId: 0, conquerer: 1
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.playersEliminated, 0);
    });
});

// ── Achievement Unlocking ───────────────────────

describe('Achievement Unlocking', function() {

    beforeEach(function() { achSetup(); });
    afterEach(function() { achTeardown(); });

    it('should unlock first_blood on first kill', function() {
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var d = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 5, 6);
        _achEngine.resolveCombat(a, d);

        assert.ok(achievementManager.isUnlocked('first_blood'));
    });

    it('should not unlock first_blood when human destroys a settler', function() {
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var s = placePiece(_achEngine, PIECE_TYPES.SETTLER, 1, 5, 6);
        _achEngine.resolveCombat(a, s);

        assert.ok(!achievementManager.isUnlocked('first_blood'));
    });

    it('should not unlock first_blood when capturing an enemy city', function() {
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var city = placePiece(_achEngine, PIECE_TYPES.CITY, 1, 5, 6);
        city.hp = 1;
        _achEngine.resolveCombat(a, city);

        assert.ok(!achievementManager.isUnlocked('first_blood'));
    });

    it('should unlock warmonger on player elimination in 3+ player game', function() {
        achTeardown();
        achSetup(3);
        achievementManager.onElimination({
            eliminated: true, playerId: 1, conquerer: 0
        }, _achEngine);

        assert.ok(achievementManager.isUnlocked('warmonger'));
    });

    it('should not unlock warmonger in 2-player game', function() {
        achievementManager.onElimination({
            eliminated: true, playerId: 1, conquerer: 0
        }, _achEngine);

        assert.ok(!achievementManager.isUnlocked('warmonger'));
    });

    it('should not unlock warmonger on easy difficulty', function() {
        achTeardown();
        achSetup(3);
        _achEngine.players[1].aiDifficulty = AI_DIFFICULTY.EASY;
        _achEngine.players[2].aiDifficulty = AI_DIFFICULTY.EASY;
        achievementManager.onElimination({
            eliminated: true, playerId: 1, conquerer: 0
        }, _achEngine);

        assert.ok(!achievementManager.isUnlocked('warmonger'));
    });

    it('should not unlock warmonger without elimination', function() {
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var d = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 5, 6);
        _achEngine.resolveCombat(a, d);

        assert.ok(!achievementManager.isUnlocked('warmonger'));
    });

    it('should unlock city_raider on first city capture', function() {
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var city = placePiece(_achEngine, PIECE_TYPES.CITY, 1, 5, 6);
        city.hp = 1;
        _achEngine.resolveCombat(a, city);

        assert.ok(achievementManager.isUnlocked('city_raider'));
    });

    it('should unlock new_horizons on first city founding', function() {
        achievementManager.onCityFounded({
            city: { ownerId: 0 }, row: 5, col: 5
        }, _achEngine);

        assert.ok(achievementManager.isUnlocked('new_horizons'));
    });

    it('should unlock empire_builder with 4 cities', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 5);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 5, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 5, 5);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        _achEngine.endTurn();

        assert.ok(achievementManager.isUnlocked('empire_builder'));
    });

    it('should not unlock empire_builder with 3 cities', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 5);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 5, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        _achEngine.endTurn();

        assert.ok(!achievementManager.isUnlocked('empire_builder'));
    });

    it('should unlock land_grab at 40 tiles', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        for (var r = 0; r < 4; r++) {
            for (var c = 0; c < 10; c++) {
                _achEngine.tileOwnership[r][c] = 0;
            }
        }
        _achEngine.endTurn();

        assert.ok(achievementManager.isUnlocked('land_grab'));
    });

    it('should not unlock land_grab below 40 tiles', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        for (var r = 0; r < 3; r++) {
            for (var c = 0; c < 10; c++) {
                _achEngine.tileOwnership[r][c] = 0;
            }
        }
        for (var c = 0; c < 9; c++) {
            _achEngine.tileOwnership[3][c] = 0;
        }
        _achEngine.endTurn();

        assert.ok(!achievementManager.isUnlocked('land_grab'));
    });

    it('should unlock peace_broker when forming peace', function() {
        // acceptPeace requires target to have peace_proposed
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'peace_proposed';
        _achEngine.roundNumber = 100;
        _achEngine.players[0].relationsChangedRound[1] = 0;
        _achEngine.players[1].relationsChangedRound[0] = 0;

        _achEngine.acceptPeace(0, 1);

        assert.ok(achievementManager.isUnlocked('peace_broker'));
    });

    it('should unlock assembly_line after 30 units', function() {
        for (var i = 0; i < 30; i++) {
            achievementManager.onProductionComplete({
                city: { ownerId: 0 }, type: 'WARRIOR'
            }, _achEngine);
        }

        assert.ok(achievementManager.isUnlocked('assembly_line'));
    });

    it('should not unlock assembly_line at 29 units', function() {
        for (var i = 0; i < 29; i++) {
            achievementManager.onProductionComplete({
                city: { ownerId: 0 }, type: 'WARRIOR'
            }, _achEngine);
        }

        assert.ok(!achievementManager.isUnlocked('assembly_line'));
    });

    it('should unlock tech_rush after 6 science', function() {
        for (var i = 0; i < 6; i++) {
            achievementManager.onProductionComplete({
                city: { ownerId: 0 }, type: 'SCIENCE'
            }, _achEngine);
        }

        assert.ok(achievementManager.isUnlocked('tech_rush'));
    });

    it('should not unlock tech_rush at 5 science', function() {
        for (var i = 0; i < 5; i++) {
            achievementManager.onProductionComplete({
                city: { ownerId: 0 }, type: 'SCIENCE'
            }, _achEngine);
        }

        assert.ok(!achievementManager.isUnlocked('tech_rush'));
    });

    it('should unlock first_victory on human win', function() {
        achievementManager.onVictory({ winner: 0 }, _achEngine);

        assert.ok(achievementManager.isUnlocked('first_victory'));
    });

    it('should not unlock first_victory on AI win', function() {
        achievementManager.onVictory({ winner: 1 }, _achEngine);

        assert.ok(!achievementManager.isUnlocked('first_victory'));
    });

    it('should unlock speed_demon on win under 30 rounds in 3+ player game', function() {
        achTeardown();
        achSetup(3);
        achievementManager.sessionStats.roundsPlayed = 20;
        achievementManager.onVictory({ winner: 0 }, _achEngine);

        assert.ok(achievementManager.isUnlocked('speed_demon'));
    });

    it('should not unlock speed_demon at 30+ rounds', function() {
        achTeardown();
        achSetup(3);
        achievementManager.sessionStats.roundsPlayed = 30;
        achievementManager.onVictory({ winner: 0 }, _achEngine);

        assert.ok(!achievementManager.isUnlocked('speed_demon'));
    });

    it('should not unlock speed_demon in 2-player game', function() {
        achievementManager.sessionStats.roundsPlayed = 20;
        achievementManager.onVictory({ winner: 0 }, _achEngine);

        assert.ok(!achievementManager.isUnlocked('speed_demon'));
    });

    it('should not unlock speed_demon on easy difficulty', function() {
        achTeardown();
        achSetup(3);
        _achEngine.players[1].aiDifficulty = AI_DIFFICULTY.EASY;
        _achEngine.players[2].aiDifficulty = AI_DIFFICULTY.EASY;
        achievementManager.sessionStats.roundsPlayed = 20;
        achievementManager.onVictory({ winner: 0 }, _achEngine);

        assert.ok(!achievementManager.isUnlocked('speed_demon'));
    });

    it('should unlock win_easy on easy skirmish win', function() {
        achTeardown();
        var e = achSetup(2);
        e.players[1].aiDifficulty = AI_DIFFICULTY.EASY;

        achievementManager.onVictory({ winner: 0 }, e);

        assert.ok(achievementManager.isUnlocked('win_easy'));
    });

    it('should unlock win_medium on medium skirmish win', function() {
        achTeardown();
        var e = achSetup(2);
        e.players[1].aiDifficulty = AI_DIFFICULTY.MEDIUM;

        achievementManager.onVictory({ winner: 0 }, e);

        assert.ok(achievementManager.isUnlocked('win_medium'));
    });

    it('should unlock win_hard on hard skirmish win', function() {
        achTeardown();
        var e = achSetup(2);
        e.players[1].aiDifficulty = AI_DIFFICULTY.HARD;

        achievementManager.onVictory({ winner: 0 }, e);

        assert.ok(achievementManager.isUnlocked('win_hard'));
    });

    it('should unlock win_hard_v3 vs 3 hard AI', function() {
        achTeardown();
        var e = achSetup(4);
        for (var i = 1; i <= 3; i++) {
            e.players[i].aiDifficulty = AI_DIFFICULTY.HARD;
        }

        achievementManager.onVictory({ winner: 0 }, e);

        assert.ok(achievementManager.isUnlocked('win_hard_v3'));
    });

    it('should not unlock win_hard_v3 with medium AI', function() {
        achTeardown();
        var e = achSetup(4);
        e.players[1].aiDifficulty = AI_DIFFICULTY.HARD;
        e.players[2].aiDifficulty = AI_DIFFICULTY.MEDIUM;
        e.players[3].aiDifficulty = AI_DIFFICULTY.HARD;

        achievementManager.onVictory({ winner: 0 }, e);

        assert.ok(!achievementManager.isUnlocked('win_hard_v3'));
    });

    it('should unlock win_easy_v3 vs 3 easy AI', function() {
        achTeardown();
        var e = achSetup(4);
        for (var i = 1; i <= 3; i++) {
            e.players[i].aiDifficulty = AI_DIFFICULTY.EASY;
        }

        achievementManager.onVictory({ winner: 0 }, e);

        assert.ok(achievementManager.isUnlocked('win_easy_v3'));
    });

    it('should unlock win_medium_v3 vs 3 medium AI', function() {
        achTeardown();
        var e = achSetup(4);
        for (var i = 1; i <= 3; i++) {
            e.players[i].aiDifficulty = AI_DIFFICULTY.MEDIUM;
        }

        achievementManager.onVictory({ winner: 0 }, e);

        assert.ok(achievementManager.isUnlocked('win_medium_v3'));
    });

    it('should not unlock win_easy_v3 with only 2 AI', function() {
        achTeardown();
        var e = achSetup(3);
        e.players[1].aiDifficulty = AI_DIFFICULTY.EASY;
        e.players[2].aiDifficulty = AI_DIFFICULTY.EASY;

        achievementManager.onVictory({ winner: 0 }, e);

        assert.ok(!achievementManager.isUnlocked('win_easy_v3'));
    });
});

// ── Backstabber Achievement ─────────────────────

describe('Achievement Backstabber', function() {

    beforeEach(function() { achSetup(); });
    afterEach(function() { achTeardown(); });

    it('should track peace formation round', function() {
        achievementManager.onDiplomacy({
            fromPlayer: 0, toPlayer: 1, type: 'peace'
        }, _achEngine);

        assert.ok(achievementManager.sessionStats._peaceFormedRound);
        assert.equal(achievementManager.sessionStats._peaceFormedRound[1],
            _achEngine.roundNumber);
    });

    it('should unlock when declaring war within 10 rounds of peace', function() {
        _achEngine.roundNumber = 10;
        achievementManager.onDiplomacy({
            fromPlayer: 0, toPlayer: 1, type: 'peace'
        }, _achEngine);

        _achEngine.roundNumber = 15;
        achievementManager.onDiplomacy({
            fromPlayer: 0, toPlayer: 1, type: 'war'
        }, _achEngine);

        assert.ok(achievementManager.isUnlocked('backstabber'));
    });

    it('should not unlock after 10+ rounds of peace', function() {
        _achEngine.roundNumber = 10;
        achievementManager.onDiplomacy({
            fromPlayer: 0, toPlayer: 1, type: 'peace'
        }, _achEngine);

        _achEngine.roundNumber = 25;
        achievementManager.onDiplomacy({
            fromPlayer: 0, toPlayer: 1, type: 'war'
        }, _achEngine);

        assert.ok(!achievementManager.isUnlocked('backstabber'));
    });

    it('should expire stale peace tracking after 10 rounds', function() {
        _achEngine.roundNumber = 5;
        achievementManager.onDiplomacy({
            fromPlayer: 0, toPlayer: 1, type: 'peace'
        }, _achEngine);

        _achEngine.roundNumber = 20;
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);
        _achEngine.endTurn();

        var peaceRounds = achievementManager.sessionStats._peaceFormedRound;
        assert.ok(!peaceRounds || !peaceRounds[1],
            'stale peace tracking should be expired');
    });
});

// ── Survivor Achievement ────────────────────────

describe('Achievement Survivor', function() {

    beforeEach(function() { achSetup(); });
    afterEach(function() { achTeardown(); });

    it('should snapshot peak city count when war starts', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 3);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 6);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 9);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.endTurn();

        assert.ok(achievementManager.sessionStats._survivorAtWar);
        assert.equal(achievementManager.sessionStats._survivorWarPeak, 4);
    });

    it('should reset tracker when peace is restored', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 3);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.endTurn();

        assert.ok(achievementManager.sessionStats._survivorAtWar);

        _achEngine.currentPlayerIndex = 0;
        _achEngine.players[0].relations[1] = 'peace';
        _achEngine.players[1].relations[0] = 'peace';
        _achEngine.endTurn();

        assert.ok(!achievementManager.sessionStats._survivorAtWar);
        assert.equal(achievementManager.sessionStats._survivorWarPeak, 0);
    });

    it('should set eligible after losing 70% of cities during war', function() {
        var c1 = placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        var c2 = placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 3);
        var c3 = placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 6);
        var c4 = placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 9);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.endTurn();

        assert.equal(achievementManager.sessionStats._survivorWarPeak, 4);

        // Remove 3 cities (75% loss)
        _achEngine.pieces = _achEngine.pieces.filter(function(p) {
            return p !== c2 && p !== c3 && p !== c4;
        });
        _achEngine.board[0][3] = null;
        _achEngine.board[0][6] = null;
        _achEngine.board[0][9] = null;

        _achEngine.currentPlayerIndex = 0;
        _achEngine.endTurn();

        assert.ok(achievementManager.sessionStats._survivorEligible);
    });

    it('should unlock survivor on victory when eligible', function() {
        achievementManager.sessionStats._survivorEligible = true;
        achievementManager.onVictory({ winner: 0 }, _achEngine);

        assert.ok(achievementManager.isUnlocked('survivor'));
    });

    it('should not unlock survivor without eligibility', function() {
        achievementManager.onVictory({ winner: 0 }, _achEngine);

        assert.ok(!achievementManager.isUnlocked('survivor'));
    });

    it('should not track survivor if peak is less than 2 cities', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.endTurn();

        assert.ok(!achievementManager.sessionStats._survivorEligible);
    });
});

// ── Save/Load Persistence ───────────────────────

describe('Achievement Save/Load', function() {

    beforeEach(function() { achSetup(); });
    afterEach(function() { achTeardown(); });

    it('should include achievement stats in snapshot', function() {
        achievementManager.sessionStats.kills = 5;
        achievementManager.sessionStats.citiesCaptured = 2;
        achievementManager.sessionStats.unitsProduced = 8;

        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);
        _achEngine.history.captureSnapshot(_achEngine, 'TEST');

        assert.ok(_achEngine.history.latestSnapshot.a,
            'snapshot should include achievement stats');
        assert.equal(_achEngine.history.latestSnapshot.a.kills, 5);
        assert.equal(_achEngine.history.latestSnapshot.a.citiesCaptured, 2);
        assert.equal(_achEngine.history.latestSnapshot.a.unitsProduced, 8);
    });

    it('should include complex tracking state in snapshot', function() {
        achievementManager.sessionStats._peaceFormedRound = { 1: 5 };
        achievementManager.sessionStats._survivorWarPeak = 4;
        achievementManager.sessionStats._survivorAtWar = true;

        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);
        _achEngine.history.captureSnapshot(_achEngine, 'TEST');

        var stats = _achEngine.history.latestSnapshot.a;
        assert.deepEqual(stats._peaceFormedRound, { 1: 5 });
        assert.equal(stats._survivorWarPeak, 4);
        assert.equal(stats._survivorAtWar, true);
    });

    it('should not include stats when manager is detached', function() {
        achievementManager.detachFromGame();

        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);
        _achEngine.history.captureSnapshot(_achEngine, 'TEST');

        assert.ok(!_achEngine.history.latestSnapshot.a,
            'snapshot should not include stats when detached');
    });

    it('should stash achievement stats on engine during restore', function() {
        var savedStats = {
            kills: 10, losses: 2, citiesCaptured: 3, citiesLost: 1,
            citiesFounded: 1, playersEliminated: 0, warsDeclared: 1,
            peacesFormed: 1, unitsProduced: 7, techResearched: 2,
            tilesOwned: 25, turnsPlayed: 15, roundsPlayed: 8,
            _peaceFormedRound: { 1: 3 }
        };

        var savedGame = {
            gameId: 'Test Save',
            metadata: {
                players: [
                    { id: 0, name: 'P1', color: PLAYER_COLORS[0], isAI: false },
                    { id: 1, name: 'P2', color: PLAYER_COLORS[1], isAI: true, aiDifficulty: 'medium' }
                ],
                winner: null
            },
            snapshots: [{
                turnNumber: 15, roundNumber: 8, currentPlayerIndex: 0,
                tileOwnership: Array(10).fill(null).map(function() { return Array(10).fill(null); }),
                pieces: [
                    { id: 1, type: PIECE_TYPES.CITY, ownerId: 0, row: 0, col: 0, hp: 4, maxHp: 4 },
                    { id: 2, type: PIECE_TYPES.CITY, ownerId: 1, row: 9, col: 9, hp: 4, maxHp: 4 }
                ],
                techLevels: [{ playerId: 0, techScore: 2 }, { playerId: 1, techScore: 1 }],
                playerRelations: [
                    { playerId: 0, relations: { 1: 'peace' }, relationsChangedRound: { 1: 0 } },
                    { playerId: 1, relations: { 0: 'peace' }, relationsChangedRound: { 0: 0 } }
                ],
                achievementStats: savedStats
            }]
        };

        var newEngine = new GameEngine();
        newEngine.restoreFromSavedGame(savedGame);

        assert.ok(newEngine._pendingAchievementStats);
        assert.equal(newEngine._pendingAchievementStats.kills, 10);
        assert.equal(newEngine._pendingAchievementStats.citiesCaptured, 3);
        assert.deepEqual(newEngine._pendingAchievementStats._peaceFormedRound, { 1: 3 });
    });

    it('should restore session stats from pending stash on attachToGame', function() {
        var savedStats = {
            kills: 10, losses: 2, citiesCaptured: 3, citiesLost: 1,
            citiesFounded: 1, playersEliminated: 0, warsDeclared: 1,
            peacesFormed: 1, unitsProduced: 7, techResearched: 2,
            tilesOwned: 25, turnsPlayed: 15, roundsPlayed: 8
        };

        _achEngine._pendingAchievementStats = savedStats;

        achievementManager.detachFromGame();
        achievementManager.attachToGame({ engine: _achEngine });

        assert.equal(achievementManager.sessionStats.kills, 10);
        assert.equal(achievementManager.sessionStats.citiesCaptured, 3);
        assert.equal(achievementManager.sessionStats.unitsProduced, 7);
        assert.ok(!_achEngine._pendingAchievementStats, 'pending stats consumed');
    });

    it('should resetSession when no pending stats exist', function() {
        achievementManager.sessionStats.kills = 99;

        achievementManager.detachFromGame();
        achievementManager.attachToGame({ engine: _achEngine });

        assert.equal(achievementManager.sessionStats.kills, 0);
    });

    it('should handle old saves without achievement data', function() {
        var savedGame = {
            gameId: 'Old Save',
            metadata: {
                players: [
                    { id: 0, name: 'P1', color: PLAYER_COLORS[0], isAI: false },
                    { id: 1, name: 'P2', color: PLAYER_COLORS[1], isAI: true }
                ],
                winner: null
            },
            snapshots: [{
                turnNumber: 10, roundNumber: 5, currentPlayerIndex: 0,
                tileOwnership: Array(10).fill(null).map(function() { return Array(10).fill(null); }),
                pieces: [
                    { id: 1, type: PIECE_TYPES.CITY, ownerId: 0, row: 0, col: 0, hp: 4, maxHp: 4 },
                    { id: 2, type: PIECE_TYPES.CITY, ownerId: 1, row: 9, col: 9, hp: 4, maxHp: 4 }
                ],
                techLevels: [{ playerId: 0, techScore: 0 }, { playerId: 1, techScore: 0 }],
                playerRelations: [
                    { playerId: 0, relations: { 1: 'peace' }, relationsChangedRound: { 1: 0 } },
                    { playerId: 1, relations: { 0: 'peace' }, relationsChangedRound: { 0: 0 } }
                ]
            }]
        };

        var newEngine = new GameEngine();
        newEngine.restoreFromSavedGame(savedGame);

        assert.ok(!newEngine._pendingAchievementStats);

        achievementManager.detachFromGame();
        achievementManager.attachToGame({ engine: newEngine });

        assert.equal(achievementManager.sessionStats.kills, 0);
    });

    it('should survive full compress/decompress cycle', function() {
        achievementManager.sessionStats.kills = 12;
        achievementManager.sessionStats._peaceFormedRound = { 1: 7 };
        achievementManager.sessionStats._survivorEligible = true;

        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);
        _achEngine.history.captureSnapshot(_achEngine, 'TEST');

        var saveData = {
            s: _achEngine.history.latestSnapshot,
            m: { st: Date.now(), et: null, pc: 2, ps: [], w: null }
        };

        var compressed = GameHistory.compress(saveData);
        var decompressed = GameHistory.decompress(compressed);

        assert.ok(decompressed.s.a);
        assert.equal(decompressed.s.a.kills, 12);
        assert.deepEqual(decompressed.s.a._peaceFormedRound, { 1: 7 });
        assert.equal(decompressed.s.a._survivorEligible, true);
    });

    it('should continue accumulating stats after restore', function() {
        _achEngine._pendingAchievementStats = {
            kills: 5, losses: 0, citiesCaptured: 0, citiesLost: 0,
            citiesFounded: 0, playersEliminated: 0, warsDeclared: 0,
            peacesFormed: 0, unitsProduced: 29, techResearched: 0,
            tilesOwned: 0, turnsPlayed: 0, roundsPlayed: 0
        };

        achievementManager.detachFromGame();
        achievementManager.attachToGame({ engine: _achEngine });

        // Produce one more unit to reach 30 and unlock assembly_line
        achievementManager.onProductionComplete({
            city: { ownerId: 0 }, type: 'WARRIOR'
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.unitsProduced, 30);
        assert.ok(achievementManager.isUnlocked('assembly_line'),
            'assembly_line should unlock from restored + new stats');
    });
});

// ── Save/Load Round-Trip (E2E) ──────────────────
// Simulates the full flow: play game → save → leave → reload → verify progress → continue

// Helper: build a saved-game object from a live engine + achievement state,
// mirroring what GameHistory.loadFromIndexedDB would reconstruct.
function buildSavedGameFromEngine(engine) {
    // Capture the latest snapshot (includes achievement stats as 'a')
    engine.history.captureSnapshot(engine, 'TEST');
    var snap = engine.history.latestSnapshot;

    // Compress → decompress to mirror the real IndexedDB round-trip
    var saveData = {
        s: snap,
        m: {
            st: engine.history.metadata.startTime,
            et: null,
            pc: engine.players.length,
            ps: engine.players.map(function(p) {
                return {
                    id: p.id, name: p.name, color: p.color,
                    isAI: p.isAI, aiDifficulty: p.aiDifficulty,
                    personality: p.personality,
                    warriorKills: p.warriorKills, warriorsLost: p.warriorsLost
                };
            }),
            w: null
        }
    };
    var compressed = GameHistory.compress(saveData);
    var decompressed = GameHistory.decompress(compressed);

    // Reconstruct the decoded format (same logic as loadFromIndexedDB)
    var s = decompressed.s;
    var m = decompressed.m;
    var history = new GameHistory();
    var decodedSnapshot = {
        turnNumber: s.t,
        roundNumber: s.n,
        currentPlayerIndex: s.p,
        tileOwnership: history.decodeTileOwnership(s.o),
        pieces: history.decodePieces(s.u),
        techLevels: history.decodeTechLevels(s.l),
        playerRelations: history.decodeRelations(s.r),
        achievementStats: s.a || null
    };

    return {
        gameId: engine.history.gameId,
        metadata: {
            startTime: m.st, endTime: m.et,
            playerCount: m.pc, players: m.ps, winner: m.w
        },
        snapshots: [decodedSnapshot]
    };
}

describe('Achievement Save/Load Round-Trip', function() {

    beforeEach(function() { achSetup(); });
    afterEach(function() { achTeardown(); });

    it('should preserve basic session stats through save and reload', function() {
        // --- Phase 1: Play and earn some progress ---
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';

        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        // Kill 3 warriors
        for (var i = 0; i < 3; i++) {
            var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 3, i);
            var d = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 4, i);
            _achEngine.resolveCombat(a, d);
        }
        // Produce some units
        for (var j = 0; j < 5; j++) {
            achievementManager.onProductionComplete({
                city: { ownerId: 0 }, type: 'WARRIOR'
            }, _achEngine);
        }

        assert.equal(achievementManager.sessionStats.kills, 3);
        assert.equal(achievementManager.sessionStats.unitsProduced, 5);
        assert.ok(achievementManager.isUnlocked('first_blood'));

        // --- Phase 2: Save the game ---
        var savedGame = buildSavedGameFromEngine(_achEngine);

        // --- Phase 3: "Leave" — detach everything ---
        achievementManager.detachFromGame();

        // --- Phase 4: "Reload" — restore into a fresh engine ---
        var newEngine = new GameEngine();
        newEngine.restoreFromSavedGame(savedGame);
        achievementManager.attachToGame({ engine: newEngine });

        // --- Phase 5: Verify all stats survived ---
        assert.equal(achievementManager.sessionStats.kills, 3,
            'kills should survive save/load');
        assert.equal(achievementManager.sessionStats.unitsProduced, 5,
            'unitsProduced should survive save/load');
    });

    it('should unlock achievement from combined pre-save and post-load progress', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        // --- Phase 1: Produce 28 units before save ---
        for (var i = 0; i < 28; i++) {
            achievementManager.onProductionComplete({
                city: { ownerId: 0 }, type: 'WARRIOR'
            }, _achEngine);
        }
        assert.equal(achievementManager.sessionStats.unitsProduced, 28);
        assert.ok(!achievementManager.isUnlocked('assembly_line'),
            'assembly_line should NOT be unlocked yet at 28');

        // --- Phase 2: Save → leave → reload ---
        var savedGame = buildSavedGameFromEngine(_achEngine);
        achievementManager.detachFromGame();

        var newEngine = new GameEngine();
        newEngine.restoreFromSavedGame(savedGame);
        achievementManager.attachToGame({ engine: newEngine });

        assert.equal(achievementManager.sessionStats.unitsProduced, 28,
            'unitsProduced should be restored to 28');

        // --- Phase 3: Produce 2 more after reload → hits 30 → unlocks ---
        for (var j = 0; j < 2; j++) {
            achievementManager.onProductionComplete({
                city: { ownerId: 0 }, type: 'SETTLER'
            }, newEngine);
        }

        assert.equal(achievementManager.sessionStats.unitsProduced, 30);
        assert.ok(achievementManager.isUnlocked('assembly_line'),
            'assembly_line should unlock from pre-save + post-load progress');
    });

    it('should preserve backstabber tracking through save and reload', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        // --- Phase 1: Form peace at round 10 ---
        _achEngine.roundNumber = 10;
        achievementManager.onDiplomacy({
            fromPlayer: 0, toPlayer: 1, type: 'peace'
        }, _achEngine);
        assert.ok(achievementManager.sessionStats._peaceFormedRound);
        assert.equal(achievementManager.sessionStats._peaceFormedRound[1], 10);

        // --- Phase 2: Save → leave → reload ---
        var savedGame = buildSavedGameFromEngine(_achEngine);
        achievementManager.detachFromGame();

        var newEngine = new GameEngine();
        newEngine.restoreFromSavedGame(savedGame);
        achievementManager.attachToGame({ engine: newEngine });

        // --- Phase 3: Verify tracking survived ---
        assert.ok(achievementManager.sessionStats._peaceFormedRound,
            '_peaceFormedRound should survive');
        assert.equal(achievementManager.sessionStats._peaceFormedRound[1], 10,
            'peace round should be 10');

        // --- Phase 4: Declare war at round 15 — triggers backstabber ---
        newEngine.roundNumber = 15;
        achievementManager.onDiplomacy({
            fromPlayer: 0, toPlayer: 1, type: 'war'
        }, newEngine);

        assert.ok(achievementManager.isUnlocked('backstabber'),
            'backstabber should unlock from pre-save peace + post-load war');
    });

    it('should preserve survivor tracking through save and reload', function() {
        // --- Phase 1: Start war with 4 cities, snapshot peak ---
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 3);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 6);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 9);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.endTurn();

        assert.ok(achievementManager.sessionStats._survivorAtWar);
        assert.equal(achievementManager.sessionStats._survivorWarPeak, 4);

        // --- Phase 2: Save → leave → reload ---
        var savedGame = buildSavedGameFromEngine(_achEngine);
        achievementManager.detachFromGame();

        var newEngine = new GameEngine();
        newEngine.restoreFromSavedGame(savedGame);
        achievementManager.attachToGame({ engine: newEngine });

        // --- Phase 3: Verify survivor tracking survived ---
        assert.ok(achievementManager.sessionStats._survivorAtWar,
            '_survivorAtWar should survive');
        assert.equal(achievementManager.sessionStats._survivorWarPeak, 4,
            'peak city count should survive');
    });

    it('should preserve survivor eligibility through save and unlock on victory after reload', function() {
        // --- Phase 1: Become eligible ---
        achievementManager.sessionStats._survivorEligible = true;
        achievementManager.sessionStats.kills = 7;

        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        // --- Phase 2: Save → leave → reload ---
        var savedGame = buildSavedGameFromEngine(_achEngine);
        achievementManager.detachFromGame();

        var newEngine = new GameEngine();
        newEngine.restoreFromSavedGame(savedGame);
        achievementManager.attachToGame({ engine: newEngine });

        assert.ok(achievementManager.sessionStats._survivorEligible,
            '_survivorEligible should survive');

        // --- Phase 3: Win the game after reload ---
        achievementManager.onVictory({ winner: 0 }, newEngine);

        assert.ok(achievementManager.isUnlocked('survivor'),
            'survivor should unlock from pre-save eligibility + post-load victory');
        assert.ok(achievementManager.isUnlocked('first_victory'),
            'first_victory should also unlock');
    });

    it('should preserve speed_demon eligibility through save and reload', function() {
        achTeardown();
        achSetup(3);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        // --- Phase 1: Play 15 rounds ---
        achievementManager.sessionStats.roundsPlayed = 15;
        _achEngine.roundNumber = 15;

        // --- Phase 2: Save → leave → reload ---
        var savedGame = buildSavedGameFromEngine(_achEngine);
        achievementManager.detachFromGame();

        var newEngine = new GameEngine();
        newEngine.restoreFromSavedGame(savedGame);
        achievementManager.attachToGame({ engine: newEngine });

        assert.equal(achievementManager.sessionStats.roundsPlayed, 15,
            'roundsPlayed should survive');

        // --- Phase 3: Win at round 15 → under 30 → speed_demon unlocks ---
        achievementManager.onVictory({ winner: 0 }, newEngine);

        assert.ok(achievementManager.isUnlocked('speed_demon'),
            'speed_demon should unlock from pre-save round count');
    });

    it('should handle multiple save/load cycles without data loss', function() {
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);

        // --- Cycle 1: Earn 3 kills, save, reload ---
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';

        for (var i = 0; i < 3; i++) {
            var a1 = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 3, i);
            var d1 = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 4, i);
            _achEngine.resolveCombat(a1, d1);
        }

        var saved1 = buildSavedGameFromEngine(_achEngine);
        achievementManager.detachFromGame();

        var engine2 = new GameEngine();
        engine2.restoreFromSavedGame(saved1);
        achievementManager.attachToGame({ engine: engine2 });

        assert.equal(achievementManager.sessionStats.kills, 3, 'cycle 1: 3 kills');

        // --- Cycle 2: Earn 2 more kills, save again, reload ---
        engine2.players[0].relations[1] = 'war';
        engine2.players[1].relations[0] = 'war';

        for (var j = 0; j < 2; j++) {
            var a2 = placePiece(engine2, PIECE_TYPES.WARRIOR, 0, 6, j);
            var d2 = placePiece(engine2, PIECE_TYPES.WARRIOR, 1, 7, j);
            engine2.resolveCombat(a2, d2);
        }

        assert.equal(achievementManager.sessionStats.kills, 5, 'cycle 2: 5 kills total');

        var saved2 = buildSavedGameFromEngine(engine2);
        achievementManager.detachFromGame();

        var engine3 = new GameEngine();
        engine3.restoreFromSavedGame(saved2);
        achievementManager.attachToGame({ engine: engine3 });

        assert.equal(achievementManager.sessionStats.kills, 5,
            'cycle 3: kills should be 5 after two save/load cycles');
    });
});

// ── Edge Cases ──────────────────────────────────

describe('Achievement Edge Cases', function() {

    beforeEach(function() { achSetup(); });
    afterEach(function() { achTeardown(); });

    it('should not re-unlock already unlocked achievements', function() {
        achievementManager.unlock('first_blood');
        var firstTime = achievementManager.unlocked.first_blood.unlockedAt;

        achievementManager.unlock('first_blood');

        assert.equal(achievementManager.unlocked.first_blood.unlockedAt, firstTime);
    });

    it('should not unlock unregistered achievements', function() {
        achievementManager.unlock('nonexistent');
        assert.ok(!achievementManager.isUnlocked('nonexistent'));
    });

    it('should not fire checks when manager is detached', function() {
        achievementManager.detachFromGame();

        var other = createScenario(2);
        other.players[0].relations[1] = 'war';
        other.players[1].relations[0] = 'war';

        var a = placePiece(other, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var d = placePiece(other, PIECE_TYPES.WARRIOR, 1, 5, 6);
        other.resolveCombat(a, d);

        // sessionStats is empty object since detachFromGame doesn't clear it
        // but no new stats were tracked
        assert.ok(!achievementManager.sessionStats.kills ||
            achievementManager.sessionStats.kills === 0);
    });

    it('should report correct progress string', function() {
        achievementManager.unlock('first_blood');
        achievementManager.unlock('first_victory');

        assert.equal(achievementManager.getProgressString(), '2 / 20');
    });

    it('should store gameId in unlock info', function() {
        _achEngine.history.gameId = 'Game test123';
        achievementManager.unlock('first_blood');

        var info = achievementManager.getUnlockInfo('first_blood');
        assert.ok(info);
        assert.equal(info.gameId, 'Game test123');
    });

    it('should store details in unlock info', function() {
        achievementManager.unlock('first_blood', { kills: 1 });

        var info = achievementManager.getUnlockInfo('first_blood');
        assert.deepEqual(info.details, { kills: 1 });
    });

    it('should return null for locked achievement info', function() {
        assert.equal(achievementManager.getUnlockInfo('first_blood'), null);
    });
});

// ── Human Player Helpers ─────────────────────────

describe('Achievement Human Player Helpers', function() {

    afterEach(function() { achTeardown(); });

    it('isSingleHumanGame should return true for 1 human', function() {
        achSetup(2);
        assert.ok(achievementManager.isSingleHumanGame());
    });

    it('isSingleHumanGame should return false for hot seat (2 humans)', function() {
        achSetup(2);
        _achEngine.players[0].isAI = false;
        _achEngine.players[1].isAI = false;
        assert.ok(!achievementManager.isSingleHumanGame());
    });

    it('isSingleHumanGame should return false for AI-only', function() {
        achSetup(2);
        _achEngine.players[0].isAI = true;
        _achEngine.players[1].isAI = true;
        assert.ok(!achievementManager.isSingleHumanGame());
    });

    it('getHumanPlayerId should return 0 when human is player 0', function() {
        achSetup(2, 0);
        assert.equal(achievementManager.getHumanPlayerId(), 0);
    });

    it('getHumanPlayerId should return 1 when human is player 1', function() {
        achSetup(2, 1);
        assert.equal(achievementManager.getHumanPlayerId(), 1);
    });

    it('getHumanPlayerId should return -1 for hot seat', function() {
        achSetup(2);
        _achEngine.players[0].isAI = false;
        _achEngine.players[1].isAI = false;
        assert.equal(achievementManager.getHumanPlayerId(), -1);
    });

    it('getHumanPlayerId should return -1 for AI-only', function() {
        achSetup(2);
        _achEngine.players[0].isAI = true;
        _achEngine.players[1].isAI = true;
        assert.equal(achievementManager.getHumanPlayerId(), -1);
    });
});

// ── Hot Seat / AI-Only Blocking ─────────────────

describe('Achievement Hot Seat Blocking', function() {

    afterEach(function() { achTeardown(); });

    it('should block all achievements in hot seat games', function() {
        achSetup(2);
        // Make both players human (hot seat)
        _achEngine.players[0].isAI = false;
        _achEngine.players[1].isAI = false;

        achievementManager.sessionStats.kills = 5;
        achievementManager.unlock('first_blood');

        assert.ok(!achievementManager.isUnlocked('first_blood'),
            'first_blood should be blocked in hot seat');
    });

    it('should block skirmishOnly achievements in hot seat', function() {
        achSetup(2);
        _achEngine.players[0].isAI = false;
        _achEngine.players[1].isAI = false;

        achievementManager.unlock('first_victory');

        assert.ok(!achievementManager.isUnlocked('first_victory'),
            'first_victory should be blocked in hot seat');
    });

    it('should block all achievements in AI-only games', function() {
        achSetup(2);
        _achEngine.players[0].isAI = true;
        _achEngine.players[1].isAI = true;

        achievementManager.unlock('first_blood');

        assert.ok(!achievementManager.isUnlocked('first_blood'),
            'first_blood should be blocked in AI-only');
    });
});

// ── Human at Non-Zero Position ──────────────────

describe('Achievement Human at Non-Zero Position', function() {

    afterEach(function() { achTeardown(); });

    it('should track kills when human is player 1', function() {
        achSetup(2, 1);
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.currentPlayerIndex = 1;

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 5, 5);
        var d = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        _achEngine.resolveCombat(a, d);

        assert.equal(achievementManager.sessionStats.kills, 1);
    });

    it('should unlock first_blood when human is player 1', function() {
        achSetup(2, 1);
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.currentPlayerIndex = 1;

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 5, 5);
        var d = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 6);
        _achEngine.resolveCombat(a, d);

        assert.ok(achievementManager.isUnlocked('first_blood'),
            'first_blood should unlock for player 1 human');
    });

    it('should not track kills for AI when human is player 1', function() {
        achSetup(2, 1);
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.currentPlayerIndex = 0;

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var d = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 5, 6);
        _achEngine.resolveCombat(a, d);

        assert.equal(achievementManager.sessionStats.kills, 0,
            'AI kills should not count for human stats');
    });

    it('should track city captures when human is player 1', function() {
        achSetup(2, 1);
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.currentPlayerIndex = 1;

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 5, 5);
        var city = placePiece(_achEngine, PIECE_TYPES.CITY, 0, 5, 6);
        city.hp = 1;
        _achEngine.resolveCombat(a, city);

        assert.equal(achievementManager.sessionStats.citiesCaptured, 1);
    });

    it('should track city losses when AI captures human city (human is player 1)', function() {
        achSetup(2, 1);
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.currentPlayerIndex = 0;

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var city = placePiece(_achEngine, PIECE_TYPES.CITY, 1, 5, 6);
        city.hp = 1;
        _achEngine.resolveCombat(a, city);

        assert.equal(achievementManager.sessionStats.citiesLost, 1);
    });

    it('should track tile ownership when human is player 1', function() {
        achSetup(2, 1);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 9, 9);
        _achEngine.tileOwnership[9][9] = 1;
        _achEngine.tileOwnership[9][8] = 1;
        _achEngine.tileOwnership[8][9] = 1;

        _achEngine.endTurn();

        assert.equal(achievementManager.sessionStats.tilesOwned, 3,
            'tilesOwned should count player 1 tiles');
    });

    it('should unlock empire_builder when human is player 1 with 4 cities', function() {
        achSetup(2, 1);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 0, 5);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 5, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 5, 5);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 9, 9);

        _achEngine.endTurn();

        assert.ok(achievementManager.isUnlocked('empire_builder'),
            'empire_builder should unlock for player 1 human');
    });

    it('should unlock first_victory when human wins as player 1', function() {
        achSetup(2, 1);
        achievementManager.onVictory({ winner: 1 }, _achEngine);

        assert.ok(achievementManager.isUnlocked('first_victory'),
            'first_victory should unlock for player 1 winner');
    });

    it('should not unlock first_victory when AI wins and human is player 1', function() {
        achSetup(2, 1);
        achievementManager.onVictory({ winner: 0 }, _achEngine);

        assert.ok(!achievementManager.isUnlocked('first_victory'),
            'first_victory should not unlock for AI winner');
    });

    it('should track eliminations when human is player 1', function() {
        achSetup(2, 1);
        achievementManager.onElimination({
            eliminated: true, playerId: 0, conquerer: 1
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.playersEliminated, 1);
    });

    it('should track production when human is player 1', function() {
        achSetup(2, 1);
        achievementManager.onProductionComplete({
            city: { ownerId: 1 }, type: 'WARRIOR'
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.unitsProduced, 1);
    });

    it('should not track production for AI when human is player 1', function() {
        achSetup(2, 1);
        achievementManager.onProductionComplete({
            city: { ownerId: 0 }, type: 'WARRIOR'
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.unitsProduced, 0);
    });

    it('should track diplomacy when human is player 1', function() {
        achSetup(2, 1);
        achievementManager.onDiplomacy({
            fromPlayer: 1, toPlayer: 0, type: 'war'
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.warsDeclared, 1);
    });

    it('should not track AI diplomacy when human is player 1', function() {
        achSetup(2, 1);
        achievementManager.onDiplomacy({
            fromPlayer: 0, toPlayer: 1, type: 'war'
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.warsDeclared, 0);
    });

    it('should track city founding when human is player 1', function() {
        achSetup(2, 1);
        achievementManager.onCityFounded({
            city: { ownerId: 1 }, row: 5, col: 5
        }, _achEngine);

        assert.equal(achievementManager.sessionStats.citiesFounded, 1);
    });

    it('should track survivor when human is player 1', function() {
        achSetup(2, 1);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 0, 0);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 0, 3);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 0, 6);
        placePiece(_achEngine, PIECE_TYPES.CITY, 1, 0, 9);
        placePiece(_achEngine, PIECE_TYPES.CITY, 0, 9, 9);

        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.endTurn();

        assert.ok(achievementManager.sessionStats._survivorAtWar);
        assert.equal(achievementManager.sessionStats._survivorWarPeak, 4,
            'survivor peak should track player 1 cities');
    });
});

// ── City Loss Accuracy ──────────────────────────

describe('Achievement City Loss Accuracy', function() {

    afterEach(function() { achTeardown(); });

    it('should not count AI-vs-AI city captures as human losses', function() {
        achSetup(3, 0);
        _achEngine.players[1].relations[2] = 'war';
        _achEngine.players[2].relations[1] = 'war';
        _achEngine.currentPlayerIndex = 1;

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 5, 5);
        var city = placePiece(_achEngine, PIECE_TYPES.CITY, 2, 5, 6);
        city.hp = 1;
        _achEngine.resolveCombat(a, city);

        assert.equal(achievementManager.sessionStats.citiesLost, 0,
            'AI capturing AI city should not count as human loss');
    });

    it('should count AI capturing human city as a loss', function() {
        achSetup(3, 0);
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.currentPlayerIndex = 1;

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 1, 5, 5);
        var city = placePiece(_achEngine, PIECE_TYPES.CITY, 0, 5, 6);
        city.hp = 1;
        _achEngine.resolveCombat(a, city);

        assert.equal(achievementManager.sessionStats.citiesLost, 1,
            'AI capturing human city should count as a loss');
    });

    it('should not count AI-vs-AI city captures as losses when human is player 2', function() {
        achSetup(3, 2);
        _achEngine.players[0].relations[1] = 'war';
        _achEngine.players[1].relations[0] = 'war';
        _achEngine.currentPlayerIndex = 0;

        var a = placePiece(_achEngine, PIECE_TYPES.WARRIOR, 0, 5, 5);
        var city = placePiece(_achEngine, PIECE_TYPES.CITY, 1, 5, 6);
        city.hp = 1;
        _achEngine.resolveCombat(a, city);

        assert.equal(achievementManager.sessionStats.citiesLost, 0,
            'AI-vs-AI city capture should not count as player 2 human loss');
    });
});
