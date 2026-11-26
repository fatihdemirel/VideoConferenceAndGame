let lingoState = null;
let lingoTimerInterval = null;
let lingoDraft = [];
let lingoRenderedGuessCount = 0;
let lingoRenderedTurn = null;
let lingoGuessPending = false;
const LINGO_KEY_ROWS = [
  [...'QWERTYUIOP\u011e\u00dc'],
  [...'ASDFGHJKL\u015e\u0130'],
  [...'ZXCVBNM\u00d6\u00c7']
];

function updateLingoTimer() {
  if (!lingoTimer || !lingoState?.turnDeadline || lingoState.winner) {
    if (lingoTimer) lingoTimer.textContent = '—';
    lingoTimer?.classList.remove('is-low');
    return;
  }
  const seconds = Math.max(0, Math.ceil((lingoState.turnDeadline - Date.now()) / 1000));
  lingoTimer.textContent = `${seconds} sn`;
  lingoTimer.classList.toggle('is-low', seconds <= 10);
}

function renderLingoState(state) {
  const previousState = lingoState;
  lingoState = state;
  lingoResetBtn?.classList.toggle('hidden', !state?.winner);
  gameActiveLingo?.classList.toggle('is-finished', Boolean(state?.winner));
  if (lingoTimerInterval) {
    clearInterval(lingoTimerInterval);
    lingoTimerInterval = null;
  }
  if (!lingoBoard || !lingoStatus) return;
  if (!state?.player1 || !state?.player2) {
    lingoBoard.replaceChildren();
    lingoStatus.textContent = 'İkinci oyuncu bekleniyor...';
    lingoDraft = [];
    lingoGuessPending = false;
    renderLingoKeyboard(new Map());
    updateLingoTimer();
    return;
  }

  const wordLength = state.wordLength;
  const myPlayer = state.player1 === socket.id ? 'player1' : state.player2 === socket.id ? 'player2' : null;
  const isMyTurn = !state.winner && myPlayer === state.currentTurn;
  const guesses = Array.isArray(state.guesses) ? state.guesses : [];
  if (!previousState || previousState.player1 !== state.player1 ||
      guesses.length !== lingoRenderedGuessCount || state.currentTurn !== lingoRenderedTurn) {
    lingoDraft = [];
    lingoGuessPending = false;
  }
  lingoRenderedGuessCount = guesses.length;
  lingoRenderedTurn = state.currentTurn;

  const knownLetters = Array(wordLength).fill('');
  if (state.firstLetter) knownLetters[0] = state.firstLetter;
  const keyboardStatus = new Map();
  const statusPriority = { absent: 1, present: 2, correct: 3 };
  guesses.forEach((entry) => {
    [...(entry.guess || '')].forEach((letter, index) => {
      const result = entry.feedback?.[index];
      if (result === 'correct') knownLetters[index] = letter;
      if (result && (statusPriority[result] || 0) > (statusPriority[keyboardStatus.get(letter)] || 0)) {
        keyboardStatus.set(letter, result);
      }
    });
  });

  const rows = document.createDocumentFragment();

  for (let rowIndex = 0; rowIndex < 6; rowIndex++) {
    const entry = guesses[rowIndex];
    const row = document.createElement('div');
    row.className = 'lingo-row';
    row.style.setProperty('--lingo-length', String(wordLength));
    if (entry?.timedOut) {
      row.classList.add('timed-out');
      row.setAttribute('aria-label', 'Süre doldu');
    }
    const letters = [...(entry?.guess || '')];
    const isCurrentRow = !entry && rowIndex === guesses.length && isMyTurn;
    for (let column = 0; column < wordLength; column++) {
      const tile = document.createElement('span');
      tile.className = 'lingo-tile';
      const letter = letters[column] || (isCurrentRow ? (knownLetters[column] || lingoDraft[column] || '') : '');
      tile.textContent = letter;
      const result = entry?.feedback?.[column];
      if (result) tile.classList.add(result);
      else if (isCurrentRow && knownLetters[column]) tile.classList.add('correct', 'lingo-locked');
      row.appendChild(tile);
    }
    rows.appendChild(row);
  }
  lingoBoard.replaceChildren(rows);

  if (state.winner === 'draw') {
    lingoStatus.textContent = `Berabere! Kelime: ${state.answer}`;
  } else if (state.winner) {
    lingoStatus.textContent = state.winner === myPlayer ? 'Doğru bildin, kazandın!' : 'Rakibin bildi!';
  } else if (state.turnDeadline === null) {
    lingoStatus.textContent = 'Rakibin bağlantısı bekleniyor...';
  } else if (myPlayer) {
    lingoStatus.textContent = isMyTurn ? 'Senin sıran!' : `${getParticipantDisplayName(state.currentTurn === 'player1' ? state.player1 : state.player2)} tahmin ediyor`;
  } else {
    lingoStatus.textContent = `${getParticipantDisplayName(state.currentTurn === 'player1' ? state.player1 : state.player2)} tahmin ediyor`;
  }
  if (state.winner && state.winner !== 'draw') {
    lingoStatus.textContent += ` Kelime: ${state.answer}`;
  }
  if (lingoScore) {
    lingoPlayer1Name.textContent = getParticipantDisplayName(state.player1);
    lingoPlayer2Name.textContent = getParticipantDisplayName(state.player2);
    lingoScore1.textContent = String(state.score1 || 0);
    lingoScore2.textContent = String(state.score2 || 0);
  }
  const canGuess = isMyTurn && !lingoGuessPending;
  if (lingoKeyboard) lingoKeyboard.setAttribute('aria-disabled', String(!canGuess));
  renderLingoKeyboard(keyboardStatus, canGuess);
  updateLingoTimer();
  if (!state.winner) lingoTimerInterval = setInterval(updateLingoTimer, 250);
}

