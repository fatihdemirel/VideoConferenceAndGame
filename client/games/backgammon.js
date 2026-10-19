const backgammonTopPoints = document.getElementById('backgammonTopPoints');
const backgammonBottomPoints = document.getElementById('backgammonBottomPoints');
const backgammonBoardLayout = document.querySelector('.backgammon-board-layout');
const backgammonTopPlayer = document.getElementById('backgammonTopPlayer');
const backgammonBottomPlayer = document.getElementById('backgammonBottomPlayer');
const backgammonControls = document.querySelector('.backgammon-controls');
const backgammonDiceLeft = document.getElementById('backgammonDiceLeft');
const backgammonDiceRight = document.getElementById('backgammonDiceRight');
const backgammonStatus = document.getElementById('backgammonStatus');
const backgammonScore = document.getElementById('backgammonScore');
const backgammonBearOffBtn = document.getElementById('backgammonBearOffBtn');
const backgammonBarPlayer1 = document.getElementById('backgammonBarPlayer1');
const backgammonBarPlayer2 = document.getElementById('backgammonBarPlayer2');
const backgammonOffPlayer1 = document.getElementById('backgammonOffPlayer1');
const backgammonOffPlayer2 = document.getElementById('backgammonOffPlayer2');
const backgammonBarCheckers = {
  player1: backgammonBarPlayer1.querySelector('.backgammon-bar-checkers'),
  player2: backgammonBarPlayer2.querySelector('.backgammon-bar-checkers')
};
let backgammonCurrentState = null;
let backgammonSelectedSource = null;

const diePips = [
  [4],
  [0, 8],
  [0, 4, 8],
  [0, 2, 6, 8],
  [0, 2, 4, 6, 8],
  [0, 2, 3, 5, 6, 8]
];

function renderCheckerStack(container, count, player, className = '') {
  container.replaceChildren();
  for (let index = 0; index < count; index++) {
    const checker = document.createElement('span');
    checker.className = `backgammon-checker ${player}${className ? ` ${className}` : ''}`;
    container.appendChild(checker);
  }
}

function makeBackgammonDie(die, index, state) {
  const dieEl = document.createElement('span');
  dieEl.className = 'backgammon-die';
  const dieOrdinal = state.rolledDice.slice(0, index + 1).filter(value => value === die).length;
  const remainingOrdinal = state.diceRemaining.filter(value => value === die).length;
  if (dieOrdinal > remainingOrdinal) dieEl.classList.add('is-used');
  diePips[die - 1].forEach((pipPosition) => {
    const pip = document.createElement('span');
    pip.className = 'backgammon-die-pip';
    pip.style.gridArea = `${Math.floor(pipPosition / 3) + 1} / ${(pipPosition % 3) + 1}`;
    dieEl.appendChild(pip);
  });
  dieEl.setAttribute('aria-label', `${die} göz`);
  return dieEl;
}

function changedBackgammonMove(previous, next) {
  const sign = previous.currentTurn === 'player1' ? 1 : -1;
  const player = sign > 0 ? 'player1' : 'player2';
  const sources = [];
  const destinations = [];
  for (let point = 0; point < 24; point++) {
    const before = previous.points[point];
    const after = next.points[point];
    if (before * sign > 0 && after === before - sign) sources.push(point);
    if (after * sign > 0 && before * sign >= 0 && after === before + sign) destinations.push(point);
    if (before * sign === -1 && after === sign) destinations.push(point);
  }
  if (previous.bar[player] > next.bar[player]) sources.push('bar');
  if (previous.off[player] < next.off[player]) destinations.push('off');
  if (sources.length !== 1 || destinations.length !== 1) return null;
  return { player, from: sources[0], to: destinations[0] };
}

