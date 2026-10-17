const BOARD_SIZE = 8;
const SHIPS = [4, 3, 2, 2];

function placeShipsRandom() {
  const grid = Array(BOARD_SIZE * BOARD_SIZE).fill(0);
  const ships = [];
  for (const len of SHIPS) {
    let placed = false;
    for (let attempt = 0; attempt < 100 && !placed; attempt++) {
      const horizontal = Math.random() < 0.5;
      const maxRow = horizontal ? BOARD_SIZE : BOARD_SIZE - len;
      const maxCol = horizontal ? BOARD_SIZE - len : BOARD_SIZE;
      if (maxRow <= 0 || maxCol <= 0) continue;
      const row = Math.floor(Math.random() * maxRow);
      const col = Math.floor(Math.random() * maxCol);
      const cells = [];
      let valid = true;
      for (let i = 0; i < len; i++) {
        const r = horizontal ? row : row + i;
        const c = horizontal ? col + i : col;
        const index = r * BOARD_SIZE + c;
        if (grid[index]) {
          valid = false;
          break;
        }
        cells.push(index);
      }
      if (valid) {
        cells.forEach(index => { grid[index] = 1; });
        ships.push(cells);
        placed = true;
      }
    }
  }
  return { grid, ships };
}

function validateShips(ships) {
  if (!Array.isArray(ships) || ships.length !== SHIPS.length) return false;
  const expectedLengths = [...SHIPS].sort((a, b) => b - a);
  const actualLengths = ships.map(ship => Array.isArray(ship) ? ship.length : 0).sort((a, b) => b - a);
  if (JSON.stringify(expectedLengths) !== JSON.stringify(actualLengths)) return false;

  const occupied = Array(BOARD_SIZE * BOARD_SIZE).fill(0);
  for (const ship of ships) {
    const indexes = ship.map(index => parseInt(index, 10))
      .filter(index => !isNaN(index) && index >= 0 && index < BOARD_SIZE * BOARD_SIZE);
    if (indexes.length !== ship.length) return false;
    const rows = indexes.map(index => Math.floor(index / BOARD_SIZE));
    const columns = indexes.map(index => index % BOARD_SIZE);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minColumn = Math.min(...columns);
    const maxColumn = Math.max(...columns);
    const isLine =
      (maxRow - minRow === indexes.length - 1 && minColumn === maxColumn) ||
      (maxColumn - minColumn === indexes.length - 1 && minRow === maxRow);
    if (!isLine) return false;
    for (const index of indexes) {
      if (occupied[index]) return false;
      occupied[index] = 1;
    }
  }
  return true;
}

function shipsToGrid(ships) {
  const grid = Array(BOARD_SIZE * BOARD_SIZE).fill(0);
  for (const ship of ships) {
    for (const index of ship) grid[index] = 1;
  }
  return grid;
}

function getInitialState(keepScores = false, previous, forcePlacement = false, startingPlayer = 'player1') {
  const usePlacement = forcePlacement || !keepScores || !previous?.ships1;
  return {
    gameId: 'battleship',
    startingPlayer,
    player1: keepScores && previous ? previous.player1 : null,
    player2: keepScores && previous ? previous.player2 : null,
    phase: usePlacement ? 'placement' : 'battle',
    grid1: usePlacement ? null : previous?.grid1,
    grid2: usePlacement ? null : previous?.grid2,
    ships1: usePlacement ? null : previous?.ships1,
    ships2: usePlacement ? null : previous?.ships2,
    shots1: [],
    shots2: [],
    currentTurn: startingPlayer,
    winner: null,
    score1: keepScores && previous ? (previous.score1 || 0) : 0,
    score2: keepScores && previous ? (previous.score2 || 0) : 0
  };
}

function placePlayerShips(game, socketId, ships) {
  if (!game || game.gameId !== 'battleship' || game.phase !== 'placement' || !validateShips(ships)) return false;
  const isPlayer1 = game.player1 === socketId;
  const isPlayer2 = game.player2 === socketId;
  if (!isPlayer1 && !isPlayer2) return false;

  if (isPlayer1) game.ships1 = ships;
  else game.ships2 = ships;

  if (game.ships1 && game.ships2) {
    game.phase = 'battle';
    game.grid1 = shipsToGrid(game.ships1);
    game.grid2 = shipsToGrid(game.ships2);
  }
  return true;
}

function shoot(game, socketId, index) {
  if (!game || game.gameId !== 'battleship' || game.phase !== 'battle' || game.winner ||
      !Number.isInteger(index) || index < 0 || index >= BOARD_SIZE * BOARD_SIZE) return false;

  const isPlayer1 = game.player1 === socketId;
  const isPlayer2 = game.player2 === socketId;
  if (!isPlayer1 && !isPlayer2) return false;
  const currentPlayerId = game.currentTurn === 'player1' ? game.player1 : game.player2;
  if (socketId !== currentPlayerId) return false;

  const myShots = isPlayer1 ? game.shots1 : game.shots2;
  if (myShots.includes(index)) return false;

  const enemyGrid = isPlayer1 ? game.grid2 : game.grid1;
  const enemyShips = isPlayer1 ? game.ships2 : game.ships1;
  myShots.push(index);
  const hit = enemyGrid[index] === 1;
  enemyGrid[index] = hit ? 2 : 3;

  const allSunk = enemyShips.every(ship => ship.every(shipIndex => enemyGrid[shipIndex] === 2));
  if (allSunk) {
    game.winner = isPlayer1 ? 'player1' : 'player2';
    if (isPlayer1) game.score1 = (game.score1 || 0) + 1;
    else game.score2 = (game.score2 || 0) + 1;
  } else if (!hit) {
    game.currentTurn = isPlayer1 ? 'player2' : 'player1';
  }
  return true;
}

module.exports = { BOARD_SIZE, getInitialState, placePlayerShips, shoot };
