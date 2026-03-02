// ============================================
// GAME SCENE - UI Updates Module
// ============================================
// UI state updates and refresh logic.

GameScene.prototype.updateUI = function() {
    const currentPlayer = this.engine.getCurrentPlayer();

    // Update turn text - neon terminal style (uppercase)
    const aiIndicator = currentPlayer.isAI ? ' (AI)' : '';
    this.turnText.setText(`TURN: ${currentPlayer.name.toUpperCase()}${aiIndicator}`);
    this.turnText.setColor(currentPlayer.color.css);

    // Disable Next Turn button during AI turns
    if (this.nextTurnBtn) {
        const isAITurn = currentPlayer.isAI || this.isAITurnInProgress;
        if (isAITurn) {
            this.nextTurnBtn.disableInteractive();
            this.nextTurnBtn.bg.setAlpha(0.5);
            this.nextTurnBtn.label.setAlpha(0.5);
        } else {
            this.nextTurnBtn.setInteractive({ useHandCursor: true });
            // Reset to default state (clear any hover color)
            this.nextTurnBtn.bg.setFillStyle(COLORS.buttonBg);
            this.nextTurnBtn.bg.setAlpha(1);
            this.nextTurnBtn.label.setAlpha(1);
        }
    }

    // Update container glow to match current player color
    if (!this._cachedGameContainer) {
        this._cachedGameContainer = document.getElementById('game-container');
    }
    if (this._cachedGameContainer) {
        this._cachedGameContainer.style.boxShadow = `0 0 30px ${currentPlayer.color.css}50`;
    }

    // Update tech text - neon terminal style
    this.techText.setText(`TECH: ${currentPlayer.techScore}`);

    // Update open popups so they reflect current game state during AI turns
    if (this.playersPopup && this.playersPopup.visible) {
        this.updatePlayersPopup();
    }
    if (this.relationsPopup && this.relationsPopup.visible) {
        this.updateRelationsPopup();
    }

    // Update player entries (desktop only, skip if using mobile popup)
    if (this.isMobilePlayersPopup) {
        // Mobile mode - entries are in popup, not inline
    } else {
        this.playerEntries.forEach((entry, i) => {
        if (i < this.engine.players.length) {
            const player = this.engine.players[i];
            entry.setVisible(true);
            entry.colorDot.setFillStyle(player.color.hex);

            // Check if at war with this player (war or peace_proposed means still at war)
            const myRelation = currentPlayer.relations[i];
            const theirRelation = player.relations[this.engine.currentPlayerIndex];
            const atWar = myRelation === 'war' || myRelation === 'peace_proposed' ||
                          theirRelation === 'war' || theirRelation === 'peace_proposed';

            // Show red sword if at war
            const warIndicator = atWar ? ' \u2694' : '';
            entry.nameText.setText(player.name + warIndicator);
            if (atWar) {
                entry.nameText.setColor('#ff4444');
            } else {
                entry.nameText.setColor(COLORS.textPrimary);
            }

            const techLevel = this.engine.players[i].techScore;
            entry.relationText.setText(`Tech: ${techLevel}`);

            // Show diplomacy button for other players
            const hasCities = !this.engine.players[i].eliminated;
            const isAITurn = currentPlayer.isAI || this.isAITurnInProgress;
            if (i !== this.engine.currentPlayerIndex && hasCities) {
                entry.diplomacyBtn.setVisible(true);

                // Disable diplomacy buttons during AI turns
                if (isAITurn) {
                    entry.diplomacyBtn.disableInteractive();
                    entry.diplomacyBtn.bg.setAlpha(0.5);
                    entry.diplomacyBtn.label.setAlpha(0.5);
                } else {
                    entry.diplomacyBtn.setInteractive({ useHandCursor: true });
                    entry.diplomacyBtn.bg.setAlpha(1);
                    entry.diplomacyBtn.label.setAlpha(1);
                }

                // Check if they have proposed peace to us
                const theyProposedPeace = theirRelation === 'peace_proposed';
                const weProposedPeace = myRelation === 'peace_proposed';

                let buttonText;
                let buttonColor;

                if (myRelation === 'peace' && theirRelation === 'peace') {
                    // At peace - can declare war
                    buttonText = entry.compact ? 'War' : 'Declare War';
                    buttonColor = COLORS.textPrimary;
                } else if (theyProposedPeace) {
                    // They proposed peace - we can accept
                    buttonText = entry.compact ? 'Accept' : 'Accept Peace';
                    buttonColor = '#ffffff';
                } else if (weProposedPeace) {
                    // We proposed peace - click to rescind
                    buttonText = entry.compact ? 'Rescind' : 'Rescind Peace';
                    buttonColor = '#ff8800';
                } else {
                    // At war - can propose peace
                    buttonText = entry.compact ? 'Peace' : 'Propose Peace';
                    buttonColor = COLORS.textPrimary;
                }

                entry.diplomacyBtn.label.setText(buttonText);
                entry.diplomacyBtn.label.setColor(buttonColor);
            } else {
                entry.diplomacyBtn.setVisible(false);
            }
        } else {
            entry.setVisible(false);
        }
        });
    }

    // Check for victory
    if (this.engine.gameOver) {
        this.showVictoryScreen();
    }
};