function renderLingoKeyboard(keyboardStatus, isMyTurn = false) {
  if (!lingoKeyboard) return;
  const fragment = document.createDocumentFragment();
  LINGO_KEY_ROWS.forEach((letters, rowIndex) => {
    const row = document.createElement('div');
    row.className = `lingo-key-row row-${rowIndex + 1}`;
    letters.forEach((letter) => {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'lingo-key';
      key.textContent = letter;
      key.dataset.letter = letter;
      const status = keyboardStatus.get(letter);
      if (status) key.classList.add(`used-${status}`);
      key.disabled = !isMyTurn;
      row.appendChild(key);
    });
    if (rowIndex === 2) {
      const backspace = document.createElement('button');
      backspace.type = 'button';
      backspace.className = 'lingo-key lingo-key-action';
      backspace.textContent = '⌫';
      backspace.setAttribute('aria-label', 'Son harfi sil');
      backspace.dataset.action = 'backspace';
      backspace.disabled = !isMyTurn;
      row.appendChild(backspace);
    }
    fragment.appendChild(row);
  });
  lingoKeyboard.replaceChildren(fragment);
}

lingoKeyboard?.addEventListener('click', (event) => {
  const key = event.target.closest('.lingo-key');
  if (!key || key.disabled || !lingoState || lingoGuessPending) return;
  let guessCompleted = false;
  if (key.dataset.action === 'backspace') {
    for (let index = lingoDraft.length - 1; index >= 0; index--) {
      if (!getLingoKnownLetters()[index] && lingoDraft[index]) {
        lingoDraft[index] = '';
        break;
      }
    }
  } else {
    const knownLetters = getLingoKnownLetters();
    const nextIndex = knownLetters.findIndex((letter, index) => !letter && !lingoDraft[index]);
    if (nextIndex !== -1) {
      lingoDraft[nextIndex] = key.dataset.letter;
      guessCompleted = knownLetters.every((letter, index) => letter || lingoDraft[index]);
    }
  }
  renderLingoState(lingoState);
  if (guessCompleted) submitLingoGuess();
});

function getLingoKnownLetters() {
  const knownLetters = Array(lingoState?.wordLength || 0).fill('');
  if (lingoState?.firstLetter) knownLetters[0] = lingoState.firstLetter;
  (lingoState?.guesses || []).forEach((entry) => {
    [...(entry.guess || '')].forEach((letter, index) => {
      if (entry.feedback?.[index] === 'correct') knownLetters[index] = letter;
    });
  });
  return knownLetters;
}

function submitLingoGuess() {
  const myPlayer = lingoState?.player1 === socket.id
    ? 'player1'
    : lingoState?.player2 === socket.id ? 'player2' : null;
  if (!currentRoomId || !lingoState || lingoState.winner || lingoGuessPending ||
      myPlayer !== lingoState.currentTurn) return;
  const knownLetters = getLingoKnownLetters();
  const letters = Array.from({ length: lingoState.wordLength }, (_, index) => knownLetters[index] || lingoDraft[index] || '');
  if (letters.some((letter) => !letter)) {
    lingoStatus.textContent = `Tahmin için ${lingoState.wordLength} harfi tamamla.`;
    return;
  }
  lingoGuessPending = true;
  lingoStatus.textContent = 'Tahmin gönderiliyor...';
  if (lingoKeyboard) lingoKeyboard.setAttribute('aria-disabled', 'true');
  renderLingoKeyboard(new Map(), false);
  socket.emit('game-lingo-guess', letters.join(''));
}

