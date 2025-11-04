window.onload = function () {
    let board = document.getElementById('board');
    let guessButton = document.getElementById('guessButton');
    let guessInput = document.getElementById('guessInput');
    let messageBox = document.getElementById('message');
    let newGameButton = document.getElementById('newGameButton');
    let statsContainer = document.getElementById('stats');

    const words = [
        'table', 'chair', 'piano', 'mouse', 'house',
        'plant', 'brain', 'cloud', 'beach', 'fruit',
        'media'
    ];

    let secretWord = '';
    let tries = 0;
    let gameOver = false;

    function chooseRandomWord() {
        const index = Math.floor(Math.random() * words.length);
        return words[index].toLowerCase();
    }

    function buildBoard() {
        board.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            let row = document.createElement('div');
            row.classList.add('row');
            board.append(row);
            for (let j = 0; j < 5; j++) {
                let cell = document.createElement('div');
                cell.classList.add('cell');
                cell.setAttribute('data-row', i);
                cell.setAttribute('data-column', j);
                row.append(cell);
            }
        }
    }

    function setMessage(text, type) {
        messageBox.textContent = text || '';
        messageBox.className = '';
        if (type) {
            messageBox.classList.add(type);
        }
    }

    function loadStats() {
        try {
            const raw = localStorage.getItem('wordleStats');
            if (!raw) return { gamesPlayed: 0, wins: 0, currentStreak: 0, maxStreak: 0 };
            const parsed = JSON.parse(raw);
            return {
                gamesPlayed: parsed.gamesPlayed || 0,
                wins: parsed.wins || 0,
                currentStreak: parsed.currentStreak || 0,
                maxStreak: parsed.maxStreak || 0
            };
        } catch (_) {
            return { gamesPlayed: 0, wins: 0, currentStreak: 0, maxStreak: 0 };
        }
    }

    function saveStats(stats) {
        localStorage.setItem('wordleStats', JSON.stringify(stats));
    }

    function renderStats() {
        const s = loadStats();
        const winPct = s.gamesPlayed === 0 ? 0 : Math.round((s.wins / s.gamesPlayed) * 100);
        statsContainer.textContent = `Played: ${s.gamesPlayed} • Win%: ${winPct} • Streak: ${s.currentStreak}`;
    }

    function updateStats(didWin) {
        const s = loadStats();
        s.gamesPlayed += 1;
        if (didWin) {
            s.wins += 1;
            s.currentStreak += 1;
            if (s.currentStreak > s.maxStreak) s.maxStreak = s.currentStreak;
        } else {
            s.currentStreak = 0;
        }
        saveStats(s);
        renderStats();
    }

    function startNewGame() {
        secretWord = chooseRandomWord();
        tries = 0;
        gameOver = false;
        buildBoard();
        setMessage('', '');
        guessInput.value = '';
        guessInput.removeAttribute('disabled');
        guessButton.removeAttribute('disabled');
        newGameButton.classList.add('hidden');
        guessInput.focus();
    }

    function applyFeedbackAnimation(rowIndex, columnIndex, className, letter) {
        const cell = document.querySelector(`[data-row="${rowIndex}"][data-column="${columnIndex}"]`);
        cell.textContent = letter.toUpperCase();
        cell.classList.add('flip');
        setTimeout(() => {
            cell.classList.add(className);
        }, 200);
    }

    function evaluateAndColorGuess(guess) {
        const lowerGuess = guess.toLowerCase();
        const lowerSecret = secretWord.toLowerCase();

        const result = new Array(5).fill('red');
        const letterCounts = {};

        for (let i = 0; i < 5; i++) {
            const ch = lowerSecret[i];
            letterCounts[ch] = (letterCounts[ch] || 0) + 1;
        }

        for (let i = 0; i < 5; i++) {
            if (lowerGuess[i] === lowerSecret[i]) {
                result[i] = 'green';
                letterCounts[lowerGuess[i]] -= 1;
            }
        }

        for (let i = 0; i < 5; i++) {
            if (result[i] === 'green') continue;
            const ch = lowerGuess[i];
            if (letterCounts[ch] > 0) {
                result[i] = 'yellow';
                letterCounts[ch] -= 1;
            } else {
                result[i] = 'red';
            }
        }

        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                applyFeedbackAnimation(tries, i, result[i], lowerGuess[i]);
            }, i * 120);
        }
    }

    function handleGuess() {
        if (gameOver) {
            setMessage('Game is already over. Start a new game.', 'info');
            return;
        }

        const raw = guessInput.value.trim();
        if (!/^[a-zA-Z]{5}$/.test(raw)) {
            setMessage('Please enter exactly 5 letters.', 'error');
            return;
        }
        setMessage('', '');

        evaluateAndColorGuess(raw);

        const didWin = raw.toLowerCase() === secretWord.toLowerCase();
        if (didWin) {
            setTimeout(() => {
                alert('You won');
                gameOver = true;
                guessInput.setAttribute('disabled', 'disabled');
                guessButton.setAttribute('disabled', 'disabled');
                newGameButton.classList.remove('hidden');
                updateStats(true);
            }, 650);
            return;
        }

        if (tries === 5) {
            setTimeout(() => {
                alert(`You lost! The word was: ${secretWord.toUpperCase()}`);
                gameOver = true;
                guessInput.setAttribute('disabled', 'disabled');
                guessButton.setAttribute('disabled', 'disabled');
                newGameButton.classList.remove('hidden');
                updateStats(false);
            }, 650);
            return;
        }

        tries += 1;
        guessInput.select();
    }

    guessButton.addEventListener('click', handleGuess);
    guessInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            handleGuess();
        }
    });
    newGameButton.addEventListener('click', startNewGame);

    renderStats();
    startNewGame();
}