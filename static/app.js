// ===== STATE =====
const state = {
  config: {
    gameName: '',
    numCategories: 6,
    numQuestions: 5,
    pointValues: [200, 400, 600, 800, 1000],
    players: ['Player 1', 'Player 2'],
  },
  categories: [],        // [{name, questions: [{question, answer, points}]}]
  answeredCells: {},     // "catIdx-qIdx" → true
  scores: {},            // { 'Player 1': 0, 'Player 2': 0 }
  currentCell: null,     // {catIdx, qIdx} while modal open
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

  if (isNaN(numPlayers) || numPlayers < 1 || numPlayers > 8) {
    showError('config-error', 'Number of players must be between 1 and 8.');
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

    // Column headers for Q/A
    const headers = document.createElement('div');
    headers.className = 'qa-headers';
    ['Points', 'Question', 'Answer'].forEach(t => {
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

      const aInput = document.createElement('input');
      aInput.type = 'text';
      aInput.placeholder = 'Answer';
      aInput.dataset.cat = c;
      aInput.dataset.q = q;
      aInput.dataset.field = 'answer';
      if (state.categories[c] && state.categories[c].questions[q]) {
        aInput.value = state.categories[c].questions[q].answer || '';
      }
      row.appendChild(aInput);

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
      const question = qInput ? qInput.value.trim() : '';
      const answer = aInput ? aInput.value.trim() : '';
      if (!question) errors.push(`Category ${c + 1}, $${pointValues[q]}: question is blank.`);
      if (!answer) errors.push(`Category ${c + 1}, $${pointValues[q]}: answer is blank.`);
      questions.push({ question, answer, points: pointValues[q] });
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
  state.currentCell = { catIdx, qIdx };

  document.getElementById('modal-category').textContent = cat.name;
  document.getElementById('modal-value').textContent = `$${q.points}`;
  document.getElementById('modal-question').textContent = q.question;
  document.getElementById('modal-answer').textContent = q.answer;

  document.getElementById('modal-answer-area').classList.add('hidden');
  document.getElementById('modal-attribution').classList.add('hidden');
  document.getElementById('attribution-buttons').innerHTML = '';
  document.getElementById('btn-show-answer').classList.remove('hidden');
  document.getElementById('btn-close-modal').classList.remove('hidden');

  document.getElementById('question-modal').classList.remove('hidden');
}

function buildAttributionButtons() {
  const container = document.getElementById('attribution-buttons');
  container.innerHTML = '';

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

function closeModal(markAnswered, playerIdx = null) {
  if (markAnswered && state.currentCell) {
    const { catIdx, qIdx } = state.currentCell;
    const key = `${catIdx}-${qIdx}`;
    state.answeredCells[key] = true;

    // Award points to the player who got it right
    if (playerIdx !== null) {
      const player = state.config.players[playerIdx];
      const points = state.categories[catIdx].questions[qIdx].points;
      state.scores[player] = (state.scores[player] || 0) + points;
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

  const winner = sorted[0];
  const winnerScore = state.scores[winner] || 0;

  winnerArea.innerHTML = `
    <div class="final-winner">
      <div class="final-crown">👑</div>
      <div class="final-winner-name">${winner}</div>
      <div class="final-winner-score">$${winnerScore}</div>
    </div>
  `;

  sorted.slice(1).forEach((player, i) => {
    const score = state.scores[player] || 0;
    const row = document.createElement('div');
    row.className = 'final-rank-row';

    const rank = document.createElement('span');
    rank.className = 'final-rank-number';
    rank.textContent = `#${i + 2}`;

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

      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn btn-load';
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', async () => {
        try {
          const fullGame = await apiGetGame(game.id);
          state.gameId = fullGame.id;
          state.config = fullGame.config;
          state.categories = fullGame.categories;
          state.pendingResume = fullGame.game_state || null;
          initPlayersScreen();
          showScreen('players');
        } catch (e) {
          alert('Failed to load game: ' + e.message);
        }
      });

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

      actions.appendChild(loadBtn);
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
  if (!isNaN(count) && count >= 1 && count <= 8) {
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

document.getElementById('btn-start-without-saving').addEventListener('click', () => {
  const { valid, categories, errors } = readSetupFormData();
  if (!valid) {
    showError('setup-error', errors[0]);
    return;
  }
  hideError('setup-error');
  state.categories = categories;
  state.gameId = null;
  state.answeredCells = {};
  buildBoard();
  showScreen('board');
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
  if (!isNaN(count) && count >= 1 && count <= 8) {
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
