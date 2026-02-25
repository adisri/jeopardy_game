// ===== STATE =====
const state = {
  config: {
    gameName: '',
    numCategories: 6,
    numQuestions: 5,
    pointValues: [200, 400, 600, 800, 1000],
    players: ['Player 1', 'Player 2'],
  },
  categories: [],        // [{name, questions: [{question, answer, points, dailyDouble}]}]
  answeredCells: {},     // "catIdx-qIdx" → true
  scores: {},            // { 'Player 1': 0, 'Player 2': 0 }
  currentCell: null,     // {catIdx, qIdx, ddPlayerIdx: null|int, ddWager: null|int}
  gameId: null,          // int if saved game, null if ephemeral
  pendingResume: null,   // { answeredCells, scores, players } from backend, cleared after use
};

// ===== API CLIENT =====
async function apiListGames() {
  const res = await fetch('/api/games');
  if (!res.ok) throw new Error('Failed to load games');
  return res.json();
}

async function apiCreateGame(payload) {
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) {
    const err = new Error('duplicate');
    err.status = 409;
    throw err;
  }
  if (!res.ok) throw new Error('Failed to save game');
  return res.json();
}

async function apiGetGame(id) {
  const res = await fetch(`/api/games/${id}`);
  if (!res.ok) throw new Error('Failed to load game');
  return res.json();
}

async function apiDeleteGame(id) {
  const res = await fetch(`/api/games/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete game');
}

async function apiSaveGameState(id, statePayload) {
  const res = await fetch(`/api/games/${id}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(statePayload),
  });
  if (!res.ok) throw new Error('Failed to save game state');
  return res.json();
}

// ===== SCREEN NAVIGATION =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
}

