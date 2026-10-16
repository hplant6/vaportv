"""Builds src/main/library/arcade-names.json from a MAME -listxml (the mameNNNNlx.zip
on MAME's GitHub releases): every coin-op machine's title, year and parent set, and
the BIOS and device sets to leave out of the Arcade tab.

    python3 scripts/make-arcade-names.py mame0289lx.zip
"""
import json
import sys
import xml.etree.ElementTree as ET
import zipfile

OUT = 'src/main/library/arcade-names.json'

source = zipfile.ZipFile(sys.argv[1])
xml_name = source.namelist()[0]
games = {}
skip = []
with source.open(xml_name) as f:
    for _, el in ET.iterparse(f, events=('end',)):
        if el.tag != 'machine':
            continue
        a = el.attrib
        if a.get('isbios') == 'yes' or a.get('isdevice') == 'yes' or a.get('runnable') == 'no':
            skip.append(a['name'])
        else:
            inputs = el.find('input')
            # Coin slots: an arcade machine, not a computer or console driver.
            if inputs is not None and 'coins' in inputs.attrib:
                entry = [el.findtext('description') or a['name'], el.findtext('year') or '']
                if a.get('cloneof'):
                    entry.append(a['cloneof'])
                games[a['name']] = entry
        el.clear()

with open(OUT, 'w') as out:
    json.dump({'source': xml_name, 'games': games, 'skip': sorted(skip)}, out, separators=(',', ':'), ensure_ascii=False, sort_keys=True)
print(f'{xml_name}: {len(games)} games, {len(skip)} BIOS/device sets -> {OUT}')
