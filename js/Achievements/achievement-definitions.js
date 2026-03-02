// ============================================
// ACHIEVEMENT MANAGER - Definitions
// ============================================
// Register all achievement definitions and their check logic here.
// Each achievement needs: id, name, description, category, icon.
// Optionally: hidden (hides description until unlocked).
//
// Categories: combat, expansion, diplomacy, production, mastery
//
// To add a new achievement:
//   1. Add a definition to the ACHIEVEMENT_DEFS array below
//   2. Add a check function using achievementManager.addCheck(event, fn)
//      Events: combat, elimination, production, cityFounded, diplomacy, turnEnd, victory, defeat
//      fn receives (data, engine, manager)
//
// Example:
//   achievementManager.addCheck('combat', function(result, engine, mgr) {
//       if (mgr.sessionStats.kills >= 1) {
//           mgr.unlock('first_blood');
//       }
//   });

var ACHIEVEMENT_DEFS = [
    // ── Combat ──
    {
        id: 'first_blood',
        name: 'Get Derezzed!',
        description: 'Destroy your first enemy warrior',
        category: 'combat',
        icon: '\u2694\uFE0F'
    },
    {
        id: 'warmonger',
        name: 'EXTERMINATE!',
        description: 'Eliminate an AI player on medium or hard with 3-4 players',
        category: 'combat',
        icon: '\uD83D\uDD25'
    },
    {
        id: 'city_raider',
        name: 'City Raider',
        description: 'Capture an enemy city',
        category: 'combat',
        icon: '\uD83C\uDFF0'
    },
    {
        id: 'war_crime',
        name: 'Wait! Isn\'t that a war crime?',
        description: 'Destroy a settler while at war',
        category: 'combat',
        icon: '\uD83D\uDC80',
        hidden: true
    },
    // ── Expansion ──
    {
        id: 'new_horizons',
        name: 'New Horizons',
        description: 'Found your first city with a settler',
        category: 'expansion',
        icon: '\uD83C\uDF1F',
        skirmishOnly: true
    },
    {
        id: 'empire_builder',
        name: 'Empire Builder',
        description: 'Control 4 cities at once',
        category: 'expansion',
        icon: '\uD83D\uDC51',
        skirmishOnly: true
    },
    {
        id: 'land_grab',
        name: 'Land Grab',
        description: 'Own 40 tiles simultaneously',
        category: 'expansion',
        icon: '\uD83D\uDDFA\uFE0F',
        skirmishOnly: true
    },
    // ── Diplomacy ──
    {
        id: 'peace_broker',
        name: 'Peace Broker',
        description: 'Form peace with an enemy',
        category: 'diplomacy',
        icon: '\u2615',
        skirmishOnly: true
    },
    {
        id: 'backstabber',
        name: 'Backstabber',
        description: 'Declare war within 10 rounds of making peace',
        category: 'diplomacy',
        icon: '\uD83D\uDDE1\uFE0F',
        hidden: true,
        skirmishOnly: true
    },
    // ── Production ──
    {
        id: 'assembly_line',
        name: 'Assembly Line',
        description: 'Produce 30 units in a single game',
        category: 'production',
        icon: '\u2699\uFE0F'
    },
    {
        id: 'tech_rush',
        name: 'Tech Rush',
        description: 'Research science 6 times in one game',
        category: 'production',
        icon: '\uD83D\uDD2C'
    },
    // ── Mastery ──
    {
        id: 'first_victory',
        name: 'First Victory',
        description: 'Win your first game',
        category: 'mastery',
        icon: '\uD83C\uDFC6',
        skirmishOnly: true
    },
    {
        id: 'win_easy',
        name: 'Baby Steps',
        description: 'Win a skirmish on easy difficulty',
        category: 'mastery',
        icon: '\uD83D\uDC76',
        skirmishOnly: true
    },
    {
        id: 'win_medium',
        name: 'Holding Your Own',
        description: 'Win a skirmish on medium difficulty',
        category: 'mastery',
        icon: '\uD83C\uDFC5',
        skirmishOnly: true
    },
    {
        id: 'win_hard',
        name: 'Hardened Veteran',
        description: 'Win a skirmish on hard difficulty',
        category: 'mastery',
        icon: '\uD83C\uDF96\uFE0F',
        skirmishOnly: true
    },
    {
        id: 'win_easy_v3',
        name: 'It\'s Smurfing Time',
        description: 'Win against 3 opponents on easy difficulty',
        category: 'mastery',
        icon: '\uD83D\uDE28',
        hidden: true,
        skirmishOnly: true
    },
    {
        id: 'win_medium_v3',
        name: 'War. War never changes.',
        description: 'Win against 3 opponents on medium difficulty',
        category: 'mastery',
        icon: '\uD83E\uDE96',
        hidden: true,
        skirmishOnly: true
    },
    {
        id: 'win_hard_v3',
        name: 'I\'ve Come to Kick Ass and Chew Bubble Gum',
        description: 'Win against 3 opponents on hard difficulty',
        category: 'mastery',
        icon: '\uD83C\uDF6C',
        hidden: true,
        skirmishOnly: true
    },
    {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Win in under 30 turns on medium or hard with 3-4 players',
        category: 'mastery',
        icon: '\u26A1',
        hidden: true,
        skirmishOnly: true
    },
    {
        id: 'survivor',
        name: 'Survivor',
        description: 'Win after losing 70% of your cities while at war\nCODE: Y2K',
        category: 'mastery',
        icon: '\uD83D\uDEE1\uFE0F',
        hidden: true
    },
    {
        id: 'okie_doke',
        name: 'I do not know who I am. I don\'t know why I\'m here. All I know is I must kill',
        description: 'FUCK PEACE WARRRRRRRR!!!',
        category: 'diplomacy',
        imageIcon: 'pictures/meme-soldier.svg',
        hidden: true
    },
    {
        id: 'campaign_complete',
        name: 'When dictatorship is a fact, revolution becomes a right',
        description: 'Complete the full campaign.\nCODE: RETRO',
        category: 'mastery',
        imageIcon: 'pictures/lbs.svg',
        hidden: true
    },
    {
        id: 'completionist',
        name: 'Completionist',
        description: 'Unlock every other achievement\nCODE: OHTHEHUMANITY!',
        category: 'mastery',
        icon: '\uD83D\uDCAF',
        hidden: true
    },
];