// ===== PLAYER NAME INPUTS (shared by config + players screens) =====
function buildPlayerNameInputs(containerId, count, existing = []) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  for (let i = 0; i < count; i++) {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = `Player ${i + 1} Name`;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Player ${i + 1}`;
    input.dataset.playerIdx = i;
    input.value = existing[i] || '';

    group.appendChild(label);
    group.appendChild(input);
    container.appendChild(group);
  }
}

// ===== CONFIG SCREEN =====
function initConfigScreen() {
  document.getElementById('game-name').value = state.config.gameName || '';
  document.getElementById('num-categories').value = state.config.numCategories;
  document.getElementById('num-questions').value = state.config.numQuestions;
  document.getElementById('point-values').value = state.config.pointValues.join(',');
  const numPlayers = state.config.players ? state.config.players.length : 2;
  document.getElementById('num-players').value = numPlayers;
  buildPlayerNameInputs('player-names-container', numPlayers, state.config.players || []);
  hideError('config-error');
}

function validateAndAdvanceConfig() {
  const gameName = document.getElementById('game-name').value.trim();
  const numCat = parseInt(document.getElementById('num-categories').value, 10);
  const numQ = parseInt(document.getElementById('num-questions').value, 10);
  const pvRaw = document.getElementById('point-values').value.trim();
  const numPlayers = parseInt(document.getElementById('num-players').value, 10);

  if (isNaN(numCat) || numCat < 1 || numCat > 10) {
    showError('config-error', 'Number of categories must be between 1 and 10.');
    return;
  }
  if (isNaN(numQ) || numQ < 1 || numQ > 10) {
    showError('config-error', 'Questions per category must be between 1 and 10.');
    return;
  }

  const pvParts = pvRaw.split(',').map(s => s.trim()).filter(Boolean);
  const pointValues = pvParts.map(s => parseInt(s, 10));
  if (pointValues.some(isNaN) || pointValues.length === 0) {
    showError('config-error', 'Point values must be a comma-separated list of numbers.');
    return;
  }
  if (pointValues.length !== numQ) {
    showError('config-error', `You entered ${numQ} questions per category but ${pointValues.length} point value(s). They must match.`);
    return;
  }

  if (isNaN(numPlayers) || numPlayers < 2 || numPlayers > 8) {
    showError('config-error', 'Number of players must be between 2 and 8.');
    return;
  }

  const players = [];
  document.querySelectorAll('#player-names-container input[data-player-idx]').forEach((input, i) => {
    players.push(input.value.trim() || `Player ${i + 1}`);
  });

  hideError('config-error');
  state.config = { gameName, numCategories: numCat, numQuestions: numQ, pointValues, players };
  buildSetupScreen();
  showScreen('setup');
}

// ===== IMAGE HELPER =====
function resizeImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        const scale = Math.min(1, 800 / img.width, 600 / img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ===== SETUP SCREEN =====
function buildSetupScreen() {
  const container = document.getElementById('categories-container');
  container.innerHTML = '';
  const { numCategories, numQuestions, pointValues } = state.config;

  for (let c = 0; c < numCategories; c++) {
    const block = document.createElement('div');
    block.className = 'category-block';

    const heading = document.createElement('h3');
    heading.textContent = `Category ${c + 1}`;
    block.appendChild(heading);

    const nameRow = document.createElement('div');
    nameRow.className = 'category-name-row';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Category Name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = `Category ${c + 1} name`;
    nameInput.dataset.cat = c;
    nameInput.dataset.field = 'name';
    // Restore saved value if present
    if (state.categories[c]) {
      nameInput.value = state.categories[c].name || '';
    }
    nameRow.appendChild(nameLabel);
    nameRow.appendChild(nameInput);
    block.appendChild(nameRow);

    // Column headers for Q/A/DD
    const headers = document.createElement('div');
    headers.className = 'qa-headers';
    ['Points', 'Question', 'Answer', 'DD'].forEach(t => {
      const s = document.createElement('span');
      s.textContent = t;
      headers.appendChild(s);
    });
    block.appendChild(headers);

    for (let q = 0; q < numQuestions; q++) {
      const row = document.createElement('div');
      row.className = 'question-row';

      const pts = document.createElement('span');
      pts.className = 'point-label';
      pts.textContent = `$${pointValues[q]}`;
      row.appendChild(pts);

      const qInput = document.createElement('input');
      qInput.type = 'text';
      qInput.placeholder = 'Question';
      qInput.dataset.cat = c;
      qInput.dataset.q = q;
      qInput.dataset.field = 'question';
      if (state.categories[c] && state.categories[c].questions[q]) {
        qInput.value = state.categories[c].questions[q].question || '';
      }
      row.appendChild(qInput);

      const answerCell = document.createElement('div');
      answerCell.className = 'answer-cell';

      const aInput = document.createElement('input');
      aInput.type = 'text';
      aInput.placeholder = 'Answer';
      aInput.dataset.cat = c;
      aInput.dataset.q = q;
      aInput.dataset.field = 'answer';
      if (state.categories[c] && state.categories[c].questions[q]) {
        aInput.value = state.categories[c].questions[q].answer || '';
      }
      answerCell.appendChild(aInput);

      // Image upload row
      const imgRow = document.createElement('div');
      imgRow.className = 'answer-img-row';

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.className = 'answer-img-file-input';

      const attachLabel = document.createElement('label');
      attachLabel.className = 'btn-attach-img';
      attachLabel.textContent = '+ Image';
      attachLabel.appendChild(fileInput);

      const thumb = document.createElement('img');
      thumb.className = 'answer-img-thumb hidden';
      thumb.alt = '';

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove-img hidden';
      removeBtn.textContent = '✕';

      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.dataset.cat = c;
      hiddenInput.dataset.q = q;
      hiddenInput.dataset.field = 'imageData';

      // Restore saved image if present
      const savedImage = state.categories[c]?.questions[q]?.image;
      if (savedImage) {
        hiddenInput.value = savedImage;
        thumb.src = savedImage;
        thumb.classList.remove('hidden');
        removeBtn.classList.remove('hidden');
      }

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
          const dataUrl = await resizeImageToBase64(file);
          hiddenInput.value = dataUrl;
          thumb.src = dataUrl;
          thumb.classList.remove('hidden');
          removeBtn.classList.remove('hidden');
        } catch (e) {
          alert('Failed to load image: ' + e.message);
        }
        fileInput.value = '';
      });

      removeBtn.addEventListener('click', () => {
        hiddenInput.value = '';
        thumb.src = '';
        thumb.classList.add('hidden');
        removeBtn.classList.add('hidden');
      });

      imgRow.appendChild(attachLabel);
      imgRow.appendChild(thumb);
      imgRow.appendChild(removeBtn);
      imgRow.appendChild(hiddenInput);
      answerCell.appendChild(imgRow);

      row.appendChild(answerCell);

      const ddCell = document.createElement('div');
      ddCell.className = 'dd-checkbox-cell';
      const ddCheckbox = document.createElement('input');
      ddCheckbox.type = 'checkbox';
      ddCheckbox.dataset.cat = c;
      ddCheckbox.dataset.q = q;
      ddCheckbox.dataset.field = 'dailyDouble';
      if (state.categories[c]?.questions[q]?.dailyDouble) ddCheckbox.checked = true;
      ddCell.appendChild(ddCheckbox);
      row.appendChild(ddCell);

      block.appendChild(row);
    }

    container.appendChild(block);
  }
}

function readSetupFormData() {
  const { numCategories, numQuestions, pointValues } = state.config;
  const errors = [];
  const categories = [];

  for (let c = 0; c < numCategories; c++) {
    const nameInput = document.querySelector(`input[data-cat="${c}"][data-field="name"]`);
    const catName = nameInput ? nameInput.value.trim() : '';
    if (!catName) errors.push(`Category ${c + 1} needs a name.`);

    const questions = [];
    for (let q = 0; q < numQuestions; q++) {
      const qInput = document.querySelector(`input[data-cat="${c}"][data-q="${q}"][data-field="question"]`);
      const aInput = document.querySelector(`input[data-cat="${c}"][data-q="${q}"][data-field="answer"]`);
      const ddInput = document.querySelector(`input[data-cat="${c}"][data-q="${q}"][data-field="dailyDouble"]`);
      const imageInput = document.querySelector(`input[data-cat="${c}"][data-q="${q}"][data-field="imageData"]`);
      const question = qInput ? qInput.value.trim() : '';
      const answer = aInput ? aInput.value.trim() : '';
      const dailyDouble = ddInput ? ddInput.checked : false;
      const image = imageInput?.value || null;
      if (!question) errors.push(`Category ${c + 1}, $${pointValues[q]}: question is blank.`);
      if (!answer) errors.push(`Category ${c + 1}, $${pointValues[q]}: answer is blank.`);
      questions.push({ question, answer, points: pointValues[q], dailyDouble, image });
    }
    categories.push({ name: catName, questions });
  }

  return { valid: errors.length === 0, categories, errors };
}

// ===== BOARD =====
function buildBoard() {
  // Initialize scores from current player list, preserving any existing values
  const existingScores = state.scores;
  state.scores = {};
  const players = state.config.players || [];
  players.forEach(p => { state.scores[p] = existingScores[p] ?? 0; });

  const board = document.getElementById('game-board');
  board.innerHTML = '';
  const { categories } = state;
  const numCat = categories.length;

  board.style.gridTemplateColumns = `repeat(${numCat}, 1fr)`;

  // Header row
  categories.forEach(cat => {
    const cell = document.createElement('div');
    cell.className = 'board-header-cell';
    cell.textContent = cat.name;
    board.appendChild(cell);
  });

  // Question rows: outer = row (difficulty), inner = column (category)
  const numQ = categories[0].questions.length;
  for (let q = 0; q < numQ; q++) {
    for (let c = 0; c < numCat; c++) {
      const cell = document.createElement('div');
      cell.className = 'board-question-cell';
      const key = `${c}-${q}`;
      if (state.answeredCells[key]) {
        cell.classList.add('answered');
      } else {
        cell.textContent = `$${categories[c].questions[q].points}`;
        cell.addEventListener('click', () => openQuestion(c, q));
      }
      board.appendChild(cell);
    }
  }

  // Set board title
  document.getElementById('board-title').textContent = state.config.gameName || 'Jeopardy!';

  updateScoreboard();
}

// ===== SCOREBOARD =====
function updateScoreboard() {
  const container = document.getElementById('scoreboard-players');
  container.innerHTML = '';

  const players = state.config.players || [];
  if (players.length === 0) return;

  const maxScore = Math.max(...players.map(p => state.scores[p] || 0));

  players.forEach(player => {
    const score = state.scores[player] || 0;
    const isLeader = score === maxScore && maxScore > 0;

    const row = document.createElement('div');
    row.className = 'scoreboard-row' + (isLeader ? ' leader' : '');

    const name = document.createElement('span');
    name.className = 'scoreboard-name';
    name.textContent = player;

    const scoreEl = document.createElement('span');
    scoreEl.className = 'scoreboard-score';
    scoreEl.textContent = `$${score}`;

    row.appendChild(name);
    row.appendChild(scoreEl);
    container.appendChild(row);
  });
}

// ===== MODAL =====
function openQuestion(catIdx, qIdx) {
  const cat = state.categories[catIdx];
  const q = cat.questions[qIdx];
  state.currentCell = { catIdx, qIdx, ddPlayerIdx: null, ddWager: null };

  document.getElementById('modal-category').textContent = cat.name;
  document.getElementById('question-modal').classList.remove('hidden');

  if (q.dailyDouble) {
    // DD: show player-selection step, hide everything else
    document.getElementById('modal-value').textContent = 'Daily Double!';
    document.getElementById('modal-question-area').classList.add('hidden');
    document.getElementById('modal-answer-area').classList.add('hidden');
    document.getElementById('modal-attribution').classList.add('hidden');
    document.getElementById('btn-show-answer').classList.add('hidden');
    document.getElementById('btn-close-modal').classList.remove('hidden');
    document.getElementById('modal-dd-wager-step').classList.add('hidden');
    // Build player buttons for DD step 1
    const btnContainer = document.getElementById('dd-player-buttons');
    btnContainer.innerHTML = '';
    (state.config.players || []).forEach((player, idx) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-attribution';
      btn.textContent = player;
      btn.addEventListener('click', () => selectDDPlayer(idx));
      btnContainer.appendChild(btn);
    });
    document.getElementById('modal-dd-player-step').classList.remove('hidden');
  } else {
    // Normal flow
    document.getElementById('modal-value').textContent = `$${q.points}`;
    document.getElementById('modal-question').textContent = q.question;
    document.getElementById('modal-answer').textContent = q.answer;
    const modalAnswerImg = document.getElementById('modal-answer-img');
    if (q.image) {
      modalAnswerImg.src = q.image;
      modalAnswerImg.classList.remove('hidden');
    } else {
      modalAnswerImg.src = '';
      modalAnswerImg.classList.add('hidden');
    }
    document.getElementById('modal-answer-area').classList.add('hidden');
    document.getElementById('modal-attribution').classList.add('hidden');
    document.getElementById('attribution-buttons').innerHTML = '';
    document.getElementById('btn-show-answer').classList.remove('hidden');
    document.getElementById('btn-close-modal').classList.remove('hidden');
    document.getElementById('modal-dd-player-step').classList.add('hidden');
    document.getElementById('modal-dd-wager-step').classList.add('hidden');
    document.getElementById('modal-question-area').classList.remove('hidden');
  }
}

function selectDDPlayer(playerIdx) {
  state.currentCell.ddPlayerIdx = playerIdx;
  const player = state.config.players[playerIdx];
  const playerScore = state.scores[player] || 0;
  const maxPointValue = Math.max(...state.config.pointValues);
  const maxWager = Math.max(playerScore, maxPointValue);

  document.getElementById('modal-dd-player-step').classList.add('hidden');
  document.getElementById('dd-wager-hint').textContent =
    `Max wager: $${maxWager} (your score: $${playerScore})`;
  document.getElementById('dd-wager-input').value = '';
  document.getElementById('dd-wager-input').max = maxWager;
  document.getElementById('dd-wager-error').classList.add('hidden');
  document.getElementById('modal-dd-wager-step').classList.remove('hidden');
}

function confirmDDWager() {
  const { ddPlayerIdx } = state.currentCell;
  const player = state.config.players[ddPlayerIdx];
  const playerScore = state.scores[player] || 0;
  const maxPointValue = Math.max(...state.config.pointValues);
  const maxWager = Math.max(playerScore, maxPointValue);

  const raw = parseInt(document.getElementById('dd-wager-input').value, 10);
  if (isNaN(raw) || raw < 1) {
    document.getElementById('dd-wager-error').textContent = 'Enter a wager of at least $1.';
    document.getElementById('dd-wager-error').classList.remove('hidden');
    return;
  }
  if (raw > maxWager) {
    document.getElementById('dd-wager-error').textContent = `Wager cannot exceed $${maxWager}.`;
    document.getElementById('dd-wager-error').classList.remove('hidden');
    return;
  }

  state.currentCell.ddWager = raw;

  // Reveal the question
  const { catIdx, qIdx } = state.currentCell;
  const q = state.categories[catIdx].questions[qIdx];
  document.getElementById('modal-value').textContent = `$${raw} wagered`;
  document.getElementById('modal-question').textContent = q.question;
  document.getElementById('modal-answer').textContent = q.answer;
  const modalAnswerImg = document.getElementById('modal-answer-img');
  if (q.image) {
    modalAnswerImg.src = q.image;
    modalAnswerImg.classList.remove('hidden');
  } else {
    modalAnswerImg.src = '';
    modalAnswerImg.classList.add('hidden');
  }

  document.getElementById('modal-dd-wager-step').classList.add('hidden');
  document.getElementById('modal-question-area').classList.remove('hidden');
  document.getElementById('modal-answer-area').classList.add('hidden');
  document.getElementById('modal-attribution').classList.add('hidden');
  document.getElementById('btn-show-answer').classList.remove('hidden');
  document.getElementById('btn-close-modal').classList.remove('hidden');
}

function buildAttributionButtons() {
  const container = document.getElementById('attribution-buttons');
  container.innerHTML = '';

  const { ddPlayerIdx, ddWager } = state.currentCell || {};

  const prompt = container.closest('#modal-attribution').querySelector('.attribution-prompt');
  if (prompt) {
    prompt.textContent = (ddPlayerIdx !== null && ddPlayerIdx !== undefined && ddWager !== null)
      ? 'Correct or Incorrect?'
      : 'Who got it right?';
  }

  if (ddPlayerIdx !== null && ddPlayerIdx !== undefined && ddWager !== null) {
    // DD: Correct / Incorrect
    const correctBtn = document.createElement('button');
    correctBtn.className = 'btn btn-secondary btn-attribution';
    correctBtn.textContent = 'Correct';
    correctBtn.addEventListener('click', () => closeModal(true, ddPlayerIdx, +ddWager));
    container.appendChild(correctBtn);

    const incorrectBtn = document.createElement('button');
    incorrectBtn.className = 'btn btn-ghost btn-attribution';
    incorrectBtn.textContent = 'Incorrect';
    incorrectBtn.addEventListener('click', () => closeModal(true, ddPlayerIdx, -ddWager));
    container.appendChild(incorrectBtn);
    return;
  }

  // Normal: player name buttons + Nobody
  const players = state.config.players || [];
  players.forEach((player, idx) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-attribution';
    btn.textContent = player;
    btn.addEventListener('click', () => closeModal(true, idx));
    container.appendChild(btn);
  });
  const nobodyBtn = document.createElement('button');
  nobodyBtn.className = 'btn btn-ghost btn-attribution';
  nobodyBtn.textContent = 'Nobody';
  nobodyBtn.addEventListener('click', () => closeModal(true, null));
  container.appendChild(nobodyBtn);
}

function closeModal(markAnswered, playerIdx = null, scoreDelta = null) {
  if (markAnswered && state.currentCell) {
    const { catIdx, qIdx } = state.currentCell;
    const key = `${catIdx}-${qIdx}`;
    state.answeredCells[key] = true;

    if (playerIdx !== null) {
      const player = state.config.players[playerIdx];
      // Use scoreDelta if provided (DD), else use question's points (normal)
      const delta = scoreDelta !== null
        ? scoreDelta
        : state.categories[catIdx].questions[qIdx].points;
      state.scores[player] = (state.scores[player] || 0) + delta;
      updateScoreboard();
    }

    // Auto-save progress for saved games
    if (state.gameId !== null) {
      apiSaveGameState(state.gameId, {
        answeredCells: state.answeredCells,
        scores: state.scores,
        players: state.config.players,
      }).catch(() => {}); // fire-and-forget; never block the UI
    }

    // Update the board cell visually
    const board = document.getElementById('game-board');
    const numCat = state.categories.length;
    // cell index = header row (numCat cells) + qIdx * numCat + catIdx
    const cellIndex = numCat + qIdx * numCat + catIdx;
    const cell = board.children[cellIndex];
    if (cell) {
      cell.classList.add('answered');
      cell.textContent = '';
      cell.removeEventListener('click', cell._clickHandler);
    }
  }

  state.currentCell = null;
  document.getElementById('question-modal').classList.add('hidden');

  if (markAnswered) {
    checkGameOver();
  }
}

// ===== GAME OVER =====
function checkGameOver() {
  if (state.categories.length === 0) return;
  const total = state.categories.length * state.categories[0].questions.length;
  if (Object.keys(state.answeredCells).length >= total) {
    buildFinalScreen();
    showScreen('final');
  }
}

function buildFinalScreen() {
  const players = state.config.players || [];
  const sorted = [...players].sort((a, b) => (state.scores[b] || 0) - (state.scores[a] || 0));

  const winnerArea = document.getElementById('final-winner-area');
  const scoresList = document.getElementById('final-scores-list');
  winnerArea.innerHTML = '';
  scoresList.innerHTML = '';

  if (sorted.length === 0) return;

  const topScore = state.scores[sorted[0]] || 0;
  const winners = sorted.filter(p => (state.scores[p] || 0) === topScore);
  const isTie = winners.length > 1;

  if (isTie) {
    winnerArea.innerHTML = `
      <div class="final-winner">
        <div class="final-crown">🤝</div>
        <div class="final-winner-name">It's a Tie!</div>
        <div class="final-tie-names">${winners.join(' &amp; ')}</div>
        <div class="final-winner-score">$${topScore}</div>
      </div>
    `;
  } else {
    winnerArea.innerHTML = `
      <div class="final-winner">
        <div class="final-crown">👑</div>
        <div class="final-winner-name">${sorted[0]}</div>
        <div class="final-winner-score">$${topScore}</div>
      </div>
    `;
  }

  sorted.slice(isTie ? winners.length : 1).forEach((player, i) => {
    const score = state.scores[player] || 0;
    const row = document.createElement('div');
    row.className = 'final-rank-row';

    const rank = document.createElement('span');
    rank.className = 'final-rank-number';
    rank.textContent = `#${i + (isTie ? winners.length : 2)}`;

    const name = document.createElement('span');
    name.className = 'final-rank-name';
    name.textContent = player;

    const scoreEl = document.createElement('span');
    scoreEl.className = 'final-rank-score';
    scoreEl.textContent = `$${score}`;

    row.appendChild(rank);
    row.appendChild(name);
    row.appendChild(scoreEl);
    scoresList.appendChild(row);
  });
}

