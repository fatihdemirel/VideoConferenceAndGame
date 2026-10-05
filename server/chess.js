/**
 * Satranç kuralları: hamle üretimi ve doğrulama
 */

const START_BOARD = [
  'r', 'n', 'b', 'q', 'k', 'b', 'n', 'r',
  'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p',
  null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null,
  'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P',
  'R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'
];

const KNIGHT_DIRS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const PROMO_PIECES = ['Q', 'R', 'B', 'N'];

function fileOf(i) {
  return i % 8;
}

function rankOf(i) {
  return Math.floor(i / 8);
}

function inBounds(f, r) {
  return f >= 0 && f < 8 && r >= 0 && r < 8;
}

function isWhitePiece(p) {
  return !!p && p === p.toUpperCase();
}

function isBlackPiece(p) {
  return !!p && p === p.toLowerCase();
}

function pieceSide(p) {
  if (!p) return null;
  return isWhitePiece(p) ? 'w' : 'b';
}

function findKing(board, white) {
  const k = white ? 'K' : 'k';
  return board.indexOf(k);
}

function cloneGame(game) {
  return {
    ...game,
    board: game.board.slice(),
    castle: { ...game.castle },
    lastMove: game.lastMove ? { ...game.lastMove } : null
  };
}

function isSquareAttacked(board, sq, byWhite) {
  if (sq < 0 || sq > 63) return false;
  const f = fileOf(sq);
  const r = rankOf(sq);

  for (const [df, dr] of KNIGHT_DIRS) {
    const nf = f + df;
    const nr = r + dr;
    if (!inBounds(nf, nr)) continue;
    const p = board[nr * 8 + nf];
    if (p === (byWhite ? 'N' : 'n')) return true;
  }

  for (const [df, dr] of KING_DIRS) {
    const nf = f + df;
    const nr = r + dr;
    if (!inBounds(nf, nr)) continue;
    const p = board[nr * 8 + nf];
    if (p === (byWhite ? 'K' : 'k')) return true;
  }

  if (byWhite) {
    if (f > 0 && r < 7 && board[sq + 7] === 'P') return true;
    if (f < 7 && r < 7 && board[sq + 9] === 'P') return true;
  } else {
    if (f > 0 && r > 0 && board[sq - 9] === 'p') return true;
    if (f < 7 && r > 0 && board[sq - 7] === 'p') return true;
  }

  const sliders = [
    { dirs: BISHOP_DIRS, pieces: byWhite ? ['B', 'Q'] : ['b', 'q'] },
    { dirs: ROOK_DIRS, pieces: byWhite ? ['R', 'Q'] : ['r', 'q'] }
  ];
  for (const { dirs, pieces } of sliders) {
    for (const [df, dr] of dirs) {
      let nf = f + df;
      let nr = r + dr;
      while (inBounds(nf, nr)) {
        const p = board[nr * 8 + nf];
        if (p) {
          if (pieces.includes(p)) return true;
          break;
        }
        nf += df;
        nr += dr;
      }
    }
  }
  return false;
}

function inCheck(board, white) {
  const king = findKing(board, white);
  if (king < 0) return true;
  return isSquareAttacked(board, king, !white);
}

function addSlideMoves(board, from, dirs, white, moves) {
  const f = fileOf(from);
  const r = rankOf(from);
  for (const [df, dr] of dirs) {
    let nf = f + df;
    let nr = r + dr;
    while (inBounds(nf, nr)) {
      const to = nr * 8 + nf;
      const p = board[to];
      if (!p) {
        moves.push({ from, to });
      } else {
        if (white ? isBlackPiece(p) : isWhitePiece(p)) moves.push({ from, to });
        break;
      }
      nf += df;
      nr += dr;
    }
  }
}

function addPawnMoves(game, from, white, moves) {
  const board = game.board;
  const dir = white ? -8 : 8;
  const startRank = white ? 6 : 1;
  const promoRank = white ? 0 : 7;
  const f = fileOf(from);
  const forward = from + dir;

  if (forward >= 0 && forward <= 63 && !board[forward]) {
    pushPawnTo(moves, from, forward, rankOf(forward) === promoRank);
    const doubleTo = from + dir * 2;
    if (rankOf(from) === startRank && doubleTo >= 0 && doubleTo <= 63 && !board[doubleTo]) {
      moves.push({ from, to: doubleTo });
    }
  }

  const caps = white
    ? [{ df: -1, delta: -9 }, { df: 1, delta: -7 }]
    : [{ df: -1, delta: 7 }, { df: 1, delta: 9 }];
  for (const { df, delta } of caps) {
    const nf = f + df;
    if (nf < 0 || nf > 7) continue;
    const to = from + delta;
    if (to < 0 || to > 63) continue;
    const p = board[to];
    const isEp = game.enPassant === to;
    if (p && (white ? isBlackPiece(p) : isWhitePiece(p))) {
      pushPawnTo(moves, from, to, rankOf(to) === promoRank);
    } else if (isEp) {
      moves.push({ from, to });
    }
  }
}

