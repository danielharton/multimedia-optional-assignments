window.onload = function () {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const guessButton = document.getElementById('guess');
    const newGameButton = document.getElementById('new-game');
    const helpButton = document.getElementById('help');
    const continuousToggle = document.getElementById('continuous-toggle');
    const multiplayerToggle = document.getElementById('multiplayer-toggle');
    const difficultySelect = document.getElementById('difficulty');
    const languageSelect = document.getElementById('language');
    const voiceSelect = document.getElementById('voice');
    const rateSlider = document.getElementById('rate');
    const pitchSlider = document.getElementById('pitch');
    const volumeSlider = document.getElementById('volume');
    const transcriptEl = document.getElementById('transcript');
    const historyEl = document.getElementById('history');
    const attemptsEl = document.getElementById('attempts');
    const rangeLabelEl = document.getElementById('range-label');
    const hintTextEl = document.getElementById('hint-text');
    const timerEl = document.getElementById('timer');
    const bestScoreEl = document.getElementById('best-score');
    const avgTimeEl = document.getElementById('avg-time');
    const winLossEl = document.getElementById('win-loss');
    const achievementsEl = document.getElementById('achievements');
    const currentPlayerEl = document.getElementById('current-player');
    const rangeCanvas = document.getElementById('rangeCanvas');
    const statsCanvas = document.getElementById('statsCanvas');
    const rangeCtx = rangeCanvas.getContext('2d');
    const statsCtx = statsCanvas.getContext('2d');

    if (!SpeechRecognition) {
        hintTextEl.textContent = "Browser does not support SpeechRecognition.";
        guessButton.disabled = true;
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = languageSelect.value;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const synth = window.speechSynthesis;
    let voices = [];
    let listeningTimeout;
    let timerInterval;

    const difficulties = { easy: 50, medium: 100, hard: 1000 };
    let targetNumber = 0;
    let minRange = 1;
    let upperBound = difficulties[difficultySelect.value];
    let maxRange = upperBound;
    let attempts = 0;
    let gameActive = true;
    let startTime = performance.now();
    let lastHint = "Say a number to start guessing!";
    let gameHistory = []; // stores attempts per game
    let gameTimes = [];
    let wins = 0;
    let losses = 0;
    let bestScore = null;
    let currentPlayer = 0; // 0 -> player1, 1 -> player2
    let playerAttempts = [0, 0];
    let achievements = new Set(JSON.parse(localStorage.getItem('achievements') || "[]"));

    const wordNumbers = {
        'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
        'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
        'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
        'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
        'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
        'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100, 'thousand': 1000
    };

    function saveAchievements() {
        localStorage.setItem('achievements', JSON.stringify(Array.from(achievements)));
    }

    function renderAchievements() {
        achievementsEl.innerHTML = '';
        achievements.forEach(a => {
            const span = document.createElement('span');
            span.textContent = a;
            achievementsEl.appendChild(span);
        });
    }

    function playTone(type) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = type === 'success' ? 880 : type === 'error' ? 220 : 440;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    }

    function speak(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = languageSelect.value;
        utterance.rate = parseFloat(rateSlider.value);
        utterance.pitch = parseFloat(pitchSlider.value);
        utterance.volume = parseFloat(volumeSlider.value);
        const selected = voices.find(v => v.name === voiceSelect.value);
        if (selected) utterance.voice = selected;
        synth.speak(utterance);
    }

    function generateNumber() {
        return Math.floor(Math.random() * upperBound) + 1;
    }

    function resetTimer() {
        startTime = performance.now();
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const elapsed = (performance.now() - startTime) / 1000;
            timerEl.textContent = `${elapsed.toFixed(1)}s`;
        }, 200);
    }

    function resetGame(announce = true) {
        upperBound = difficulties[difficultySelect.value];
        maxRange = upperBound;
        minRange = 1;
        attempts = 0;
        playerAttempts = [0, 0];
        gameActive = true;
        targetNumber = generateNumber();
        historyEl.innerHTML = '';
        transcriptEl.textContent = '—';
        hintTextEl.textContent = "Say a number to start guessing!";
        lastHint = hintTextEl.textContent;
        attemptsEl.textContent = '0';
        rangeLabelEl.textContent = `${minRange} - ${maxRange}`;
        currentPlayer = 0;
        currentPlayerEl.textContent = "Player 1";
        resetTimer();
        drawRange();
        if (announce) {
            speak("New game started. Say a number to guess.");
        }
    }

    function switchPlayer() {
        if (!multiplayerToggle.checked) return;
        currentPlayer = currentPlayer === 0 ? 1 : 0;
        currentPlayerEl.textContent = currentPlayer === 0 ? "Player 1" : "Player 2";
    }

    function addHistoryEntry(text) {
        const li = document.createElement('li');
        li.textContent = text;
        historyEl.prepend(li);
    }

    function updateScoreboard(win, timeSec) {
        if (win) {
            wins += 1;
            gameHistory.push(attempts);
            if (typeof timeSec === 'number') gameTimes.push(timeSec);
            if (bestScore === null || attempts < bestScore) bestScore = attempts;
            if (attempts === 1) achievements.add("Lucky: won in 1 guess");
            if (attempts <= 5) achievements.add("Skilled: won in 5 guesses");
            if (timeSec !== undefined && timeSec <= 10) achievements.add("Fast finisher: under 10s");
        } else {
            losses += 1;
        }
        if (gameHistory.length >= 10) achievements.add("Dedicated: played 10 games");
        bestScoreEl.textContent = bestScore ? `${bestScore} tries` : '–';
        const avg = gameTimes.length ? (gameTimes.reduce((a, b) => a + b, 0) / gameTimes.length) : null;
        avgTimeEl.textContent = avg ? `${avg.toFixed(1)}s` : '–';
        winLossEl.textContent = `${wins}/${losses}`;
        renderAchievements();
        saveAchievements();
        drawStats();
    }

    function drawRange(guessMarker) {
        rangeCtx.clearRect(0, 0, rangeCanvas.width, rangeCanvas.height);
        const w = rangeCanvas.width - 40;
        const h = 40;
        const baseX = 20;
        const baseY = 60;
        const maxVal = upperBound;

        // eliminated low
        rangeCtx.fillStyle = '#fde68a';
        const lowWidth = ((minRange - 1) / maxVal) * w;
        rangeCtx.fillRect(baseX, baseY, lowWidth, h);

        // remaining
        rangeCtx.fillStyle = '#a7f3d0';
        const remWidth = ((maxRange - minRange + 1) / maxVal) * w;
        rangeCtx.fillRect(baseX + lowWidth, baseY, remWidth, h);

        // eliminated high
        rangeCtx.fillStyle = '#fecdd3';
        const highWidth = ((maxVal - maxRange) / maxVal) * w;
        rangeCtx.fillRect(baseX + lowWidth + remWidth, baseY, highWidth, h);

        // border
        rangeCtx.strokeStyle = '#111827';
        rangeCtx.strokeRect(baseX, baseY, w, h);

        // markers
        rangeCtx.fillStyle = '#111827';
        rangeCtx.fillText(`${minRange}`, baseX - 10, baseY + h + 14);
        rangeCtx.fillText(`${maxRange}`, baseX + w - 10, baseY + h + 14);

        if (typeof guessMarker === 'number') {
            const x = baseX + (guessMarker - 1) / maxVal * w;
            rangeCtx.fillStyle = '#2563eb';
            rangeCtx.fillRect(x - 2, baseY - 10, 4, h + 20);
            rangeCtx.fillText(`${guessMarker}`, x - 8, baseY - 14);
        }
    }

    function drawStats() {
        statsCtx.clearRect(0, 0, statsCanvas.width, statsCanvas.height);
        if (gameHistory.length === 0) return;
        const padding = 30;
        const width = statsCanvas.width - padding * 2;
        const height = statsCanvas.height - padding * 2;
        const barWidth = width / gameHistory.length - 8;
        const maxAttempts = Math.max(...gameHistory);
        gameHistory.forEach((attempt, idx) => {
            const x = padding + idx * (barWidth + 8);
            const barHeight = (attempt / maxAttempts) * height;
            const y = statsCanvas.height - padding - barHeight;
            statsCtx.fillStyle = '#60a5fa';
            statsCtx.fillRect(x, y, barWidth, barHeight);
            statsCtx.fillStyle = '#111827';
            statsCtx.fillText(`${attempt}`, x, y - 4);
        });
    }

    function parseWordsToNumber(words) {
        if (!words) return NaN;
        if (wordNumbers.hasOwnProperty(words)) return wordNumbers[words];
        const parts = words.split(/[\s-]+/);
        let total = 0;
        let current = 0;
        for (const p of parts) {
            const n = wordNumbers[p];
            if (n === undefined) return NaN;
            if (n === 1000) { current *= n; total += current; current = 0; }
            else if (n === 100) { current *= n; }
            else { current += n; }
        }
        return total + current;
    }

    function smartHint(diff) {
        const ratio = diff / upperBound;
        if (diff === 0) return "Correct!";
        if (ratio > 0.4) return "Very cold";
        if (ratio > 0.25) return "Cold";
        if (ratio > 0.1) return "Warm";
        return "Hot";
    }

    function handleGiveUp() {
        hintTextEl.textContent = `You gave up. The number was ${targetNumber}. New game starting.`;
        speak(`You gave up. The answer was ${targetNumber}. Starting a new game.`);
        gameActive = false;
        updateScoreboard(false);
        setTimeout(() => resetGame(false), 800);
    }

    function remindListening() {
        clearTimeout(listeningTimeout);
        listeningTimeout = setTimeout(() => {
            speak("I did not hear anything. Please say your guess.");
        }, 6000);
    }

    function handleCommand(transcript) {
        if (transcript.includes("give up") || transcript.includes("surrender")) {
            handleGiveUp();
            return true;
        }
        if (transcript.includes("new game") || transcript.includes("restart")) {
            speak("Restarting game.");
            resetGame(false);
            return true;
        }
        if (transcript.includes("repeat")) {
            speak(lastHint);
            return true;
        }
        if (transcript.includes("help")) {
            speak("Say a number within the range, or say give up, new game, repeat, or help. You can also toggle continuous listening.");
            return true;
        }
        return false;
    }

    recognition.onresult = function (event) {
        clearTimeout(listeningTimeout);
        const result = event.results[0][0];
        const rawTranscription = result.transcript.toLowerCase().trim();
        transcriptEl.textContent = rawTranscription;

        if (handleCommand(rawTranscription)) return;
        if (!gameActive) return;

        let guess = parseInt(rawTranscription, 10);
        if (isNaN(guess)) guess = parseWordsToNumber(rawTranscription);

        if (isNaN(guess)) {
            playTone('error');
            const msg = "Your input is invalid. Please say a number.";
            hintTextEl.textContent = msg;
            speak(msg);
                return;
            }

        if (guess < minRange || guess > maxRange) {
            playTone('error');
            const msg = `Please guess within ${minRange} and ${maxRange}.`;
            hintTextEl.textContent = msg;
            speak(msg);
            return;
        }

        attempts += 1;
        attemptsEl.textContent = attempts;
        playerAttempts[currentPlayer] += 1;
        addHistoryEntry(`Player ${currentPlayer + 1}: ${guess}`);

        const diff = Math.abs(guess - targetNumber);
        const hintLevel = smartHint(diff);

        if (guess === targetNumber) {
            playTone('success');
            const elapsedRaw = (performance.now() - startTime) / 1000;
            const elapsed = elapsedRaw.toFixed(1);
            const msg = `You won! Number was ${targetNumber}. Attempts ${attempts}. Time ${elapsed} seconds.`;
            hintTextEl.textContent = msg;
            lastHint = msg;
            speak(msg);
            gameActive = false;
            updateScoreboard(true, elapsedRaw);
            if (result.confidence >= 0.9) achievements.add("Clear speech: high confidence");
            renderAchievements();
            saveAchievements();
            return;
        }

        // update range
        if (guess < targetNumber) {
            minRange = Math.max(minRange, guess + 1);
            lastHint = `Too low. ${hintLevel}. Remaining range ${minRange} to ${maxRange}.`;
        } else {
            maxRange = Math.min(maxRange, guess - 1);
            lastHint = `Too high. ${hintLevel}. Remaining range ${minRange} to ${maxRange}.`;
        }
        hintTextEl.textContent = lastHint;
        rangeLabelEl.textContent = `${minRange} - ${maxRange}`;
        drawRange(guess);
        speak(lastHint);
        switchPlayer();
    };

    recognition.onerror = function (err) {
        const msg = `Recognition error: ${err.error || err.message}`;
        hintTextEl.textContent = msg;
        playTone('error');
        speak(msg);
    };

    recognition.onend = function () {
        if (continuousToggle.checked && gameActive) {
            recognition.start();
            remindListening();
        }
    };

    function populateVoices() {
        voices = synth.getVoices();
        voiceSelect.innerHTML = '';
        voices.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.name;
            opt.textContent = `${v.name} (${v.lang})`;
            voiceSelect.appendChild(opt);
        });
        if (voices.length) voiceSelect.value = voices[0].name;
    }
    synth.onvoiceschanged = populateVoices;
    populateVoices();

    // UI events
    guessButton.addEventListener('click', () => {
        recognition.lang = languageSelect.value;
        recognition.continuous = continuousToggle.checked;
        recognition.start();
        remindListening();
        playTone('start');
    });

    newGameButton.addEventListener('click', () => resetGame());
    helpButton.addEventListener('click', () => {
        const msg = "Say a number within the shown range. Voice commands: give up, new game, repeat, help. Adjust difficulty, language, and voice using the controls.";
        hintTextEl.textContent = msg;
        speak(msg);
    });

    languageSelect.addEventListener('change', () => {
        recognition.lang = languageSelect.value;
        speak(`Language set to ${languageSelect.options[languageSelect.selectedIndex].text}`);
    });

    difficultySelect.addEventListener('change', () => {
        resetGame();
    });

    continuousToggle.addEventListener('change', () => {
        recognition.continuous = continuousToggle.checked;
        if (continuousToggle.checked) {
            speak("Continuous listening enabled.");
            recognition.start();
            remindListening();
        } else {
            speak("Continuous listening disabled.");
            recognition.stop && recognition.stop();
        }
    });

    multiplayerToggle.addEventListener('change', () => {
        currentPlayer = 0;
        currentPlayerEl.textContent = "Player 1";
        playerAttempts = [0, 0];
    });

    rateSlider.addEventListener('input', () => hintTextEl.textContent = `Rate ${rateSlider.value}`);
    pitchSlider.addEventListener('input', () => hintTextEl.textContent = `Pitch ${pitchSlider.value}`);
    volumeSlider.addEventListener('input', () => hintTextEl.textContent = `Volume ${volumeSlider.value}`);

    resetGame(false);
};