// ===== PLAYERS SCREEN (for loaded games) =====
function initPlayersScreen() {
  const savedPlayers = state.pendingResume ? state.pendingResume.players : null;
  const playersToShow = (savedPlayers && savedPlayers.length > 0)
    ? savedPlayers
    : (state.config.players || []);
  const numPlayers = playersToShow.length || 2;
  document.getElementById('num-players-load').value = numPlayers;
  buildPlayerNameInputs('player-names-container-load', numPlayers, playersToShow);

  const banner = document.getElementById('resume-banner');
  if (state.pendingResume) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ===== LOAD SCREEN =====
async function doLoadGame(gameId, forceReset = false) {
  try {
    const fullGame = await apiGetGame(gameId);
    state.gameId = fullGame.id;
    state.config = fullGame.config;
    state.categories = fullGame.categories;
    state.pendingResume = forceReset ? null : (fullGame.game_state || null);
    initPlayersScreen();
    showScreen('players');
  } catch (e) {
    alert('Failed to load game: ' + e.message);
  }
}

async function loadGamesScreen() {
  showScreen('load');
  const listEl = document.getElementById('load-game-list');
  listEl.innerHTML = '<div class="loading-indicator">Loading...</div>';

  try {
    const games = await apiListGames();
    listEl.innerHTML = '';

    if (games.length === 0) {
      listEl.innerHTML = '<div class="load-empty">No saved games yet.</div>';
      return;
    }

    games.forEach(game => {
      const row = document.createElement('div');
      row.className = 'load-game-row';

      const info = document.createElement('div');
      info.className = 'load-game-info';

      const name = document.createElement('div');
      name.className = 'load-game-name';
      name.textContent = game.name;
      if (game.has_state) {
        const badge = document.createElement('span');
        badge.className = 'resume-badge';
        badge.textContent = 'Resume';
        name.appendChild(badge);
      }

      const date = document.createElement('div');
      date.className = 'load-game-date';
      // Append Z so JS parses as UTC
      date.textContent = new Date(game.created_at + 'Z').toLocaleString();

      info.appendChild(name);
      info.appendChild(date);

      const actions = document.createElement('div');
      actions.className = 'load-game-actions';

      if (game.has_state) {
        const resumeBtn = document.createElement('button');
        resumeBtn.className = 'btn btn-load';
        resumeBtn.textContent = 'Resume';
        resumeBtn.addEventListener('click', () => doLoadGame(game.id, false));

        const freshBtn = document.createElement('button');
        freshBtn.className = 'btn btn-back';
        freshBtn.textContent = 'New Game';
        freshBtn.addEventListener('click', () => {
          if (!confirm(`Starting a new game will erase saved progress for "${game.name}". Continue?`)) return;
          doLoadGame(game.id, true);
        });

        actions.appendChild(resumeBtn);
        actions.appendChild(freshBtn);
      } else {
        const loadBtn = document.createElement('button');
        loadBtn.className = 'btn btn-load';
        loadBtn.textContent = 'Load';
        loadBtn.addEventListener('click', () => doLoadGame(game.id, false));
        actions.appendChild(loadBtn);
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(`Delete "${game.name}"?`)) return;
        try {
          await apiDeleteGame(game.id);
          row.remove();
          if (listEl.querySelectorAll('.load-game-row').length === 0) {
            listEl.innerHTML = '<div class="load-empty">No saved games yet.</div>';
          }
        } catch (e) {
          alert('Failed to delete game: ' + e.message);
        }
      });

      actions.appendChild(deleteBtn);

      row.appendChild(info);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  } catch (e) {
    listEl.innerHTML = `<div class="load-empty">Error loading games: ${e.message}</div>`;
  }
}

// ===== HELPERS =====
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(id) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.classList.add('hidden');
}

