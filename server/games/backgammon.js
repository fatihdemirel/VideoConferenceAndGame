const CHECKERS_PER_PLAYER = 15;

function getInitialState(keepScores = false, previous, startingPlayer = 'player1') {
  const points = Array(24).fill(0);
  points[23] = 2;
  points[12] = 5;
  points[7] = 3;
  points[5] = 5;
  points[0] = -2;
  points[11] = -5;
  points[16] = -3;
  points[18] = -5;

  return {
    gameId: 'backgammon',
    points,
    bar: { player1: 0, player2: 0 },
    off: { player1: 0, player2: 0 },
    currentTurn: startingPlayer,
    startingPlayer,
    rolledDice: null,
    diceRemaining: [],
    legalMoves: [],
    winner: null,
    player1: keepScores && previous ? previous.player1 : null,
    player2: keepScores && previous ? previous.player2 : null,
    score1: keepScores && previous ? (previous.score1 || 0) : 0,
    score2: keepScores && previous ? (previous.score2 || 0) : 0
  };
}

function isPlayersTurn(game, socketId) {
  return game.currentTurn === 'player1'
    ? game.player1 === socketId
    : game.player2 === socketId;
}

function moveOptions(points, bar, player, die) {
  const direction = player === 'player1' ? -1 : 1;
  const ownSign = player === 'player1' ? 1 : -1;
  const opponent = player === 'player1' ? 'player2' : 'player1';
  const moves = [];
  const sources = bar[player] > 0 ? ['bar'] : points
    .map((count, point) => count * ownSign > 0 ? point : null)
    .filter(point => point !== null);

  for (const from of sources) {
    let to;
    if (from === 'bar') {
      to = player === 'player1' ? 24 - die : die - 1;
    } else {
      to = from + direction * die;
    }

    if (to >= 0 && to < 24) {
      const landing = points[to];
      if (landing * ownSign < -1) continue;
      moves.push({ from, to, die });
      continue;
    }

    if (from === 'bar' || bar[player] > 0 || !isAllHome(points, bar, player)) continue;
    const exactOrOvershoot = player === 'player1' ? to < 0 : to > 23;
    if (!exactOrOvershoot) continue;
    const canOvershoot = player === 'player1'
      ? !points.slice(from + 1, 6).some(count => count > 0)
      : !points.slice(18, from).some(count => count < 0);
    const exactBearOff = die === (player === 'player1' ? from + 1 : 24 - from);
    if (exactBearOff || canOvershoot) {
      moves.push({ from, to: 'off', die });
    }
  }

  return moves;
}

function isAllHome(points, bar, player) {
  if (bar[player] > 0) return false;
  return player === 'player1'
    ? !points.slice(6).some(count => count > 0)
    : !points.slice(0, 18).some(count => count < 0);
}

function applyMove(position, player, move) {
  const next = {
    points: position.points.slice(),
    bar: { ...position.bar },
    off: { ...position.off }
  };
  const sign = player === 'player1' ? 1 : -1;
  const opponent = player === 'player1' ? 'player2' : 'player1';

  if (move.from === 'bar') {
    next.bar[player]--;
  } else {
    next.points[move.from] -= sign;
  }

  if (move.to === 'off') {
    next.off[player]++;
  } else {
    if (next.points[move.to] === -sign) {
      next.points[move.to] = 0;
      next.bar[opponent]++;
    }
    next.points[move.to] += sign;
  }
  return next;
}

function bestMoves(points, bar, off, player, dice) {
  const memo = new Map();
  const solve = (position, remaining) => {
    if (!remaining.length) return { count: 0, moves: [] };
    const key = `${position.points.join(',')};${position.bar.player1},${position.bar.player2};${position.off.player1},${position.off.player2};${remaining.join(',')}`;
    if (memo.has(key)) return memo.get(key);

    let maxCount = 0;
    let firstMoves = [];
    for (const die of new Set(remaining)) {
      for (const move of moveOptions(position.points, position.bar, player, die)) {
        const afterMove = applyMove(position, player, move);
        const diceAfterMove = remaining.slice();
        diceAfterMove.splice(diceAfterMove.indexOf(die), 1);
        const next = solve(afterMove, diceAfterMove);
        const count = next.count + 1;
        if (count > maxCount) {
          maxCount = count;
          firstMoves = [move];
        } else if (count === maxCount) {
          firstMoves.push(move);
        }
      }
    }

    const unique = new Map(firstMoves.map(move => [`${move.from}:${move.to}:${move.die}`, move]));
    const result = { count: maxCount, moves: [...unique.values()] };
    memo.set(key, result);
    return result;
  };

  const result = solve({ points, bar, off }, dice);
  if (result.count === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const higherDieMoves = result.moves.filter(move => move.die === Math.max(...dice));
    if (higherDieMoves.length) return higherDieMoves;
  }
  return result.moves;
}

function rollDice(game, socketId, random = Math.random) {
  if (!game || game.gameId !== 'backgammon' || game.winner ||
      game.rolledDice || !isPlayersTurn(game, socketId)) return false;
  const first = Math.floor(random() * 6) + 1;
  const second = Math.floor(random() * 6) + 1;
  game.rolledDice = [first, second];
  game.diceRemaining = first === second ? [first, first, first, first] : [first, second];
  game.legalMoves = bestMoves(game.points, game.bar, game.off, game.currentTurn, game.diceRemaining);
  if (game.legalMoves.length === 0) {
    game.currentTurn = game.currentTurn === 'player1' ? 'player2' : 'player1';
    game.rolledDice = null;
    game.diceRemaining = [];
  }
  return true;
}

function playMove(game, socketId, selection) {
  if (!game || game.gameId !== 'backgammon' || game.winner ||
      !game.rolledDice || !isPlayersTurn(game, socketId)) return false;
  if (!selection || !['bar', ...Array.from({ length: 24 }, (_, i) => i)].includes(selection.from) ||
      !['off', ...Array.from({ length: 24 }, (_, i) => i)].includes(selection.to) ||
      !Number.isInteger(selection.die)) return false;
  const move = game.legalMoves.find(candidate =>
    candidate.from === selection.from &&
    candidate.to === selection.to &&
    candidate.die === selection.die
  );
  if (!move) return false;

  const next = applyMove(game, game.currentTurn, move);
  game.points = next.points;
  game.bar = next.bar;
  game.off = next.off;
  game.diceRemaining.splice(game.diceRemaining.indexOf(move.die), 1);

  if (game.off[game.currentTurn] === CHECKERS_PER_PLAYER) {
    game.winner = game.currentTurn;
    game[game.currentTurn === 'player1' ? 'score1' : 'score2']++;
    game.legalMoves = [];
    return true;
  }

  game.legalMoves = bestMoves(game.points, game.bar, game.off, game.currentTurn, game.diceRemaining);
  if (!game.diceRemaining.length || !game.legalMoves.length) {
    game.currentTurn = game.currentTurn === 'player1' ? 'player2' : 'player1';
    game.rolledDice = null;
    game.diceRemaining = [];
    game.legalMoves = [];
  }
  return true;
}

function publicState(game) {
  return {
    ...game,
    points: game.points.slice(),
    bar: { ...game.bar },
    off: { ...game.off },
    rolledDice: game.rolledDice ? game.rolledDice.slice() : null,
    diceRemaining: game.diceRemaining.slice(),
    legalMoves: game.legalMoves.map(move => ({ ...move }))
  };
}

module.exports = { getInitialState, playMove, publicState, rollDice };
