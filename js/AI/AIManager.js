// ============================================
// AI MANAGER
// ============================================
class AIManager {
    constructor(engine) {
        this.engine = engine;
        this.aiPlayers = new Map(); // playerId -> CivChessAI
    }

    registerAIPlayer(playerId, difficulty, savedPersonality = null) {
        // All AI players are now expansionist
        const personality = AI_PERSONALITY.EXPANSIONIST;

        const ai = new CivChessAI(this.engine, playerId, personality, difficulty);
        this.aiPlayers.set(playerId, ai);

        // Save personality to game history
        if (this.engine.history) {
            this.engine.history.updatePlayerPersonality(playerId, personality);
        }

        console.log(`[AI] Registered Player ${playerId + 1} as ${personality} AI (${difficulty})`);
    }

    isAIPlayer(playerId) {
        return this.aiPlayers.has(playerId);
    }

    getAI(playerId) {
        return this.aiPlayers.get(playerId);
    }

    async executeAITurn(playerId) {
        const ai = this.aiPlayers.get(playerId);
        if (!ai) {
            console.error(`[AI] No AI registered for player ${playerId}`);
            return [];
        }

        return await ai.executeTurn();
    }
}
