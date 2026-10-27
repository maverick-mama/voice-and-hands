'use strict';
/**
 * A small spend ledger: one JSON-lines file, a rolling 24-hour cap per self.
 * Every run is written, failed ones too, so you can see exactly what the
 * helper did and what it cost.
 */
const fs = require('fs');
const path = require('path');

const DAY_MS = 24 * 60 * 60 * 1000;

function createLedger(file) {
  const rows = () => {
    try {
      return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    } catch { return []; }
  };
  return {
    spentToday(selfId, now = Date.now()) {
      return rows()
        .filter(r => r.self === selfId && now - Date.parse(r.at) < DAY_MS)
        .reduce((n, r) => n + (Number(r.cost) || 0), 0);
    },
    add(row) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n');
    },
    rows,
  };
}

// For tests and throwaway runs.
function memoryLedger() {
  const list = [];
  return {
    spentToday: (selfId, now = Date.now()) => list
      .filter(r => r.self === selfId && now - Date.parse(r.at) < DAY_MS)
      .reduce((n, r) => n + (Number(r.cost) || 0), 0),
    add: row => list.push({ at: new Date().toISOString(), ...row }),
    rows: () => list.slice(),
  };
}

module.exports = { createLedger, memoryLedger };
