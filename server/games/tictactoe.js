const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function getInitialState(keepScores = false, previous, startingPlayer = 'player1') {
  return {
    gameId: 'tictactoe',
    board: Array(9).fill(null),
    currentTurn: startingPlayer === 'player2' ? 'O' : 'X',
    startingPlayer,
    winner: null,
    player1: keepScores && previous ? previous.player1 : null,
    player2: keepScores && previous ? previous.player2 : null,
    score1: keepScores && previous ? (previous.score1 || 0) : 0,
    score2: keepScores && previous ? (previous.score2 || 0) : 0
  };
}

function checkWinner(board) {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.includes(null) ? null : 'draw';
}

function playMove(game, socketId, index) {
  if (!game || game.gameId !== 'tictactoe' || !Number.isInteger(index) ||
      index < 0 || index > 8 || game.board[index] || game.winner) return false;

  const mySymbol = game.player1 === socketId ? 'X' : game.player2 === socketId ? 'O' : null;
  if (!mySymbol || game.currentTurn !== mySymbol) return false;

  game.board[index] = mySymbol;
  game.winner = checkWinner(game.board);
  game.currentTurn = game.currentTurn === 'X' ? 'O' : 'X';

  if (game.winner && game.winner !== 'draw') {
    if (game.winner === 'X') game.score1 = (game.score1 || 0) + 1;
    else game.score2 = (game.score2 || 0) + 1;
  }
  return true;
}

module.exports = { getInitialState, playMove };
