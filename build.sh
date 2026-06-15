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

# 使用 rsync 排除浏览器专属文件，避免 cp -r 覆盖 manifest.json 和 icons/
# 如果 rsync 不可用则回退到 cp（当前 browser-common 不含冲突文件所以安全）
if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude='manifest.json' --exclude='icons/' "$BROWSER_COMMON/" "$SCRIPT_DIR/chrome/"
  rsync -a --exclude='manifest.json' --exclude='icons/' "$BROWSER_COMMON/" "$SCRIPT_DIR/firefox/"
else
  cp -r "$BROWSER_COMMON/"* "$SCRIPT_DIR/chrome/"
  cp -r "$BROWSER_COMMON/"* "$SCRIPT_DIR/firefox/"
fi

echo "   ✓ 公共代码已同步"

# ---- Chrome 扩展 ----
echo "📦 打包 Chrome 扩展..."
cd "$SCRIPT_DIR/chrome"
zip -r "$BUILD_DIR/ai-quota-dashboard-chrome-v${VERSION}.zip" \
  manifest.json offscreen.html popup.html popup.js dashboard.html dashboard.js \
  styles.css templates.js \
  config.js cache.js browser-api.js constants.js \
  api/ scripts/ icons/ > /dev/null
echo "   ✓ Chrome: build/ai-quota-dashboard-chrome-v${VERSION}.zip"

# ---- Firefox 扩展 ----
echo "📦 打包 Firefox 扩展..."
cd "$SCRIPT_DIR/firefox"
zip -r "$BUILD_DIR/ai-quota-dashboard-firefox-v${VERSION}.zip" \
  manifest.json offscreen.html popup.html popup.js dashboard.html dashboard.js \
  styles.css templates.js \
  config.js cache.js browser-api.js constants.js \
  api/ scripts/ icons/ > /dev/null
echo "   ✓ Firefox: build/ai-quota-dashboard-firefox-v${VERSION}.zip"

# ---- 清理构建时复制的文件 ----
echo "🧹 清理构建产物..."

# 从 chrome/ 移除 browser-common 文件（保留 manifest.json 和 icons/）
cd "$SCRIPT_DIR/chrome"
rm -f popup.html popup.js dashboard.html dashboard.js styles.css templates.js
rm -f config.js cache.js browser-api.js constants.js offscreen.html
rm -rf api scripts

# 从 firefox/ 移除 browser-common 文件（保留 manifest.json 和 icons/）
cd "$SCRIPT_DIR/firefox"
rm -f popup.html popup.js dashboard.html dashboard.js styles.css templates.js
rm -f config.js cache.js browser-api.js constants.js offscreen.html
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
