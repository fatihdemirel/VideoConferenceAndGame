function getWinningLine(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return [a,b,c];
  }
  return null;
}

function renderGameState(state) {
  if (!gameBoard || !gameStatus) return;
  if (gameScore) {
    const s1 = state?.score1 ?? 0;
    const s2 = state?.score2 ?? 0;
    gameScore.textContent = `X: ${s1} — O: ${s2}`;
  }
  const cells = gameBoard.querySelectorAll('.game-cell');
  const winningLine = state?.board ? getWinningLine(state.board) : null;
  cells.forEach((cell, i) => {
    const val = state?.board?.[i] || '';
    cell.textContent = val;
    cell.className = 'game-cell' + (val ? ` ${val.toLowerCase()}` : '');
    cell.classList.toggle('winning', winningLine?.includes(i) ?? false);
    if (state?.winner) {
      cell.classList.remove('disabled');
      cell.style.cursor = 'default';
    } else {
      const mySymbol = state?.player1 === socket.id ? 'X' : state?.player2 === socket.id ? 'O' : null;
      const canPlay = mySymbol && state?.currentTurn === mySymbol;
      cell.classList.toggle('disabled', !canPlay);
      cell.style.cursor = canPlay ? 'pointer' : 'not-allowed';
    }
  });

  let status = 'Bekleniyor...';
  if (state?.player1 && state?.player2) {
    if (state.winner === 'draw') status = 'Berabere!';
    else if (state.winner) status = `${state.winner} kazandı!`;
    else {
      const mySymbol = state.player1 === socket.id ? 'X' : state.player2 === socket.id ? 'O' : null;
      if (mySymbol) status = state.currentTurn === mySymbol ? 'Senin sıran!' : 'Rakibin sırası';
      else status = `${state.currentTurn} sırası`;
    }
  } else if (state?.player1) status = 'İkinci oyuncu bekleniyor...';
  gameStatus.textContent = status;
}

gameBoard?.addEventListener('click', (e) => {
  const cell = e.target.closest('.game-cell');
  if (!cell || !currentRoomId || cell.classList.contains('disabled') || cell.textContent) return;
  const index = parseInt(cell.dataset.index, 10);
  if (isNaN(index) || index < 0 || index > 8) return;
  socket.emit('game-move', index);
});
