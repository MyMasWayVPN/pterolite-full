#!/bin/bash

# Script untuk menambahkan endpoint tunnel ke nginx configuration yang sudah ada
# Untuk VPS dengan domain panel.masway.biz.id

echo "🔧 Updating Nginx Configuration for Cloudflare Tunnels..."
echo "========================================================"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "❌ This script must be run as root"
    exit 1
fi

# Backup existing configuration
echo "📋 Backing up existing nginx configuration..."
cp /etc/nginx/sites-available/pterolite.conf /etc/nginx/sites-available/pterolite.conf.backup.$(date +%Y%m%d_%H%M%S)

# Check if tunnel endpoint already exists
if grep -q "location /tunnels" /etc/nginx/sites-available/pterolite.conf; then
    echo "✅ Tunnel endpoint already exists in nginx configuration"
else
    echo "➕ Adding tunnel endpoint to nginx configuration..."
    
    # Add tunnel endpoint before the external-api location block
    sed -i '/# API eksternal dengan authentication/i \
    # Cloudflare Tunnel management endpoints\
    location /tunnels {\
        proxy_pass http://127.0.0.1:8088/tunnels;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade $http_upgrade;\
        proxy_set_header Connection '\''upgrade'\'';\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto $scheme;\
        proxy_cache_bypass $http_upgrade;\
    }\
\
' /etc/nginx/sites-available/pterolite.conf

    echo "✅ Tunnel endpoint added to nginx configuration"
fi

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
if nginx -t; then
    echo "✅ Nginx configuration is valid"
    
    # Reload nginx
    echo "🔄 Reloading nginx..."
    systemctl reload nginx
    
    if systemctl is-active --quiet nginx; then
        echo "✅ Nginx reloaded successfully"
    else
        echo "❌ Nginx failed to reload"
        exit 1
    fi
else
    echo "❌ Nginx configuration test failed"
    echo "🔄 Restoring backup configuration..."
    cp /etc/nginx/sites-available/pterolite.conf.backup.$(date +%Y%m%d)* /etc/nginx/sites-available/pterolite.conf
    exit 1
fi

# Restart PteroLite backend service to ensure tunnel endpoints are loaded
echo "🔄 Restarting PteroLite backend service..."
systemctl restart pterolite

# Wait a moment for service to start
sleep 3

# Check if service is running
if systemctl is-active --quiet pterolite; then
    echo "✅ PteroLite backend service restarted successfully"
else
    echo "❌ PteroLite backend service failed to restart"
    echo "📋 Checking service status..."
    systemctl status pterolite --no-pager -l
fi

echo ""
echo "🎉 Nginx configuration updated successfully!"
echo "=========================================="
echo ""
echo "✅ Tunnel endpoints are now available at:"
echo "   • GET  /tunnels/check-cloudflared"
echo "   • POST /tunnels/install-cloudflared"
echo "   • GET  /tunnels"
echo "   • POST /tunnels/create"
echo "   • POST /tunnels/quick"
echo "   • GET  /tunnels/:id/logs"
echo "   • POST /tunnels/:id/stop"
echo "   • DELETE /tunnels/:id"
echo ""
echo "🧪 Test the tunnel check endpoint:"
echo "   curl -X GET https://panel.masway.biz.id/tunnels/check-cloudflared"
echo ""
echo "💡 You can now use the Cloudflare Tunnel feature in the web panel!"