// Register all definitions
achievementManager.registerAll(ACHIEVEMENT_DEFS);

// ── Combat checks ─────────────────────────────────

achievementManager.addCheck('combat', function(result, engine, mgr) {
    // First Blood — destroy your first enemy warrior
    if (mgr.sessionStats.kills >= 1) {
        mgr.unlock('first_blood');
    }

    // City Raider — capture an enemy city
    if (mgr.sessionStats.citiesCaptured >= 1) {
        mgr.unlock('city_raider');
    }

    // War Crime — destroy a settler while at war
    if (result.defenderDestroyed && result.defenderType === PIECE_TYPES.SETTLER) {
        var attackerPlayer = engine.players[engine.currentPlayerIndex];
        if (attackerPlayer && !attackerPlayer.isAI) {
            mgr.unlock('war_crime');
        }
    }
});

// ── Elimination checks ───────────────────────────

achievementManager.addCheck('elimination', function(elimination, engine, mgr) {
    // EXTERMINATE! — eliminate an AI player (3-4 players, medium+ difficulty)
    if (mgr.sessionStats.playersEliminated >= 1 && engine.players.length >= 3) {
        var allMediumPlus = true;
        for (var i = 0; i < engine.players.length; i++) {
            var p = engine.players[i];
            if (p.isAI) {
                var diff = p.aiDifficulty || 'medium';
                if (diff !== AI_DIFFICULTY.MEDIUM && diff !== AI_DIFFICULTY.HARD) {
                    allMediumPlus = false;
                    break;
                }
            }
        }
        if (allMediumPlus) {
            mgr.unlock('warmonger');
        }
    }
});

// ── Expansion checks ──────────────────────────────

achievementManager.addCheck('cityFounded', function(data, engine, mgr) {
    // New Horizons — found your first city with a settler
    if (mgr.sessionStats.citiesFounded >= 1) {
        mgr.unlock('new_horizons');
    }
});

achievementManager.addCheck('turnEnd', function(data, engine, mgr) {
    // Empire Builder — control 4 cities at once
    var humanId = mgr.getHumanPlayerId();
    if (humanId >= 0) {
        var cityCount = 0;
        for (var j = 0; j < engine.pieces.length; j++) {
            if (engine.pieces[j].type === PIECE_TYPES.CITY && engine.pieces[j].ownerId === humanId) {
                cityCount++;
            }
        }
        if (cityCount >= 4) {
            mgr.unlock('empire_builder');
        }
    }

    // Land Grab — own 40 tiles simultaneously
    if (mgr.sessionStats.tilesOwned >= 40) {
        mgr.unlock('land_grab');
    }
});

// ── Diplomacy checks ──────────────────────────────

achievementManager.addCheck('diplomacy', function(data, engine, mgr) {
    // Peace Broker — form peace with an enemy
    if (data.type === 'peace') {
        mgr.unlock('peace_broker');

        // Record when peace was formed (only explicit peace, not game-start default).
        // Used by Backstabber to detect quick war re-declarations.
        if (!mgr.sessionStats._peaceFormedRound) {
            mgr.sessionStats._peaceFormedRound = {};
        }
        mgr.sessionStats._peaceFormedRound[data.toPlayer] = engine.roundNumber;
    }

    // Backstabber — declare war within 10 rounds of forming peace
    if (data.type === 'war') {
        var peaceRounds = mgr.sessionStats._peaceFormedRound;
        if (peaceRounds && typeof peaceRounds[data.toPlayer] === 'number') {
            var roundsSincePeace = engine.roundNumber - peaceRounds[data.toPlayer];
            if (roundsSincePeace < 10) {
                mgr.unlock('backstabber');
            }
            // Clear the tracked peace — it's been broken
            delete peaceRounds[data.toPlayer];
        }
    }
});