GameScene.prototype.updateSelectedInfo = function() {
    const isMobile = layoutConfig.mobile;

    if (!this.selectedPiece) {
        this.selectedInfoText.setText('NONE');
        this.productionButtons.forEach(({ btn }) => btn.setVisible(false));
        this.repeatToggle.container.setVisible(false);
        this.settleBtn.setVisible(false);
        // Hide action buttons (mobile and desktop)
        if (this.mobileProductionBtn) this.mobileProductionBtn.setVisible(false);
        if (this.mobileSettleBtn) this.mobileSettleBtn.setVisible(false);
        if (this.desktopProductionBtn) this.desktopProductionBtn.setVisible(false);
        return;
    }

    const piece = this.selectedPiece.pieceData;
    const owner = this.engine.players[piece.ownerId];
    console.log(piece.type)

    // Neon terminal style - uppercase text
    let info = `TYPE: ${piece.type.toUpperCase()}\n`;
    info += `HP: ${piece.hp}/${piece.maxHp}\n`;

    if (piece.type === PIECE_TYPES.WARRIOR) {
        info += `DMG: ${piece.damage}\n`;
    }

    if (piece.type === PIECE_TYPES.CITY && piece.production) {
        const prodType = PRODUCTION_TYPES[piece.production];
        info += `BUILDING: ${prodType.name.toUpperCase()}\n`;
        if (piece.productionPaused) {
            info += 'BLOCKED';
        } else {
            info += `PROGRESS: ${piece.productionProgress}/${prodType.turns}`;
        }
    }

    this.selectedInfoText.setText(info);

    // Show/hide production buttons for owned cities
    const isOwnedCity = piece.type === PIECE_TYPES.CITY &&
                        piece.ownerId === this.engine.currentPlayerIndex;

    // Both mobile and desktop now use popup for production
    this.productionButtons.forEach(({ btn }) => btn.setVisible(false));
    this.repeatToggle.container.setVisible(false);

    if (isMobile) {
        if (this.mobileProductionBtn) {
            this.mobileProductionBtn.setVisible(isOwnedCity);
        }
    } else {
        if (this.desktopProductionBtn) {
            this.desktopProductionBtn.setVisible(isOwnedCity);
        }
    }

    // Close production popup if not selecting an owned city
    if (!isOwnedCity) {
        this.hideProductionPopup();
    }

    // Show/hide settle button for owned settlers - neon terminal style
    const isOwnedSettler = piece.type === PIECE_TYPES.SETTLER &&
                           piece.ownerId === this.engine.currentPlayerIndex;

    // On mobile, use the mobile Settle button
    if (isMobile) {
        this.settleBtn.setVisible(false);
        if (this.mobileSettleBtn) {
            this.mobileSettleBtn.setVisible(isOwnedSettler);
            if (isOwnedSettler) {
                const canSettle = this.engine.canSettlerBuildCity(piece);
                this.mobileSettleBtn.bg.setFillStyle(canSettle.valid ? COLORS.buttonBg : COLORS.buttonBg);
                this.mobileSettleBtn.bg.setStrokeStyle(1, canSettle.valid ? 0x00ff88 : 0x00d4ff33);
                this.mobileSettleBtn.bg.setAlpha(canSettle.valid ? 1 : 0.5);
                this.mobileSettleBtn.label.setAlpha(canSettle.valid ? 1 : 0.5);
                this.mobileSettleBtn.label.setColor(canSettle.valid ? COLORS.accentGreen : COLORS.textPrimary);
            }
        }
    } else {
        // Desktop uses the main settle button
        if (isOwnedSettler) {
            const canSettle = this.engine.canSettlerBuildCity(piece);
            this.settleBtn.setVisible(true);
            this.settleBtn.bg.setFillStyle(canSettle.valid ? COLORS.buttonBg : COLORS.buttonBg);
            this.settleBtn.bg.setStrokeStyle(1, canSettle.valid ? 0x00ff88 : 0x00d4ff33);
            this.settleBtn.bg.setAlpha(canSettle.valid ? 1 : 0.5);
            this.settleBtn.label.setAlpha(canSettle.valid ? 1 : 0.5);
            this.settleBtn.label.setColor(canSettle.valid ? COLORS.accentGreen : COLORS.textPrimary);
        } else {
            this.settleBtn.setVisible(false);
        }
    }
};

