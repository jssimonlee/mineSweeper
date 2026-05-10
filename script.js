const PRESETS = {
  beginner: { label: "초급", rows: 9, cols: 9, mines: 10 },
  intermediate: { label: "중급", rows: 16, cols: 16, mines: 40 },
  expert: { label: "고급", rows: 16, cols: 30, mines: 99 },
};

const board = document.querySelector("#board");
const mineCount = document.querySelector("#mine-count");
const timer = document.querySelector("#timer");
const revealedCount = document.querySelector("#revealed-count");
const statusMessage = document.querySelector("#status-message");
const newGameButton = document.querySelector("#new-game");
const pauseOverlay = document.querySelector("#pause-overlay");
const resumeGameButton = document.querySelector("#resume-game");
const resultOverlay = document.querySelector("#result-overlay");
const resultDialog = document.querySelector(".result-dialog");
const resultLabel = document.querySelector("#result-label");
const resultTitle = document.querySelector("#result-title");
const resultCopy = document.querySelector("#result-copy");
const resultTime = document.querySelector("#result-time");
const resultRevealed = document.querySelector("#result-revealed");
const resultMines = document.querySelector("#result-mines");
const resultNewGameButton = document.querySelector("#result-new-game");
const viewBoardButton = document.querySelector("#view-board");
const presetButtons = [...document.querySelectorAll("[data-preset]")];
const toolButtons = [...document.querySelectorAll("[data-tool]")];

let state = createState("beginner");
let longPressTimer = null;
let ignoreNextClick = false;
let hoveredCellIndex = null;

function createState(presetKey) {
  const preset = PRESETS[presetKey];
  const total = preset.rows * preset.cols;

  return {
    presetKey,
    rows: preset.rows,
    cols: preset.cols,
    mines: preset.mines,
    cells: Array.from({ length: total }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      questioned: false,
      adjacent: 0,
    })),
    started: false,
    ended: false,
    won: false,
    paused: false,
    flags: 0,
    revealed: 0,
    seconds: 0,
    timerId: null,
    activeTool: "reveal",
    hitMineIndex: -1,
  };
}

function initGame(presetKey = state.presetKey) {
  clearLongPressTimer();
  ignoreNextClick = false;
  hoveredCellIndex = null;
  stopTimer();
  state = createState(presetKey);
  hidePauseOverlay();
  hideResultOverlay();
  syncPresetButtons();
  syncToolButtons();
  buildBoard();
  updateStats();
  setStatus("첫 칸을 열어 시작하세요.");
}

function buildBoard() {
  board.innerHTML = "";
  board.style.setProperty("--cols", state.cols);
  board.setAttribute("aria-rowcount", String(state.rows));
  board.setAttribute("aria-colcount", String(state.cols));

  state.cells.forEach((_, index) => {
    const cellButton = document.createElement("button");
    cellButton.type = "button";
    cellButton.className = "cell";
    cellButton.dataset.index = String(index);
    cellButton.setAttribute("role", "gridcell");
    cellButton.setAttribute("aria-rowindex", String(Math.floor(index / state.cols) + 1));
    cellButton.setAttribute("aria-colindex", String((index % state.cols) + 1));
    cellButton.setAttribute("aria-keyshortcuts", "Enter Space");

    if ((Math.floor(index / state.cols) + index) % 2 === 1) {
      cellButton.classList.add("is-odd");
    }

    cellButton.addEventListener("click", handleCellClick);
    cellButton.addEventListener("contextmenu", handleCellContextMenu);
    cellButton.addEventListener("keydown", handleCellKeyDown);
    cellButton.addEventListener("pointerenter", handleCellPointerEnter);
    cellButton.addEventListener("pointerdown", handlePointerDown);
    cellButton.addEventListener("pointerup", clearLongPressTimer);
    cellButton.addEventListener("pointerleave", clearLongPressTimer);
    cellButton.addEventListener("pointercancel", clearLongPressTimer);

    board.appendChild(cellButton);
  });

  renderBoard();
}

function handleCellClick(event) {
  const index = Number(event.currentTarget.dataset.index);

  if (ignoreNextClick) {
    ignoreNextClick = false;
    return;
  }

  if (state.activeTool === "flag") {
    toggleMark(index);
    return;
  }

  revealCell(index);
}

function handleCellContextMenu(event) {
  event.preventDefault();

  if (ignoreNextClick) {
    return;
  }

  toggleMark(Number(event.currentTarget.dataset.index));
}

function handleCellKeyDown(event) {
  const index = Number(event.currentTarget.dataset.index);

  if (event.key === "Enter") {
    event.preventDefault();
    revealCell(index);
  }

  if (event.key === " " || event.key.toLowerCase() === "f" || event.key.toLowerCase() === "m") {
    event.preventDefault();
    toggleMark(index);
  }
}

function handleCellPointerEnter(event) {
  hoveredCellIndex = Number(event.currentTarget.dataset.index);
}