// ===== EVENT LISTENERS =====

// Landing
document.getElementById('btn-new-game').addEventListener('click', () => {
  initConfigScreen();
  showScreen('config');
});

document.getElementById('btn-load-game').addEventListener('click', () => {
  loadGamesScreen();
});

// Config
document.getElementById('btn-config-back').addEventListener('click', () => showScreen('landing'));
document.getElementById('btn-config-next').addEventListener('click', validateAndAdvanceConfig);

document.getElementById('num-players').addEventListener('input', () => {
  const count = parseInt(document.getElementById('num-players').value, 10);
  if (!isNaN(count) && count >= 2 && count <= 8) {
    const existing = Array.from(
      document.querySelectorAll('#player-names-container input[data-player-idx]')
    ).map(inp => inp.value);
    buildPlayerNameInputs('player-names-container', count, existing);
  }
});

// Setup
document.getElementById('btn-setup-back').addEventListener('click', () => {
  initConfigScreen();
  showScreen('config');
});

document.getElementById('btn-save-and-start').addEventListener('click', async () => {
  const { valid, categories, errors } = readSetupFormData();
  if (!valid) {
    showError('setup-error', errors[0]);
    return;
  }

  const gameName = state.config.gameName.trim();
  if (!gameName) {
    showError('setup-error', 'Please enter a game name to save, or use "Start Without Saving".');
    return;
  }

  hideError('setup-error');
  state.categories = categories;

  try {
    const saved = await apiCreateGame({
      name: gameName,
      config: state.config,
      categories: state.categories,
    });
    state.gameId = saved.id;
  } catch (e) {
    if (e.status === 409) {
      showError('setup-error', `A game named "${gameName}" already exists. Choose a different name.`);
    } else {
      showError('setup-error', 'Failed to save game: ' + e.message);
    }
    return;
  }

  state.answeredCells = {};
  buildBoard();
  showScreen('board');
});

