#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:-/var/www/ciallo.org.cn/server/leaderboard}"
install_dir="/opt/ciallo-leaderboard"
data_dir="/var/lib/ciallo-leaderboard"
unit_file="/etc/systemd/system/ciallo-leaderboard.service"
backup_root="/var/backups/ciallo-leaderboard"
timestamp="$(date +%Y%m%dT%H%M%S%z)"
backup_dir="${backup_root}/${timestamp}"

test "$(id -u)" -eq 0
test -f "${source_dir}/leaderboard_server.py"
test -f "${source_dir}/blocked_words.txt"
test -f "${source_dir}/ciallo-leaderboard.service"

mkdir -p "${backup_dir}"
if [[ -d "${install_dir}" ]]
then
    cp -a "${install_dir}" "${backup_dir}/application"
fi
if [[ -f "${unit_file}" ]]
then
    cp -a "${unit_file}" "${backup_dir}/ciallo-leaderboard.service"
fi

if ! getent group ciallo-board >/dev/null
then
    groupadd --system ciallo-board
fi
if ! getent passwd ciallo-board >/dev/null
then
    useradd \
        --system \
        --gid ciallo-board \
        --home-dir "${data_dir}" \
        --shell /sbin/nologin \
        ciallo-board
fi

install -d -m 0755 -o root -g root "${install_dir}"
install -d -m 0750 -o ciallo-board -g ciallo-board "${data_dir}"
install -m 0755 -o root -g root \
    "${source_dir}/leaderboard_server.py" \
    "${install_dir}/leaderboard_server.py"
install -m 0644 -o root -g root \
    "${source_dir}/blocked_words.txt" \
    "${install_dir}/blocked_words.txt"
install -m 0644 -o root -g root \
    "${source_dir}/ciallo-leaderboard.service" \
    "${unit_file}"

systemctl daemon-reload
systemctl enable ciallo-leaderboard.service
systemctl restart ciallo-leaderboard.service

for attempt in 1 2 3 4 5 6 7 8 9 10
do
    if curl -fsS --max-time 3 http://127.0.0.1:18181/healthz >/dev/null
    then
        break
    fi
    if [[ "${attempt}" -eq 10 ]]
    then
        systemctl status --no-pager ciallo-leaderboard.service || true
        exit 1
    fi
    sleep 1
done

printf 'LEADERBOARD_SERVICE=%s\n' "$(systemctl is-active ciallo-leaderboard.service)"
printf 'LEADERBOARD_HEALTH=ok\n'
printf 'LEADERBOARD_BACKUP_DIR=%s\n' "${backup_dir}"