function pushPawnTo(moves, from, to, promote) {
  if (promote) {
    for (const promo of PROMO_PIECES) moves.push({ from, to, promo });
  } else {
    moves.push({ from, to });
  }
}

function canCastle(game, white, kingSide) {
  const { castle, board } = game;
  if (white && kingSide && !castle.wK) return false;
  if (white && !kingSide && !castle.wQ) return false;
  if (!white && kingSide && !castle.bK) return false;
  if (!white && !kingSide && !castle.bQ) return false;

  const kingFrom = white ? 60 : 4;
  if (board[kingFrom] !== (white ? 'K' : 'k')) return false;
  if (isSquareAttacked(board, kingFrom, !white)) return false;

  const empty = kingSide
    ? (white ? [61, 62] : [5, 6])
    : (white ? [59, 58, 57] : [3, 2, 1]);
  const path = kingSide
    ? (white ? [61, 62] : [5, 6])
    : (white ? [59, 58] : [3, 2]);

  for (const sq of empty) {
    if (board[sq]) return false;
  }
  for (const sq of path) {
    if (isSquareAttacked(board, sq, !white)) return false;
  }
  return true;
}

function generatePseudoMoves(game) {
  const white = game.currentTurn === 'w';
  const board = game.board;
  const moves = [];

  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || pieceSide(p) !== game.currentTurn) continue;
    const type = p.toUpperCase();

    if (type === 'P') addPawnMoves(game, from, white, moves);
    else if (type === 'N') {
      const f = fileOf(from);
      const r = rankOf(from);
      for (const [df, dr] of KNIGHT_DIRS) {
        const nf = f + df;
        const nr = r + dr;
        if (!inBounds(nf, nr)) continue;
        const to = nr * 8 + nf;
        const t = board[to];
        if (!t || (white ? isBlackPiece(t) : isWhitePiece(t))) moves.push({ from, to });
      }
    } else if (type === 'B') addSlideMoves(board, from, BISHOP_DIRS, white, moves);
    else if (type === 'R') addSlideMoves(board, from, ROOK_DIRS, white, moves);
    else if (type === 'Q') addSlideMoves(board, from, [...BISHOP_DIRS, ...ROOK_DIRS], white, moves);
    else if (type === 'K') {
      const f = fileOf(from);
      const r = rankOf(from);
      for (const [df, dr] of KING_DIRS) {
        const nf = f + df;
        const nr = r + dr;
        if (!inBounds(nf, nr)) continue;
        const to = nr * 8 + nf;
        const t = board[to];
        if (!t || (white ? isBlackPiece(t) : isWhitePiece(t))) moves.push({ from, to });
      }
    }
  }

  if (canCastle(game, white, true)) moves.push({ from: white ? 60 : 4, to: white ? 62 : 6 });
  if (canCastle(game, white, false)) moves.push({ from: white ? 60 : 4, to: white ? 58 : 2 });
  return moves;
}

function applyMove(game, move) {
  const { from, to, promo } = move;
  const piece = game.board[from];
  const white = isWhitePiece(piece);
  const captured = game.board[to];
  const type = piece.toUpperCase();
  let resetHalf = type === 'P' || !!captured;

  game.board[to] = piece;
  game.board[from] = null;

  if (type === 'P' && game.enPassant === to && !captured) {
    const capSq = white ? to + 8 : to - 8;
    game.board[capSq] = null;
    resetHalf = true;
  }

  if (type === 'P' && (rankOf(to) === 0 || rankOf(to) === 7)) {
    const q = promo && PROMO_PIECES.includes(promo) ? promo : 'Q';
    game.board[to] = white ? q : q.toLowerCase();
  }

  if (type === 'K' && from === 60 && to === 62) {
    game.board[63] = null;
    game.board[61] = 'R';
  } else if (type === 'K' && from === 60 && to === 58) {
    game.board[56] = null;
    game.board[59] = 'R';
  } else if (type === 'K' && from === 4 && to === 6) {
    game.board[7] = null;
    game.board[5] = 'r';
  } else if (type === 'K' && from === 4 && to === 2) {
    game.board[0] = null;
    game.board[3] = 'r';
  }

  if (type === 'K') {
    if (white) {
      game.castle.wK = false;
      game.castle.wQ = false;
    } else {
      game.castle.bK = false;
      game.castle.bQ = false;
    }
  }
  if (from === 63 || to === 63) game.castle.wK = false;
  if (from === 56 || to === 56) game.castle.wQ = false;
  if (from === 7 || to === 7) game.castle.bK = false;
  if (from === 0 || to === 0) game.castle.bQ = false;

  if (type === 'P' && Math.abs(to - from) === 16) {
    game.enPassant = (from + to) / 2;
  } else {
    game.enPassant = null;
  }

  game.halfmove = resetHalf ? 0 : (game.halfmove || 0) + 1;
  game.lastMove = { from, to };
  game.currentTurn = white ? 'b' : 'w';
}

