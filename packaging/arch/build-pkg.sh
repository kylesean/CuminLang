#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <version> <packaged_app_dir> <output_dir>" >&2
  exit 1
fi

VERSION="$1"
APP_DIR="$(cd "$2" && pwd)"
mkdir -p "$3"
OUT_DIR="$(cd "$3" && pwd)"
# Arch pkgver disallows hyphens
PKGVER="${VERSION//-/.}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

mkdir -p "${WORK_DIR}/icons"
cp "${REPO_ROOT}/assets/icons/"*.png "${WORK_DIR}/icons/"
cp "${REPO_ROOT}/assets/icons/icon.svg" "${WORK_DIR}/icons/"
tar -C "${WORK_DIR}" -czf "${WORK_DIR}/cuminlang-icons.tar.gz" icons
rm -rf "${WORK_DIR}/icons"

cp "${SCRIPT_DIR}/cuminlang.desktop" "${WORK_DIR}/cuminlang.desktop"
sed "s/__PKGVER__/${PKGVER}/g" "${SCRIPT_DIR}/PKGBUILD.template" > "${WORK_DIR}/PKGBUILD"

APP_PARENT="$(dirname "${APP_DIR}")"
APP_BASENAME="$(basename "${APP_DIR}")"
if [ "${APP_BASENAME}" = "CuminLang-linux-x64" ]; then
  tar -C "${APP_PARENT}" -czf "${WORK_DIR}/cuminlang-app.tar.gz" "${APP_BASENAME}"
else
  ln -s "${APP_DIR}" "${WORK_DIR}/CuminLang-linux-x64"
  tar -Ch -C "${WORK_DIR}" -czf "${WORK_DIR}/cuminlang-app.tar.gz" "CuminLang-linux-x64"
  rm -f "${WORK_DIR}/CuminLang-linux-x64"
fi

pushd "${WORK_DIR}" >/dev/null
PKGEXT='.pkg.tar.zst' makepkg -df --noconfirm
popd >/dev/null

cp "${WORK_DIR}/"*.pkg.tar.zst "${OUT_DIR}/"
echo "Built Arch Linux package(s) in ${OUT_DIR}:"
ls -lh "${OUT_DIR}/"*.pkg.tar.zst
