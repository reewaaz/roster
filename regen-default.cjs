const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('rosters/208306.json', 'utf8'));
const out = `/* Built-in default roster: Ashwin 2083 — synced 1:1 from rosters/208306.json.
   Shipping it as a JS module (not .json) means the raw source tree also runs on
   static hosts (GitHub Pages) — browsers reject native .json ES-module imports. */
export default {
  "meta": {
    "month": "${raw.month}",
    "startDate": "${raw.startDate}"
  },
  "days": [
`;
const dayLines = raw.days.map(d => {
  const fields = Object.entries(d).map(([k,v]) => `      "${k}": "${v}"`).join(',\n');
  return `    {\n${fields}\n    }`;
}).join(',\n');

const footer = `
  ]
};
`;
fs.writeFileSync('modules/roster-data.js', out + dayLines + footer);
console.log('Regenerated modules/roster-data.js from rosters/208306.json');