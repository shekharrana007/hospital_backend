const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');
const config = require('./config');

// Simple JSON-based datastore using lowdb (NoSQL-style).
// This keeps the assignment focused on the allocation logic rather than DB setup.

const file = path.join(__dirname, '..', config.dbFile);
const adapter = new JSONFile(file);
const db = new Low(adapter, {
  doctors: [],
  slots: [],
  tokens: []
});

async function initDb() {
  await db.read();
  db.data ||= { doctors: [], slots: [], tokens: [] };
  await db.write();
}

module.exports = {
  db,
  initDb
};


