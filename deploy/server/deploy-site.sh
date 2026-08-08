#!/usr/bin/env bash
set -Eeuo pipefail

deploy_user="ciallo-deploy"
incoming_dir="/home/${deploy_user}/incoming"
archive="${incoming_dir}/site.tar.gz"
checksum_file="${incoming_dir}/site.tar.gz.sha256"
revision_file="${incoming_dir}/revision.txt"
site_root="/var/www/ciallo.org.cn"
backup_root="/var/backups/ciallo.org.cn/github-actions"
state_dir="/var/lib/ciallo-deploy"
lock_file="/var/lock/ciallo-deploy.lock"
public_entries=(index.html 404.html maintenance.html assets games)

if [[ "$(realpath -m "${site_root}")" != "/var/www/ciallo.org.cn" ]]; then
    echo "拒绝部署：站点路径校验失败" >&2
    exit 1
fi

exec 9>"${lock_file}"
if ! flock -n 9; then
    echo "已有部署正在进行" >&2
    exit 1
fi

for required in "${archive}" "${checksum_file}" "${revision_file}"; do
    test -f "${required}"
done

revision="$(tr -d '\r\n' < "${revision_file}")"
if [[ ! "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "拒绝部署：revision 不是完整 commit SHA" >&2
    exit 1
fi

expected_checksum="$(awk 'NR == 1 { print $1 }' "${checksum_file}")"
actual_checksum="$(sha256sum "${archive}" | awk '{ print $1 }')"
if [[ ! "${expected_checksum}" =~ ^[0-9a-f]{64}$ || "${expected_checksum}" != "${actual_checksum}" ]]; then
    echo "拒绝部署：压缩包校验和不匹配" >&2
    exit 1
fi

if tar -tzf "${archive}" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
    echo "拒绝部署：压缩包包含不安全路径" >&2
    exit 1
fi

stage_dir="$(mktemp -d /var/tmp/ciallo-release.XXXXXX)"
rollback_dir="$(mktemp -d /var/tmp/ciallo-rollback.XXXXXX)"
timestamp="$(date +%Y%m%dT%H%M%S%z)"
backup_dir="${backup_root}/${timestamp}-${revision:0:12}"
deployment_started=0

restore_previous()
{
    echo "部署失败，正在恢复上一版本" >&2
    for entry in "${public_entries[@]}"; do
        target="${site_root}/${entry}"
        previous="${rollback_dir}/${entry}"
        missing_marker="${rollback_dir}/.missing-${entry}"

        if [[ -f "${missing_marker}" ]]; then
            rm -rf -- "${target}"
        elif [[ -d "${previous}" ]]; then
            install -d -m 0755 "${target}"
            rsync -a --delete "${previous}/" "${target}/"
        elif [[ -f "${previous}" ]]; then
            install -m 0644 "${previous}" "${target}"
        fi
    done
}

cleanup()
{
    status=$?
    trap - EXIT
    if [[ ${status} -ne 0 && ${deployment_started} -eq 1 ]]; then
        restore_previous || true
    fi
    rm -rf -- "${stage_dir}" "${rollback_dir}"
    exit "${status}"
}
trap cleanup EXIT

tar --no-same-owner --no-same-permissions -xzf "${archive}" -C "${stage_dir}"

for entry in "${public_entries[@]}"; do
    test -e "${stage_dir}/${entry}"
done
if find "${stage_dir}" -type l -print -quit | grep -q .; then
    echo "拒绝部署：公开文件包含符号链接" >&2
    exit 1
fi

unexpected="$(find "${stage_dir}" -mindepth 1 -maxdepth 1 -printf '%f\n' | grep -Ev '^(index\.html|404\.html|maintenance\.html|assets|games)$' || true)"
if [[ -n "${unexpected}" ]]; then
    echo "拒绝部署：压缩包包含非公开顶层文件：${unexpected}" >&2
    exit 1
fi

install -d -m 0755 "${site_root}" "${backup_dir}" "${state_dir}"
for entry in "${public_entries[@]}"; do
    if [[ -e "${site_root}/${entry}" ]]; then
        cp -a "${site_root}/${entry}" "${rollback_dir}/${entry}"
        cp -a "${site_root}/${entry}" "${backup_dir}/${entry}"
    else
        touch "${rollback_dir}/.missing-${entry}"
        touch "${backup_dir}/.missing-${entry}"
    fi
done
printf '%s\n' "${revision}" > "${backup_dir}/replaced-by-revision.txt"

deployment_started=1
install -d -m 0755 "${site_root}/assets" "${site_root}/games"
rsync -a --delete "${stage_dir}/assets/" "${site_root}/assets/"
rsync -a --delete "${stage_dir}/games/" "${site_root}/games/"
install -m 0644 "${stage_dir}/404.html" "${site_root}/404.html"
install -m 0644 "${stage_dir}/maintenance.html" "${site_root}/maintenance.html"
install -m 0644 "${stage_dir}/index.html" "${site_root}/index.html"

nginx -t
status_code="$(curl -sS -o /dev/null -w '%{http_code}' \
    --connect-timeout 5 \
    --noproxy '*' \
    --resolve ciallo.org.cn:443:127.0.0.1 \
    https://ciallo.org.cn/)"
if [[ "${status_code}" != "200" && "${status_code}" != "503" ]]; then
    echo "部署后站点返回异常状态码：${status_code}" >&2
    exit 1
fi

printf '%s\n' "${revision}" > "${state_dir}/last-successful-revision"
printf '%s\n' "${timestamp}" > "${state_dir}/last-successful-deployment"
rm -f -- "${archive}" "${checksum_file}" "${revision_file}"
deployment_started=0

echo "部署完成：${revision}，站点状态码 ${status_code}，备份 ${backup_dir}"
