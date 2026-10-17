let memoryState = null;

function renderMemoryState(state) {
  memoryState = state;
  if (!memoryBoard || !memoryStatus) return;
  if (!state?.player1 || !state?.player2) {
    memoryBoard.replaceChildren();
    memoryStatus.textContent = 'İkinci oyuncu bekleniyor...';
    if (memoryScore) memoryScore.textContent = '0 — 0';
    return;
  }

  const isPlayer1 = state.player1 === socket.id;
  const myPlayer = isPlayer1 ? 'player1' : state.player2 === socket.id ? 'player2' : null;
  const isMyTurn = !state.winner && myPlayer === state.currentTurn;
  const columns = state.columns || Number(state.boardSize?.split('x')[1]) || 5;
  memoryBoard.style.setProperty('--memory-columns', String(columns));
  memoryBoard.classList.toggle('is-large', columns === 6);

  if (memoryScore) {
    memoryScore.textContent = `${getParticipantDisplayName(state.player1)}: ${state.score1 || 0} — ${getParticipantDisplayName(state.player2)}: ${state.score2 || 0}`;
  }

  if (state.winner === 'draw') {
    memoryStatus.textContent = 'Berabere!';
  } else if (state.winner) {
    memoryStatus.textContent = state.winner === myPlayer ? 'Kazandın!' : 'Rakibin kazandı!';
  } else if (state.mismatchPending) {
    memoryStatus.textContent = 'Eşleşmedi, sıra rakibe geçiyor...';
  } else {
    memoryStatus.textContent = isMyTurn ? 'Senin sıran!' : 'Rakibin sırası';
  }

  const fragment = document.createDocumentFragment();
  state.cards.forEach((card, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'memory-card';
    button.dataset.index = String(index);
    button.textContent = card.value || '?';
    button.setAttribute('aria-label', card.value ? `Kart ${index + 1}: ${card.value}` : `Kapalı kart ${index + 1}`);
    button.classList.toggle('is-revealed', card.revealed && !card.matched);
    button.classList.toggle('is-matched', card.matched);
    button.disabled = !isMyTurn || card.revealed || card.matched || state.mismatchPending;
    fragment.appendChild(button);
  });
  memoryBoard.replaceChildren(fragment);
}

memoryBoard?.addEventListener('click', (event) => {
  const card = event.target.closest('.memory-card');
  if (!card || card.disabled || !currentRoomId || !memoryState) return;
  const index = Number(card.dataset.index);
  if (Number.isInteger(index)) socket.emit('game-memory-flip', index);
});
