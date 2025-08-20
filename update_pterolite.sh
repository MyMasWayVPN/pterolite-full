#!/bin/bash
# PteroLite Update Script - GitHub Version
set -e  # Exit on any error

# Configuration
GITHUB_REPO="https://github.com/MyMasWayVPN/pterolite-full"
INSTALL_DIR="/opt/pterolite"
WEB_ROOT="/var/www/pterolite"
TEMP_DIR="/tmp/pterolite-update"
BACKUP_DIR="/opt/pterolite-backup-$(date +%Y%m%d-%H%M%S)"

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

# Check if PteroLite is installed
check_installation() {
    log_step "Checking existing installation..."
    
    # Check for systemd service (new installation method)
    if systemctl list-unit-files | grep -q "pterolite.service"; then
        log_info "Found systemd service installation"
        INSTALL_TYPE="systemd"
        return 0
    fi
    
    # Check for PM2 installation (legacy method)
    if command -v pm2 >/dev/null 2>&1; then
        if pm2 list | grep -q "pterolite"; then
            log_info "Found PM2 installation"
            INSTALL_TYPE="pm2"
            return 0
        fi
    fi
    
    # Check if installation directory exists
    if [[ -d "$INSTALL_DIR" ]]; then
        log_warn "Installation directory exists but no running service found"
        log_warn "This might be a partial or broken installation"
        INSTALL_TYPE="partial"
        return 0
    fi
    
    log_error "PteroLite installation not found"
    log_error "Please run the install script first"
    exit 1
}

# Backup current installation
backup_installation() {
    log_step "Creating backup of current installation..."
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Backup installation directory
    if [[ -d "$INSTALL_DIR" ]]; then
        log_info "Backing up installation directory..."
        cp -r "$INSTALL_DIR" "$BACKUP_DIR/install"
    fi
    
    # Backup web root
    if [[ -d "$WEB_ROOT" ]]; then
        log_info "Backing up web root..."
        cp -r "$WEB_ROOT" "$BACKUP_DIR/web"
    fi
    
    # Backup nginx configuration
    if [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        log_info "Backing up nginx configuration..."
        mkdir -p "$BACKUP_DIR/nginx"
        cp "/etc/nginx/sites-available/pterolite.conf" "$BACKUP_DIR/nginx/"
    fi
    
    # Backup systemd service
    if [[ -f "/etc/systemd/system/pterolite.service" ]]; then
        log_info "Backing up systemd service..."
        mkdir -p "$BACKUP_DIR/systemd"
        cp "/etc/systemd/system/pterolite.service" "$BACKUP_DIR/systemd/"
    fi
    
    log_info "Backup created at: $BACKUP_DIR"
}

# Stop services
stop_services() {
    log_step "Stopping services..."
    
    case $INSTALL_TYPE in
        "systemd")
            log_info "Stopping systemd service..."
            systemctl stop pterolite || true
            ;;
        "pm2")
            log_info "Stopping PM2 process..."
            pm2 stop pterolite || true
            ;;
        "partial")
            log_warn "No running service to stop"
            ;;
    esac
}

# Download latest version
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

