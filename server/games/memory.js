const MISMATCH_DELAY_MS = 900;
const CARD_SYMBOLS = [
  '🐱', '🐶', '🦊', '🐼', '🦁',
  '🐸', '🐵', '🐰', '🐻', '🐧',
  '🍎', '🚗', '⚽', '🎈', '🎁'
];
const BOARD_SIZES = {
  '4x5': { rows: 4, columns: 5, pairCount: 10 },
  '5x6': { rows: 5, columns: 6, pairCount: 15 }
};

function getInitialState(boardSize = '4x5', keepScores = false, previous, startingPlayer = 'player1') {
  const size = BOARD_SIZES[boardSize] || BOARD_SIZES['4x5'];
  const values = CARD_SYMBOLS.slice(0, size.pairCount).flatMap(symbol => [symbol, symbol]);
  for (let index = values.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }

  return {
    gameId: 'memory',
    boardSize: `${size.rows}x${size.columns}`,
    rows: size.rows,
    columns: size.columns,
    cards: values.map((value, index) => ({
      id: index,
      value,
      revealed: false,
      matched: false
    })),
    revealedIndices: [],
    mismatchPending: false,
    currentTurn: startingPlayer,
    startingPlayer,
    winner: null,
    player1: keepScores && previous ? previous.player1 : null,
    player2: keepScores && previous ? previous.player2 : null,
    score1: keepScores && previous ? (previous.score1 || 0) : 0,
    score2: keepScores && previous ? (previous.score2 || 0) : 0
  };
}

function flipCard(game, socketId, index) {
  if (!game || game.gameId !== 'memory' || game.winner || game.mismatchPending ||
      !Number.isInteger(index) || index < 0 || index >= game.cards.length) return null;
  const playerId = game.currentTurn === 'player1' ? game.player1 : game.player2;
  if (!playerId || socketId !== playerId) return null;

  const card = game.cards[index];
  if (card.revealed || card.matched) return null;
  card.revealed = true;
  game.revealedIndices.push(index);

  if (game.revealedIndices.length < 2) return 'revealed';

  const [firstIndex, secondIndex] = game.revealedIndices;
  const firstCard = game.cards[firstIndex];
  const secondCard = game.cards[secondIndex];
  if (firstCard.value !== secondCard.value) {
    game.mismatchPending = true;
    return 'mismatch';
  }

  firstCard.matched = true;
  secondCard.matched = true;
  game.revealedIndices = [];
  game[game.currentTurn === 'player1' ? 'score1' : 'score2'] += 1;

  if (game.cards.every(candidate => candidate.matched)) {
    if (game.score1 === game.score2) game.winner = 'draw';
    else game.winner = game.score1 > game.score2 ? 'player1' : 'player2';
    return 'finished';
  }
  return 'matched';
}

function resolveMismatch(game) {
  if (!game || game.gameId !== 'memory' || !game.mismatchPending || game.revealedIndices.length !== 2) {
    return false;
  }
  game.revealedIndices.forEach(index => { game.cards[index].revealed = false; });
  game.revealedIndices = [];
  game.mismatchPending = false;
  game.currentTurn = game.currentTurn === 'player1' ? 'player2' : 'player1';
  return true;
}

function publicState(game) {
  return {
    gameId: game.gameId,
    boardSize: game.boardSize,
    rows: game.rows,
    columns: game.columns,
    cards: game.cards.map(card => ({
      id: card.id,
      value: card.revealed || card.matched ? card.value : null,
      revealed: card.revealed,
      matched: card.matched
    })),
    currentTurn: game.currentTurn,
    mismatchPending: game.mismatchPending,
    winner: game.winner,
    player1: game.player1,
    player2: game.player2,
    score1: game.score1,
    score2: game.score2
  };
}

module.exports = { MISMATCH_DELAY_MS, flipCard, getInitialState, publicState, resolveMismatch };
