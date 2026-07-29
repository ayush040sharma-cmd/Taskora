#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BOARD = path.join(__dirname, 'board.json');
const AGENT = 'qa';
const POLL_MS = 3000;

function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${msg}`);
}

function readBoard() {
  return JSON.parse(fs.readFileSync(BOARD, 'utf8'));
}

function writeBoard(board) {
  fs.writeFileSync(BOARD, JSON.stringify(board, null, 2));
}

function simulateWork(task) {
  return new Promise(resolve => {
    const steps = [
      `Reading task: "${task.title}"`,
      `Setting up test environment...`,
      `Running unit & integration tests...`,
      `Checking for regressions...`,
      `All tests passed. No issues found.`
    ];
    let i = 0;
    const interval = setInterval(() => {
      if (i < steps.length) {
        log(`  > ${steps[i]}`);
        i++;
      } else {
        clearInterval(interval);
        resolve();
      }
    }, 1200);
  });
}

async function processTask(task) {
  const board = readBoard();
  const idx = board.tasks.findIndex(t => t.id === task.id);
  if (idx === -1) return;
  board.tasks[idx].status = 'in_progress';
  board.agents[AGENT].status = 'busy';
  writeBoard(board);

  log(`\n TASK ASSIGNED: [${task.id}] ${task.title}`);
  log(`  Priority: ${task.priority}`);
  log(`  Description: ${task.description}`);
  log('');

  await simulateWork(task);

  const board2 = readBoard();
  const idx2 = board2.tasks.findIndex(t => t.id === task.id);
  if (idx2 !== -1) {
    board2.tasks[idx2].status = 'done';
    board2.tasks[idx2].completed_at = new Date().toISOString();
    board2.agents[AGENT].status = 'idle';
    writeBoard(board2);
  }

  log(`\n DONE: [${task.id}] ${task.title} — awaiting Manager review.\n`);
}

async function run() {
  console.log('');
  console.log('========================================');
  console.log('   QA AGENT — Online');
  console.log('   Role: Testing, Bugs & Audits');
  console.log('   Polling board every 3s...');
  console.log('========================================');
  console.log('');

  let busy = false;

  setInterval(async () => {
    if (busy) return;
    const board = readBoard();
    const myTask = board.tasks.find(
      t => t.assigned_to === AGENT && t.status === 'pending'
    );
    if (myTask) {
      busy = true;
      await processTask(myTask);
      busy = false;
    } else {
      process.stdout.write('\r  [IDLE] Watching for tasks...');
    }
  }, POLL_MS);
}

run();
