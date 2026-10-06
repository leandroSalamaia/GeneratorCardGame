import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export const ART_CACHE = process.env.LOTR_AI_CACHE || 'D:/GeradorCartas-AI/import-cache';
const PYTHON = process.env.LOTR_AI_PYTHON || 'D:/GeradorCartas-AI/venv/Scripts/python.exe';
const types = new Set(['hero','ally','enemy','attachment','treasure','event','treachery','location','objective','quest']);
let queue = Promise.resolve();
const pending = new Map();

export function validateArtSource(url, root) {
  const parsed = new URL(url, 'http://localhost');
  if (parsed.origin !== 'http://localhost' || parsed.pathname !== '/api/local-image') throw Error('A extensão por IA precisa de uma imagem da pasta local de proxies.');
  const source = fs.realpathSync(parsed.searchParams.get('path'));
  const relative = path.relative(fs.realpathSync(root), source);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !/\.(png|jpe?g)$/i.test(source)) throw Error('Imagem fora da pasta de proxies.');
  return source;
}

export function artCacheKey(source, type) {
  const stat = fs.statSync(source);
  const version = type === 'quest' ? 'sdxl-import-v4-quest-trim' : type === 'event' ? 'sdxl-import-v2-oriented' : 'sdxl-import-v1-edge-match';
  return crypto.createHash('sha256').update(JSON.stringify([source, stat.size, stat.mtimeMs, type, version])).digest('hex');
}

function runPython(source, type, output) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, ['scripts/generate-import-art.py', '--source', source, '--type', type, '--output', output], {
      cwd: process.cwd(), windowsHide: true, env: { ...process.env, HF_HOME: process.env.HF_HOME || 'D:/GeradorCartas-AI/huggingface', PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    const capture = data => { log = (log + data.toString()).slice(-24000); };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    const timer = setTimeout(() => { child.kill(); }, 10 * 60 * 1000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(output, 'worker.log'), log);
      if (code === 0) resolve();
      else reject(Error('A IA local não concluiu a imagem. Consulte o worker.log no cache; a arte original foi mantida.'));
    });
  });
}

export async function extendLocalArt(url, type, root) {
  if (!types.has(type)) throw Error('Tipo de carta não suportado pela IA local.');
  const source = validateArtSource(url, root), key = artCacheKey(source, type);
  const output = path.join(ART_CACHE, key), file = path.join(output, 'extended-art.png');
  const ready = () => fs.existsSync(file) && fs.existsSync(path.join(output, 'complete.json'));
  if (ready()) return { url: `/api/generated-art/${key}.png`, cached: true };
  if (!fs.existsSync(PYTHON)) throw Error('Python da IA local não encontrado. Configure LOTR_AI_PYTHON.');
  if (!pending.has(key)) {
    const job = queue.catch(() => {}).then(async () => {
      if (ready()) return;
      fs.mkdirSync(output, { recursive: true });
      await runPython(source, type, output);
      if (!fs.existsSync(file)) throw Error('A IA não produziu a imagem esperada.');
      fs.writeFileSync(path.join(output, 'complete.json'), JSON.stringify({ source, type, key }));
    });
    queue = job;
    pending.set(key, job);
    job.finally(() => pending.delete(key)).catch(() => {});
  }
  await pending.get(key);
  return { url: `/api/generated-art/${key}.png`, cached: false };
}
