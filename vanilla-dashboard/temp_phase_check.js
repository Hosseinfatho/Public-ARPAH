const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('data/Patient_12738_OP/notes_manifest.json', 'utf8'));
const admission = new Date(2023, 4, 4);
const discharge = new Date(2023, 4, 11);
const dayMs = 24 * 60 * 60 * 1000;
function mapDateToPhase(noteDate, admission, discharge) {
  if (!noteDate || !admission || !discharge) return null;
  const n = new Date(noteDate);
  n.setHours(0, 0, 0, 0);
  const a = new Date(admission);
  const d = new Date(discharge);
  a.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  if (n < new Date(a.getTime() - dayMs)) return null;
  if (n <= a) return 'Home';
  const erDate = new Date(a.getTime() + dayMs);
  if (n.getTime() === erDate.getTime()) return 'ER';
  if (n > erDate && n < d) return 'Unit';
  if (n.getTime() === d.getTime()) return 'Discharge';
  if (n <= new Date(d.getTime() + dayMs * 7)) return 'Post-Discharge';
  return null;
}
const grouped = { Home: [], ER: [], Unit: [], Discharge: [], 'Post-Discharge': [] };
for (const file of manifest.files) {
  const d = new Date(file.date);
  const phase = mapDateToPhase(d, admission, discharge);
  if (phase) grouped[phase].push(file.date);
}
for (const [phase, dates] of Object.entries(grouped)) {
  console.log(phase + ': ' + dates.join(', '));
}
