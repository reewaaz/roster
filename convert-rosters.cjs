const fs = require('fs');

function convertRoster(inputFile, outputFile) {
  const raw = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const newDays = raw.days.map(d => ({
    date: d.date,
    day: d.day,
    title: d.type === 'off' ? 'Saturday OFF' : '',
    ward: d.ward,
    nicu: d.nicu,
    picu: d.picu,
    er: d.er,
    second: d.second,
    opd: d.opd,
    nagarHospital: d.nagarHospital
  }));
  const out = { month: raw.month, startDate: raw.startDate, days: newDays };
  
  // Match 208306.json compact style
  const lines = ['{'];
  lines.push('  "month": "' + out.month + '",');
  lines.push('  "startDate": "' + out.startDate + '",');
  lines.push('  "days": [');
  for (let i = 0; i < newDays.length; i++) {
    const d = newDays[i];
    const fields = Object.entries(d).map(([k,v]) => '"' + k + '": "' + v + '"').join(', ');
    lines.push('    {' + fields + '}' + (i < newDays.length - 1 ? ',' : ''));
  }
  lines.push('  ]');
  lines.push('}');
  fs.writeFileSync(outputFile, lines.join('\n'));
  console.log('Converted', inputFile, '->', outputFile);
}

convertRoster('rosters/208304.json', 'rosters/208304.json');
convertRoster('rosters/208305.json', 'rosters/208305.json');
convertRoster('rosters/208307.json', 'rosters/208307.json');
console.log('Done');