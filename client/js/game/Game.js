// Main Game Class - Coordinates all game systems
import * as THREE from 'three';
import { Scene } from './Scene.js';
import { Player } from './Player.js';
import { InputManager } from '../utils/InputManager.js';
import { GAME_CONSTANTS } from '../../../shared/constants.js';
import { SniperModel } from './SniperModel.js';

export class Game {
    constructor(network, ui, audioManager) {
        this.network = network;
        this.ui = ui;
        this.audioManager = audioManager;
        this.input = new InputManager();

        this.scene = null;
        this.player = null;
        this.opponents = new Map(); // playerId -> SniperModel

        this.running = false;
        this.lastTime = 0;

        this.gameState = {
            round: 1,
            scores: {}, // playerId -> score
            players: {}, // playerId -> {nickname}
            timeRemaining: GAME_CONSTANTS.ROUND_TIME
        };

        this.init();
    }

    init() {
        // Initialize Three.js scene
        this.scene = new Scene();

        // Initialize player
        this.player = new Player(this.scene.scene, this.scene.camera, this.input, this.network, this.ui, this.audioManager);

        // Network event listeners
        this.network.addEventListener('stateUpdate', (e) => this.onStateUpdate(e.detail));
        this.network.addEventListener('hitConfirmed', (e) => this.onHitConfirmed(e.detail));
        this.network.addEventListener('playerDied', (e) => this.onPlayerDied(e.detail));
        this.network.addEventListener('roundStart', (e) => this.onRoundStart(e.detail));
        this.network.addEventListener('roundEnd', (e) => this.onRoundEnd(e.detail));
        this.network.addEventListener('matchEnd', (e) => this.onMatchEnd(e.detail));
        this.network.addEventListener('matchReset', (e) => this.onMatchReset(e.detail));
        this.network.addEventListener('playerFired', (e) => this.onPlayerFired(e.detail));
        this.network.addEventListener('playerRespawn', (e) => this.onPlayerRespawn(e.detail));

        // Request pointer lock on click
        this.onClick = () => {
            if (this.running) {
                this.input.requestPointerLock(this.scene.renderer.domElement);
            }
        };
        document.addEventListener('click', this.onClick);
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        this.gameLoop();
    }

    gameLoop() {
        if (!this.running) return;

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.scene.render();

        requestAnimationFrame(() => this.gameLoop());
    }

    update(deltaTime) {
        if (this.player) {
            this.player.update(deltaTime);
        }
    }

    onStateUpdate(data) {
        if (data.round) {
            this.gameState.round = data.round;
            this.ui.updateRound(data.round, data.roundsToWin || GAME_CONSTANTS.ROUNDS_TO_WIN);
        }

        if (data.scores) {
            this.gameState.scores = data.scores;
        }

        if (data.timeRemaining !== undefined) {
            this.gameState.timeRemaining = data.timeRemaining;
            this.ui.updateTimer(Math.ceil(data.timeRemaining));
        }

        if (data.players) {
            this.gameState.players = data.players;
            this.ui.updateScore(this.gameState.scores, this.gameState.players, this.network.playerId);

            // Update opponents
            const currentOpponentIds = new Set(Object.keys(data.players).filter(id => id !== this.network.playerId));

            // Remove players who left
            for (const [id, model] of this.opponents) {
                if (!currentOpponentIds.has(id)) {
                    this.scene.scene.remove(model);
                    this.opponents.delete(id);
                }
            }

            // Update/Add opponents
            for (const id of currentOpponentIds) {
                this.updateOpponent(id, data.players[id]);
            }
        }
    }

    updateOpponent(id, opponentData) {
        let opponent = this.opponents.get(id);
        if (!opponent) {
            opponent = this.createOpponentMesh();
            this.opponents.set(id, opponent);
        }

        if (opponentData.nickname && opponent.setName && !opponent.hasName) {
            opponent.setName(opponentData.nickname);
            opponent.hasName = true;
        }

        if (opponentData.position) {
            opponent.position.set(
                opponentData.position.x,
                opponentData.position.y,
                opponentData.position.z
            );
        }

        if (opponentData.rotation) {
            opponent.rotation.y = opponentData.rotation.yaw || 0;
        }

        opponent.visible = !opponentData.isDead;
    }

