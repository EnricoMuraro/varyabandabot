import { EventEmitter } from 'events';

export default class VaryabandaGame extends EventEmitter {
    constructor(options = {}) {
        super();
        this.rounds = options.rounds ?? 100;
        this.songStartPercent = options.songStartPercent ?? 0.2; // percentage
        this.songDuration = options.songDuration ?? 20; // seconds
        this.guessLikenessPercent = options.guessLikenessPercent ?? 0.8; // percentage
        this.guessTimeLeniency = options.guessTimeLeniency ?? 1000; // milliseconds

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



    startNewRound(roundNumber, songTitle, songArtists) {
        const round = new Round();
        round.roundNumber = roundNumber;
        round.songTitle = songTitle;
        round.songArtists = songArtists;
        round.artistsGuessTimestamps = new Array(songArtists.length).fill(0);
        round.titleScorers = new Set();
        round.artistScorers = new Array(songArtists.length).fill(null).map(() => new Set());
        round.titleTimer = null;
        round.artistTimers = new Array(songArtists.length).fill(null);
        this.currentRoundIndex = this.rounds.push(round) - 1;
        this.emit('roundStart', { roundNumber, songTitle, songArtists });
    }

    finishCurrentRound() {
        const currentRound = this.rounds[this.currentRoundIndex];
        if (!currentRound) return;

        currentRound.titleTimer && clearTimeout(currentRound.titleTimer);
        currentRound.artistTimers.forEach(timer => {
            timer && clearTimeout(timer);
        });
        this.emit('roundOver', { roundNumber: currentRound.roundNumber, title: currentRound.songTitle, artists: currentRound.songArtists, scoreboard: this.scoreboard });
    }

    newGuess(userId, userName, guess, timestamp) {
        if (!this.gameStarted) return false;

        this.players.set(userId, userName);
        const currentRound = this.rounds[this.currentRoundIndex];
        if (!currentRound) return false;

        const normalizedGuess = this.normalizeTitle(guess);
        const normalizedTitle = this.normalizeTitle(currentRound.songTitle);
        // Title guess: accept correct guesses within `guessTimeLeniency` of first correct guess
        if ((currentRound.titleGuessTimestamp === 0) || ((timestamp - currentRound.titleGuessTimestamp) <= this.guessTimeLeniency)) {
            if (this.checkLikeness(normalizedGuess, normalizedTitle)) {
                if (currentRound.titleGuessTimestamp === 0) {
                    currentRound.titleGuessTimestamp = timestamp;
                    // schedule emission after leniency window
                    currentRound.titleTimer = setTimeout(() => {
                        const scorers = Array.from(currentRound.titleScorers).map(id => (this.players.get(id) ?? ""));
                        this.emit('titleGuessed', { roundNumber: currentRound.roundNumber, title: currentRound.songTitle, scorers });
                        currentRound.titleTimer = null;
                    }, this.guessTimeLeniency);
                }
                // award only once per user per title
                if (!currentRound.titleScorers.has(userId)) {
                    currentRound.titleScorers.add(userId);
                    this.addPointsToUser(userId, 2);
                }
            }
        }

        const titleGuessed = currentRound.titleGuessTimestamp !== 0;

        // Artists guesses
        let allArtistsGuessed = true;
        for (let i = 0; i < currentRound.songArtists.length; i++) {
            const artist = currentRound.songArtists[i];

            // Accept guesses if first guess not present OR within leniency window
            if ((currentRound.artistsGuessTimestamps[i] === 0) || ((timestamp - currentRound.artistsGuessTimestamps[i]) <= this.guessTimeLeniency)) {
                const normalizedArtist = this.normalizeArtist(artist);
                if (this.checkLikeness(guess, normalizedArtist)) {
                    if (currentRound.artistsGuessTimestamps[i] === 0) {
                        currentRound.artistsGuessTimestamps[i] = timestamp;
                        // schedule emission after leniency window
                        currentRound.artistTimers[i] = setTimeout(() => {
                            const scorersArr = Array.from(currentRound.artistScorers[i]).map(id => (this.players.get(id) ?? ""));
                            this.emit('artistGuessed', { roundNumber: currentRound.roundNumber, artistIndex: i, artist, scorers: scorersArr });
                            currentRound.artistTimers[i] = null;
                        }, this.guessTimeLeniency);
                    }
                    // award only once per user per artist
                    const scorers = currentRound.artistScorers[i];
                    if (!scorers.has(userId)) {
                        scorers.add(userId);
                        const points = i === 0 ? 2 : 1;
                        this.addPointsToUser(userId, points);
                    }
                }
            }

            if (currentRound.artistsGuessTimestamps[i] === 0) {
                allArtistsGuessed = false;
            }
        }
        console.log("correct guesses: ",titleGuessed, allArtistsGuessed);
        const roundComplete = titleGuessed && allArtistsGuessed;

        return roundComplete;
    }
    
    addPointsToUser(userId, points) {
        const currentScore = this.scoreboard.get(userId) ?? 0;
        this.scoreboard.set(userId, currentScore + points);
    }

    getSongTimeLimits(duration) {
        console.log('Calculating time limits for duration:', duration);
        const startSecond = Math.floor(duration * this.songStartPercent);
        const endSecond = Math.min(startSecond + this.songDuration, duration);
        return { startSecond, endSecond };
    }

    checkLikeness(guess, value) {
        const longer = guess.length > value.length ? guess : value;
        const shorter = guess.length > value.length ? value : guess;

        if (longer.length === 0) return 1.0;

        const editDistance = levenshteinDistance(shorter, longer);
        return (1.0 - (editDistance / longer.length)) >= this.guessLikenessPercent;
    }

    normalizeTitle(title) {
        title = title.replace(/^\s*the\s+/i, ''); // remove leading 'the'
        title = title.replace(/\s*\([^)]*\)\s*/g, ''); // remove text in parentheses
        title = title.replace(/\s*\[[^\]]*\]\s*/g, ''); // remove text in brackets
        title = title.replace(/feat\.?\s+[^\-+,&]+/gi, ''); // remove 'feat. Artist'
        title = title.replace(/ft\.?\s+[^\-+,&]+/gi, ''); // remove 'ft. Artist'
        title = title.replace(/&/g, 'and'); // replace & with and
        title = title.replace(/[\—\-].*/g, ''); // remove text after - or —
        title = title.replace(/[\-+,_]/g, ' '); // replace - + _ with space
        return title.trim().toLowerCase();
    }

    normalizeArtist(artist) {
        artist = artist.replace(/^\s*the\s+/i, ''); // remove leading 'the'
        artist = artist.replace(/&/g, 'and'); // replace & with and
        artist = artist.replace(/[\-+,_]/g, ' '); // replace - + _ with space
        return artist.trim().toLowerCase();
    }
}

class Round {
    roundNumber;
    songTitle;
    songArtists;
    titleGuessTimestamp = 0;
    artistsGuessTimestamps = [];
}
function levenshteinDistance(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}       