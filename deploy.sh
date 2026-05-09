#!/bin/bash
# Alibaba Cloud Deployment Script
# Usage: bash deploy.sh

set -e

echo "=== Building frontend ==="
npm run build

echo ""
echo "=== Preparing Function Compute package ==="
rm -rf /tmp/fc-deploy
mkdir -p /tmp/fc-deploy

# Copy server code
cp -r server /tmp/fc-deploy/
cp package.json /tmp/fc-deploy/
cp package-lock.json /tmp/fc-deploy/

# Copy frontend dist (for static serving)
cp -r dist /tmp/fc-deploy/

# Create FC bootstrap
cat > /tmp/fc-deploy/bootstrap << 'BOOTSTRAP'
#!/bin/bash
export PORT=9000
cd /code
npm install --production 2>&1
exec node --env-file=.env server/fc.js
BOOTSTRAP
chmod +x /tmp/fc-deploy/bootstrap

# Create .env file (user must fill in credentials)
cat > /tmp/fc-deploy/.env << 'ENVFILE'
MINIO_ENDPOINT=your-minio-host
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=YOUR_ACCESS_KEY
MINIO_SECRET_KEY=YOUR_SECRET_KEY
MINIO_BUCKET=photo-album
ENVFILE

# Build dist (no API base - same origin)
echo "VITE_API_BASE=" > /tmp/fc-deploy/.env.production

# Create zip
cd /tmp/fc-deploy
zip -r /tmp/photo-album-fc.zip . -x "node_modules/*"
cd -

echo ""
echo "=== Done ==="
echo "FC package: /tmp/photo-album-fc.zip"
echo ""
echo "=== Next Steps ==="
echo "1. Upload dist/ folder to your static hosting or serve via FC"
echo "2. Upload FC zip to Function Compute console"
echo "3. Set FC environment variables: MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET"
echo "4. Create HTTP trigger on FC function"
echo "5. Update frontend VITE_API_BASE with FC endpoint and rebuild"
