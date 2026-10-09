// Lógica dos ajustes: registo do Windows, plano de energia, cache do FiveM.
// Só mexe em HKCU, por isso não precisa de administrador.

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = promisify(execFile);
const opts = { windowsHide: true };

const BACKUP_DIR = path.join(process.env.APPDATA || os.homedir(), 'PrecisionFix');
const BACKUP_FILE = path.join(BACKUP_DIR, 'backup.json');
const HIGH_PERF = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

// ---------------------------------------------------------------- registo

async function regGet(key, name) {
  try {
    const { stdout } = await run('reg', ['query', `HKCU\\${key}`, '/v', name], opts);
    const m = stdout.match(/^\s*(.*?)\s{4}(REG_[A-Z_]+)(?:\s{4}(.*))?\s*$/m);
    return m ? { type: m[2], value: m[3] || '' } : null;
  } catch {
    return null;
  }
}

async function regSet(key, name, value, type) {
  await run('reg', ['add', `HKCU\\${key}`, '/v', name, '/t', type, '/d', String(value), '/f'], opts);
}

async function regDel(key, name) {
  try {
    await run('reg', ['delete', `HKCU\\${key}`, '/v', name, '/f'], opts);
  } catch {
    /* já não existia */
  }
}

// ------------------------------------------- aplicar input em tempo real

const ps = (script) =>
  run(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')],
    opts
  );

const MOUSE = 'Control Panel\\Mouse';
const KEYB = 'Control Panel\\Keyboard';
const ACCESS = 'Control Panel\\Accessibility';

async function num(key, name, def) {
  const r = await regGet(key, name);
  const n = r ? parseInt(r.value, r.value.startsWith('0x') ? 16 : 10) : NaN;
  return Number.isNaN(n) ? def : n;
}

async function refreshInput() {
  const t1 = await num(MOUSE, 'MouseThreshold1', 6);
  const t2 = await num(MOUSE, 'MouseThreshold2', 10);
  const acc = await num(MOUSE, 'MouseSpeed', 1);
  const sens = await num(MOUSE, 'MouseSensitivity', 10);
  const delay = await num(KEYB, 'KeyboardDelay', 1);
  const speed = await num(KEYB, 'KeyboardSpeed', 31);

  const script = `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class PF { [DllImport("user32.dll")] public static extern bool SystemParametersInfo(int a, int b, int[] c, int d); [DllImport("user32.dll")] public static extern bool SystemParametersInfo(int a, int b, IntPtr c, int d); }'
[PF]::SystemParametersInfo(0x0004, 0, [int[]]@(${t1}, ${t2}, ${acc}), 3) | Out-Null
[PF]::SystemParametersInfo(0x0071, 0, [IntPtr]${sens}, 3) | Out-Null
[PF]::SystemParametersInfo(0x0017, ${delay}, [IntPtr]::Zero, 3) | Out-Null
[PF]::SystemParametersInfo(0x000B, ${speed}, [IntPtr]::Zero, 3) | Out-Null
`;
  await ps(script);
}

// ------------------------------------------------------------------ FiveM

const FIVEM_ROOT = path.join(process.env.LOCALAPPDATA || '', 'FiveM');

function fivemExes() {
  const list = [path.join(FIVEM_ROOT, 'FiveM.exe')];
  const appDir = path.join(FIVEM_ROOT, 'FiveM.app');
  try {
    for (const f of fs.readdirSync(appDir)) {
      if (/^FiveM.*_GTAProcess\.exe$/i.test(f)) list.push(path.join(appDir, f));
    }
  } catch {
    /* pasta não existe */
  }
  return list.filter((p) => fs.existsSync(p));
}

async function fivemRunning() {
  try {
    const { stdout } = await run('tasklist', [], opts);
    return /fivem|gta5/i.test(stdout);
  } catch {
    return false;
  }
}

