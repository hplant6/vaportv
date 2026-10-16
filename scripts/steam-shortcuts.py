#!/usr/bin/env python3
"""List or add non-Steam shortcuts in a copy of Steam's binary shortcuts.vdf.

    steam-shortcuts.py list FILE
    steam-shortcuts.py add FILE OUT NAME EXE [LAUNCH_OPTIONS] [START_DIR]
    steam-shortcuts.py rename FILE OUT OLD_NAME NEW_NAME   (keeps the app id)

Steam overwrites shortcuts.vdf on exit, so edit a copy with Steam stopped and put
it back before Steam starts (scripts/add-shortcut.sh does that on the box).
"""
import binascii
import struct
import sys


def parse(data, i=0):
    obj = {}
    while True:
        kind = data[i]
        i += 1
        if kind == 0x08:
            return obj, i
        end = data.index(b'\0', i)
        key = data[i:end].decode()
        i = end + 1
        if kind == 0x00:
            obj[key], i = parse(data, i)
        elif kind == 0x01:
            end = data.index(b'\0', i)
            obj[key] = data[i:end].decode()
            i = end + 1
        elif kind == 0x02:
            obj[key] = ('u32', struct.unpack('<I', data[i:i + 4])[0])
            i += 4
        else:
            raise ValueError(f'unknown type 0x{kind:02x} at {i - 1}')


def dump(obj):
    out = b''
    for key, value in obj.items():
        k = key.encode() + b'\0'
        if isinstance(value, dict):
            out += b'\x00' + k + dump(value) + b'\x08'
        elif isinstance(value, tuple):
            out += b'\x02' + k + struct.pack('<I', value[1])
        else:
            out += b'\x01' + k + value.encode() + b'\0'
    return out


def load(path):
    data = open(path, 'rb').read()
    root, end = parse(data)
    if dump(root) + b'\x08' != data[:end + 1]:
        sys.exit(f'{path}: would not round-trip unchanged; refusing to edit it')
    return root, data[end + 1:]


def field(entry, name):
    return next((v for k, v in entry.items() if k.lower() == name.lower()), '')


def game_id(appid):
    return (appid << 32) | 0x02000000


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == 'list':
        root, _ = load(sys.argv[2])
        for entry in root['shortcuts'].values():
            appid = field(entry, 'appid')[1]
            print(f"{field(entry, 'AppName')}\tgame id {game_id(appid)}\t{field(entry, 'Exe')} {field(entry, 'LaunchOptions')}")
        return
    if len(sys.argv) >= 6 and sys.argv[1] == 'add':
        src, dst, name, exe = sys.argv[2:6]
        options = sys.argv[6] if len(sys.argv) > 6 else ''
        start_dir = sys.argv[7] if len(sys.argv) > 7 else '"./"'
        root, tail = load(src)
        shortcuts = root['shortcuts']
        if any(field(e, 'AppName').lower() == name.lower() for e in shortcuts.values()):
            sys.exit(f'{name}: already exists')
        # The id Steam itself derives for a shortcut, so artwork and launches match.
        appid = (binascii.crc32((exe + name).encode()) & 0xFFFFFFFF) | 0x80000000
        shortcuts[str(len(shortcuts))] = {
            'appid': ('u32', appid),
            'AppName': name,
            'Exe': exe,
            'StartDir': start_dir,
            'icon': '',
            'ShortcutPath': '',
            'LaunchOptions': options,
            'IsHidden': ('u32', 0),
            'AllowDesktopConfig': ('u32', 1),
            'AllowOverlay': ('u32', 1),
            'OpenVR': ('u32', 0),
            'Devkit': ('u32', 0),
            'DevkitGameID': '',
            'DevkitOverrideAppID': ('u32', 0),
            'LastPlayTime': ('u32', 0),
            'FlatpakAppID': '',
            'tags': {},
        }
        open(dst, 'wb').write(dump(root) + b'\x08' + tail)
        print(f'added {name}: game id {game_id(appid)}')
        return
    if len(sys.argv) == 6 and sys.argv[1] == 'rename':
        src, dst, old, new = sys.argv[2:6]
        root, tail = load(src)
        matches = [e for e in root['shortcuts'].values() if field(e, 'AppName').lower() == old.lower()]
        if len(matches) != 1:
            sys.exit(f'{old}: {len(matches)} matches')
        entry = matches[0]
        key = next(k for k in entry if k.lower() == 'appname')
        entry[key] = new
        open(dst, 'wb').write(dump(root) + b'\x08' + tail)
        print(f'renamed {old} -> {new} (app id {field(entry, "appid")[1]} unchanged)')
        return
    sys.exit(__doc__)


main()
