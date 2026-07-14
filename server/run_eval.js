/**
 * Eval pipeline runner.
 *
 * Shared by the scheduler (background_processes.js) AND runnable standalone to
 * trigger an eval instantly:
 *
 *     node server/run_eval.js
 *
 * Runs, inside evaluator_setup/ (venv python if present, else python3):
 *     python dataset_updater.py   &&   python evaluator.py
 */
const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const EVAL_DIR    = path.resolve(__dirname, '../evaluator_setup');
const VENV_PYTHON = path.resolve(__dirname, '../.venv/bin/python');
const ENV_FILE    = path.resolve(__dirname, '../.env');

let running = false;

/** Runs the eval pipeline once. Calls done(ok) when finished. Safe to re-call. */
function runEval(done = () => {}) {
  if (running) { console.log('🧪 Eval already running — skipping'); return done(false); }
  if (!fs.existsSync(EVAL_DIR)) {
    console.error(`❌ Eval dir not found: ${EVAL_DIR} — evaluator_setup/ is not present in this build`);
    return done(false);
  }

  const python = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';
  running = true;
  console.log(`🧪 [${new Date().toISOString()}] Starting eval pipeline — python: ${python}`);

  const finish = (ok) => { running = false; done(ok); };

  // Spawn `python <script>` in evaluator_setup (no shell). next() runs on exit 0.
  const runScript = (script, next) => {
    const child = spawn(python, [script], { cwd: EVAL_DIR, env: { ...process.env, ENV_FILE } });
    child.stdout.on('data', d => process.stdout.write(`[eval] ${d}`));
    child.stderr.on('data', d => process.stderr.write(`[eval] ${d}`));
    child.on('error', err => { console.error(`❌ eval: ${script} failed to start: ${err.message}`); finish(false); });
    child.on('close', code => {
      console.log(`🧪 eval: ${script} exited with code ${code}`);
      if (code === 0) next(); else finish(false);
    });
  };

  // dataset_updater.py, then evaluator.py only if the updater succeeded
  runScript('dataset_updater.py', () => {
    runScript('evaluator.py', () => {
      console.log(`🧪 [${new Date().toISOString()}] Eval pipeline complete`);
      finish(true);
    });
  });
}

module.exports = { runEval };

// Standalone trigger: `node server/run_eval.js` runs one eval now and exits.
if (require.main === module) {
  runEval(ok => process.exit(ok ? 0 : 1));
}
