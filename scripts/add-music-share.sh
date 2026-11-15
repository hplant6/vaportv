#!/bin/bash
# Connects a Windows (SMB) share to the Music app: mounts it read-only at ~/Network/<name>,
# where the Music app lists it beside ~/Music and the drives. Run on the box itself, as root:
#
#   sudo ./add-music-share.sh //LargeBox/Music LargeBox-Music
#   sudo ./add-music-share.sh --remove LargeBox-Music
#
# It asks for the share's Windows user name and password and keeps them in a file only root
# can read (/etc/vaportv/shares/<name>.cred), never on the command line. The mount is a
# systemd automount (like the SATA and NZB drives' units), so it connects when the Music app
# first looks in it and a PC that's off never holds up boot. SteamOS updates keep
# /etc/systemd/system; /etc/vaportv is added to the update keep list.
set -euo pipefail

USER_NAME=${SUDO_USER:-deck}
HOME_DIR=$(getent passwd "$USER_NAME" | cut -d: -f6)
CRED_DIR=/etc/vaportv/shares
KEEP=/etc/atomic-update.conf.d/vaportv-shares.conf

[ "$(id -u)" = 0 ] || { echo "Run it with sudo."; exit 1; }

units() { # name → the mount and automount unit names for ~/Network/<name>
  local where="$HOME_DIR/Network/$1"
  local base
  base=$(systemd-escape -p "$where")
  echo "$where" "$base.mount" "$base.automount"
}

if [ "${1:-}" = "--remove" ]; then
  name=${2:?Which share? e.g. --remove LargeBox-Music}
  read -r where mount automount < <(units "$name")
  systemctl disable --now "$automount" 2>/dev/null || true
  systemctl stop "$mount" 2>/dev/null || true
  rm -f "/etc/systemd/system/$mount" "/etc/systemd/system/$automount" "$CRED_DIR/$name.cred"
  systemctl daemon-reload
  rmdir "$where" 2>/dev/null || true
  echo "Removed $name."
  exit 0
fi

share=${1:?Which share? e.g. //LargeBox/Music}
name=${2:?What to call it? e.g. LargeBox-Music (letters, numbers and dashes)}
[[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]] || { echo "Use letters, numbers and dashes for the name."; exit 1; }
share=${share//\\//}
[[ "$share" =~ ^//[^/]+/.+ ]] || { echo "The share looks like //Computer/Folder (or \\\\Computer\\Folder)."; exit 1; }
read -r where mount automount < <(units "$name")

read -r -p "Windows user name for $share: " smb_user
read -r -s -p "Password: " smb_pass
echo
mkdir -p "$CRED_DIR"
chmod 700 /etc/vaportv "$CRED_DIR" 2>/dev/null || true
umask 077
printf 'username=%s\npassword=%s\n' "$smb_user" "$smb_pass" > "$CRED_DIR/$name.cred"
unset smb_pass

# Through SteamOS updates.
mkdir -p "$(dirname "$KEEP")"
printf '%s\n' "## vaporTV: network shares' sign-ins for the Music app" /etc/vaportv > "$KEEP"

sudo -u "$USER_NAME" mkdir -p "$where"
uid=$(id -u "$USER_NAME")
gid=$(id -g "$USER_NAME")

cat > "/etc/systemd/system/$mount" <<UNIT
[Unit]
Description=$share for vaporTV's Music app
After=network-online.target
Wants=network-online.target

[Mount]
What=$share
Where=$where
Type=cifs
Options=ro,credentials=$CRED_DIR/$name.cred,uid=$uid,gid=$gid,iocharset=utf8,file_mode=0444,dir_mode=0555,_netdev,soft
TimeoutSec=20
UNIT

cat > "/etc/systemd/system/$automount" <<UNIT
[Unit]
Description=$share for vaporTV's Music app (on first use)

[Automount]
Where=$where
TimeoutIdleSec=600

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now "$automount"
if ls "$where" >/dev/null 2>&1; then
  echo "Connected: $(ls "$where" | wc -l) items in $share, at $where."
else
  echo "Set up, but it didn't connect just now (check the user name and password, or that the PC is on):"
  journalctl -u "$mount" -n 5 --no-pager -o cat || true
fi
