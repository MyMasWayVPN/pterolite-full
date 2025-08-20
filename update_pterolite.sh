#!/bin/bash
# PteroLite Update Script - GitHub Version
set -e

# Configuration
GITHUB_REPO="https://github.com/MyMasWayVPN/pterolite-full"
INSTALL_DIR="/opt/pterolite"
WEB_ROOT="/var/www/pterolite"
TEMP_DIR="/tmp/pterolite-update"
BACKUP_DIR="/opt/pterolite-update-backup-$(date +%Y%m%d_%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Check if PteroLite is already installed
check_existing_installation() {
    if [[ ! -d "$INSTALL_DIR" ]]; then
        log_error "PteroLite installation not found at $INSTALL_DIR"
        log_error "Please run the main install script first: sudo bash install_pterolite.sh"
        exit 1
    fi
    
    if ! pm2 list | grep -q "pterolite"; then
        log_error "PteroLite PM2 process not found"
        log_error "Please check your installation or run reinstall script"
        exit 1
    fi
    
    log_info "Existing PteroLite installation found"
}

# Get domain from existing installation
get_existing_domain() {
    if [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        DOMAIN=$(grep -oP 'server_name \K[^;]+' /etc/nginx/sites-available/pterolite.conf | head -1)
        if [[ -n "$DOMAIN" ]]; then
            log_info "Found existing domain: $DOMAIN"
        else
            log_warn "Could not detect domain from existing config"
            DOMAIN="pterolite.mydomain.com"
        fi
    else
        log_warn "No existing nginx configuration found"
        DOMAIN="pterolite.mydomain.com"
    fi
}

# Backup existing files
backup_files() {
    log_step "Creating backup of existing files..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup backend
    if [[ -f "$INSTALL_DIR/server.js" ]]; then
        cp "$INSTALL_DIR/server.js" "$BACKUP_DIR/"
    fi
    
    if [[ -f "$INSTALL_DIR/package.json" ]]; then
        cp "$INSTALL_DIR/package.json" "$BACKUP_DIR/"
    fi
    
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        cp "$INSTALL_DIR/.env" "$BACKUP_DIR/"
    fi
    
    # Backup frontend
    if [[ -d "$WEB_ROOT" ]]; then
        cp -r "$WEB_ROOT" "$BACKUP_DIR/web_root_backup"
    fi
    
    # Backup nginx config
    if [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        cp "/etc/nginx/sites-available/pterolite.conf" "$BACKUP_DIR/nginx-pterolite.conf.backup"
    fi
    
    log_info "Backup created at: $BACKUP_DIR"
}

# Download latest version from GitHub
download_latest() {
    log_step "Downloading latest version from GitHub..."
    
    # Clean up any existing temp directory
    rm -rf "$TEMP_DIR"
    mkdir -p "$TEMP_DIR"
    cd "$TEMP_DIR"
    
    # Clone the repository
    log_info "Cloning repository: $GITHUB_REPO"
    if git clone "$GITHUB_REPO" pterolite-full; then
        log_info "Repository cloned successfully"
    else
        log_error "Failed to clone repository"
        log_error "Please check your internet connection and repository URL"
        exit 1
    fi
    
    # Verify required directories exist
    if [[ ! -d "pterolite-full/backend" ]]; then
        log_error "Backend directory not found in repository"
        exit 1
    fi
    
    if [[ ! -d "pterolite-full/frontend" ]]; then
        log_error "Frontend directory not found in repository"
        exit 1
    fi
    
    log_info "Latest version downloaded successfully"
}

# Create systemd service
create_systemd_service() {
    log_step "Creating/updating systemd service..."
    
    # Create systemd service file
    cat > /etc/systemd/system/pterolite.service <<EOF
[Unit]
Description=PteroLite Container Management Panel
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=pterolite

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable pterolite
    
    log_info "Systemd service created/updated and enabled"
}

# Update backend
update_backend() {
    log_step "Updating backend with new features..."
    
    cd "$INSTALL_DIR"
    
    # Stop systemd service
    log_info "Stopping PteroLite service..."
    systemctl stop pterolite || true
    
    # Copy new backend files (preserve .env)
    log_info "Copying new backend files..."
    
    # Backup .env temporarily
    if [[ -f ".env" ]]; then
        cp ".env" "/tmp/pterolite_env_backup"
    fi
    
    # Copy all new backend files
    cp -r "$TEMP_DIR/pterolite-full/backend"/* "$INSTALL_DIR/"
    
    # Restore .env
    if [[ -f "/tmp/pterolite_env_backup" ]]; then
        cp "/tmp/pterolite_env_backup" ".env"
        rm "/tmp/pterolite_env_backup"
        log_info "Preserved existing environment configuration"
    fi
    
    # Install new dependencies
    log_info "Installing/updating dependencies..."
    npm install
    
    # Install additional dependencies that might be missing
    npm install multer archiver unzipper uuid
    
    # Update server.js to use environment variables properly
    if grep -q 'const API_KEY = process.env.API_KEY || "supersecretkey";' server.js; then
        sed -i 's/const API_KEY = process.env.API_KEY || "supersecretkey";/const API_KEY = process.env.API_KEY;/' server.js
    fi
    
    # Create/update systemd service
    create_systemd_service
    
    # Start systemd service
    log_info "Starting PteroLite service..."
    systemctl start pterolite
    
    # Verify service is running
    if systemctl is-active --quiet pterolite; then
        log_info "Backend service started successfully"
    else
        log_error "Failed to start backend service"
        log_info "Checking service status..."
        systemctl status pterolite --no-pager -l
        return 1
    fi
    
    log_info "Backend updated successfully"
}

# Update frontend
update_frontend() {
    log_step "Updating frontend with new features..."
    
    # Build new frontend
    cd "$TEMP_DIR/pterolite-full/frontend"
    
    # Install dependencies
    log_info "Installing frontend dependencies..."
    npm install
    
    # Build frontend
    log_info "Building new frontend..."
    npm run build
    
    # Verify build output
    if [[ ! -d "dist" ]]; then
        log_error "Frontend build failed - dist directory not created"
        exit 1
    fi
    
    if [[ ! -f "dist/index.html" ]]; then
        log_error "Frontend build failed - index.html not found in dist"
        exit 1
    fi
    
    # Copy built files to web root
    log_info "Deploying new frontend..."
    rm -rf "$WEB_ROOT"/*
    cp -r dist/* "$WEB_ROOT/"
    
    # Set proper permissions
    chown -R www-data:www-data "$WEB_ROOT"
    chmod -R 755 "$WEB_ROOT"
    
    log_info "Frontend updated successfully"
}

# Update nginx configuration
update_nginx() {
    log_step "Updating nginx configuration..."
    
    # Get API key from .env file
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        API_KEY=$(grep "API_KEY=" "$INSTALL_DIR/.env" | cut -d'=' -f2)
    else
        API_KEY="supersecretkey"
        log_warn "Could not find API key, using default"
    fi
    
    # Create new nginx config
    log_info "Creating updated nginx configuration..."
    cat > /etc/nginx/sites-available/pterolite.conf <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    root $WEB_ROOT;
    index index.html;

    # Serve static files (React frontend)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API proxy untuk web panel (tanpa auth requirement)
    location /api/ {
        proxy_pass http://127.0.0.1:8088/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # API eksternal dengan authentication (untuk akses programmatic)
    location /external-api/ {
        proxy_pass http://127.0.0.1:8088/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
EOF
    
    # Test nginx configuration
    if nginx -t; then
        log_info "Nginx configuration is valid"
        systemctl reload nginx
    else
        log_error "Nginx configuration test failed"
        log_info "Restoring backup configuration..."
        if [[ -f "$BACKUP_DIR/nginx-pterolite.conf.backup" ]]; then
            cp "$BACKUP_DIR/nginx-pterolite.conf.backup" "/etc/nginx/sites-available/pterolite.conf"
            nginx -t && systemctl reload nginx
        fi
        exit 1
    fi
    
    # Re-run certbot if SSL was previously configured
    if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
        log_info "Re-configuring SSL certificate..."
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" || log_warn "SSL reconfiguration failed"
    fi
    
    log_info "Nginx configuration updated successfully"
}

# Install additional system dependencies if needed
install_additional_dependencies() {
    log_step "Checking and installing additional dependencies..."
    
    # Install Python if not present
    if ! command -v python3 >/dev/null 2>&1; then
        log_info "Installing Python3..."
        apt-get update
        apt-get install -y python3 python3-pip
    else
        log_info "Python3 already installed"
    fi
    
    # Create working directories if they don't exist
    log_info "Creating working directories..."
    mkdir -p /tmp/pterolite-containers
    mkdir -p /tmp/pterolite-files
    mkdir -p /tmp/pterolite-uploads
    
    # Set permissions
    chmod 755 /tmp/pterolite-containers
    chmod 755 /tmp/pterolite-files
    chmod 755 /tmp/pterolite-uploads
    
    log_info "Additional dependencies checked and installed"
}

# Verify update
verify_update() {
    log_step "Verifying update..."
    
    # Wait a moment for services to start
    sleep 3
    
    # Check systemd service status
    if systemctl is-active --quiet pterolite; then
        log_info "✅ Backend service is running"
        BACKEND_STATUS="✅ Running"
    else
        log_error "❌ Backend service failed to start"
        BACKEND_STATUS="❌ Failed"
    fi
    
    # Check nginx status
    if systemctl is-active --quiet nginx; then
        log_info "✅ Nginx is running"
        NGINX_STATUS="✅ Running"
    else
        log_error "❌ Nginx is not running"
        NGINX_STATUS="❌ Failed"
    fi
    
    # Check if frontend files exist
    if [[ -f "$WEB_ROOT/index.html" ]]; then
        log_info "✅ Frontend files deployed"
        FRONTEND_STATUS="✅ Deployed"
    else
        log_error "❌ Frontend files missing"
        FRONTEND_STATUS="❌ Missing"
    fi
    
    # Test web access
    if curl -s -o /dev/null -w "%{http_code}" http://localhost 2>/dev/null | grep -q "200\|301\|302"; then
        log_info "✅ Web access working"
        HTTP_ACCESS="✅ Working"
    else
        log_warn "⚠️ Web access test failed"
        HTTP_ACCESS="⚠️ Failed"
    fi
    
    # Test backend API
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8088 2>/dev/null | grep -q "401\|200"; then
        log_info "✅ Backend API responding"
        API_STATUS="✅ Responding"
    else
        log_warn "⚠️ Backend API test failed"
        API_STATUS="⚠️ Failed"
    fi
    
    log_info "Update verification completed"
}

# Show update summary
show_summary() {
    log_step "Update Summary"
    
    # Get API key
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        API_KEY=$(grep "API_KEY=" "$INSTALL_DIR/.env" | cut -d'=' -f2)
    else
        API_KEY="Not found"
    fi
    
    echo ""
    echo "🎉 PteroLite has been successfully updated!"
    echo ""
    echo "📊 SERVICE STATUS:"
    echo "================================"
    printf "%-20s %s\n" "Backend Service:" "$BACKEND_STATUS"
    printf "%-20s %s\n" "Nginx Server:" "$NGINX_STATUS"
    printf "%-20s %s\n" "Frontend Files:" "$FRONTEND_STATUS"
    printf "%-20s %s\n" "HTTP Access:" "$HTTP_ACCESS"
    printf "%-20s %s\n" "API Status:" "$API_STATUS"
    
    echo ""
    echo "🔧 System Information:"
    echo "================================"
    echo "   • Domain: $DOMAIN"
    echo "   • Install Directory: $INSTALL_DIR"
    echo "   • Web Root: $WEB_ROOT"
    echo "   • API Key: $API_KEY"
    echo "   • Backup Location: $BACKUP_DIR"
    echo "   • GitHub Repository: $GITHUB_REPO"
    
    echo ""
    echo "🚀 Available Features:"
    echo "================================"
    echo "   • 🐳 Container Management - Create, start, stop, delete Docker containers"
    echo "   • 📁 File Manager - Upload, edit, delete files & extract ZIP"
    echo "   • 💻 Console Terminal - Execute server commands"
    echo "   • ⚡ Script Executor - Run JavaScript (Node.js) & Python scripts"
    echo "   • 🔧 Startup Manager - Manage startup commands"
    echo "   • 🐋 Docker Image Manager - Manage Docker images"
    
    echo ""
    echo "📝 Management Commands:"
    echo "================================"
    echo "   • View logs: journalctl -u pterolite -f"
    echo "   • Restart backend: systemctl restart pterolite"
    echo "   • Check backend status: systemctl status pterolite"
    echo "   • Check nginx status: systemctl status nginx"
    
    echo ""
    echo "💾 Backup Information:"
    echo "================================"
    echo "   • Your previous installation is backed up at: $BACKUP_DIR"
    echo "   • Configuration and API key have been preserved"
    
    # Save update info
    cat > "$INSTALL_DIR/update-info.txt" <<EOF
PteroLite Update Information
===========================
Update Date: $(date)
Domain: $DOMAIN
API Key: $API_KEY
Install Directory: $INSTALL_DIR
Web Root: $WEB_ROOT
Backup Location: $BACKUP_DIR
GitHub Repository: $GITHUB_REPO

Updated Features:
- Container Management with Docker
- File Manager with upload/download
- Console Terminal
- Script Executor (JavaScript & Python)
- Startup Manager
- Docker Image Manager

Management Commands:
- journalctl -u pterolite -f (view backend logs)
- systemctl restart pterolite (restart backend)
- systemctl status pterolite (check backend status)
- systemctl status nginx (check nginx)
- systemctl reload nginx (reload nginx config)
EOF
    
    log_info "Update information saved to $INSTALL_DIR/update-info.txt"
}

# Cleanup temporary files
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -rf "$TEMP_DIR"
    log_info "Cleanup completed"
}

# Main update function
main() {
    echo ""
    echo "🔄 PteroLite Update Script - GitHub Version"
    echo "==========================================="
    echo "This script will update your PteroLite installation with the latest version from:"
    echo "$GITHUB_REPO"
    echo ""
    echo "What this script will do:"
    echo "• Backup your current installation"
    echo "• Download latest version from GitHub"
    echo "• Update backend and frontend"
    echo "• Preserve your configuration and API key"
    echo "• Update all features and dependencies"
    echo ""
    
    # Checks
    check_root
    check_existing_installation
    get_existing_domain
    
    # Confirm before proceeding
    read -p "Do you want to proceed with the update? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Update cancelled by user"
        exit 0
    fi
    
    # Execute update steps
    backup_files
    download_latest
    install_additional_dependencies
    update_backend
    update_frontend
    update_nginx
    
    # Verify and show results
    verify_update
    show_summary
    cleanup
    
    # Final status
    echo ""
    if [[ "$BACKEND_STATUS" == "✅ Running" && "$NGINX_STATUS" == "✅ Running" ]]; then
        log_info "🎉 PteroLite update completed successfully!"
        log_info "🌐 Visit your domain to access the updated features: $DOMAIN"
    else
        log_warn "⚠️ Update completed with some issues. Please check the service status above."
        log_info "💡 Check logs with: journalctl -u pterolite -f"
    fi
    echo ""
    
    log_info "🎯 Next Steps:"
    log_info "1. Visit your web panel to try the updated features"
    log_info "2. Test container management functionality"
    log_info "3. Try the file manager and console features"
    log_info "4. Execute scripts using the script executor"
    log_info "5. Check the Docker image manager"
}

# Run main function
main "$@"
