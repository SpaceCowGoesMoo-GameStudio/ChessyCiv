// ============================================
// DEV CONTROLS - Export Helpers
// ============================================
// JSON serialization helpers for DevGame state.

const DevExport = {
    pieceToPlain(piece) {
        if (!piece) return null;
        return {
            id: piece.id,
            type: piece.type,
            ownerId: piece.ownerId,
            row: piece.row,
            col: piece.col,
            hp: piece.hp,
            maxHp: piece.maxHp,
            damage: piece.damage,
            hasMoved: piece.hasMoved,
            production: piece.production,
            productionProgress: piece.productionProgress,
            productionPaused: piece.productionPaused || false,
            repeatProduction: piece.repeatProduction || false,
            createdOnRound: piece.createdOnRound ?? null
        };
    },

    tileToPlain(tile) {
        return {
            row: tile.row,
            col: tile.col,
            owner: tile.owner,
            piece: DevExport.pieceToPlain(tile.piece)
        };
    },

    playerToPlain(player) {
        return {
            id: player.id,
            name: player.name,
            color: player.color,
            techScore: player.techScore,
            isHuman: player.isHuman,
            isAI: player.isAI,
            aiDifficulty: player.aiDifficulty,
            relations: { ...player.relations },
            relationsChangedRound: { ...player.relationsChangedRound },
            eliminated: player.eliminated,
            warriorKills: player.warriorKills || 0,
            warriorsLost: player.warriorsLost || 0
        };
    },

    heatmapToPlain(heatmap) {
        return heatmap.map(row => Array.from(row));
    },

    gameToJSON(devGame) {
        const state = devGame.getState();
        return JSON.stringify(state, null, 2);
    },

    gameToCompactJSON(devGame) {
        const state = devGame.getState();
        return JSON.stringify(state);
    }
};
