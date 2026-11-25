/**
 * Tüm oyunlar için seviye 1–10 bot AI.
 * Seviye arttıkça daha az hata, daha iyi hamle seçimi.
 */

const { generateLegalMoves, cloneGame, applyMove, evaluateEnd } = require('./chess');
const lingo = require('./lingo');
const battleship = require('./battleship');

const PIECE_VALUE = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
  P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000
};

function clampLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function skillRatio(level) {
  return (clampLevel(level) - 1) / 9;
}

function thinkDelayMs(level) {
  const lv = clampLevel(level);
  return 280 + (11 - lv) * 160 + Math.floor(Math.random() * 220);
}

function pickRandom(list) {
  if (!list?.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function shouldBlunder(level) {
  const skill = skillRatio(level);
  const chance = Math.max(0, 0.72 - skill * 0.78);
  return Math.random() < chance;
}

function botDisplayName(level) {
  return `Bot · Sv.${clampLevel(level)}`;
}

function isBotId(id) {
  return typeof id === 'string' && id.startsWith('bot-');
}

function makeBotId(roomId) {
  return `bot-${roomId}`;
}

/* ---------- XOX ---------- */

function tictactoeWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.includes(null) ? null : 'draw';
}

function minimaxTtt(board, turn, botSymbol) {
  const result = tictactoeWinner(board);
  if (result === botSymbol) return { score: 10 };
  if (result && result !== 'draw') return { score: -10 };
  if (result === 'draw') return { score: 0 };

  let best = turn === botSymbol ? { score: -Infinity, index: null } : { score: Infinity, index: null };
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = turn;
    const next = minimaxTtt(board, turn === 'X' ? 'O' : 'X', botSymbol);
    board[i] = null;
    if (turn === botSymbol) {
      if (next.score > best.score) best = { score: next.score, index: i };
    } else if (next.score < best.score) {
      best = { score: next.score, index: i };
    }
  }
  return best;
}

function chooseTicTacToeMove(game, level) {
  const empties = game.board.map((v, i) => (v ? null : i)).filter((i) => i !== null);
  if (!empties.length) return null;
  if (shouldBlunder(level) || clampLevel(level) <= 2) return pickRandom(empties);

  const botSymbol = game.currentTurn;
  if (clampLevel(level) >= 7 || Math.random() < skillRatio(level)) {
    const board = game.board.slice();
    const best = minimaxTtt(board, botSymbol, botSymbol);
    if (best.index !== null) return best.index;
  }

  // Orta seviye: kazan / engelle, yoksa rastgele
  for (const index of empties) {
    const trial = game.board.slice();
    trial[index] = botSymbol;
    if (tictactoeWinner(trial) === botSymbol) return index;
  }
  const opp = botSymbol === 'X' ? 'O' : 'X';
  for (const index of empties) {
    const trial = game.board.slice();
    trial[index] = opp;
    if (tictactoeWinner(trial) === opp) return index;
  }
  if (empties.includes(4) && Math.random() < skillRatio(level)) return 4;
  return pickRandom(empties);
}

/* ---------- Satranç ---------- */

function materialScore(board, side) {
  let score = 0;
  for (const piece of board) {
    if (!piece) continue;
    const white = piece === piece.toUpperCase();
    const value = PIECE_VALUE[piece] || 0;
    if ((side === 'w' && white) || (side === 'b' && !white)) score += value;
    else score -= value;
  }
  return score;
}

function scoreChessMove(game, move, side) {
  const next = cloneGame(game);
  const captured = game.board[move.to];
  applyMove(next, move);
  const end = evaluateEnd(next);
  if (end.winner === side) return 100000;
  if (end.winner && end.winner !== 'draw') return -100000;
  if (end.winner === 'draw') return 0;
  let score = materialScore(next.board, side);
  if (captured) score += (PIECE_VALUE[captured] || 0) * 0.15;
  if (end.inCheck) score += 35;
  // Merkeze yaklaşma
  const toFile = move.to % 8;
  const toRank = Math.floor(move.to / 8);
  score += (3.5 - Math.abs(toFile - 3.5)) + (3.5 - Math.abs(toRank - 3.5));
  return score;
}

