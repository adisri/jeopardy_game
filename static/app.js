// ===== STATE =====
const state = {
  config: {
    gameName: '',
    numCategories: 6,
    numQuestions: 5,
    pointValues: [200, 400, 600, 800, 1000],
  },
  categories: [],        // [{name, questions: [{question, answer, points}]}]
  answeredCells: {},     // "catIdx-qIdx" → true
  currentCell: null,     // {catIdx, qIdx} while modal open
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

// ===== SCREEN NAVIGATION =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
}

// ===== CONFIG SCREEN =====
function initConfigScreen() {
  document.getElementById('game-name').value = state.config.gameName || '';
  document.getElementById('num-categories').value = state.config.numCategories;
  document.getElementById('num-questions').value = state.config.numQuestions;
  document.getElementById('point-values').value = state.config.pointValues.join(',');
  hideError('config-error');
}

function validateAndAdvanceConfig() {
  const gameName = document.getElementById('game-name').value.trim();
  const numCat = parseInt(document.getElementById('num-categories').value, 10);
  const numQ = parseInt(document.getElementById('num-questions').value, 10);
  const pvRaw = document.getElementById('point-values').value.trim();

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

  hideError('config-error');
  state.config = { gameName, numCategories: numCat, numQuestions: numQ, pointValues };
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
  const board = document.getElementById('game-board');
  board.innerHTML = '';
  const { categories, config } = state;
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
  const title = document.getElementById('board-title');
  title.textContent = state.config.gameName || 'Pooja-pardy!';
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

  const answerArea = document.getElementById('modal-answer-area');
  answerArea.classList.add('hidden');

  const showBtn = document.getElementById('btn-show-answer');
  showBtn.classList.remove('hidden');

  document.getElementById('question-modal').classList.remove('hidden');
}

function closeModal(markAnswered) {
  if (markAnswered && state.currentCell) {
    const { catIdx, qIdx } = state.currentCell;
    const key = `${catIdx}-${qIdx}`;
    state.answeredCells[key] = true;

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
          state.config = fullGame.config;
          state.categories = fullGame.categories;
          state.answeredCells = {};
          buildBoard();
          showScreen('board');
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
    await apiCreateGame({
      name: gameName,
      config: state.config,
      categories: state.categories,
    });
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
document.getElementById('btn-board-back').addEventListener('click', () => showScreen('landing'));

// Modal
document.getElementById('btn-show-answer').addEventListener('click', () => {
  document.getElementById('modal-answer-area').classList.remove('hidden');
  document.getElementById('btn-show-answer').classList.add('hidden');
});

document.getElementById('btn-close-modal').addEventListener('click', () => closeModal(true));

document.getElementById('modal-backdrop').addEventListener('click', () => closeModal(false));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('question-modal');
    if (!modal.classList.contains('hidden')) {
      closeModal(false);
    }
  }
});

// Load
document.getElementById('btn-load-back').addEventListener('click', () => showScreen('landing'));
