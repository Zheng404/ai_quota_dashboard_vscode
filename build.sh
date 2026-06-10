#!/bin/bash
# ============================================
# AI Quota Cookie Bridge — 打包脚本
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VERSION="1.0.0"
BUILD_DIR="$SCRIPT_DIR/build"

BROWSER_COMMON="$SCRIPT_DIR/browser-common"

echo "🍪 AI Quota Cookie Bridge 打包工具"
echo "===================================="

# 清理旧构建
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# ---- 复制公共代码到平台目录 ----
echo "📂 同步公共代码..."

# Chrome: 复制 browser-common 到 chrome/（manifest.json 保留）
cp -r "$BROWSER_COMMON/"* "$SCRIPT_DIR/chrome/"

# Firefox: 复制 browser-common 到 firefox/（manifest.json 保留）
cp -r "$BROWSER_COMMON/"* "$SCRIPT_DIR/firefox/"

echo "   ✓ 公共代码已同步"

# ---- Chrome 扩展 ----
echo "📦 打包 Chrome 扩展..."
cd "$SCRIPT_DIR/chrome"
zip -r "$BUILD_DIR/ai-quota-dashboard-chrome-v${VERSION}.zip" \
  manifest.json popup.html popup.js dashboard.html dashboard.js \
  styles.css templates.js \
  config.js cache.js browser-api.js \
  api/ scripts/ icons/ > /dev/null
echo "   ✓ Chrome: build/ai-quota-dashboard-chrome-v${VERSION}.zip"

# ---- Firefox 扩展 ----
echo "📦 打包 Firefox 扩展..."
cd "$SCRIPT_DIR/firefox"
zip -r "$BUILD_DIR/ai-quota-dashboard-firefox-v${VERSION}.zip" \
  manifest.json popup.html popup.js dashboard.html dashboard.js \
  styles.css templates.js \
  config.js cache.js browser-api.js \
  api/ scripts/ icons/ > /dev/null
echo "   ✓ Firefox: build/ai-quota-dashboard-firefox-v${VERSION}.zip"

# ---- 清理构建时复制的文件 ----
echo "🧹 清理构建产物..."

# 从 chrome/ 移除 browser-common 文件（保留 manifest.json 和 icons/）
cd "$SCRIPT_DIR/chrome"
rm -f popup.html popup.js dashboard.html dashboard.js styles.css templates.js
rm -f config.js cache.js browser-api.js
rm -rf api scripts

# 从 firefox/ 移除 browser-common 文件（保留 manifest.json 和 icons/）
cd "$SCRIPT_DIR/firefox"
rm -f popup.html popup.js dashboard.html dashboard.js styles.css templates.js
rm -f config.js cache.js browser-api.js
rm -rf api scripts

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