function handlePointerDown(event) {
  if (event.pointerType === "mouse") {
    return;
  }

  clearLongPressTimer();
  const index = Number(event.currentTarget.dataset.index);
  longPressTimer = window.setTimeout(() => {
    ignoreNextClick = true;
    toggleMark(index);
  }, 430);
}

function clearLongPressTimer() {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function revealCell(index) {
  if (state.ended || state.paused) {
    return;
  }

  const cell = state.cells[index];
  if (!cell || cell.flagged) {
    return;
  }

  if (!state.started) {
    placeMines(index);
    state.started = true;
    startTimer();
    setStatus(`${PRESETS[state.presetKey].label} 진행 중`);
  }

  if (cell.questioned) {
    cell.questioned = false;
  }

  if (cell.revealed) {
    revealAroundNumber(index);
    renderBoard();
    updateStats();
    return;
  }

  if (cell.mine) {
    cell.revealed = true;
    state.hitMineIndex = index;
    endGame(false);
    return;
  }

  floodReveal(index);
  checkWin();
  renderBoard();
  updateStats();
}

function revealAroundNumber(index) {
  const cell = state.cells[index];
  if (!cell.revealed || cell.adjacent === 0) {
    return;
  }

  const neighbors = getNeighbors(index);
  const flagCount = neighbors.filter((neighborIndex) => state.cells[neighborIndex].flagged).length;

  if (flagCount !== cell.adjacent) {
    return;
  }

  for (const neighborIndex of neighbors) {
    const neighbor = state.cells[neighborIndex];
    if (!neighbor.revealed && !neighbor.flagged) {
      if (neighbor.mine) {
        neighbor.revealed = true;
        state.hitMineIndex = neighborIndex;
        endGame(false);
        return;
      }

      floodReveal(neighborIndex);
    }
  }

  checkWin();
}

function toggleMark(index) {
  if (state.ended || state.paused) {
    return;
  }

  const cell = state.cells[index];
  if (!cell || cell.revealed) {
    return;
  }

  if (cell.flagged) {
    cell.flagged = false;
    cell.questioned = true;
    state.flags -= 1;
  } else if (cell.questioned) {
    cell.questioned = false;
  } else {
    cell.flagged = true;
    state.flags += 1;
  }

  renderBoard();
  updateStats();
}

function placeMines(firstIndex) {
  let safeIndexes = new Set([firstIndex, ...getNeighbors(firstIndex)]);
  let candidates = state.cells
    .map((_, index) => index)
    .filter((index) => !safeIndexes.has(index));

  if (candidates.length < state.mines) {
    safeIndexes = new Set([firstIndex]);
    candidates = state.cells.map((_, index) => index).filter((index) => !safeIndexes.has(index));
  }

  shuffle(candidates);

  candidates.slice(0, state.mines).forEach((mineIndex) => {
    state.cells[mineIndex].mine = true;
  });

  state.cells.forEach((cell, index) => {
    cell.adjacent = getNeighbors(index).filter((neighborIndex) => state.cells[neighborIndex].mine).length;
  });
}

function floodReveal(startIndex) {
  const stack = [startIndex];

  while (stack.length > 0) {
    const index = stack.pop();
    const cell = state.cells[index];

    if (!cell || cell.revealed || cell.flagged || cell.mine) {
      continue;
    }

    if (cell.questioned) {
      cell.questioned = false;
    }

    cell.revealed = true;
    state.revealed += 1;

    if (cell.adjacent === 0) {
      for (const neighborIndex of getNeighbors(index)) {
        const neighbor = state.cells[neighborIndex];
        if (!neighbor.revealed && !neighbor.flagged) {
          stack.push(neighborIndex);
        }
      }
    }
  }
}

function checkWin() {
  const safeCellCount = state.rows * state.cols - state.mines;

  if (state.revealed === safeCellCount) {
    endGame(true);
  }
}

function endGame(won) {
  state.ended = true;
  state.won = won;
  state.paused = false;
  stopTimer();
  hidePauseOverlay();

  if (won) {
    state.cells.forEach((cell) => {
      if (cell.mine && !cell.flagged) {
        cell.flagged = true;
      }
      if (cell.mine) {
        cell.questioned = false;
      }
    });
    state.flags = state.mines;
    setStatus("승리했습니다. 모든 지뢰를 피했습니다.", "win");
  } else {
    state.cells.forEach((cell) => {
      if (cell.mine) {
        cell.revealed = true;
      }
    });
    setStatus("지뢰를 밟았습니다. 새 게임으로 다시 시작하세요.", "loss");
  }

  renderBoard();
  updateStats();
  showResultOverlay(won);
}

function renderBoard() {
  const buttons = board.querySelectorAll(".cell");

  buttons.forEach((button, index) => {
    const cell = state.cells[index];
    const odd = (Math.floor(index / state.cols) + index) % 2 === 1;
    button.className = odd ? "cell is-odd" : "cell";
    button.textContent = "";
    button.removeAttribute("data-number");
    button.setAttribute("aria-label", describeCell(cell, index));
    button.setAttribute("aria-selected", cell.revealed ? "true" : "false");

    if (cell.revealed) {
      button.classList.add("is-revealed");

      if (cell.mine) {
        button.classList.add("is-mine");
        if (index === state.hitMineIndex) {
          button.classList.add("is-mine-hit");
        }
        button.innerHTML = '<span class="mine-icon" aria-hidden="true"></span>';
      } else if (cell.adjacent > 0) {
        button.textContent = String(cell.adjacent);
        button.dataset.number = String(cell.adjacent);
      }

      return;
    }

    if (cell.flagged) {
      button.innerHTML = '<span class="flag-icon" aria-hidden="true"></span>';
    } else if (cell.questioned) {
      button.innerHTML = '<span class="question-mark" aria-hidden="true">?</span>';
    }
  });
}

function describeCell(cell, index) {
  const row = Math.floor(index / state.cols) + 1;
  const col = (index % state.cols) + 1;
  const position = `${row}행 ${col}열`;

  if (cell.revealed && cell.mine) {
    return `${position}, 지뢰`;
  }

  if (cell.revealed && cell.adjacent > 0) {
    return `${position}, 주변 지뢰 ${cell.adjacent}개`;
  }

  if (cell.revealed) {
    return `${position}, 빈 칸`;
  }

  if (cell.flagged) {
    return `${position}, 표시됨`;
  }

  if (cell.questioned) {
    return `${position}, 물음표`;
  }

  return `${position}, 닫힌 칸`;
}

function getNeighbors(index) {
  const row = Math.floor(index / state.cols);
  const col = index % state.cols;
  const neighbors = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) {
        continue;
      }

      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;

      if (nextRow >= 0 && nextRow < state.rows && nextCol >= 0 && nextCol < state.cols) {
        neighbors.push(nextRow * state.cols + nextCol);
      }
    }
  }

  return neighbors;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

