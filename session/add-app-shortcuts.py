#!/usr/bin/env python3
"""Adds (or updates, by name) non-Steam shortcuts for vaporTV's apps.

    add-app-shortcuts.py SHORTCUTS_VDF ENTRIES_JSON [--wait-for-steam-exit] [--relaunch]

ENTRIES_JSON is a file holding [{"name", "exe", "startDir", "launchOptions"}, ...].
Steam rewrites shortcuts.vdf as it exits, so this only writes once Steam is gone:
with --wait-for-steam-exit it waits for that (vaporTV starts it before restarting
Steam in Gaming Mode, as a separate service, since vaporTV closes with Steam).
Everything else in the file is kept as it was; a backup is left beside it.
With --relaunch it then opens vaporTV again: Gaming Mode brings Steam back by itself,
but its autostart only runs when the whole session starts.
"""

import json
import os
import shutil
import struct
import subprocess
import sys
import time
import zlib


def parse(data, i=0):
    out = {}
    while True:
        kind = data[i]
        i += 1
        if kind == 8:
            return out, i
        end = data.index(0, i)
        key = data[i:end].decode('utf-8')
        i = end + 1
        if kind == 0:
            value, i = parse(data, i)
        elif kind == 1:
            end = data.index(0, i)
            value = data[i:end].decode('utf-8')
            i = end + 1
        elif kind == 2:
            value = struct.unpack('<I', data[i:i + 4])[0]
            i += 4
        else:
            raise ValueError(f'unknown field type {kind}')
        out[key] = value


def dump(obj):
    out = bytearray()
    for key, value in obj.items():
        name = key.encode('utf-8') + b'\0'
        if isinstance(value, dict):
            out += b'\0' + name + dump(value)
        elif isinstance(value, int):
            out += b'\2' + name + struct.pack('<I', value & 0xFFFFFFFF)
        else:
            out += b'\1' + name + str(value).encode('utf-8') + b'\0'
    return bytes(out + b'\x08')


def field(entry, name):
    """The key as this file spells it (Steam writes appname / exe in lower case)."""
    return next((k for k in entry if k.lower() == name.lower()), name)


def upsert(shortcuts, item):
    for entry in shortcuts.values():
        if isinstance(entry, dict) and str(entry.get(field(entry, 'AppName'), '')).lower() == item['name'].lower():
            entry[field(entry, 'Exe')] = item['exe']
            entry[field(entry, 'StartDir')] = item['startDir']
            entry[field(entry, 'LaunchOptions')] = item['launchOptions']
            return 'updated'
    # Steam's own id for a shortcut: crc32 of exe + name, top bit set.
    appid = (zlib.crc32((item['exe'] + item['name']).encode('utf-8')) | 0x80000000) & 0xFFFFFFFF
    keys = [int(k) for k in shortcuts if k.isdigit()]
    shortcuts[str(max(keys) + 1 if keys else 0)] = {
        'appid': appid,
        'appname': item['name'],
        'exe': item['exe'],
        'StartDir': item['startDir'],
        'icon': '',
        'ShortcutPath': '',
        'LaunchOptions': item['launchOptions'],
        'IsHidden': 0,
        'AllowDesktopConfig': 1,
        'AllowOverlay': 1,
        'OpenVR': 0,
        'Devkit': 0,
        'DevkitGameID': '',
        'DevkitOverrideAppID': 0,
        'LastPlayTime': 0,
        'FlatpakAppID': '',
        'sortas': '',
        'tags': {},
    }
    return 'added'


def steam_running():
    return subprocess.run(['pgrep', '-x', 'steam'], stdout=subprocess.DEVNULL).returncode == 0


def main():
    vdf_path, entries_path = sys.argv[1], sys.argv[2]
    if '--wait-for-steam-exit' in sys.argv:
        # Up to two minutes for Steam to close; then give up rather than fight it.
        for _ in range(600):
            if not steam_running():
                break
            time.sleep(0.2)
        else:
            print('Steam never closed; nothing changed', file=sys.stderr)
            return 1
    entries = json.load(open(entries_path))
    data = open(vdf_path, 'rb').read() if os.path.exists(vdf_path) else b'\0shortcuts\0\x08\x08'
    root, _ = parse(data)
    if dump(root) != data:
        print("Steam's shortcuts file has something this doesn't understand; left it alone", file=sys.stderr)
        return 1
    shortcuts = root.setdefault('shortcuts', {})
    for item in entries:
        print(f"{upsert(shortcuts, item)} {item['name']}")
    if os.path.exists(vdf_path):
        shutil.copyfile(vdf_path, vdf_path + '.vaportv-backup')
    tmp = vdf_path + '.vaportv-tmp'
    with open(tmp, 'wb') as out:
        out.write(dump(root))
    os.replace(tmp, vdf_path)
    os.remove(entries_path)
    if '--relaunch' in sys.argv:
        relaunch()
    return 0


def relaunch():
    """vaporTV's autostart, which waits for Steam's UI and then opens vaporTV."""
    started = subprocess.run(['systemctl', '--user', 'start', 'steamtv-autostart.service'], stderr=subprocess.DEVNULL)
    if started.returncode != 0:
        script = os.path.expanduser('~/.local/bin/steamtv-autostart')
        if os.path.exists(script):
            subprocess.run([script])


if __name__ == '__main__':
    sys.exit(main())
