#!/bin/bash
# ============================================
# AI Quota Cookie Bridge — 打包脚本
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VERSION="1.0.0"
BUILD_DIR="$SCRIPT_DIR/build"

echo "🍪 AI Quota Cookie Bridge 打包工具"
echo "===================================="

# 清理旧构建
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# ---- Chrome 扩展 ----
echo "📦 打包 Chrome 扩展..."
cd "$SCRIPT_DIR/chrome"
zip -r "$BUILD_DIR/ai-quota-cookie-bridge-chrome-v${VERSION}.zip" \
  manifest.json popup.html popup.js dashboard.html dashboard.js \
  styles.css templates.js \
  api/ scripts/ icons/ > /dev/null
echo "   ✓ Chrome: build/ai-quota-cookie-bridge-chrome-v${VERSION}.zip"

# ---- Firefox 扩展 ----
echo "📦 打包 Firefox 扩展..."
cd "$SCRIPT_DIR/firefox"
zip -r "$BUILD_DIR/ai-quota-cookie-bridge-firefox-v${VERSION}.zip" \
  manifest.json popup.html popup.js dashboard.html dashboard.js \
  styles.css templates.js \
  api/ scripts/ icons/ > /dev/null
echo "   ✓ Firefox: build/ai-quota-cookie-bridge-firefox-v${VERSION}.zip"

# ---- VSCode 扩展 ----
echo "📦 打包 VSCode 扩展..."
cd "$SCRIPT_DIR/vscode"
if command -v vsce >/dev/null 2>&1; then
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
