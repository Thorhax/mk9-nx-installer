// Interface texts. Works in the page and in the worker (no DOM here). English only for now; the structure (from
// sa2-nx-installer) keeps room for more languages. Static texts in index.html name their key with data-i18n (plain
// text) or data-i18n-html (text with markup).

export const LANGUAGES = [{ code: 'en', name: 'English', flag: 'uk' }];

const SPHAIRA = '<a href="https://github.com/NaGaa95/sphaira/releases" target="_blank" rel="noopener">Sphaira</a>';

const TEXTS = {
  en: {
    legal:
      'Mortal Kombat is a trademark of Warner Bros. Entertainment. mk9-nx is an unofficial fan project and is not affiliated with, endorsed or sponsored by Warner Bros., NetherRealm Studios, Nintendo or Microsoft. Nintendo Switch is a trademark of Nintendo; Xbox 360 is a trademark of Microsoft. This site does not host or distribute game data: your disc image is read only inside your browser, is never uploaded, and its files are copied straight into the mk9-nx.zip saved on your computer. You need your own legally obtained copy of the game.',
    sourceCode: 'Source code',
    signature: 'a Thorhax project',
    lead:
      'Builds the <strong>Nintendo Switch</strong> package of <strong>Mortal Kombat Komplete Edition</strong> from your own ' +
      '<strong>Xbox 360</strong> disc. Everything runs in <strong>this browser</strong>.',
    languageBar: 'Language',
    step1: '1. Choose your game',
    formatPackage: 'Disc image (.iso)',
    formatFolder: 'Folder',
    ownCopy:
      '<strong>Important:</strong> you need your own copy of the game, dumped from your own Xbox 360 disc. The installer reads the game from it to make the package; without it, it cannot be made. Every game file in the package comes from your copy: the installer does not supply any of its own.',
    formatHint:
      '<strong>Disc image:</strong> a plain <code>.iso</code> of the disc (not a compressed CCI, GOD or ZAR image). ' +
      '<strong>Folder:</strong> a folder you extracted the disc into (with <code>default.xex</code>).',
    nothingChosen: 'Nothing chosen yet.',
    chosenGame: 'Game: {name} ({size})',
    step2: '2. Create the package',
    step2First: 'If you are installing the game for the first time, use:',
    create: 'Create mk9-nx.zip',
    step2Update:
      'If the game is already installed and you only want to update it (<code>mk9.nro</code> and the shaders), use:',
    createUpdate: 'Create mk9-nx-update.zip',
    step3: '3. Copy it to the Switch',
    step3Extract: 'Extract the downloaded zip into <code>sdmc:/switch/</code> (about 6.8 GB of game files).',
    step3Start:
      'Start <code>mk9.nro</code> from the Homebrew Menu in title takeover mode (<strong>launch</strong> a game installed on the Switch ' +
      `<strong>while holding R</strong>) or create a forwarder with full memory with ${SPHAIRA}. The album applet does not give the game enough memory.`,
    step3First:
      'The first time you play, scenery can be <strong>missing for a moment</strong> at a stage\'s first intro while its shaders are ' +
      'compiled; they are kept on the SD card (<code>deko3d_shaders.bin</code>) for the next sessions. The game writes ' +
      '<code>mk9.toml</code> (your settings) at its first start.',
    step3Update:
      '<strong>Updating:</strong> make the update zip, extract it into <code>sdmc:/switch/</code> over your <code>mk9-nx</code> ' +
      'folder. Your <code>game_root/</code>, saves and <code>mk9.toml</code> stay.',
    checking: 'Checking your game…',
    supported: 'Xbox 360 disc · supported',
    unsupported: 'This version of the game is not supported yet.',
    notGame: 'Not the game',
    noGame: 'The game was not found: choose its .iso disc image, or a folder with default.xex.',
    noStreaming: 'this browser window cannot stream downloads. Use a normal (not private) window.',
    downloadStarted: 'Download started ({size}). Keep this page open until it finishes.',
    finished: 'Finished in {seconds} s.',
    error: 'Error: {message}',
    cancelled: 'the download was cancelled',
    readingFiles: 'Reading your game',
    downloadingBuild: 'Downloading the Switch build',
    logBuild: 'Supported: Mortal Kombat Komplete Edition for Xbox 360 (build {version})',
    logUpdate: 'Update package: mk9.nro and the shaders',
    foundShaders: 'Found {count} shaders; building the shader library',
    translatedShaders: 'Translated {count} shaders',
    compiled: 'Compiled {done} of {total}',
    libraryReady: 'Shader library ready: it matches the tested one',
    gameIdentical: 'The game files have the tested count and size',
    gameDifferent: 'Warning: the game files differ from the tested copy (modified or damaged files?). The package is made anyway.',
    packing: 'Writing the package',
    done: 'Done: extract the zip into sdmc:/switch/',
    notSupportedYet: 'this version of the game is not supported yet. Executable fingerprint: {hash}',
    buildMismatch: 'the downloaded Switch build is not the published one ({hash}); try again later',
    libraryMismatch: 'the shader library does not match the tested one ({hash}); nothing was written',
    containersMismatch: 'the shaders of your game are not the tested ones; nothing was written',
    shaderMissing: 'the game file {name} is missing from your game',
    shaderDamaged: 'the game file {name} is damaged',
    incompleteGame: 'Incomplete game: {count} of {expected} files. Only the update package can be made.',
    incompleteError: 'the game is incomplete ({count} of {expected} files): choose the whole game',
    downloadFailed: 'could not download {url} ({status})',
    deko3dShaders: 'Making the Switch renderer\'s {count} shaders from your game',
    deko3dWait: 'This takes about 10 minutes on a PC with 8 cores, and up to an hour on one with 2: keep this tab open',
    deko3dReady: 'Shaders ready',
    deko3dMismatch: 'the shaders made from your game are not the tested ones (SHA-256 {hash}): please report this',
    downloadResuming: 'The connection broke: downloading the Switch build again in parts',
    downloadInterrupted:
      'the Switch build could not be downloaded: the connection keeps breaking. Check your internet connection, turn ' +
      'off any VPN, download blocker or antivirus web filter for this page, and try again (Firefox or Chrome).',
  },
};

let current = 'en';

export function getLanguage() {
  return current;
}

export function setLanguage(code) {
  current = TEXTS[code] ? code : 'en';
  return current;
}

// The visitor's choice (saved in their browser), else the browser's language when it is one of ours, else English.
export function preferredLanguage(saved, browser = []) {
  if (saved && TEXTS[saved]) {
    return saved;
  }
  for (const tag of browser) {
    const code = String(tag).toLowerCase().split('-')[0];
    if (TEXTS[code]) {
      return code;
    }
  }
  return 'en';
}

export function t(key, params = {}) {
  const text = TEXTS[current][key] ?? TEXTS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
}

// Sizes as Windows Explorer shows them, so the page and the file's properties agree: units of 1024 bytes (which
// Windows calls KB, MB and GB) and three significant digits, truncated. 7,834,892,288 bytes is 7.29 GB, not 7.83.
export function formatSize(bytes) {
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const scale = 10 ** decimals;
  // The small epsilon keeps values such as 7.3 from becoming 7.29 through floating point.
  const shown = Math.floor(value * scale + 1e-9) / scale;
  const number = new Intl.NumberFormat(current, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${number.format(shown)} ${units[unit]}`;
}
