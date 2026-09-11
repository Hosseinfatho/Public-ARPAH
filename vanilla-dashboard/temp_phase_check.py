import json
from datetime import date, datetime, timedelta
from pathlib import Path

manifest = json.loads(Path('data/Patient_12738_OP/notes_manifest.json').read_text(encoding='utf-8'))
admission = date(2023, 5, 4)
discharge = date(2023, 5, 11)
day = timedelta(days=1)

def map_date_to_phase(note_date, admission, discharge):
    if not note_date or not admission or not discharge:
        return None
    n = note_date
    a = admission
    d = discharge
    if n < a - day:
        return None
    if n <= a:
        return 'Home'
    er_date = a + day
    if n == er_date:
        return 'ER'
    if a < n < d:
        return 'Unit'
    if n == d:
        return 'Discharge'
    if n <= d + timedelta(days=7):
        return 'Post-Discharge'
    return None

out = {'Home': [], 'ER': [], 'Unit': [], 'Discharge': [], 'Post-Discharge': []}
for file in manifest['files']:
    d = datetime.strptime(file['date'], '%Y-%m-%d').date()
    phase = map_date_to_phase(d, admission, discharge)
    if phase:
        out[phase].append(file['date'])

for phase, dates in out.items():
    print(phase + ': ' + ', '.join(dates))
