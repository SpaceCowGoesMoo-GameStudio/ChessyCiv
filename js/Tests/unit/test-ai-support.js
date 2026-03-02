// ============================================
// UNIT TESTS - AI Support Module
// ============================================

describe('GameEngine AI Support', function() {
    it('getGamePhase returns early for fresh game', function() {
        const e = createEngine(2);
        assert.equal(e.getGamePhase(), 'early');
    });

    it('getGamePhase returns late for high turn count', function() {
        const e = createEngine(2);
        e.turnNumber = 50;
        assert.equal(e.getGamePhase(), 'late');
    });

    it('getGamePhase returns mid for moderate game', function() {
        const e = createEngine(4);
        e.turnNumber = 20;
        // 4 players with cities, avgCities < 3
        assert.equal(e.getGamePhase(), 'mid');
    });

    it('getThreatHeatmap returns 10x10 array', function() {
        const e = createEngine(2);
        const heatmap = e.getThreatHeatmap(0);
        assert.equal(heatmap.length, BOARD_SIZE);
        assert.equal(heatmap[0].length, BOARD_SIZE);
    });

    it('getThreatHeatmap all zeros when no enemies at war', function() {
        const e = createEngine(2);
        // At peace by default
        const heatmap = e.getThreatHeatmap(0);
        let sum = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                sum += heatmap[r][c];
        assert.equal(sum, 0);
    });

    it('getThreatHeatmap non-zero when at war', function() {
        const e = createEngine(2);
        e.players[0].relations[1] = 'war';
        e.players[1].relations[0] = 'war';
        const heatmap = e.getThreatHeatmap(0);
        let sum = 0;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                sum += heatmap[r][c];
        assert.ok(sum > 0);
    });

    it('getOpportunityHeatmap returns 10x10 array', function() {
        const e = createEngine(2);
        const heatmap = e.getOpportunityHeatmap(0);
        assert.equal(heatmap.length, BOARD_SIZE);
    });

    it('getTerritoryHeatmap returns values in [-1, 1]', function() {
        const e = createEngine(2);
        const heatmap = e.getTerritoryHeatmap(0);
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                assert.ok(heatmap[r][c] >= -1 && heatmap[r][c] <= 1,
                    `Value ${heatmap[r][c]} at (${r},${c}) out of range`);
            }
        }
    });

    it('getExpansionHeatmap marks invalid locations as -1', function() {
        const e = createEngine(2);
        const heatmap = e.getExpansionHeatmap(0);
        // City locations and adjacent tiles should be -1
        const cities = e.pieces.filter(p => p.type === PIECE_TYPES.CITY);
        for (const city of cities) {
            assert.equal(heatmap[city.row][city.col], -1);
        }
    });

    it('getPlayerStrength returns correct structure', function() {
        const e = createEngine(2);
        const strength = e.getPlayerStrength(0);
        assert.ok(strength !== null);
        assert.ok(typeof strength.military === 'number');
        assert.ok(typeof strength.economic === 'number');
        assert.ok(typeof strength.expansion === 'number');
        assert.ok(typeof strength.technology === 'number');
        assert.ok(typeof strength.territory === 'number');
        assert.ok(typeof strength.total === 'number');
        assert.ok(strength.breakdown);
    });

    it('getPlayerStrength military includes warrior stats', function() {
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const strength = e.getPlayerStrength(0);
        // military = hp + damage*2 = 1 + 1*2 = 3
        assert.equal(strength.military, 3);
    });

    it('getPlayerStrength returns null for invalid player', function() {
        const e = createEngine(2);
        assert.equal(e.getPlayerStrength(99), null);
    });

    it('getRelativeStrength returns advantage assessment', function() {
        const e = createEngine(2);
        const rel = e.getRelativeStrength(0, 1);
        assert.ok(rel !== null);
        assert.ok(['strong', 'even', 'weak'].includes(rel.advantage));
        assert.ok(typeof rel.ratio === 'number');
    });

    it('simulateMove returns valid result for legal move', function() {
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const result = e.simulateMove(w, 5, 6);
        assert.ok(result.valid);
        assert.equal(result.combat, null);
    });

    it('simulateMove predicts combat without mutating state', function() {
        const e = createScenario(2);
        e.players[0].relations[1] = 'war';
        e.players[1].relations[0] = 'war';
        const attacker = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 5);
        const defender = placePiece(e, PIECE_TYPES.WARRIOR, 1, 5, 6);
        const defHpBefore = defender.hp;

        const result = e.simulateMove(attacker, 5, 6);
        assert.ok(result.valid);
        assert.ok(result.combat);
        assert.ok(result.combat.defenderDestroyed);
        // Original state unchanged
        assert.equal(defender.hp, defHpBefore);
    });

    it('simulateMove returns invalid for illegal move', function() {
        const e = createScenario(2);
        const w = placePiece(e, PIECE_TYPES.WARRIOR, 0, 5, 5);
        w.hasMoved = true;
        const result = e.simulateMove(w, 5, 6);
        assert.equal(result.valid, false);
    });

    it('getGameStateForAI returns comprehensive state', function() {
        const e = createEngine(2);
        const state = e.getGameStateForAI(0);
        assert.ok(state);
        assert.equal(state.playerId, 0);
        assert.ok(state.ownPieces);
        assert.ok(state.ownPieces.cities.length >= 1);
        assert.ok(state.ownPieces.warriors.length >= 1);
        assert.ok(state.enemyPieces);
        assert.ok(state.territory);
        assert.ok(state.gamePhase);
    });

    it('getStrategicPositions returns categorized positions', function() {
        const e = createEngine(2);
        const pos = e.getStrategicPositions(0);
        assert.ok(Array.isArray(pos.chokepoints));
        assert.ok(Array.isArray(pos.contestedBorders));
        assert.ok(Array.isArray(pos.vulnerableCities));
        assert.ok(Array.isArray(pos.defensivePositions));
    });
});