# Preserve configuration
preserve_config() {
    log_step "Preserving existing configuration..."
    
    # Preserve API key from .env file
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        log_info "Preserving API key from .env file..."
        API_KEY=$(grep "API_KEY=" "$INSTALL_DIR/.env" | cut -d'=' -f2)
        if [[ -n "$API_KEY" ]]; then
            log_info "API key preserved: ${API_KEY:0:8}..."
        else
            log_warn "No API key found in .env file"
            # Generate new API key
            API_KEY=$(openssl rand -hex 32)
            log_info "Generated new API key: ${API_KEY:0:8}..."
        fi
    else
        log_warn ".env file not found, generating new API key"
        API_KEY=$(openssl rand -hex 32)
        log_info "Generated new API key: ${API_KEY:0:8}..."
    fi
    
    # Preserve domain from nginx config
    if [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        DOMAIN=$(grep "server_name" "/etc/nginx/sites-available/pterolite.conf" | awk '{print $2}' | sed 's/;//')
        if [[ -n "$DOMAIN" ]]; then
            log_info "Preserved domain: $DOMAIN"
        else
            log_warn "Could not extract domain from nginx config"
            DOMAIN="localhost"
        fi
    else
        log_warn "Nginx config not found, using localhost"
        DOMAIN="localhost"
    fi
}

# Update backend
update_backend() {
    log_step "Updating backend..."
    
    # Copy new backend files
    log_info "Copying new backend files..."
    cp -r "$TEMP_DIR/pterolite-full/backend"/* "$INSTALL_DIR/"
    
    # Install/update dependencies
    log_info "Installing/updating backend dependencies..."
    cd "$INSTALL_DIR"
    npm install
    
    # Install additional dependencies for new features
    log_info "Installing additional backend dependencies..."
    npm install multer archiver unzipper uuid
    
    # Restore configuration
    log_info "Restoring configuration..."
    cat > .env <<EOF
API_KEY=$API_KEY
NODE_ENV=production
PORT=8088
EOF
    
    # Update server.js to use environment variables properly
    if grep -q 'const API_KEY = process.env.API_KEY || "supersecretkey";' server.js; then
        sed -i 's/const API_KEY = process.env.API_KEY || "supersecretkey";/const API_KEY = process.env.API_KEY;/' server.js
    fi
    
    log_info "Backend updated successfully"
}

# Update frontend
update_frontend() {
    log_step "Updating frontend..."
    
    cd "$TEMP_DIR/pterolite-full/frontend"
    
    # Install frontend dependencies
    log_info "Installing frontend dependencies..."
    npm install
    
    # Build the frontend
    log_info "Building React application with Vite..."
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
    
    log_info "Frontend build completed successfully"
    
    # Deploy frontend files
    log_info "Deploying frontend files..."
    rm -rf "$WEB_ROOT"/*
    cp -r dist/* "$WEB_ROOT/"
    
    # Set proper permissions
    chown -R www-data:www-data "$WEB_ROOT"
    chmod -R 755 "$WEB_ROOT"
    
    log_info "Frontend updated successfully"
}

# Update systemd service
update_systemd_service() {
    log_step "Updating systemd service..."
    
    # Create/update systemd service file
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
    
    # Reload systemd
    systemctl daemon-reload
    systemctl enable pterolite
    
    log_info "Systemd service updated"
}

# Migrate from PM2 to systemd
migrate_pm2_to_systemd() {
    log_step "Migrating from PM2 to systemd..."
    
    # Stop and remove PM2 process
    log_info "Stopping PM2 process..."
    pm2 stop pterolite || true
    pm2 delete pterolite || true
    pm2 save || true
    
    # Remove PM2 startup script
    log_info "Removing PM2 startup configuration..."
    pm2 unstartup || true
    
    # Create systemd service
    update_systemd_service
    
    log_info "Migration from PM2 to systemd completed"
}

# Update nginx configuration
update_nginx_config() {
    log_step "Updating nginx configuration..."
    
    # Create updated nginx configuration
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
    log_info "Testing nginx configuration..."
    if nginx -t; then
        log_info "Nginx configuration is valid"
        systemctl reload nginx
    else
        log_error "Nginx configuration test failed"
        exit 1
    fi
    
    log_info "Nginx configuration updated"
}

# Start services
start_services() {
    log_step "Starting services..."
    
    # Start backend service
    log_info "Starting backend service..."
    systemctl start pterolite
    
    # Verify service is running
    sleep 3
    if systemctl is-active --quiet pterolite; then
        log_info "Backend service started successfully"
    else
        log_error "Failed to start backend service"
        log_info "Checking service status..."
        systemctl status pterolite --no-pager -l
        exit 1
    fi
    
    # Ensure nginx is running
    if ! systemctl is-active --quiet nginx; then
        log_info "Starting nginx..."
        systemctl start nginx
    fi
}

# Verify update
verify_update() {
    log_step "Verifying update..."
    
    # Check systemd service
    if systemctl is-active --quiet pterolite; then
        log_info "✅ Backend service is running"
        BACKEND_STATUS="✅ Running"
    else
        log_error "❌ Backend service failed to start"
        BACKEND_STATUS="❌ Failed"
    fi
    
    # Check Nginx service
    if systemctl is-active --quiet nginx; then
        log_info "✅ Nginx web server is running"
        NGINX_STATUS="✅ Running"
    else
        log_error "❌ Nginx failed to start"
        NGINX_STATUS="❌ Failed"
    fi
    
    # Check if backend port is listening
    if netstat -tuln 2>/dev/null | grep -q ":8088 " || ss -tuln 2>/dev/null | grep -q ":8088 "; then
        log_info "✅ Backend is listening on port 8088"
        PORT_STATUS="✅ Listening"
    else
        log_warn "⚠️ Backend port 8088 not detected"
        PORT_STATUS="⚠️ Not Detected"
    fi
    
    # Test API endpoint
    if curl -s -H "X-API-Key: $API_KEY" "http://localhost:8088/containers" >/dev/null 2>&1; then
        log_info "✅ API endpoint is responding"
        API_STATUS="✅ Responding"
    else
        log_warn "⚠️ API endpoint not responding"
        API_STATUS="⚠️ Not Responding"
    fi
    
    log_info "Update verification completed"
}

# Show update summary
show_summary() {
    echo ""
    log_info "🎉 PteroLite update completed!"
    echo "================================"
    
    # Service Status Summary
    echo ""
    log_info "📊 SERVICE STATUS SUMMARY:"
    echo "================================"
    printf "%-20s %s\n" "Backend Service:" "$BACKEND_STATUS"
    printf "%-20s %s\n" "Nginx Server:" "$NGINX_STATUS"
    printf "%-20s %s\n" "Backend Port:" "$PORT_STATUS"
    printf "%-20s %s\n" "API Endpoint:" "$API_STATUS"
    
    # Update Details
    echo ""
    log_info "📋 UPDATE DETAILS:"
    echo "================================"
    log_info "Domain: $DOMAIN"
    log_info "API Key: ${API_KEY:0:8}... (preserved)"
    log_info "Install Type: $INSTALL_TYPE → systemd"
    log_info "Backup Location: $BACKUP_DIR"
    log_info "GitHub Repository: $GITHUB_REPO"
    
    # Access Information
    echo ""
    log_info "🌐 ACCESS INFORMATION:"
    echo "================================"
    if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
        log_info "Web Panel: https://$DOMAIN"
        log_info "API Eksternal: https://$DOMAIN/external-api"
    else
        log_info "Web Panel: http://$DOMAIN"
        log_info "API Eksternal: http://$DOMAIN/external-api"
    fi
    
    # New Features
    echo ""
    log_info "🚀 UPDATED FEATURES:"
    echo "================================"
    log_info "• 🎨 Dark Theme - Modern dark interface for better user experience"
    log_info "• 🐳 Enhanced Container Management"
    log_info "• 📁 Improved File Manager with better UI"
    log_info "• 💻 Enhanced Console Terminal"
    log_info "• ⚡ Updated Script Executor"
    log_info "• 🔧 Improved Startup Manager"
    log_info "• 🐋 Enhanced Docker Image Manager"
    
    # Management Commands
    echo ""
    log_info "🔧 MANAGEMENT COMMANDS:"
    echo "================================"
    log_info "• View backend logs: journalctl -u pterolite -f"
    log_info "• Restart backend: systemctl restart pterolite"
    log_info "• Stop backend: systemctl stop pterolite"
    log_info "• Check backend status: systemctl status pterolite"
    log_info "• Restore backup: cp -r $BACKUP_DIR/install/* $INSTALL_DIR/"
    
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
    
    # Check prerequisites
    check_root
    check_installation
    
    # Confirm update
    read -p "Do you want to continue with the update? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Update cancelled by user"
        exit 0
    fi
    
    # Backup current installation
    backup_installation
    
    # Stop services
    stop_services
    
    # Download latest version
    download_latest
    
    # Preserve configuration
    preserve_config
    
    # Update components
    update_backend
    update_frontend
    
    # Handle service migration
    case $INSTALL_TYPE in
        "pm2")
            migrate_pm2_to_systemd
            ;;
        "systemd"|"partial")
            update_systemd_service
            ;;
    esac
    
    # Update nginx configuration
    update_nginx_config
    
    # Start services
    start_services
    
    # Verify update
    verify_update
    
    # Show summary
    show_summary
    
    # Save update info
    cat > "$INSTALL_DIR/update-info.txt" <<EOF
PteroLite Update Information
===========================
Update Date: $(date)
Previous Install Type: $INSTALL_TYPE
Current Install Type: systemd
Domain: $DOMAIN
API Key: $API_KEY
Backup Location: $BACKUP_DIR
GitHub Repository: $GITHUB_REPO

Services:
- Backend: systemd service (pterolite)
- Web Server: Nginx
- Docker: Container Management

Commands:
- View backend logs: journalctl -u pterolite -f
- Restart backend: systemctl restart pterolite
- Check backend status: systemctl status pterolite
- Restore backup: cp -r $BACKUP_DIR/install/* $INSTALL_DIR/
EOF
    
    # Cleanup
    cleanup
    
    # Final status
    echo ""
    if [[ "$BACKEND_STATUS" == "✅ Running" && "$NGINX_STATUS" == "✅ Running" ]]; then
        log_info "🎉 Update completed successfully! All services are running."
        log_info "🌐 Visit your domain to see the updated PteroLite with dark theme!"
    else
        log_warn "⚠️ Update completed with some issues. Please check the service status above."
        log_info "💾 Your backup is available at: $BACKUP_DIR"
    fi
    echo ""
}

# Run main function
main "$@"
