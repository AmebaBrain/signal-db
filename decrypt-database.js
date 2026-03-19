const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');
const electronModule = require('electron');
const { Database } = require('@signalapp/sqlcipher');

const signalDir = path.join(os.homedir(), '.config', 'Signal');
const dbPath = path.join(signalDir, 'sql', 'db.sqlite');
const outPath = path.join(signalDir, 'sql', 'db-decrypted.sqlite');
const configPath = path.join(signalDir, 'config.json');
const linuxPasswordStoreFlags = {
  basic_text: 'basic',
  gnome_libsecret: 'gnome-libsecret',
  kwallet: 'kwallet',
  kwallet5: 'kwallet5',
  kwallet6: 'kwallet6',
};

function isElectronRuntime(electronValue) {
  return Boolean(electronValue && typeof electronValue === 'object' && electronValue.app);
}

function relaunchUnderElectron(electronBinary) {
  const result = childProcess.spawnSync(
    electronBinary,
    [path.resolve(__filename), ...process.argv.slice(2)],
    { stdio: 'inherit' }
  );

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

if (!isElectronRuntime(electronModule)) {
  relaunchUnderElectron(electronModule);
}

const { app, safeStorage } = electronModule;

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

const config = readConfig();

if (process.platform === 'linux') {
  const passwordStoreFlag = linuxPasswordStoreFlags[config.safeStorageBackend];
  if (passwordStoreFlag) {
    app.commandLine.appendSwitch('password-store', passwordStoreFlag);
  }
}

// Match Signal app identity before Electron initializes safeStorage internals.
app.setName('Signal');

function decodeEncryptedKey(encryptedKey) {
  if (typeof encryptedKey !== 'string' || !encryptedKey.trim()) {
    throw new Error('encryptedKey is missing or not a string');
  }

  const value = encryptedKey.trim();

  // Signal commonly stores encryptedKey as hex-encoded bytes (starts with v10/v11).
  if (/^[0-9a-f]+$/i.test(value) && value.length % 2 === 0) {
    return Buffer.from(value, 'hex');
  }

  // Some environments store it in base64.
  return Buffer.from(value, 'base64');
}

app.whenReady().then(() => {
  if (!config.encryptedKey) {
    throw new Error('config.json does not contain encryptedKey');
  }

  const selectedBackend =
    process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function'
      ? safeStorage.getSelectedStorageBackend()
      : undefined;

  if (
    process.platform === 'linux' &&
    typeof config.safeStorageBackend === 'string' &&
    selectedBackend &&
    config.safeStorageBackend !== selectedBackend
  ) {
    throw new Error(
      `safeStorage backend mismatch: Signal used "${config.safeStorageBackend}", ` +
      `but Electron selected "${selectedBackend}" for this run.`
    );
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Electron safeStorage is not available in this session');
  }

  let key;
  try {
    key = safeStorage.decryptString(decodeEncryptedKey(config.encryptedKey));
  } catch (error) {
    const backend = config.safeStorageBackend || selectedBackend || 'unknown';
    throw new Error(
      `Failed to decrypt config.encryptedKey using safeStorage backend "${backend}". ` +
      'Make sure your desktop keyring is unlocked and this script runs in the same desktop session and packaging context as Signal. ' +
      `Original error: ${error.message}`
    );
  }

  if (fs.existsSync(outPath)) {
    fs.unlinkSync(outPath);
  }

  const db = new Database(dbPath);
  db.pragma(`key = "x'${key}'"`);

  db.exec(`
    ATTACH DATABASE '${outPath.replace(/'/g, "''")}' AS plaintext KEY '';
    SELECT sqlcipher_export('plaintext');
    DETACH DATABASE plaintext;
  `);

  db.close();
  console.log(`Decrypted database exported to: ${outPath}`);
  app.quit();
}).catch(err => {
  console.error(err);
  app.exit(1);
});