// Board
document.getElementById('btn-board-back').addEventListener('click', () => {
  state.gameId = null;
  showScreen('landing');
});

// Modal
document.getElementById('btn-show-answer').addEventListener('click', () => {
  document.getElementById('modal-answer-area').classList.remove('hidden');
  document.getElementById('btn-show-answer').classList.add('hidden');
  document.getElementById('btn-close-modal').classList.add('hidden');
  document.getElementById('modal-attribution').classList.remove('hidden');
  buildAttributionButtons();
});

document.getElementById('btn-close-modal').addEventListener('click', () => closeModal(false));

document.getElementById('modal-backdrop').addEventListener('click', () => closeModal(false));

document.getElementById('btn-dd-reveal').addEventListener('click', confirmDDWager);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('question-modal');
    if (!modal.classList.contains('hidden')) {
      closeModal(false);
    }
  }
});

// Players screen (load flow)
document.getElementById('btn-players-back').addEventListener('click', () => showScreen('load'));

document.getElementById('num-players-load').addEventListener('input', () => {
  const count = parseInt(document.getElementById('num-players-load').value, 10);
  if (!isNaN(count) && count >= 2 && count <= 8) {
    const existing = Array.from(
      document.querySelectorAll('#player-names-container-load input[data-player-idx]')
    ).map(inp => inp.value);
    buildPlayerNameInputs('player-names-container-load', count, existing);
  }
});

document.getElementById('btn-players-start').addEventListener('click', () => {
  const players = [];
  document.querySelectorAll('#player-names-container-load input[data-player-idx]').forEach((input, i) => {
    players.push(input.value.trim() || `Player ${i + 1}`);
  });
  if (players.length < 2) {
    alert('At least 2 players are required.');
    return;
  }
  state.config.players = players;

  if (state.pendingResume) {
    state.answeredCells = state.pendingResume.answeredCells || {};
    state.scores = state.pendingResume.scores || {};
    // buildBoard() will use ?? 0 for any players not in saved scores
  } else {
    state.answeredCells = {};
    state.scores = {};
  }
  state.pendingResume = null;

  buildBoard();
  showScreen('board');
});

// Final screen
document.getElementById('btn-final-home').addEventListener('click', () => {
  state.gameId = null;
  showScreen('landing');
});

// Load
document.getElementById('btn-load-back').addEventListener('click', () => showScreen('landing'));
