#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
    echo "请使用 root 执行此脚本" >&2
    exit 1
fi

if [[ $# -ne 1 ]]; then
    echo "用法：$0 /path/to/ciallo-deploy.pub" >&2
    exit 1
fi

public_key_file="$(realpath "$1")"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deploy_user="ciallo-deploy"
deploy_home="/home/${deploy_user}"

test -f "${public_key_file}"
test -f "${script_dir}/deploy-site.sh"
grep -Eq '^(ssh-ed25519|sk-ssh-ed25519@openssh.com) [A-Za-z0-9+/=]+( .*)?$' "${public_key_file}"

for command in curl flock nginx realpath rsync sha256sum sudo tar; do
    command -v "${command}" >/dev/null
done

if ! id "${deploy_user}" >/dev/null 2>&1; then
    useradd --create-home --home-dir "${deploy_home}" --shell /bin/bash "${deploy_user}"
fi

install -d -o "${deploy_user}" -g "${deploy_user}" -m 0700 "${deploy_home}/.ssh"
install -d -o "${deploy_user}" -g "${deploy_user}" -m 0750 "${deploy_home}/incoming"

authorized_keys="${deploy_home}/.ssh/authorized_keys"
touch "${authorized_keys}"
chown "${deploy_user}:${deploy_user}" "${authorized_keys}"
chmod 0600 "${authorized_keys}"

key="$(tr -d '\r\n' < "${public_key_file}")"
restricted_key="no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding ${key}"
if ! grep -Fqx -- "${restricted_key}" "${authorized_keys}"; then
    printf '%s\n' "${restricted_key}" >> "${authorized_keys}"
fi

install -o root -g root -m 0755 "${script_dir}/deploy-site.sh" /usr/local/sbin/deploy-ciallo-site

sudoers_tmp="$(mktemp)"
trap 'rm -f -- "${sudoers_tmp}"' EXIT
printf '%s\n' "${deploy_user} ALL=(root) NOPASSWD: /usr/local/sbin/deploy-ciallo-site" > "${sudoers_tmp}"
chmod 0440 "${sudoers_tmp}"
visudo -cf "${sudoers_tmp}"
install -o root -g root -m 0440 "${sudoers_tmp}" /etc/sudoers.d/ciallo-deploy

echo "已安装专用部署账号与固定 sudo 入口。未修改 Nginx、站点文件或维护模式。"
