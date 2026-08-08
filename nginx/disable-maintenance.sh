#!/usr/bin/env bash
set -Eeuo pipefail

site_dir="/var/www/ciallo.org.cn"
source_config="${site_dir}/nginx/ciallo.org.cn.conf"
active_config="/etc/nginx/conf.d/ciallo.org.cn.conf"
certificate="/etc/letsencrypt/live/ciallo.org.cn/fullchain.pem"
private_key="/etc/letsencrypt/live/ciallo.org.cn/privkey.pem"

if [[ "${EUID}" -ne 0 ]]
then
    echo "请使用 root 运行此脚本。"
    exit 1
fi

if [[ ! -f "${certificate}" || ! -f "${private_key}" ]]
then
    echo "未找到 ciallo.org.cn 的证书或私钥，拒绝切换到正式 HTTPS 配置。"
    exit 1
fi

if [[ ! -f "${source_config}" ]]
then
    echo "找不到正式配置模板：${source_config}"
    exit 1
fi

backup_dir="/etc/nginx/ciallo-backups"
mkdir -p "${backup_dir}"
backup_config="$(mktemp "${backup_dir}/ciallo.org.cn.XXXXXX")"
had_active_config=0

if [[ -f "${active_config}" ]]
then
    cp -a "${active_config}" "${backup_config}"
    had_active_config=1
fi

restore_previous()
{
    if [[ "${had_active_config}" -eq 1 ]]
    then
        cp -a "${backup_config}" "${active_config}"
    else
        rm -f "${active_config}"
    fi
}

cp -a "${source_config}" "${active_config}"

if ! nginx -t
then
    echo "Nginx 配置检查失败，正在恢复维护配置。"
    restore_previous
    nginx -t || true
    exit 1
fi

systemctl reload nginx
echo "维护模式已关闭，正式站点已恢复。"
