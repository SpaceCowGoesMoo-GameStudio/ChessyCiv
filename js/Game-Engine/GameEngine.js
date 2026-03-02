// ============================================
// GAME ENGINE - Core Class
// ============================================
// Main class definition with constructor and core methods.
// Other modules extend this class via prototype.

class GameEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.players = [];
        this.currentPlayerIndex = 0;
        this.board = this.createEmptyBoard();
        this.pieces = [];
        this.tileOwnership = this.createEmptyBoard();
        this.actionLog = [];
        this.gameOver = false;
        this.winner = null;
        this.turnNumber = 0;
        this.roundNumber = 0; // Tracks complete rounds (all players taking a turn)
        this.history = new GameHistory();
    }

    createEmptyBoard() {
        return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    }

    log(action, details) {
        const entry = {
            turn: this.currentPlayerIndex,
            player: this.players[this.currentPlayerIndex]?.name || 'System',
            action: action,
            details: details,
            timestamp: Date.now()
        };
        this.actionLog.push(entry);
        console.log(`[${entry.player}] ${action}:`, details);
        return entry;
    }

    isValidTile(row, col) {
        return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    getPlayerCities(playerId) {
        return this.pieces.filter(p =>
            p.type === PIECE_TYPES.CITY && p.ownerId === playerId
        );
    }

    /**
     * Get the first active player (lowest index with at least one city)
     * Used to determine when a complete round has been played
     */
    getFirstActivePlayer() {
        for (let i = 0; i < this.players.length; i++) {
            if (!this.players[i].eliminated) {
                return i;
            }
        }
        return 0;
    }

    calculatePlayerScore(playerId) {
        const player = this.players[playerId];
        if (!player) return 0;

        // Cities: +25 per city currently owned
        const cities = this.pieces.filter(p => p.type === PIECE_TYPES.CITY && p.ownerId === playerId).length;

        // Tiles: +1 per tile currently owned
        let tiles = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (this.tileOwnership[r][c] === playerId) tiles++;
            }
        }

        // Warrior kills: +1 per enemy warrior destroyed (cumulative)
        const kills = player.warriorKills || 0;

        // Warriors lost: -1 per own warrior destroyed (cumulative)
        const losses = player.warriorsLost || 0;

        return cities * 25 + tiles + kills - losses;
    }

    calculatePlayerScores() {
        const scores = {};
        for (let i = 0; i < this.players.length; i++) {
            scores[i] = this.calculatePlayerScore(i);
        }
        return scores;
    }
}
