import {EventEmitter} from 'events';

export default class VaryatriviaGame extends EventEmitter {
    constructor(options = {}) {
        super();
        this.songStartPercent = options.songStartPercent ?? 0.2;
        this.songDuration = options.songDuration ?? 10; // seconds
        this.pointsPerGuess = options.pointsPerGuess ?? 10;
        this.pointsPenalty = options.pointsPenalty ?? 2;
        this.optionsPerRound = options.optionsPerRound ?? 4;

        this.gameStarted = false;
        this.scoreboard = new Map();
        this.currentRoundIndex = -1;
        this.rounds = [];
        this.players = new Map();
    }

    start() {
        this.gameStarted = true;
        this.scoreboard = new Map();
        this.currentRoundIndex = -1;
        this.rounds = [];
        this.players = new Map();
    }

    stop() {
        this.gameStarted = false;
    }

    startNewRound(roundNumber, answer) {
        const round = new Round(roundNumber, answer);
        this.currentRoundIndex = this.rounds.push(round) - 1;
    }

    finishCurrentRound() {
        const currentRound = this.rounds[this.currentRoundIndex];
        if (!currentRound) return;

        newPoints = new Map();
        for (const [userId, guessInfo] of currentRound.guesses.entries()) {
            if (guessInfo.points > 0) {
                newPoints.set(userId, guessInfo.points);
            }
        }
        this.emit('roundOver', {
            roundNumber: currentRound.roundNumber,
            correctAnswer: currentRound.correctAnswer,
            scoreboard: this.scoreboard,
            newPoints,
        });
    }

    newGuess(userId, userName, guess, timestamp) {
        if (!this.gameStarted) return false;

        this.players.set(userId, userName);
        const currentRound = this.rounds[this.currentRoundIndex];
        if (!currentRound) return false;

        if (currentRound.guesses.has(userId)) {
            // User has already guessed this round
            return false;
        }

        const normalizedGuess = guess.trim().toLowerCase();
        //check if normalizedGuess string is a number between 1 and optionsPerRound
        try {
            const guessNumber = parseInt(normalizedGuess);
            if (guessNumber < 1 || guessNumber > this.optionsPerRound) {
                return false;
            }
            let points = 0;
            if (guessNumber === currentRound.correctAnswer) {
                points = Math.max(this.pointsPerGuess - (this.pointsPenalty * currentRound.correctGuesses), 1); // minimum 1 point
                this.scoreboard.set(userId, (this.scoreboard.get(userId) ?? 0) + points);
                currentRound.correctGuesses += 1;
            }
            
            currentRound.guesses.set(userId, { guess: guessNumber, points, timestamp });
            return true;

        } catch {
            return false;
        }
    }

    getTriviaOptions(tracks, fillerTracks) {
        //remove tracks in fillerTracks that are also in tracks by id
        fillerTracks = fillerTracks.filter(fillerTrack => {
            return !tracks.some(track => track.id === fillerTrack.id);
        });

        //randomize the fillerTracks array
        fillerTracks = fillerTracks.sort(() => Math.random() - 0.5);
        let fillerTrackIndex = 0;

        let triviaTracks = []
        let answers = [];

        for (const track of tracks) {
            triviaTracks.push(new Array(this.optionsPerRound).fill(null));
            const correctIndex = Math.floor(Math.random() * this.optionsPerRound);
            triviaTracks[triviaTracks.length - 1][correctIndex] = track;
            answers.push(correctIndex + 1); // +1 to make it 1-based index

            for (let i = 0; i < this.optionsPerRound; i++) {
                if (triviaTracks[triviaTracks.length - 1][i] === null) {
                    triviaTracks[triviaTracks.length - 1][i] = fillerTracks[fillerTrackIndex];
                    fillerTrackIndex += 1;
                }
            }
        }
    }

    getSongTimeLimits(audioInfo) {
        console.log('Calculating time limits for duration:', audioInfo.duration);
        let startSecond = 0;

        if (audioInfo.mostReplayed !== null)
            startSecond = Math.min(audioInfo.mostReplayed, audioInfo.duration - this.songDuration);
        else
            startSecond = Math.floor(audioInfo.duration * this.songStartPercent);

        const endSecond = Math.min(startSecond + this.songDuration, audioInfo.duration);
        return { startSecond, endSecond };
    }
}

class Round {
    roundNumber;
    correctAnswer;
    guesses = new Map();
    correctGuesses = 0;

    constructor(roundNumber, correctAnswer) {
        this.roundNumber = roundNumber;
        this.correctAnswer = correctAnswer;
    }
}