function animateBackgammonMove(previous, next) {
  if (!previous || !next || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const move = changedBackgammonMove(previous, next);
  if (!move) return;

  const source = move.from === 'bar'
    ? document.getElementById(move.player === 'player1' ? 'backgammonBarPlayer1' : 'backgammonBarPlayer2')
    : document.querySelector(`.backgammon-point[data-point="${move.from}"]`);
  const destination = move.to === 'off'
    ? document.getElementById(move.player === 'player1' ? 'backgammonOffPlayer1' : 'backgammonOffPlayer2')
    : document.querySelector(`.backgammon-point[data-point="${move.to}"]`);
  const targetCheckers = destination?.querySelectorAll(`.backgammon-checker.${move.player}`);
  const targetChecker = targetCheckers?.[targetCheckers.length - 1];
  if (!source || !destination || !targetChecker) return;

  const sourceRect = source.getBoundingClientRect();
  const targetRect = targetChecker.getBoundingClientRect();
  const checker = targetChecker.cloneNode(false);
  checker.classList.add('backgammon-checker-moving');
  checker.setAttribute('aria-hidden', 'true');
  checker.style.left = `${targetRect.left}px`;
  checker.style.top = `${targetRect.top}px`;
  checker.style.width = `${targetRect.width}px`;
  checker.style.height = `${targetRect.height}px`;
  document.body.appendChild(checker);
  const animation = checker.animate([
    {
      transform: `translate(${sourceRect.left + sourceRect.width / 2 - targetRect.left - targetRect.width / 2}px, ${sourceRect.top + sourceRect.height / 2 - targetRect.top - targetRect.height / 2}px) scale(0.9)`
    },
    { transform: 'translate(0, 0) scale(1)' }
  ], { duration: 220, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' });
  animation.onfinish = () => checker.remove();
  animation.oncancel = () => checker.remove();
}

function currentBackgammonPlayer(state) {
  if (state.player1 === socket.id) return 'player1';
  if (state.player2 === socket.id) return 'player2';
  return null;
}

function setBackgammonPlayerLabel(element, player, me) {
  const color = player === 'player1' ? 'Krem' : 'Kahverengi';
  const label = me ? (player === me ? 'Sen' : 'Rakip') : color;
  element.replaceChildren(document.createTextNode(`${label} `));
  const playerNumber = document.createElement('small');
  playerNumber.textContent = `(Oyuncu ${player === 'player1' ? '1' : '2'})`;
  element.appendChild(playerNumber);
}

function makeBackgammonPoint(index, columnIndex, upper, state, myPlayer, legalMoves) {
  const point = document.createElement('button');
  point.type = 'button';
  point.className = `backgammon-point${upper ? ' upper-point' : ' lower-point'}${index % 2 ? ' dark-point' : ' light-point'}`;
  point.dataset.point = String(index);
  point.style.gridColumn = String(columnIndex < 6 ? columnIndex + 1 : columnIndex + 2);
  point.setAttribute('aria-label', `Hane, ${Math.abs(state.points[index])} pul`);

  const checkers = document.createElement('span');
  checkers.className = 'backgammon-checkers';
  const count = Math.abs(state.points[index]);
  const player = state.points[index] > 0 ? 'player1' : state.points[index] < 0 ? 'player2' : null;
  const moveFromHere = legalMoves.some(move => move.from === index);
  const isDestination = backgammonSelectedSource !== null &&
    legalMoves.some(move => move.from === backgammonSelectedSource && move.to === index);
  if (player === myPlayer && moveFromHere) point.classList.add('is-source');
  if (isDestination) point.classList.add('is-destination');
  if (backgammonSelectedSource === index) point.classList.add('is-selected');

  for (let checkerIndex = 0; checkerIndex < Math.min(count, 5); checkerIndex++) {
    const checker = document.createElement('span');
    checker.className = `backgammon-checker ${player}`;
    checkers.appendChild(checker);
  }
  if (count > 5) {
    const overflow = document.createElement('span');
    overflow.className = 'backgammon-checker-count';
    overflow.textContent = String(count);
    checkers.appendChild(overflow);
  }

  point.appendChild(checkers);
  return point;
}

function renderBackgammonState(state, preserveSelection = false) {
  const previousState = backgammonCurrentState;
  backgammonCurrentState = state;
  if (!preserveSelection) backgammonSelectedSource = null;
  renderGameClocks(state);
  if (!state?.player1 || !state?.player2 || !state.points) {
    backgammonBoardLayout.classList.remove('player2-perspective');
    backgammonTopPoints.replaceChildren();
    backgammonBottomPoints.replaceChildren();
    backgammonTopPlayer.textContent = 'Kahverengi (Oyuncu 2)';
    backgammonBottomPlayer.textContent = 'Krem (Oyuncu 1)';
    backgammonDiceLeft.replaceChildren();
    backgammonDiceRight.replaceChildren();
    renderCheckerStack(backgammonOffPlayer1, 0, 'player1', 'off-checker');
    renderCheckerStack(backgammonOffPlayer2, 0, 'player2', 'off-checker');
    renderCheckerStack(backgammonBarCheckers.player1, 0, 'player1', 'bar-checker');
    renderCheckerStack(backgammonBarCheckers.player2, 0, 'player2', 'bar-checker');
    backgammonBarPlayer1.classList.remove('has-checkers', 'is-source');
    backgammonBarPlayer2.classList.remove('has-checkers', 'is-source');
    backgammonRollBtn.disabled = true;
    backgammonRollBtn.classList.add('hidden');
    backgammonBearOffBtn.classList.add('hidden');
    backgammonControls.classList.remove('has-dice', 'can-roll');
    return;
  }

  const me = currentBackgammonPlayer(state);
  const topPlayer = me === 'player2' ? 'player1' : 'player2';
  const bottomPlayer = me === 'player2' ? 'player2' : 'player1';
  backgammonBoardLayout.classList.toggle('player2-perspective', me === 'player2');
  setBackgammonPlayerLabel(backgammonTopPlayer, topPlayer, me);
  setBackgammonPlayerLabel(backgammonBottomPlayer, bottomPlayer, me);
  backgammonTopPoints.setAttribute('aria-label', me === 'player2' ? 'Tavla alt hanesi' : 'Tavla üst hanesi');
  backgammonBottomPoints.setAttribute('aria-label', me === 'player2' ? 'Tavla üst hanesi' : 'Tavla alt hanesi');
  const myTurn = state.currentTurn === me;
  const legalMoves = state.legalMoves || [];
  backgammonScore.textContent = `${state.score1 || 0} — ${state.score2 || 0}`;
  renderCheckerStack(backgammonOffPlayer1, state.off.player1, 'player1', 'off-checker');
  renderCheckerStack(backgammonOffPlayer2, state.off.player2, 'player2', 'off-checker');
  backgammonOffPlayer1.setAttribute('aria-label', `Krem: ${state.off.player1} pul toplandı`);
  backgammonOffPlayer2.setAttribute('aria-label', `Kahverengi: ${state.off.player2} pul toplandı`);
  renderCheckerStack(backgammonBarCheckers.player1, state.bar.player1, 'player1', 'bar-checker');
  renderCheckerStack(backgammonBarCheckers.player2, state.bar.player2, 'player2', 'bar-checker');
  backgammonBarPlayer1.setAttribute('aria-label', `Krem kırık pulları: ${state.bar.player1}`);
  backgammonBarPlayer2.setAttribute('aria-label', `Kahverengi kırık pulları: ${state.bar.player2}`);
  backgammonBarPlayer1.classList.toggle('has-checkers', state.bar.player1 > 0);
  backgammonBarPlayer2.classList.toggle('has-checkers', state.bar.player2 > 0);
  backgammonBarPlayer1.classList.toggle('is-source', myTurn && me === 'player1' && legalMoves.some(move => move.from === 'bar'));
  backgammonBarPlayer2.classList.toggle('is-source', myTurn && me === 'player2' && legalMoves.some(move => move.from === 'bar'));

  backgammonTopPoints.replaceChildren();
  for (let column = 0; column < 12; column++) {
    backgammonTopPoints.appendChild(makeBackgammonPoint(column + 12, column, true, state, me, legalMoves));
  }
  backgammonBottomPoints.replaceChildren();
  for (let column = 0; column < 12; column++) {
    backgammonBottomPoints.appendChild(makeBackgammonPoint(11 - column, column, false, state, me, legalMoves));
  }

  backgammonDiceLeft.replaceChildren();
  backgammonDiceRight.replaceChildren();
  (state.rolledDice || []).forEach((die, index) => {
    (index === 0 ? backgammonDiceLeft : backgammonDiceRight).appendChild(makeBackgammonDie(die, index, state));
  });

  const endedByTime = state.endReason === 'timeout';
  if (state.winner) {
    const won = state.winner === me;
    backgammonStatus.textContent = endedByTime
      ? (won ? 'Süre rakibinde bitti. Kazandın!' : 'Süren doldu. Kaybettin!')
      : (won ? 'Kazandın!' : 'Kaybettin!');
  } else if (!me) {
    backgammonStatus.textContent = state.currentTurn === 'player1' ? 'Krem sırası' : 'Kahverengi sırası';
  } else if (!state.rolledDice) {
    backgammonStatus.textContent = myTurn ? 'Senin sıran · zarları at' : 'Rakip zar atıyor';
  } else {
    backgammonStatus.textContent = myTurn ? 'Senin sıran · pullarını oynat' : 'Rakibin pullarını oynatıyor';
  }

  const canRoll = myTurn && !state.winner && !state.rolledDice;
  backgammonRollBtn.disabled = !canRoll;
  backgammonRollBtn.classList.toggle('hidden', !canRoll);
  backgammonControls.classList.toggle('has-dice', !!state.rolledDice);
  backgammonControls.classList.toggle('can-roll', canRoll);
  backgammonBearOffBtn.classList.toggle('hidden', !myTurn || !legalMoves.some(move =>
    move.from === backgammonSelectedSource && move.to === 'off'
  ));
  animateBackgammonMove(previousState, state);
}

function selectBackgammonSource(source) {
  const state = backgammonCurrentState;
  if (!state || state.winner || state.currentTurn !== currentBackgammonPlayer(state) || !state.rolledDice) return;
  const hasMove = state.legalMoves.some(move => move.from === source);
  backgammonSelectedSource = hasMove && backgammonSelectedSource !== source ? source : null;
  renderBackgammonState(state, true);
}

function makeBackgammonMove(destination) {
  const state = backgammonCurrentState;
  if (!state || backgammonSelectedSource === null) return;
  const move = state.legalMoves.find(candidate =>
    candidate.from === backgammonSelectedSource && candidate.to === destination
  );
  if (!move) return;
  socket.emit('game-backgammon-move', move);
  backgammonSelectedSource = null;
}

backgammonRollBtn.addEventListener('click', () => {
  if (currentRoomId) {
    backgammonSelectedSource = null;
    socket.emit('game-backgammon-roll');
  }
});

backgammonBearOffBtn.addEventListener('click', () => makeBackgammonMove('off'));

backgammonStateRoot.addEventListener('click', (event) => {
  const point = event.target.closest('.backgammon-point');
  if (point) {
    const index = Number(point.dataset.point);
    if (backgammonSelectedSource !== null) {
      const move = backgammonCurrentState?.legalMoves.find(candidate =>
        candidate.from === backgammonSelectedSource && candidate.to === index
      );
      if (move) {
        makeBackgammonMove(index);
        return;
      }
    }
    selectBackgammonSource(index);
    return;
  }

  const barSeat = event.target.closest('.backgammon-bar-seat');
  if (barSeat && barSeat.dataset.player === currentBackgammonPlayer(backgammonCurrentState || {})) {
    selectBackgammonSource('bar');
  }
});