function generateLegalMoves(game) {
  const white = game.currentTurn === 'w';
  const legal = [];
  for (const m of generatePseudoMoves(game)) {
    const next = cloneGame(game);
    applyMove(next, m);
    if (!inCheck(next.board, white)) legal.push(m);
  }
  return legal;
}

function onlyKingsAndMinors(board) {
  const pieces = board.filter(Boolean);
  if (pieces.length === 2) return true;
  if (pieces.length === 3) {
    return pieces.some(p => p.toUpperCase() === 'B' || p.toUpperCase() === 'N');
  }
  return false;
}

function evaluateEnd(game) {
  const white = game.currentTurn === 'w';
  const legal = generateLegalMoves(game);
  const check = inCheck(game.board, white);
  if (legal.length === 0) {
    if (check) return { winner: white ? 'b' : 'w', inCheck: true, legalMoves: [] };
    return { winner: 'draw', inCheck: false, legalMoves: [] };
  }
  if ((game.halfmove || 0) >= 100) return { winner: 'draw', inCheck: check, legalMoves: legal };
  if (onlyKingsAndMinors(game.board)) return { winner: 'draw', inCheck: check, legalMoves: legal };
  return { winner: null, inCheck: check, legalMoves: legal };
}

function getInitialChessState(keepScores = false, prev) {
  return {
    gameId: 'chess',
    board: START_BOARD.slice(),
    currentTurn: 'w',
    winner: null,
    inCheck: false,
    enPassant: null,
    halfmove: 0,
    castle: { wK: true, wQ: true, bK: true, bQ: true },
    lastMove: null,
    legalMoves: generateLegalMoves({
      board: START_BOARD.slice(),
      currentTurn: 'w',
      enPassant: null,
      castle: { wK: true, wQ: true, bK: true, bQ: true }
    }),
    player1: keepScores && prev ? prev.player1 : null,
    player2: keepScores && prev ? prev.player2 : null,
    score1: keepScores && prev ? (prev.score1 || 0) : 0,
    score2: keepScores && prev ? (prev.score2 || 0) : 0
  };
}

function publicChessState(game) {
  const end = game.winner ? { winner: game.winner, inCheck: game.inCheck, legalMoves: [] } : evaluateEnd(game);
  return {
    gameId: 'chess',
    board: game.board,
    currentTurn: game.currentTurn,
    winner: end.winner,
    inCheck: end.inCheck,
    lastMove: game.lastMove,
    legalMoves: end.legalMoves,
    player1: game.player1,
    player2: game.player2,
    score1: game.score1 || 0,
    score2: game.score2 || 0
  };
}

function tryChessMove(game, socketId, from, to, promo) {
  if (!game || game.gameId !== 'chess' || game.winner) return false;
  from = parseInt(from, 10);
  to = parseInt(to, 10);
  if (isNaN(from) || isNaN(to) || from < 0 || from > 63 || to < 0 || to > 63) return false;

  const isP1 = game.player1 === socketId;
  const isP2 = game.player2 === socketId;
  if (!isP1 && !isP2) return false;
  const mySide = isP1 ? 'w' : 'b';
  if (game.currentTurn !== mySide) return false;

  const promoNorm = typeof promo === 'string' ? promo.toUpperCase() : undefined;
  const legal = generateLegalMoves(game);
  const match = legal.find((m) => {
    if (m.from !== from || m.to !== to) return false;
    if (m.promo) return m.promo === (PROMO_PIECES.includes(promoNorm) ? promoNorm : 'Q');
    return true;
  });
  if (!match) return false;

  applyMove(game, match);
  const end = evaluateEnd(game);
  game.winner = end.winner;
  game.inCheck = end.inCheck;
  game.legalMoves = end.legalMoves;

  if (game.winner === 'w') game.score1 = (game.score1 || 0) + 1;
  else if (game.winner === 'b') game.score2 = (game.score2 || 0) + 1;

  return true;
}

module.exports = {
  getInitialChessState,
  publicChessState,
  tryChessMove
};
