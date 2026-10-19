let chessSelected = null;
let chessPendingPromo = null;
let chessState = null;
const CHESS_PIECE_SHAPES = {
  K: 'M28 5h8v7h7v7h-7v6c8 2 13 9 13 17v5H15v-5c0-8 5-15 13-17v-6h-7v-7h7z',
  Q: 'M12 18l8 7 7-5 5-13 5 13 7 5 8-7-5 22c-1 5-4 8-9 8h-12c-5 0-8-3-9-8z',
  R: 'M13 10h9v9h5v-9h10v9h5v-9h9v17l-5 4v14H18V31l-5-4z',
  B: 'M32 6c-3 5-13 14-13 24 0 7 4 11 10 13l-2 6h10l-2-6c6-2 10-6 10-13C45 20 35 11 32 6z',
  N: 'M17 50c1-7 3-12 7-17l-6-8 8-2 3-10 8-7 2 9 8 3 7 10-5 5 4 17z',
  P: 'M32 7a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-6 22c-1 4-2 8-4 11l-6 5v5h32v-5l-6-5c-2-3-3-7-4-11z'
};

function chessMySide(state) {
  if (state?.player1 === socket.id) return 'w';
  if (state?.player2 === socket.id) return 'b';
  return null;
}

function createChessPiece(piece) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '8 0 48 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('chess-piece-art');

  const shape = document.createElementNS(svg.namespaceURI, 'path');
  shape.setAttribute('d', CHESS_PIECE_SHAPES[piece.toUpperCase()]);
  shape.classList.add('chess-piece-shape');
  svg.appendChild(shape);

  const details = {
    K: 'M32 5v14m-7-7h14m-15 36h16',
    Q: 'M17 24l15 7 15-7M22 43h20',
    R: 'M18 31h28m-23 12h18',
    B: 'M24 22l16 17M24 43h16',
    N: 'M25 35c7-4 13-8 21-9m-13-9h.1M23 43h22',
    P: 'M27 29h10m-12 11h14m-18 7h22'
  };
  if (piece.toUpperCase() === 'N') {
    const eye = document.createElementNS(svg.namespaceURI, 'circle');
    eye.setAttribute('cx', '34');
    eye.setAttribute('cy', '19');
    eye.setAttribute('r', '1.7');
    eye.classList.add('chess-piece-eye');
    svg.appendChild(eye);
  }
  if (piece.toUpperCase() === 'Q') {
    for (const [cx, cy] of [[12, 17], [32, 6], [52, 17]]) {
      const pearl = document.createElementNS(svg.namespaceURI, 'circle');
      pearl.setAttribute('cx', String(cx));
      pearl.setAttribute('cy', String(cy));
      pearl.setAttribute('r', '3');
      pearl.classList.add('chess-piece-pearl');
      svg.appendChild(pearl);
    }
  }

  const base = document.createElementNS(svg.namespaceURI, 'path');
  base.setAttribute('d', 'M18 48h28l3 5 5 3v3H10v-3l5-3z');
  base.classList.add('chess-piece-base');
  svg.appendChild(base);

  const detail = document.createElementNS(svg.namespaceURI, 'path');
  detail.setAttribute('d', details[piece.toUpperCase()]);
  detail.classList.add('chess-piece-detail');
  svg.appendChild(detail);
  return svg;
}

