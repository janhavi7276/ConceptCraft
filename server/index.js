const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const ROOT = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(ROOT, 'input');
const OUTPUT_DIR = path.join(ROOT, 'output');
const UPLOAD_TMP_DIR = path.join(INPUT_DIR, '.uploads');
const PORT = process.env.PORT || 3001;
const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS) || 60 * 1000;
const RUN_LOG = path.join(__dirname, 'last-run.log');

fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

const DECK_RE = /^[A-Za-z0-9_-]+$/;

const app = express();
app.use(cors());
app.use(express.json());

class HttpError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function recapPath(deck) {
  return path.join(OUTPUT_DIR, `${deck}-recap.md`);
}

function mapPath(deck) {
  for (const ext of ['svg', 'png']) {
    const file = path.join(OUTPUT_DIR, `${deck}-concept-map.${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function listRecaps() {
  const files = fs.readdirSync(OUTPUT_DIR);
  return files
    .filter((f) => f.endsWith('-recap.md'))
    .map((f) => {
      const deck = f.slice(0, -'-recap.md'.length);
      const stat = fs.statSync(path.join(OUTPUT_DIR, f));
      return {
        deck,
        mtime: stat.mtimeMs,
        hasMap: Boolean(mapPath(deck)),
      };
    })
    .filter((d) => DECK_RE.test(d.deck))
    .sort((a, b) => b.mtime - a.mtime);
}

app.get('/api/recaps', (req, res) => {
  res.json(listRecaps());
});

app.get('/api/recaps/:deck', (req, res, next) => {
  try {
    const { deck } = req.params;
    if (!DECK_RE.test(deck)) throw new HttpError(400, 'Invalid deck name');
    const file = recapPath(deck);
    if (!fs.existsSync(file)) throw new HttpError(404, 'Recap not found');
    res.type('text/markdown').send(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    next(err);
  }
});

app.get('/api/map/:deck', (req, res, next) => {
  try {
    const { deck } = req.params;
    if (!DECK_RE.test(deck)) throw new HttpError(400, 'Invalid deck name');
    const file = mapPath(deck);
    if (!file) throw new HttpError(404, 'Concept map not found');
    const type = path.extname(file) === '.png' ? 'image/png' : 'image/svg+xml';
    res.type(type).send(fs.readFileSync(file));
  } catch (err) {
    next(err);
  }
});

function sanitizeDeck(originalName) {
  const base = originalName.replace(/\.pdf$/i, '');
  const deck = base.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
  if (!deck || !DECK_RE.test(deck)) {
    throw new HttpError(400, 'File name must contain letters, numbers, - or _');
  }
  return deck;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_TMP_DIR,
    filename: (req, file, cb) => {
      try {
        cb(null, `${sanitizeDeck(file.originalname)}.pdf`);
      } catch (err) {
        cb(err);
      }
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
      return cb(new HttpError(400, 'Only .pdf files are allowed'));
    }
    cb(null, true);
  },
});

let running = false;

function killTree(child) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true });
  } else {
    child.kill('SIGTERM');
  }
}

function runOpencode(deck) {
  const prompt = [
    'Using the `slide-recap` skill on `input/' + deck + '.pdf`:',
    'read it once with the pdf-reader MCP, then finish in a single pass —',
    'no sub-agents, no reviewer, as few turns as possible.',
    'In ONE assistant message do both: (1) write `output/' + deck + '-recap.md`',
    '(max 6 key concepts, max 4 topics of 2-3 sentences, flowchart map max 10',
    'nodes, optional short Open Questions) and (2) call the mermaid MCP with that',
    'flowchart (outputType file).',
    'Then move the rendered file to `output/' + deck + '-concept-map.png` and finish.',
    'Do not save the extracted slides text. Target: done in well under a minute.',
  ].join(' ');

  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const fail = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    const before = (() => {
      try {
        return fs.statSync(recapPath(deck)).mtimeMs;
      } catch {
        return 0;
      }
    })();
    const freshRecap = () => {
      try {
        return fs.statSync(recapPath(deck)).mtimeMs > before;
      } catch {
        return false;
      }
    };
    const readRecap = () => fs.readFileSync(recapPath(deck), 'utf8');

    const child = spawn('opencode', ['run', prompt, '--auto', '--variant', 'minimal'], {
      cwd: ROOT,
      shell: process.platform === 'win32',
      windowsHide: true,
      // stdin must be 'ignore' or opencode run waits for piped input forever
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    const capture = (chunk) => {
      out += chunk.toString();
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);

    const saveLog = () => {
      try {
        fs.writeFileSync(RUN_LOG, out);
      } catch {
        /* best effort */
      }
    };
    const detail = () => out.slice(-1500);

    // Respond as soon as the recap exists; the concept map finishes right after.
    const poll = setInterval(() => {
      if (freshRecap()) {
        clearInterval(poll);
        clearTimeout(timer);
        ok(readRecap());
      }
    }, 1000);

    const timer = setTimeout(() => {
      clearInterval(poll);
      if (freshRecap()) {
        ok(readRecap());
        return;
      }
      killTree(child);
      saveLog();
      running = false;
      fail(new HttpError(504, 'opencode run timed out after 60 seconds', detail()));
    }, RUN_TIMEOUT_MS);

    child.on('error', (err) => {
      clearInterval(poll);
      clearTimeout(timer);
      running = false;
      fail(new HttpError(500, `Could not start opencode: ${err.message}`));
    });

    child.on('close', (code) => {
      clearInterval(poll);
      clearTimeout(timer);
      saveLog();
      running = false;
      if (freshRecap()) {
        ok(readRecap());
        return;
      }
      if (code === 0) {
        fail(new HttpError(500, 'opencode finished but no recap was created', detail()));
      } else {
        fail(new HttpError(500, `opencode run failed (exit ${code})`, detail()));
      }
    });
  });
}

app.post('/api/upload', (req, res, next) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return next(new HttpError(400, 'No PDF uploaded (field name: pdf)'));

    const deck = path.basename(req.file.filename, '.pdf');
    if (running) {
      fs.unlink(req.file.path, () => {});
      return next(new HttpError(409, 'A run is already in progress'));
    }

    try {
      fs.renameSync(req.file.path, path.join(INPUT_DIR, `${deck}.pdf`));
    } catch (saveErr) {
      fs.unlink(req.file.path, () => {});
      return next(new HttpError(500, `Could not save PDF: ${saveErr.message}`));
    }

    running = true;
    try {
      const markdown = await runOpencode(deck);
      res.json({ deck, markdown });
    } catch (runErr) {
      running = false;
      next(runErr);
    }
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const dist = path.join(ROOT, 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  const payload = { error: err.message || 'Internal server error' };
  if (err.detail) payload.detail = err.detail;
  if (status >= 500) console.error(err);
  res.status(status).json(payload);
});

app.listen(PORT, () => {
  console.log(`ConceptCraft server on http://localhost:${PORT}`);
});
