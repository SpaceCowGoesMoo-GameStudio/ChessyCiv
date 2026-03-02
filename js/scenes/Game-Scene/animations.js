// ============================================
// GAME SCENE - Animations Module (DOM-based)
// ============================================
// Movement animations and combat bump effects.
// Uses TweenManager (plain-object targets with x, y, alpha, scale, rotation).
// All Phaser `this.time.delayedCall` replaced with `this.delayedCall`.

GameScene.prototype.playBumpAnimation = function(attackerSprite, result, attackerPiece) {
    this.playAttackSound();

    const originalX = BOARD_OFFSET + result.originalPos.col * TILE_SIZE + TILE_SIZE / 2;
    const originalY = BOARD_OFFSET + result.originalPos.row * TILE_SIZE + TILE_SIZE / 2;
    const targetX = BOARD_OFFSET + result.targetPos.col * TILE_SIZE + TILE_SIZE / 2;
    const targetY = BOARD_OFFSET + result.targetPos.row * TILE_SIZE + TILE_SIZE / 2;

    // Bump point — halfway between attacker and defender
    const bumpX = (originalX + targetX) / 2;
    const bumpY = (originalY + targetY) / 2;

    // Get defender sprite
    const defenderPiece = this.engine.board[result.targetPos.row][result.targetPos.col];
    const defenderSprite = defenderPiece ? this.pieceSprites.get(defenderPiece.id) : null;

    // Check if this is a city capture
    const isCityCapture = result.combat && result.combat.cityFlipped;

    // Animate attacker moving toward target then bouncing back
    this.tweens.add({
        targets: attackerSprite,
        x: bumpX,
        y: bumpY,
        duration: 100,
        ease: 'Quad.easeOut',
        onComplete: () => {
            // Bounce back to original position
            this.tweens.add({
                targets: attackerSprite,
                x: originalX,
                y: originalY,
                duration: 150,
                ease: 'Back.easeOut',
                onComplete: () => {
                    // Update UI after animation completes
                    this.updatePieceSprite(attackerPiece);

                    // Handle city capture: delete old sprite and create new one for new owner
                    if (isCityCapture && defenderPiece) {
                        const oldSpriteId = defenderPiece.id;
                        const oldSprite = this.pieceSprites.get(oldSpriteId);
                        if (oldSprite) {
                            oldSprite.destroy();
                            this.pieceSprites.delete(oldSpriteId);
                            this.playCityCapture();
                        }
                        // Create new sprite for the captured city (now owned by attacker)
                        this.createPieceSprite(defenderPiece);
                        this.drawOwnership();

                        // Handle player elimination if it occurred
                        if (result.combat.elimination && result.combat.elimination.eliminated) {
                            this.handleEliminationAnimation(result.combat.elimination);
                            this.playCivDeath();
                        }
                    } else if (defenderPiece) {
                        this.updatePieceSprite(defenderPiece);
                    }
                    this.updateUI();
                }
            });
        }
    });

    // If defender is a warrior (not a city), animate mutual bump
    if (defenderSprite && defenderPiece && defenderPiece.type === PIECE_TYPES.WARRIOR) {
        // Calculate defender's bump point (toward attacker)
        const defenderBumpX = (targetX + originalX) / 2;
        const defenderBumpY = (targetY + originalY) / 2;

        this.tweens.add({
            targets: defenderSprite,
            x: defenderBumpX,
            y: defenderBumpY,
            duration: 100,
            ease: 'Quad.easeOut',
            onComplete: () => {
                // Bounce back to original position
                this.tweens.add({
                    targets: defenderSprite,
                    x: targetX,
                    y: targetY,
                    duration: 150,
                    ease: 'Back.easeOut'
                });
            }
        });
    }
};

GameScene.prototype.onMoveSuccess = function(piece, result, numberPieces) {
    // Handle blocked attack with bump animation
    if (result.blocked) {
        const sprite = this.pieceSprites.get(piece.id);
        if (sprite) {
            this.playBumpAnimation(sprite, result, piece);
        }
        return;
    }

    // Play piece drop sound effect
    this.playPieceDropSoundHuman();

    // Update sprite position
    this.updatePieceSprite(piece);

    // Handle combat results
    if (result.combat) {
        // Log combat in dev mode
        if (typeof uiController !== 'undefined' && uiController.settings.devMode) {
            const attacker = this.engine.players[piece.ownerId];
            if (result.combat.defenderDestroyed) {
                uiController.log(`Combat: ${attacker.name} destroyed enemy at (${result.targetPos.row},${result.targetPos.col})`, 'warning');
            } else if (result.combat.cityFlipped) {
                uiController.log(`Combat: ${attacker.name} captured city at (${result.targetPos.row},${result.targetPos.col})!`, 'success');
            } else {
                uiController.log(`Combat: ${attacker.name} attacked (${result.targetPos.row},${result.targetPos.col})`, 'info');
            }
        }

        if (result.combat.defenderDestroyed && !result.combat.cityFlipped) {
            this.removePieceSprite(result.combat.defender);
        }
    }

    // Update ownership display
    this.drawOwnership();
    this.updateUI();
};

GameScene.prototype.onMoveSuccessAnimated = function(piece, result, numberPieces) {
    const sprite = this.pieceSprites.get(piece.id);
    if (!sprite) return;

    // Clear highlights immediately
    this.clearHighlights();

    // Handle blocked attack with bump animation
    if (result.blocked) {
        this.playBumpAnimation(sprite, result, piece);
        this.deselectPiece();
        return;
    }

    // Play piece drop sound effect
    this.playPieceDropSoundHuman();

    const targetX = BOARD_OFFSET + piece.col * TILE_SIZE + TILE_SIZE / 2;
    const targetY = BOARD_OFFSET + piece.row * TILE_SIZE + TILE_SIZE / 2;

    // Animate the piece movement
    this.tweens.add({
        targets: sprite,
        x: targetX,
        y: targetY,
        duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => {
            // Sync sprite state (position, grayscale, health bar, etc.)
            this.updatePieceSprite(piece);

            // Handle combat results
            if (result.combat) {
                if (result.combat.defenderDestroyed && !result.combat.cityFlipped) {
                    this.removePieceSprite(result.combat.defender);
                }
            }

            // Update ownership display
            this.drawOwnership();
            this.updateUI();
            this.deselectPiece();
        }
    });
};
