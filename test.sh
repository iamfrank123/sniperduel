#!/bin/bash

echo "======================================"
echo "🎮 SNIPER DUEL - QUICK TEST"
echo "======================================"
echo ""

# Check Node.js
echo "📦 Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found! Install from nodejs.org"
    exit 1
fi
NODE_VERSION=$(node -v)
echo "✅ Node.js $NODE_VERSION"

# Check npm
echo "📦 Checking npm..."
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found!"
    exit 1
fi
NPM_VERSION=$(npm -v)
echo "✅ npm $NPM_VERSION"

# Install dependencies
echo ""
echo "📥 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ npm install failed!"
    exit 1
fi
echo "✅ Dependencies installed"

# Build
echo ""
echo "🔨 Building client..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Check errors above"
    exit 1
fi
echo "✅ Build successful"

# Check dist folder
echo ""
echo "📂 Checking build output..."
if [ ! -d "dist" ]; then
    echo "❌ dist folder not created!"
    exit 1
fi
if [ ! -f "dist/index.html" ]; then
    echo "❌ index.html not found in dist!"
    exit 1
fi
echo "✅ Build files present"

echo ""
echo "======================================"
echo "✅ ALL CHECKS PASSED!"
echo "======================================"
echo ""
echo "Ready to deploy! Next steps:"
echo ""
echo "1. Test locally:"
echo "   npm run dev"
echo "   Open http://localhost:3000"
echo ""
echo "2. Push to GitHub:"
echo "   git init"
echo "   git add ."
echo "   git commit -m 'Initial commit'"
echo "   git remote add origin YOUR_REPO_URL"
echo "   git push -u origin main"
echo ""
echo "3. Deploy on Render.com"
echo "   Follow DEPLOY_GUIDE.md"
echo ""
