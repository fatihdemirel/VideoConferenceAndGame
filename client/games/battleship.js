const BATTLE_SIZE = 8;
const BATTLE_SHIPS = [4, 3, 2, 2];
let battlePlacementShips = [];
let battlePlacementDir = 'h';
let battlePlacementShipIndex = 0;

function renderBattleshipPlacement() {
  battlePlacementShips = [];
  battlePlacementShipIndex = 0;
  battlePlacementDir = 'h';
  if (battlePlacementBoard) {
    battlePlacementBoard.innerHTML = '';
    battlePlacementBoard.style.gridTemplateColumns = `repeat(${BATTLE_SIZE}, 1fr)`;
    for (let i = 0; i < BATTLE_SIZE * BATTLE_SIZE; i++) {
      const cell = document.createElement('div');
      cell.className = 'battle-cell placement-cell';
      cell.dataset.index = i;
      battlePlacementBoard.appendChild(cell);
    }
  }
  updatePlacementUI();
}

function updatePlacementUI() {
  const len = BATTLE_SHIPS[battlePlacementShipIndex];
  battlePlacementStatus.textContent = battlePlacementShips.length === 0 ? 'Gemilerini yerleştir' : `${battlePlacementShips.length}/${BATTLE_SHIPS.length} gemi yerleştirildi`;
  battlePlacementShip.innerHTML = `${len} hücre: <button type="button" class="btn btn-icon btn-small" data-dir="h">Yatay</button> <button type="button" class="btn btn-icon btn-small" data-dir="v">Dikey</button>`;
  battlePlacementShip.querySelectorAll('[data-dir]').forEach(btn => {
    btn.classList.toggle('active', battlePlacementDir === btn.dataset.dir);
    btn.onclick = () => { battlePlacementDir = btn.dataset.dir; updatePlacementUI(); };
  });
  battleReadyBtn?.classList.toggle('hidden', battlePlacementShips.length !== BATTLE_SHIPS.length);
  renderPlacementBoard();
}

function renderPlacementBoard() {
  const used = new Set();
  battlePlacementShips.forEach(ship => ship.forEach(i => used.add(i)));
  battlePlacementBoard?.querySelectorAll('.battle-cell').forEach((cell, i) => {
    cell.className = 'battle-cell placement-cell' + (used.has(i) ? ' ship' : '');
  });
}

function tryPlaceShip(startIdx) {
  const len = BATTLE_SHIPS[battlePlacementShipIndex];
  const row = Math.floor(startIdx / BATTLE_SIZE);
  const col = startIdx % BATTLE_SIZE;
  const cells = [];
  for (let i = 0; i < len; i++) {
    const r = battlePlacementDir === 'h' ? row : row + i;
    const c = battlePlacementDir === 'h' ? col + i : col;
    if (r < 0 || r >= BATTLE_SIZE || c < 0 || c >= BATTLE_SIZE) return false;
    cells.push(r * BATTLE_SIZE + c);
  }
  const used = new Set();
  battlePlacementShips.forEach(ship => ship.forEach(i => used.add(i)));
  if (cells.some(i => used.has(i))) return false;
  battlePlacementShips.push(cells);
  battlePlacementShipIndex++;
  if (battlePlacementShipIndex >= BATTLE_SHIPS.length) battlePlacementShipIndex = 0;
  return true;
}

