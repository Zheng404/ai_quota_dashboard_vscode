#!/bin/bash
# ============================================
# AI Quota Data Bridge — 打包脚本（staging 架构）
#
# 流程：build/staging/{chrome,firefox} = 平台 manifest + icons +
#       rsync(browser-common 全部) + esbuild bundle 覆盖 background.js
#       → 改写 staging manifest version → zip 从 staging 打
# 源码树 chrome/ 与 firefox/ 全程零接触，无需清理段。
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 版本号唯一可信源：vscode/package.json（消除 4 处手工同步）
VERSION="$(node -p "require('${SCRIPT_DIR}/vscode/package.json').version")"
BUILD_DIR="$SCRIPT_DIR/build"
STAGING_DIR="$BUILD_DIR/staging"

BROWSER_COMMON="$SCRIPT_DIR/browser-common"

echo "📡 AI Quota Data Bridge 打包工具（v${VERSION}）"
echo "===================================="

# 清理旧构建（staging 一并重建）
rm -rf "$BUILD_DIR"
mkdir -p "$STAGING_DIR/chrome" "$STAGING_DIR/firefox"

# ---- 组装 staging：平台专属文件 + 共享代码 ----
echo "📂 组装 staging 目录..."

for platform in chrome firefox; do
  STAGE="$STAGING_DIR/$platform"

  # 平台专属文件（manifest 后续统一改写 version，icons 原样复制）
  cp "$SCRIPT_DIR/$platform/manifest.json" "$STAGE/manifest.json"
  cp -r "$SCRIPT_DIR/$platform/icons" "$STAGE/icons"

  # 共享代码全量同步（staging 内无 manifest.json/icons/ 冲突文件，排除仅作防御）
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude='manifest.json' --exclude='icons/' "$BROWSER_COMMON/" "$STAGE/"
  else
    cp -r "$BROWSER_COMMON/"* "$STAGE/"
  fi
done

echo "   ✓ 平台文件 + 共享代码已同步"

# ---- esbuild 打包 background（IIFE 单文件，覆盖 staging 内的 ESM 源码副本）----
echo "⚙️  esbuild 打包 background Service Worker..."
npm --prefix "$SCRIPT_DIR/vscode" run build:browser
echo "   ✓ IIFE bundle 已写入 staging"

# ---- 打包扩展（版本号改写 staging 副本，源码树 manifest 零接触）----
# zip 为显式清单制：scripts/ 展开为 background.js（IIFE bundle）+ kimi-content.js
# （classic content script 保持源码形态），scripts/lib/ 已内联进 bundle，不进包
package_extension() {
  local pkg_dir="$1" zip_path="$2"
  node -e '
    const fs = require("fs");
    const [file, version] = process.argv.slice(1);
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    manifest.version = version;
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
  ' "$pkg_dir/manifest.json" "$VERSION"
    (cd "$pkg_dir" && zip -r "$zip_path" \
      manifest.json popup.html popup.js dashboard.html dashboard.js \
      styles.css templates.js shared-ui.js icons.js \
      config.js cache.js protocol/ \
    api/ scripts/background.js scripts/kimi-content.js icons/ > /dev/null)
}

# ---- Chrome 扩展 ----
echo "📦 打包 Chrome 扩展..."
package_extension "$STAGING_DIR/chrome" "$BUILD_DIR/ai-quota-dashboard-chrome-v${VERSION}.zip"
echo "   ✓ Chrome: build/ai-quota-dashboard-chrome-v${VERSION}.zip"

# ---- Firefox 扩展 ----
echo "📦 打包 Firefox 扩展..."
package_extension "$STAGING_DIR/firefox" "$BUILD_DIR/ai-quota-dashboard-firefox-v${VERSION}.zip"
echo "   ✓ Firefox: build/ai-quota-dashboard-firefox-v${VERSION}.zip"

# ---- VSCode 扩展 ----
echo "📦 打包 VSCode 扩展..."
if command -v vsce >/dev/null 2>&1; then
  cd "$SCRIPT_DIR/vscode"
  vsce package --no-dependencies -o "$BUILD_DIR/"
  echo "   ✓ VSCode: build/ai-quota-dashboard-*.vsix"
else
  echo "   ⚠️ 未安装 vsce，跳过 VSCode 扩展打包"
  echo "      安装: npm install -g @vscode/vsce"
fi

echo ""
echo "===================================="
echo "✅ 打包完成！文件位于 build/ 目录"
echo ""
ls -lh "$BUILD_DIR/"