function startTimer() {
  stopTimer();
  state.timerId = window.setInterval(() => {
    state.seconds = Math.min(state.seconds + 1, 999);
    updateStats();

    if (state.seconds === 999) {
      stopTimer();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerId !== null) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function pauseGame() {
  if (!state.started || state.ended || state.paused) {
    return;
  }

  state.paused = true;
  stopTimer();
  pauseOverlay.hidden = false;
}

function resumeGame() {
  if (!state.paused || state.ended) {
    return;
  }

  state.paused = false;
  hidePauseOverlay();

  if (state.started) {
    startTimer();
  }
}

function hidePauseOverlay() {
  pauseOverlay.hidden = true;
}

function showResultOverlay(won) {
  const safeCellCount = state.rows * state.cols - state.mines;
  resultDialog.classList.toggle("is-win", won);
  resultDialog.classList.toggle("is-loss", !won);
  resultLabel.textContent = won ? "승리" : "실패";
  resultTitle.textContent = won ? "깔끔하게 성공했습니다" : "지뢰를 밟았습니다";
  resultCopy.textContent = won
    ? `${PRESETS[state.presetKey].label} 난이도를 ${formatTime(state.seconds)} 만에 완료했습니다.`
    : `${PRESETS[state.presetKey].label} 난이도에서 ${state.revealed}/${safeCellCount}칸을 열었습니다.`;
  resultTime.textContent = formatTime(state.seconds);
  resultRevealed.textContent = `${state.revealed}/${safeCellCount}`;
  resultMines.textContent = String(state.mines);
  resultOverlay.hidden = false;
  resultNewGameButton.focus();
}

function hideResultOverlay() {
  resultOverlay.hidden = true;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function updateStats() {
  mineCount.textContent = String(state.mines - state.flags);
  timer.textContent = String(state.seconds).padStart(3, "0");
  revealedCount.textContent = String(state.revealed);
}

function setStatus(message, tone = "") {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-win", tone === "win");
  statusMessage.classList.toggle("is-loss", tone === "loss");
}

function syncPresetButtons() {
  presetButtons.forEach((button) => {
    const active = button.dataset.preset === state.presetKey;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function syncToolButtons() {
  toolButtons.forEach((button) => {
    const active = button.dataset.tool === state.activeTool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

newGameButton.addEventListener("click", () => initGame());
resumeGameButton.addEventListener("click", resumeGame);
resultNewGameButton.addEventListener("click", () => initGame());
viewBoardButton.addEventListener("click", hideResultOverlay);

window.addEventListener("blur", pauseGame);
document.addEventListener("keydown", (event) => {
  if (event.key !== " " || hoveredCellIndex === null || !board.matches(":hover")) {
    return;
  }

  if (event.target.closest?.(".cell")) {
    return;
  }

  event.preventDefault();
  toggleMark(hoveredCellIndex);
});

board.addEventListener("pointerleave", () => {
  hoveredCellIndex = null;
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseGame();
  }
});

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    initGame(button.dataset.preset);
  });
});

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.activeTool = button.dataset.tool;
    syncToolButtons();
  });
});

initGame();