GameScene.prototype.updatePlayersPopup = function() {
    if (!this.popupPlayerEntries) return;

    const currentPlayer = this.engine.getCurrentPlayer();

    this.popupPlayerEntries.forEach((entry, i) => {
        if (i < this.engine.players.length) {
            const player = this.engine.players[i];
            entry.setVisible(true);
            entry.colorDot.setFillStyle(player.color.hex);

            // Check if at war with this player
            const myRelation = currentPlayer.relations[i];
            const theirRelation = player.relations[this.engine.currentPlayerIndex];
            const atWar = myRelation === 'war' || myRelation === 'peace_proposed' ||
                          theirRelation === 'war' || theirRelation === 'peace_proposed';

            // Show red sword if at war
            const warIndicator = atWar ? ' \u2694' : '';
            const statusIndicator = this.engine.players[i].eliminated ? ' [ELIMINATED]' : '';
            entry.nameText.setText(player.name + warIndicator + statusIndicator);
            if (atWar) {
                entry.nameText.setColor('#ff4444');
            } else if (statusIndicator) {
                entry.nameText.setColor('#666666');
            } else {
                entry.nameText.setColor(COLORS.textPrimary);
            }

            const techLevel = player.techScore;
            entry.techText.setText(`Tech Level: ${techLevel}`);

            // Show diplomacy button for other players who are still alive
            const hasCities = !this.engine.players[i].eliminated;
            const isAITurn = currentPlayer.isAI || this.isAITurnInProgress;
            if (i !== this.engine.currentPlayerIndex && hasCities) {
                entry.diplomacyBtn.setVisible(true);

                // Disable diplomacy buttons during AI turns
                if (isAITurn) {
                    entry.diplomacyBtn.disableInteractive();
                    entry.diplomacyBtn.bg.setAlpha(0.5);
                    entry.diplomacyBtn.label.setAlpha(0.5);
                } else {
                    entry.diplomacyBtn.setInteractive({ useHandCursor: true });
                    entry.diplomacyBtn.bg.setAlpha(1);
                    entry.diplomacyBtn.label.setAlpha(1);
                }

                // Check if they have proposed peace to us
                const theyProposedPeace = theirRelation === 'peace_proposed';
                const weProposedPeace = myRelation === 'peace_proposed';

                let buttonText;
                let buttonColor;

                if (myRelation === 'peace' && theirRelation === 'peace') {
                    buttonText = 'Declare War';
                    buttonColor = COLORS.textPrimary;
                } else if (theyProposedPeace) {
                    buttonText = 'Accept Peace';
                    buttonColor = '#ffffff';
                } else if (weProposedPeace) {
                    buttonText = 'Rescind Peace';
                    buttonColor = '#ff8800';
                } else {
                    buttonText = 'Propose Peace';
                    buttonColor = COLORS.textPrimary;
                }

                entry.diplomacyBtn.label.setText(buttonText);
                entry.diplomacyBtn.label.setColor(buttonColor);
            } else {
                entry.diplomacyBtn.setVisible(false);
            }
        } else {
            entry.setVisible(false);
        }
    });
};

GameScene.prototype.updateProductionPopup = function() {
    if (!this.popupProductionButtons || !this.selectedPiece) return;

    const piece = this.selectedPiece.pieceData;
    if (piece.type !== PIECE_TYPES.CITY) return;

    const blocked = this.blockedProductions || [];

    this.popupProductionButtons.forEach(({ btn, type }) => {
        const isSelected = piece.production === type;
        btn.selected = isSelected;

        // Disable repair button if city is at full health
        // Disable heal warriors button if no wounded adjacent warriors
        // Disable scenario-blocked production types
        const isDisabled = (type === 'REPAIR' && piece.hp >= piece.maxHp) ||
            (type === 'HEAL_WARRIORS' && !this.engine.hasWoundedAdjacentWarrior(piece)) ||
            (blocked.indexOf(type) !== -1);
        if (isDisabled) {
            btn.bg.setFillStyle(COLORS.buttonBg);
            btn.bg.setAlpha(0.5);
            btn.bg.setStrokeStyle(1, 0x00d4ff);
            btn.label.setAlpha(0.5);
            btn.label.setColor(COLORS.textPrimary);
        } else if (isSelected) {
            btn.bg.setFillStyle(0x00ff88);
            btn.bg.setAlpha(0.25);
            btn.bg.setStrokeStyle(1, 0x00ff88);
            btn.label.setAlpha(1);
            btn.label.setColor('#000000');
        } else {
            btn.bg.setFillStyle(COLORS.buttonBg);
            btn.bg.setAlpha(1);
            btn.bg.setStrokeStyle(1, COLORS.buttonBorder);
            btn.label.setAlpha(1);
            btn.label.setColor(COLORS.textPrimary);
        }
    });

    // Update repeat toggle
    if (this.popupRepeatToggle) {
        this.popupRepeatToggle.setEnabled(piece.repeatProduction || false);
    }
};