function clearFivemCache() {
  const base = path.join(FIVEM_ROOT, 'FiveM.app', 'data');
  for (const d of ['cache', 'server-cache', 'server-cache-priv']) {
    fs.rmSync(path.join(base, d), { recursive: true, force: true });
  }
}

function needFivem() {
  const exes = fivemExes();
  if (!exes.length) throw new Error('FiveM não encontrado em %LocalAppData%\\FiveM');
  return exes;
}

// --------------------------------------------------------- plano de energia

async function activeScheme() {
  const { stdout } = await run('powercfg', ['/getactivescheme'], opts);
  const m = stdout.match(/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

async function setScheme(guid) {
  try {
    await run('powercfg', ['/setactive', guid], opts);
  } catch {
    throw new Error('Plano de energia indisponível neste PC');
  }
}

// ------------------------------------------------------------ ajustes

const SZ = 'REG_SZ';
const DW = 'REG_DWORD';
const r = (key, name, value, type = SZ) => ({ key, name, value, type });

const LAYERS = 'Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompat\\Layers';
const GPUPREF = 'Software\\Microsoft\\DirectX\\UserGpuPreferences';

const TWEAKS = [
  // Mouse
  {
    id: 'accel', page: 'Mouse', name: 'Desativar aceleração do mouse',
    desc: "Desliga 'Aprimorar precisão do ponteiro'. O movimento fica 1:1, essencial para a memória muscular na mira.",
    reg: () => [r(MOUSE, 'MouseSpeed', '0'), r(MOUSE, 'MouseThreshold1', '0'), r(MOUSE, 'MouseThreshold2', '0')],
  },
  {
    id: 'sens', page: 'Mouse', name: 'Sensibilidade do Windows em 6/11',
    desc: 'Valor padrão que não multiplica nem divide os movimentos do sensor. Ajuste a sensibilidade no DPI do mouse e no jogo.',
    reg: () => [r(MOUSE, 'MouseSensitivity', '10')],
  },
  {
    id: 'trails', page: 'Mouse', name: 'Desativar rastro do ponteiro',
    desc: 'Remove o rastro visual do cursor, caso esteja ativo.',
    reg: () => [r(MOUSE, 'MouseTrails', '0')],
  },

  // Teclado
  {
    id: 'repeat', page: 'Teclado', name: 'Repetição de teclas rápida',
    desc: 'Atraso mínimo e velocidade máxima de repetição de teclas.',
    reg: () => [r(KEYB, 'KeyboardDelay', '0'), r(KEYB, 'KeyboardSpeed', '31')],
  },
  {
    id: 'sticky', page: 'Teclado', name: 'Desativar atalhos de acessibilidade',
    desc: 'Impede o popup de Sticky Keys e Filter Keys ao apertar Shift 5 vezes no jogo. Pode precisar de novo login.',
    reg: () => [
      r(`${ACCESS}\\StickyKeys`, 'Flags', '506'),
      r(`${ACCESS}\\Keyboard Response`, 'Flags', '122'),
      r(`${ACCESS}\\ToggleKeys`, 'Flags', '58'),
    ],
  },

  // FiveM
  {
    id: 'fso', page: 'FiveM', name: 'Desativar otimizações de tela cheia',
    desc: 'Reduz o input lag em alguns PCs ao desativar a otimização de tela cheia do Windows nos executáveis do FiveM.',
    reg: () => needFivem().map((p) => r(LAYERS, p, '~ DISABLEDXMAXIMIZEDWINDOWEDMODE')),
  },
  {
    id: 'gpu', page: 'FiveM', name: 'Forçar GPU de alto desempenho',
    desc: 'Em notebooks com duas GPUs, garante que o FiveM use a placa dedicada.',
    reg: () => needFivem().map((p) => r(GPUPREF, p, 'GpuPreference=2;')),
  },
  {
    id: 'cache', page: 'FiveM', name: 'Limpar cache do FiveM',
    desc: 'Apaga cache e server-cache. Resolve texturas bugadas e crashes. Não tem restauro: o FiveM baixa tudo de novo ao entrar.',
    default: false, special: 'cache',
  },

  // Sistema
  {
    id: 'gamemode', page: 'Sistema', name: 'Ativar Modo de Jogo do Windows',
    desc: 'Prioriza o jogo em primeiro plano e evita que o Windows Update instale drivers durante a partida.',
    reg: () => [r('Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 1, DW), r('Software\\Microsoft\\GameBar', 'AllowAutoGameMode', 1, DW)],
  },
  {
    id: 'dvr', page: 'Sistema', name: 'Desativar gravação em segundo plano',
    desc: 'Para a captura automática da Xbox Game Bar (Game DVR), que consome CPU e GPU.',
    reg: () => [r('System\\GameConfigStore', 'GameDVR_Enabled', 0, DW), r('Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 0, DW)],
  },
  {
    id: 'power', page: 'Sistema', name: 'Plano de energia: Alto desempenho',
    desc: 'Evita que a CPU reduza a frequência durante o jogo. O plano anterior volta ao clicar em Restaurar.',
    special: 'power',
  },
];

const PAGES = ['Mouse', 'Teclado', 'FiveM', 'Sistema'];
const SUBTITLES = {
  Mouse: 'Configuração de precisão e resposta do ponteiro',
  Teclado: 'Resposta de teclas e atalhos que atrapalham no jogo',
  FiveM: 'Ajustes específicos para o cliente do FiveM',
  Sistema: 'Desempenho geral do Windows para jogos',
};

// ------------------------------------------------------------ backup

function loadBackup() {
  try {
    return JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
  } catch {
    return { reg: {} };
  }
}

function saveBackup(b) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(b, null, 2));
}

// ------------------------------------------------------------ API

async function applyTweak(t, backup) {
  if (t.reg) {
    for (const e of t.reg()) {
      const id = `${e.key}|${e.name}`;
      if (!(id in backup.reg)) backup.reg[id] = await regGet(e.key, e.name); // só guarda o original
      await regSet(e.key, e.name, e.value, e.type);
    }
  }
  if (t.special === 'cache') clearFivemCache();
  if (t.special === 'power') {
    if (!('power' in backup)) backup.power = await activeScheme();
    await setScheme(HIGH_PERF);
  }
}

async function applyMany(ids, onProgress = () => {}) {
  const sel = TWEAKS.filter((t) => ids.includes(t.id));
  if (!sel.length) return { applied: 0, errors: [], fatal: 'Nenhum ajuste selecionado.' };
  if (sel.some((t) => t.id === 'cache') && (await fivemRunning())) {
    return { applied: 0, errors: [], fatal: 'Feche o FiveM antes de limpar o cache.' };
  }

  const backup = loadBackup();
  const errors = [];
  let done = 0;
  for (const t of sel) {
    try {
      await applyTweak(t, backup);
    } catch (e) {
      errors.push(`${t.name}: ${e.message}`);
    }
    onProgress(++done / sel.length);
  }
  saveBackup(backup);
  await refreshInput();
  return { applied: sel.length - errors.length, errors };
}

async function restoreAll() {
  const b = loadBackup();
  for (const [id, orig] of Object.entries(b.reg || {})) {
    const [key, name] = id.split('|');
    if (orig === null) await regDel(key, name);
    else await regSet(key, name, orig.value, orig.type);
  }
  if (b.power) {
    try { await setScheme(b.power); } catch { /* plano antigo não existe mais */ }
  }
  await refreshInput();
  try { fs.rmSync(BACKUP_FILE); } catch { /* ok */ }
}

function info() {
  return {
    pages: PAGES,
    subtitles: SUBTITLES,
    fivemFound: fivemExes().length > 0,
    hasBackup: fs.existsSync(BACKUP_FILE),
    tweaks: TWEAKS.map(({ id, page, name, desc, default: d }) => ({
      id, page, name, desc, default: d !== false,
    })),
  };
}

module.exports = { info, applyMany, restoreAll };