function renderChessState(state) {
  const previousState = chessState;
  chessState = state;
  renderGameClocks(state);
  chessPendingPromo = null;
  chessPromo?.classList.add('hidden');
  if (!chessBoard || !chessStatus) return;
  if (!state?.player1 || !state?.player2 || !state.board) {
    chessSelected = null;
    chessBoard.innerHTML = '';
    return;
  }

  const side = chessMySide(state);
  const flip = side === 'b';
  const myTurn = !state.winner && side && state.currentTurn === side;
  const legal = state.legalMoves || [];
  const fromMoves = chessSelected == null ? [] : legal.filter(m => m.from === chessSelected);
  const last = state.lastMove;
  const moved = previousState?.board && last &&
    previousState.board[last.from] !== state.board[last.from] &&
    previousState.board[last.to] !== state.board[last.to];

  if (chessScore) {
    chessScore.textContent = `Beyaz: ${state.score1 || 0} — Siyah: ${state.score2 || 0}`;
  }

  let status = 'Bekleniyor...';
  if (state.winner === 'draw') status = 'Berabere!';
  else if (state.winner === 'w' || state.winner === 'b') {
    const iWon = (state.winner === 'w' && side === 'w') || (state.winner === 'b' && side === 'b');
    const mate = state.inCheck;
    if (state.endReason === 'timeout') status = iWon ? 'Süre rakibinde bitti. Kazandın!' : 'Süren doldu. Kaybettin!';
    else if (mate) status = iWon ? 'Şah mat! Kazandın!' : 'Şah mat! Kaybettin!';
    else status = iWon ? 'Kazandın!' : 'Kaybettin!';
  } else if (side) {
    const checkText = state.inCheck ? ' Şah!' : '';
    status = (myTurn ? 'Senin sıran!' : 'Rakibin sırası') + checkText;
  } else {
    status = state.currentTurn === 'w' ? 'Beyaz sırası' : 'Siyah sırası';
  }
  chessStatus.textContent = status;

  chessBoard.innerHTML = '';
  for (let display = 0; display < 64; display++) {
    const sq = flip ? 63 - display : display;
    const piece = state.board[sq];
    const f = sq % 8;
    const r = Math.floor(sq / 8);
    const light = (f + r) % 2 === 1;
    const el = document.createElement('div');
    el.className = 'chess-square ' + (light ? 'light' : 'dark');
    el.dataset.index = String(sq);
    if (last && (last.from === sq || last.to === sq)) el.classList.add('last-move');
    if (state.inCheck && piece && piece.toUpperCase() === 'K' && ((piece === 'K' && state.currentTurn === 'w') || (piece === 'k' && state.currentTurn === 'b'))) {
      el.classList.add('check');
    }
    if (chessSelected === sq) el.classList.add('selected');
    const canSelect = myTurn && piece && ((side === 'w' && piece === piece.toUpperCase()) || (side === 'b' && piece === piece.toLowerCase()));
    if (canSelect) el.classList.add('selectable');
    const isTarget = fromMoves.some(m => m.to === sq);
    if (isTarget) {
      el.classList.add('legal');
      if (piece) el.classList.add('has-piece');
    }
    if (piece) {
      const span = document.createElement('span');
      span.className = 'chess-piece ' + (piece === piece.toUpperCase() ? 'white' : 'black');
      span.appendChild(createChessPiece(piece));
      if (moved && last.to === sq) {
        el.classList.add('piece-moving');
        const fromDisplay = flip ? 63 - last.from : last.from;
        const toDisplay = flip ? 63 - last.to : last.to;
        const squareSize = chessBoard.clientWidth / 8;
        const offsetX = ((fromDisplay % 8) - (toDisplay % 8)) * squareSize;
        const offsetY = (Math.floor(fromDisplay / 8) - Math.floor(toDisplay / 8)) * squareSize;
        const animation = span.animate([
          { transform: `translate(${offsetX}px, ${offsetY}px) scale(0.96)` },
          { transform: 'translate(0, 0) scale(1)' }
        ], { duration: 190, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' });
        animation.onfinish = () => animation.cancel();
      }
      el.appendChild(span);
    }
    chessBoard.appendChild(el);
  }
}

chessBoard?.addEventListener('click', (e) => {
  const square = e.target.closest('.chess-square');
  if (!square || !currentRoomId || !chessState) return;
  const sq = parseInt(square.dataset.index, 10);
  if (isNaN(sq)) return;
  const side = chessMySide(chessState);
  if (!side || chessState.winner || chessState.currentTurn !== side) return;

  const legal = chessState.legalMoves || [];
  if (chessSelected != null) {
    const matches = legal.filter(m => m.from === chessSelected && m.to === sq);
    if (matches.length) {
      if (matches.some(m => m.promo)) {
        chessPendingPromo = { from: chessSelected, to: sq };
        chessPromo?.classList.remove('hidden');
        return;
      }
      socket.emit('game-chess-move', { from: chessSelected, to: sq });
      chessSelected = null;
      chessPendingPromo = null;
      chessPromo?.classList.add('hidden');
      return;
    }
  }

  chessPendingPromo = null;
  chessPromo?.classList.add('hidden');
  const piece = chessState.board[sq];
  const mine = piece && ((side === 'w' && piece === piece.toUpperCase()) || (side === 'b' && piece === piece.toLowerCase()));
  if (mine && legal.some(m => m.from === sq)) {
    chessSelected = chessSelected === sq ? null : sq;
    renderChessState(chessState);
  } else {
    chessSelected = null;
    renderChessState(chessState);
  }
});

chessPromo?.addEventListener('click', (e) => {
  const btn = e.target.closest('.chess-promo-btn');
  if (!btn || !chessPendingPromo || !currentRoomId) return;
  socket.emit('game-chess-move', {
    from: chessPendingPromo.from,
    to: chessPendingPromo.to,
    promo: btn.dataset.promo
  });
  chessSelected = null;
  chessPendingPromo = null;
  chessPromo?.classList.add('hidden');
});