// Expire stale peace tracking each turn so it doesn't linger forever
achievementManager.addCheck('turnEnd', function(data, engine, mgr) {
    var peaceRounds = mgr.sessionStats._peaceFormedRound;
    if (!peaceRounds) return;
    for (var pid in peaceRounds) {
        if (engine.roundNumber - peaceRounds[pid] >= 10) {
            delete peaceRounds[pid];
        }
    }
});

// ── Production checks ─────────────────────────────

achievementManager.addCheck('production', function(production, engine, mgr) {
    // Assembly Line — produce 30 units in a single game
    if (mgr.sessionStats.unitsProduced >= 30) {
        mgr.unlock('assembly_line');
    }

    // Tech Rush — research science 6 times in one game
    if (mgr.sessionStats.techResearched >= 6) {
        mgr.unlock('tech_rush');
    }
});

// ── Mastery checks ────────────────────────────────

achievementManager.addCheck('victory', function(data, engine, mgr) {
    // First Victory — win your first game
    mgr.unlock('first_victory');

    // Difficulty-based win achievements
    // Collect AI info: count, difficulty breakdown
    var aiCount = 0;
    var diffCounts = { easy: 0, medium: 0, hard: 0 };
    for (var i = 0; i < engine.players.length; i++) {
        var p = engine.players[i];
        if (p.isAI) {
            aiCount++;
            var diff = p.aiDifficulty || 'medium';
            if (diff === AI_DIFFICULTY.EASY) diffCounts.easy++;
            else if (diff === AI_DIFFICULTY.MEDIUM) diffCounts.medium++;
            else if (diff === AI_DIFFICULTY.HARD) diffCounts.hard++;
        }
    }

    // Speed Demon — win in under 30 turns (3-4 players, medium+ difficulty)
    if (mgr.sessionStats.roundsPlayed < 30 && engine.players.length >= 3 &&
        aiCount > 0 && (diffCounts.medium + diffCounts.hard) === aiCount) {
        mgr.unlock('speed_demon');
    }

    // Basic difficulty wins — all AI must be at or above the threshold
    if (aiCount > 0 && diffCounts.easy === aiCount) {
        mgr.unlock('win_easy');
    }
    if (aiCount > 0 && (diffCounts.medium + diffCounts.hard) === aiCount) {
        mgr.unlock('win_medium');
    }
    if (aiCount > 0 && diffCounts.hard === aiCount) {
        mgr.unlock('win_hard');
    }

    // v3 achievements — win against 3+ opponents all at that difficulty
    if (aiCount >= 3 && diffCounts.easy === aiCount) {
        mgr.unlock('win_easy_v3');
    }
    if (aiCount >= 3 && (diffCounts.medium + diffCounts.hard) === aiCount) {
        mgr.unlock('win_medium_v3');
    }
    if (aiCount >= 3 && diffCounts.hard === aiCount) {
        mgr.unlock('win_hard_v3');
    }

    // Survivor — win after losing 70% of cities while at war
    if (mgr.sessionStats._survivorEligible) {
        mgr.unlock('survivor');
    }
});

// ── Survivor tracking ─────────────────────────────
// Track peak city count when any war is active. Each turn during war,
// check if the human has lost 70%+ of that peak. Once the threshold is
// hit, set _survivorEligible and stop tracking (only victory unlocks it).
// Tracking only resets when the human is at full peace with everyone.

// Helper: check if the human player is at war with any other player
function _humanIsAtWar(engine, humanId) {
    var player = engine.players[humanId];
    if (!player || !player.relations) return false;
    for (var pid in player.relations) {
        if (player.relations[pid] === 'war') return true;
    }
    return false;
}

// Helper: count cities owned by a player
function _countCities(engine, playerId) {
    var count = 0;
    for (var j = 0; j < engine.pieces.length; j++) {
        if (engine.pieces[j].type === PIECE_TYPES.CITY && engine.pieces[j].ownerId === playerId) {
            count++;
        }
    }
    return count;
}

achievementManager.addCheck('turnEnd', function(data, engine, mgr) {
    if (mgr.sessionStats._survivorEligible) return;

    var humanId = mgr.getHumanPlayerId();
    if (humanId < 0) return;

    var atWar = _humanIsAtWar(engine, humanId);

    if (atWar && !mgr.sessionStats._survivorAtWar) {
        // War just started — snapshot peak city count
        mgr.sessionStats._survivorWarPeak = _countCities(engine, humanId);
        mgr.sessionStats._survivorAtWar = true;
    } else if (!atWar && mgr.sessionStats._survivorAtWar) {
        // Full peace restored — reset tracker
        mgr.sessionStats._survivorWarPeak = 0;
        mgr.sessionStats._survivorAtWar = false;
    }

    // Check 70% loss while at war
    if (!mgr.sessionStats._survivorAtWar) return;
    var peak = mgr.sessionStats._survivorWarPeak;
    if (!peak || peak < 2) return;

    var current = _countCities(engine, humanId);
    if ((peak - current) / peak >= 0.7) {
        // Threshold passed — lock in eligibility, stop tracking
        mgr.sessionStats._survivorEligible = true;
        mgr.sessionStats._survivorAtWar = false;
    }
});