function renderBattleshipState(state) {
  if (!battleStatus) return;
  if (!state?.player1 || !state?.player2) {
    battleMyBoard && (battleMyBoard.innerHTML = '');
    battleEnemyBoard && (battleEnemyBoard.innerHTML = '');
    battlePlacement?.classList.add('hidden');
    battleBoards?.classList.add('hidden');
    return;
  }

  const isP1 = state.player1 === socket.id;
  const myShips = isP1 ? state.ships1 : state.ships2;
  const otherShips = isP1 ? state.ships2 : state.ships1;

  battleScore.textContent = `${state.score1 || 0} — ${state.score2 || 0}`;

  if (state.phase === 'placement') {
    battlePlacement?.classList.remove('hidden');
    battleBoards?.classList.add('hidden');
    if (!myShips) {
      const isFreshGame = !state.ships1 && !state.ships2;
      if (isFreshGame || battlePlacementShips.length === 0) {
        battlePlacementShips = [];
        battlePlacementShipIndex = 0;
        renderBattleshipPlacement();
      } else {
        updatePlacementUI();
      }
      battlePlacementShip?.classList.remove('hidden');
    } else {
      battlePlacementStatus.textContent = 'Rakip gemilerini yerleştiriyor...';
      battlePlacementShip?.classList.add('hidden');
      battleReadyBtn?.classList.add('hidden');
      battlePlacementBoard.innerHTML = '';
      battlePlacementBoard.style.gridTemplateColumns = `repeat(${BATTLE_SIZE}, 1fr)`;
      const used = new Set();
      myShips.forEach(ship => ship.forEach(i => used.add(i)));
      for (let i = 0; i < BATTLE_SIZE * BATTLE_SIZE; i++) {
        const cell = document.createElement('div');
        cell.className = 'battle-cell' + (used.has(i) ? ' ship' : '');
        battlePlacementBoard.appendChild(cell);
      }
    }
    return;
  }

  battlePlacement?.classList.add('hidden');
  battleBoards?.classList.remove('hidden');

  const myGrid = isP1 ? state.grid1 : state.grid2;
  const enemyGrid = isP1 ? state.grid2 : state.grid1;
  const myShots = isP1 ? state.shots1 : state.shots2;

  let status = '';
  if (state.winner) {
    status = state.winner === (isP1 ? 'player1' : 'player2') ? 'Kazandın!' : 'Kaybettin!';
  } else {
    const myTurn = state.currentTurn === (isP1 ? 'player1' : 'player2');
    status = myTurn ? 'Senin sıran!' : 'Rakibin sırası';
  }
  battleStatus.textContent = status;

  const canShoot = !state.winner && state.currentTurn === (isP1 ? 'player1' : 'player2');

  battleMyBoard.innerHTML = '';
  battleMyBoard.style.gridTemplateColumns = `repeat(${BATTLE_SIZE}, 1fr)`;
  for (let i = 0; i < BATTLE_SIZE * BATTLE_SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'battle-cell';
    if (myGrid[i] === 1) cell.classList.add('ship');
    else if (myGrid[i] === 2) cell.classList.add('hit');
    else if (myGrid[i] === 3) cell.classList.add('miss');
    battleMyBoard.appendChild(cell);
  }

  battleEnemyBoard.innerHTML = '';
  battleEnemyBoard.style.gridTemplateColumns = `repeat(${BATTLE_SIZE}, 1fr)`;
  for (let i = 0; i < BATTLE_SIZE * BATTLE_SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'battle-cell';
    cell.dataset.index = i;
    if (myShots.includes(i)) {
      cell.classList.add(enemyGrid[i] === 2 ? 'hit' : 'miss');
    } else if (canShoot) {
      cell.classList.add('shootable');
    }
    battleEnemyBoard.appendChild(cell);
  }
}

battlePlacementBoard?.addEventListener('click', (e) => {
  const cell = e.target.closest('.battle-cell.placement-cell:not(.ship)');
  if (!cell || !currentRoomId || cell.classList.contains('disabled')) return;
  if (battlePlacementShips.length >= BATTLE_SHIPS.length) return;
  const idx = parseInt(cell.dataset.index, 10);
  if (isNaN(idx)) return;
  if (tryPlaceShip(idx)) updatePlacementUI();
});

battleReadyBtn?.addEventListener('click', () => {
  if (!currentRoomId || battlePlacementShips.length !== BATTLE_SHIPS.length) return;
  socket.emit('game-ships-place', battlePlacementShips);
});

battleEnemyBoard?.addEventListener('click', (e) => {
  const cell = e.target.closest('.battle-cell.shootable');
  if (!cell || !currentRoomId) return;
  const idx = parseInt(cell.dataset.index, 10);
  if (!isNaN(idx) && idx >= 0 && idx < BATTLE_SIZE * BATTLE_SIZE) socket.emit('game-shot', idx);
});