    createOpponentMesh() {
        const mesh = new SniperModel();
        this.scene.scene.add(mesh);
        return mesh;
    }

    onHitConfirmed(data) {
        // Play hit sound for both shooter and victim
        if (data.shooterId === this.network.playerId || data.victimId === this.network.playerId) {
            this.audioManager.playHit();
        }

        if (data.fatal) {
            if (data.hitbox === 'HEAD') {
                this.audioManager.playHeadshotKill();
            } else {
                this.audioManager.playKilled();
            }
        }

        if (data.shooterId === this.network.playerId) {
            const shooter = 'You';
            const victim = data.victimNickname || 'Enemy';
            this.ui.showHitMarker(data.hitbox === 'HEAD');

            if (data.fatal) {
                this.ui.addKillFeedEntry(shooter, victim, data.hitbox === 'HEAD');
            }
        } else if (data.victimId === this.network.playerId) {
            const shooter = data.shooterNickname || 'Enemy';
            const victim = 'You';

            if (data.fatal) {
                this.ui.addKillFeedEntry(shooter, victim, data.hitbox === 'HEAD');
            }

            this.ui.showDamageIndicator();
            this.player.takeDamage(data.damage);
        }
    }

    onPlayerDied(data) {
        if (data.victimId === this.network.playerId) {
            this.player.die();
        }
    }

    onRoundStart(data) {
        console.log('Game: Round Start', data);
        if (this.player && data.spawns && data.spawns[this.network.playerId]) {
            const spawnInfo = data.spawns[this.network.playerId];
            this.player.respawn(spawnInfo.spawnPosition, spawnInfo.spawnRotation);
        }
        this.gameState.round = data.round;
        this.ui.updateRound(data.round, data.roundsToWin || GAME_CONSTANTS.ROUNDS_TO_WIN);

        if (data.players) {
            this.gameState.players = data.players;
        }
        this.ui.updateScore(this.gameState.scores, this.gameState.players, this.network.playerId);
    }

    onRoundEnd(data) {
        const won = data.winnerId === this.network.playerId;
        this.ui.showRoundEnd(won, data.reason);
        this.gameState.scores = data.scores;
        this.ui.updateScore(this.gameState.scores, this.gameState.players, this.network.playerId);
    }

    onMatchEnd(data) {
        const won = data.winnerId === this.network.playerId;
        this.ui.showMatchEnd(won, data.scores, this.gameState.players);
        // Don't stop running loop immediately, wait for user action
        // this.running = false; 
    }

    onMatchReset(data) {
        console.log('Game: Match Reset', data);
        this.gameState.round = data.round;
        this.gameState.scores = data.scores;
        this.gameState.timeRemaining = GAME_CONSTANTS.ROUND_TIME;

        this.ui.hideAllScreens();
        this.ui.showHUD();
        this.ui.updateRound(data.round, data.roundsToWin || GAME_CONSTANTS.ROUNDS_TO_WIN);
        this.ui.updateScore(this.gameState.scores, this.gameState.players, this.network.playerId);

        // Reset player 
        // Use default spawn for now until server sends specific spawn
        this.player.respawn(null);
        this.running = true;
        this.gameLoop();
    }

    onPlayerFired(data) {
        if (data.shooterId !== this.network.playerId) {
            this.audioManager.playShot();
        }
    }

    onPlayerRespawn(data) {
        if (data.playerId === this.network.playerId) {
            this.player.respawn(data.position, data.rotation);
        }
    }

    destroy() {
        this.running = false;
        document.removeEventListener('click', this.onClick);
        if (this.scene) this.scene.dispose();
        if (this.input) this.input.exitPointerLock();
    }
}