function chooseChessMove(game, level) {
  const moves = game.legalMoves?.length ? game.legalMoves : generateLegalMoves(game);
  if (!moves.length) return null;
  if (shouldBlunder(level) || clampLevel(level) <= 2) {
    return pickRandom(moves);
  }

  const side = game.currentTurn;
  const depthBias = clampLevel(level) >= 9 ? 2 : clampLevel(level) >= 6 ? 1 : 0;
  let scored = moves.map((move) => {
    let score = scoreChessMove(game, move, side);
    if (depthBias > 0) {
      const next = cloneGame(game);
      applyMove(next, move);
      const replies = generateLegalMoves(next);
      if (replies.length) {
        let worst = Infinity;
        for (const reply of replies) {
          const after = cloneGame(next);
          applyMove(after, reply);
          const end = evaluateEnd(after);
          let replyScore = materialScore(after.board, side);
          if (end.winner === side) replyScore = 100000;
          else if (end.winner && end.winner !== 'draw') replyScore = -100000;
          worst = Math.min(worst, replyScore);
        }
        score = score * 0.35 + worst * 0.65;
      }
    }
    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topN = Math.max(1, Math.ceil(scored.length * (1 - skillRatio(level) * 0.85)));
  const pool = scored.slice(0, Math.min(topN, clampLevel(level) >= 8 ? 2 : 4));
  return pickRandom(pool).move;
}

/* ---------- Tavla ---------- */

function scoreBackgammonMove(game, move) {
  const player = game.currentTurn;
  const sign = player === 'player1' ? 1 : -1;
  let score = 0;
  if (move.to === 'off') score += 80;
  else if (typeof move.to === 'number') {
    const landing = game.points[move.to];
    if (landing === -sign) score += 55; // vur
    if (landing * sign > 0) score += 8; // yığ
    // İleri taşı
    const progress = player === 'player1' ? (24 - move.to) : (move.to + 1);
    score += progress * 0.4;
  }
  if (move.from === 'bar') score += 40;
  return score;
}

function chooseBackgammonMove(game, level) {
  const moves = game.legalMoves || [];
  if (!moves.length) return null;
  if (shouldBlunder(level) || clampLevel(level) <= 2) return pickRandom(moves);
  const scored = moves
    .map((move) => ({ move, score: scoreBackgammonMove(game, move) }))
    .sort((a, b) => b.score - a.score);
  const topN = Math.max(1, Math.ceil(scored.length * (1.05 - skillRatio(level))));
  return pickRandom(scored.slice(0, topN)).move;
}

/* ---------- Amiral Battı ---------- */

function chooseBattleshipShot(game, level, botId) {
  const isP1 = game.player1 === botId;
  const myShots = new Set(isP1 ? game.shots1 : game.shots2);
  const enemyGrid = isP1 ? game.grid2 : game.grid1;
  const size = battleship.BOARD_SIZE;
  const candidates = [];
  for (let i = 0; i < size * size; i++) {
    if (!myShots.has(i)) candidates.push(i);
  }
  if (!candidates.length) return null;

  // Yüksek seviyede ara sıra “şanslı” isabet (gizli bilgi)
  if (clampLevel(level) >= 9 && Math.random() < skillRatio(level) * 0.35) {
    const hits = candidates.filter((i) => enemyGrid[i] === 1);
    if (hits.length) return pickRandom(hits);
  }

  if (shouldBlunder(level) || clampLevel(level) <= 2) return pickRandom(candidates);

  const hits = [...myShots].filter((i) => enemyGrid[i] === 2);
  const hunt = [];
  for (const hit of hits) {
    const row = Math.floor(hit / size);
    const col = hit % size;
    const neighbors = [];
    if (col > 0) neighbors.push(hit - 1);
    if (col < size - 1) neighbors.push(hit + 1);
    if (row > 0) neighbors.push(hit - size);
    if (row < size - 1) neighbors.push(hit + size);
    for (const n of neighbors) {
      if (!myShots.has(n)) hunt.push(n);
    }
  }
  if (hunt.length && Math.random() < 0.25 + skillRatio(level) * 0.75) {
    return pickRandom(hunt);
  }

  // Damalı tarama tercihi
  if (clampLevel(level) >= 5) {
    const parity = candidates.filter((i) => (Math.floor(i / size) + (i % size)) % 2 === 0);
    if (parity.length) return pickRandom(parity);
  }
  return pickRandom(candidates);
}

/* ---------- Lingo ---------- */

function matchesLingoFeedback(word, guessEntry) {
  if (!guessEntry?.guess || !guessEntry.feedback?.length) return true;
  const guess = [...guessEntry.guess];
  const candidate = [...word];
  if (guess.length !== candidate.length) return false;

  // Correct positions must match
  for (let i = 0; i < guess.length; i++) {
    if (guessEntry.feedback[i] === 'correct' && candidate[i] !== guess[i]) return false;
    if (guessEntry.feedback[i] !== 'correct' && candidate[i] === guess[i]) return false;
  }

  // Present / absent counts
  const remaining = new Map();
  candidate.forEach((letter, index) => {
    if (guessEntry.feedback[index] === 'correct') return;
    remaining.set(letter, (remaining.get(letter) || 0) + 1);
  });
  for (let i = 0; i < guess.length; i++) {
    if (guessEntry.feedback[i] === 'correct') continue;
    const letter = guess[i];
    const count = remaining.get(letter) || 0;
    if (guessEntry.feedback[i] === 'present') {
      if (count <= 0) return false;
      remaining.set(letter, count - 1);
    } else if (count > 0) {
      return false;
    }
  }
  return true;
}

function chooseLingoGuess(game, level) {
  const answers = (lingo.WORDS[game.wordLength] || lingo.WORDS[5]).map(lingo.normalizeWord);
  const used = new Set(game.guesses.filter((g) => g.guess).map((g) => g.guess));

  if (clampLevel(level) >= 10 && Math.random() < 0.55) {
    return game.answer;
  }

  let pool = answers.filter((word) => !used.has(word));
  const firstLetter = lingo.normalizeWord(game.answer)[0];
  pool = pool.filter((word) => word[0] === firstLetter);
  if (clampLevel(level) >= 4) {
    const constrained = pool.filter((word) =>
      game.guesses.every((entry) => matchesLingoFeedback(word, entry))
    );
    if (constrained.length) pool = constrained;
  }

  if (!pool.length) pool = answers.filter((word) => !used.has(word) && word[0] === firstLetter);
  if (!pool.length) pool = answers.filter((word) => word[0] === firstLetter);
  if (!pool.length) return answers[0];

  if (shouldBlunder(level) || clampLevel(level) <= 2) return pickRandom(pool);
  if (clampLevel(level) >= 8 && game.answer && pool.includes(game.answer) && Math.random() < skillRatio(level) * 0.45) {
    return game.answer;
  }
  return pickRandom(pool);
}

/* ---------- Hafıza ---------- */

function rememberMemoryCards(game) {
  if (!game.botMemory) game.botMemory = {};
  game.cards.forEach((card, index) => {
    if (card.revealed || card.matched) game.botMemory[index] = card.value;
  });
}

function chooseMemoryFlip(game, level) {
  rememberMemoryCards(game);
  const hidden = game.cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !card.revealed && !card.matched);
  if (!hidden.length) return null;

  const firstRevealed = game.revealedIndices[0];
  const skill = skillRatio(level);

  // İkinci kart: eş arıyor
  if (firstRevealed != null) {
    const need = game.cards[firstRevealed].value;
    // Yüksek seviye: gizli bilgi
    if (clampLevel(level) >= 9 && Math.random() < skill * 0.5) {
      const match = hidden.find(({ card }) => card.value === need);
      if (match) return match.index;
    }
    const knownMatch = hidden.find(({ index }) => game.botMemory[index] === need && index !== firstRevealed);
    if (knownMatch && Math.random() < 0.2 + skill * 0.8) return knownMatch.index;
    return pickRandom(hidden).index;
  }

  // Bilinen çift varsa aç
  const values = {};
  for (const { index } of hidden) {
    const value = game.botMemory[index];
    if (!value) continue;
    if (!values[value]) values[value] = [];
    values[value].push(index);
  }
  const knownPair = Object.values(values).find((indexes) => indexes.length >= 2);
  if (knownPair && Math.random() < 0.15 + skill * 0.85) {
    return knownPair[0];
  }

  if (shouldBlunder(level) || clampLevel(level) <= 2) return pickRandom(hidden).index;

  // Bilinmeyen kart tercih et
  const unknown = hidden.filter(({ index }) => !game.botMemory[index]);
  return pickRandom(unknown.length ? unknown : hidden).index;
}

/* ---------- Ortak seçici ---------- */

function chooseAction(game, level, botId) {
  if (!game || game.winner) return null;
  const lv = clampLevel(level);

  switch (game.gameId) {
    case 'tictactoe': {
      const mySymbol = game.player1 === botId ? 'X' : game.player2 === botId ? 'O' : null;
      if (!mySymbol || game.currentTurn !== mySymbol) return null;
      const index = chooseTicTacToeMove(game, lv);
      return index == null ? null : { type: 'tictactoe', index };
    }
    case 'chess': {
      const mySide = game.player1 === botId
        ? (game.whitePlayer === 'player2' ? 'b' : 'w')
        : game.player2 === botId
          ? (game.whitePlayer === 'player2' ? 'w' : 'b')
          : null;
      if (!mySide || game.currentTurn !== mySide) return null;
      const move = chooseChessMove(game, lv);
      return move ? { type: 'chess', from: move.from, to: move.to, promo: move.promo || 'Q' } : null;
    }
    case 'backgammon': {
      const myTurn = game.currentTurn === 'player1' ? game.player1 : game.player2;
      if (myTurn !== botId) return null;
      if (!game.rolledDice) return { type: 'backgammon-roll' };
      const move = chooseBackgammonMove(game, lv);
      return move
        ? { type: 'backgammon-move', from: move.from, to: move.to, die: move.die, dice: move.dice, via: move.via }
        : null;
    }
    case 'battleship': {
      if (game.phase === 'placement') {
        const needsShips = (game.player1 === botId && !game.ships1) || (game.player2 === botId && !game.ships2);
        if (!needsShips) return null;
        return { type: 'battleship-place', ships: battleship.placeShipsRandom().ships };
      }
      const myTurn = game.currentTurn === 'player1' ? game.player1 : game.player2;
      if (myTurn !== botId || game.phase !== 'battle') return null;
      const index = chooseBattleshipShot(game, lv, botId);
      return index == null ? null : { type: 'battleship-shot', index };
    }
    case 'lingo': {
      const myTurn = game.currentTurn === 'player1' ? game.player1 : game.player2;
      if (myTurn !== botId) return null;
      return { type: 'lingo', guess: chooseLingoGuess(game, lv) };
    }
    case 'memory': {
      const myTurn = game.currentTurn === 'player1' ? game.player1 : game.player2;
      if (myTurn !== botId || game.mismatchPending) return null;
      const index = chooseMemoryFlip(game, lv);
      return index == null ? null : { type: 'memory', index };
    }
    default:
      return null;
  }
}

function isBotsTurn(game, botId) {
  if (!game || !botId || game.winner) return false;
  if (game.gameId === 'battleship' && game.phase === 'placement') {
    return (game.player1 === botId && !game.ships1) || (game.player2 === botId && !game.ships2);
  }
  if (game.gameId === 'tictactoe') {
    const symbol = game.player1 === botId ? 'X' : game.player2 === botId ? 'O' : null;
    return symbol && game.currentTurn === symbol;
  }
  if (game.gameId === 'chess') {
    const side = game.player1 === botId
      ? (game.whitePlayer === 'player2' ? 'b' : 'w')
      : game.player2 === botId
        ? (game.whitePlayer === 'player2' ? 'w' : 'b')
        : null;
    return side && game.currentTurn === side;
  }
  if (game.gameId === 'memory' && game.mismatchPending) return false;
  const turnId = game.currentTurn === 'player1' ? game.player1 : game.player2;
  return turnId === botId;
}

module.exports = {
  clampLevel,
  thinkDelayMs,
  botDisplayName,
  isBotId,
  makeBotId,
  chooseAction,
  isBotsTurn
};
