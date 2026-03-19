const os = require('os');
const fs = require('fs');
const path = require('path');
const { Database } = require('@signalapp/sqlcipher');
  

// this function works for MacOS, for other OS check paths in the list above
function getFolderPath() {
    return path.join(os.homedir(), '.config', 'Signal');
}


function getDBPath() {
	const sqlDir = path.join(getFolderPath(), 'sql');
	const decryptedPath = path.join(sqlDir, 'db-decrypted.sqlite');
	if (fs.existsSync(decryptedPath)) {
		return decryptedPath;
	}
	return path.join(sqlDir, 'db.sqlite');
}


function getDBKey() {
	const config = path.join(getFolderPath(), 'config.json');
	return JSON.parse(fs.readFileSync(config).toString())['key'];
}


// read only, to make sure we will not overwrite anything accidentally
const db = new Database(getDBPath());

const dbKey = getDBKey();
if (dbKey) {
	// decrypt the database using a key when a plaintext key is available.
	db.pragma(`key = "x'${dbKey}'"`);
}

// list all tables in the database
let stm = db.prepare(`SELECT name FROM sqlite_schema WHERE type='table'`);
console.log(stm.all());

// query UUIDs of all active private conversations in Signal
stm = db.prepare(`SELECT id FROM conversations WHERE type='private' AND active_at IS NOT NULL AND name IS NOT NULL ORDER BY active_at DESC`);
console.log(stm.all());
