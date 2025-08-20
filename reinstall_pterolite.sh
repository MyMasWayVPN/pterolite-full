#!/bin/bash
# PteroLite Reinstall Script - GitHub Version
set -e  # Exit on any error

# Configuration
GITHUB_REPO="https://github.com/MyMasWayVPN/pterolite-full"
INSTALL_DIR="/opt/pterolite"
WEB_ROOT="/var/www/pterolite"
TEMP_DIR="/tmp/pterolite-reinstall"
BACKUP_DIR="/opt/pterolite-backup-$(date +%Y%m%d_%H%M%S)"

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

# Get domain from existing installation
get_existing_domain() {
    if [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        DOMAIN=$(grep -oP 'server_name \K[^;]+' /etc/nginx/sites-available/pterolite.conf | head -1)
        if [[ -n "$DOMAIN" ]]; then
            log_info "Found existing domain: $DOMAIN"
        else
            log_warn "Could not detect domain from existing config"
            read -p "Enter your domain name: " DOMAIN
        fi
    else
        log_warn "No existing nginx configuration found"
        read -p "Enter your domain name: " DOMAIN
    fi
}

# Backup existing installation
backup_installation() {
    log_step "Creating backup of existing installation..."
    
    if [[ -d "$INSTALL_DIR" ]]; then
        log_info "Backing up $INSTALL_DIR to $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
        cp -r "$INSTALL_DIR" "$BACKUP_DIR/backend"
        
        # Backup .env file specifically
        if [[ -f "$INSTALL_DIR/.env" ]]; then
            cp "$INSTALL_DIR/.env" "$BACKUP_DIR/.env.backup"
            log_info "Environment configuration backed up"
        fi
        
        log_info "Backend backup created successfully"
    else
        log_warn "No existing installation found at $INSTALL_DIR"
    fi
    
    # Backup web root
    if [[ -d "$WEB_ROOT" ]]; then
        cp -r "$WEB_ROOT" "$BACKUP_DIR/web_root"
        log_info "Web root backed up"
    fi
    
    # Backup nginx config if exists
    if [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        cp "/etc/nginx/sites-available/pterolite.conf" "$BACKUP_DIR/nginx-pterolite.conf.backup"
        log_info "Nginx configuration backed up"
    fi
    
    log_info "Backup completed at: $BACKUP_DIR"
}

# Stop existing services
stop_services() {
    log_step "Stopping existing services..."
    
    # Stop systemd service
    if systemctl is-active --quiet pterolite; then
        log_info "Stopping pterolite service..."
        systemctl stop pterolite
        log_info "Pterolite service stopped"
    else
        log_info "Pterolite service is not running"
    fi
    
    log_info "Services stopped"
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

# Update backend files
update_backend() {
    log_step "Updating backend files..."
    
    # Ensure install directory exists
    mkdir -p "$INSTALL_DIR"
    
    # Remove old backend files (except .env)
    log_info "Removing old backend files..."
    find "$INSTALL_DIR" -type f -not -name ".env" -not -name "installation-info.txt" -delete 2>/dev/null || true
    find "$INSTALL_DIR" -type d -empty -delete 2>/dev/null || true
    
    # Copy new backend files
    log_info "Copying new backend files..."
    cp -r "$TEMP_DIR/pterolite-full/backend"/* "$INSTALL_DIR/"
    
    # Set proper permissions
    chown -R root:root "$INSTALL_DIR"
    chmod -R 755 "$INSTALL_DIR"
    
    cd "$INSTALL_DIR"
    
    # Install/update dependencies
    log_info "Installing backend dependencies..."
    npm install
    
    # Install additional dependencies
    log_info "Installing additional dependencies..."
    npm install multer archiver unzipper uuid
    
    # Preserve existing .env if it exists, otherwise create new one
    if [[ -f "$BACKUP_DIR/.env.backup" ]]; then
        log_info "Restoring existing environment configuration..."
        cp "$BACKUP_DIR/.env.backup" "$INSTALL_DIR/.env"
    elif [[ ! -f ".env" ]]; then
        log_info "Creating new environment configuration..."
        API_KEY=$(openssl rand -hex 32)
        cat > .env <<EOF
API_KEY=$API_KEY
NODE_ENV=production
PORT=8088
EOF
        log_info "Generated new API key: $API_KEY"
    else
        log_info "Preserving existing environment configuration"
    fi
    
    # Update server.js to use environment variables properly
    if grep -q 'const API_KEY = process.env.API_KEY || "supersecretkey";' server.js; then
        sed -i 's/const API_KEY = process.env.API_KEY || "supersecretkey";/const API_KEY = process.env.API_KEY;/' server.js
    fi
    
    log_info "Backend files updated successfully"
}

# Update frontend files
update_frontend() {
    log_step "Updating frontend files..."
    
    cd "$TEMP_DIR/pterolite-full/frontend"
    
    # Install dependencies and build
    log_info "Installing frontend dependencies..."
    npm install
    
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
    
    # Deploy to web root
    log_info "Deploying frontend to $WEB_ROOT..."
    mkdir -p "$WEB_ROOT"
    rm -rf "$WEB_ROOT"/*
    cp -r dist/* "$WEB_ROOT/"
    
    # Set proper permissions
    chown -R www-data:www-data "$WEB_ROOT"
    chmod -R 755 "$WEB_ROOT"
    
    log_info "Frontend updated successfully"
}

# Update nginx configuration
update_nginx_config() {
    log_step "Updating nginx configuration..."
    
    # Get API key from .env file
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        API_KEY=$(grep "API_KEY=" "$INSTALL_DIR/.env" | cut -d'=' -f2)
    else
        API_KEY="supersecretkey"
        log_warn "Could not find API key, using default"
    fi
    
    # Create updated nginx configuration
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
    log_info "Testing nginx configuration..."
    if nginx -t; then
        log_info "Nginx configuration is valid"
        systemctl reload nginx
        log_info "Nginx reloaded successfully"
    else
        log_error "Nginx configuration test failed"
        log_info "Restoring backup configuration..."
        if [[ -f "$BACKUP_DIR/nginx-pterolite.conf.backup" ]]; then
            cp "$BACKUP_DIR/nginx-pterolite.conf.backup" "/etc/nginx/sites-available/pterolite.conf"
            nginx -t && systemctl reload nginx
        fi
        exit 1
    fi
}

# Create systemd service
create_systemd_service() {
    log_step "Creating systemd service..."
    
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
    
    log_info "Systemd service created and enabled"
}

# Start services
start_services() {
    log_step "Starting services..."
    
    # Create and start systemd service
    create_systemd_service
    
    # Start backend service
    log_info "Starting backend service..."
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
    
    # Ensure nginx site is properly configured
    log_info "Ensuring nginx site is properly configured..."
    
    # Remove default nginx site if it exists
    if [[ -f "/etc/nginx/sites-enabled/default" ]]; then
        log_info "Removing default nginx site..."
        rm -f /etc/nginx/sites-enabled/default
    fi
    
    # Ensure pterolite site is enabled
    ln -sf /etc/nginx/sites-available/pterolite.conf /etc/nginx/sites-enabled/
    
    # Test nginx configuration again and reload
    log_info "Final nginx configuration test and reload..."
    if nginx -t; then
        systemctl reload nginx
        log_info "Nginx reloaded successfully"
    else
        log_error "Nginx configuration test failed after site enabling"
        return 1
    fi
    
    log_info "Services started successfully"
}

# Verify installation
verify_installation() {
    log_step "Verifying installation..."
    
    # Wait a moment for services to start
    sleep 3
    
    # Check systemd service status
    if systemctl is-active --quiet pterolite; then
        log_info "✅ Backend service is running"
        BACKEND_STATUS="✅ Running"
    else
        log_error "❌ Backend service failed to start"
        log_info "Attempting to restart backend service..."
        systemctl restart pterolite
        sleep 3
        if systemctl is-active --quiet pterolite; then
            log_info "✅ Backend service restarted successfully"
            BACKEND_STATUS="✅ Running"
        else
            log_error "❌ Backend service still not running"
            BACKEND_STATUS="❌ Failed"
        fi
    fi
    
    # Check nginx status
    if systemctl is-active --quiet nginx; then
        log_info "✅ Nginx is running"
        NGINX_STATUS="✅ Running"
    else
        log_error "❌ Nginx is not running"
        log_info "Attempting to start nginx..."
        systemctl start nginx
        if systemctl is-active --quiet nginx; then
            log_info "✅ Nginx started successfully"
            NGINX_STATUS="✅ Running"
        else
            log_error "❌ Nginx failed to start"
            NGINX_STATUS="❌ Failed"
        fi
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
    log_info "Testing web access..."
    sleep 2
    
    if curl -s -o /dev/null -w "%{http_code}" http://localhost 2>/dev/null | grep -q "200\|301\|302"; then
        log_info "✅ Local web access working"
        HTTP_ACCESS="✅ Working"
    else
        log_warn "⚠️ Local web access test failed"
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
    
    log_info "Installation verification completed"
}

# Show update summary
show_summary() {
    log_step "Reinstall Summary"
    
    # Get API key
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        API_KEY=$(grep "API_KEY=" "$INSTALL_DIR/.env" | cut -d'=' -f2)
    else
        API_KEY="Not found"
    fi
    
    echo ""
    echo "🎉 PteroLite has been successfully reinstalled!"
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
    echo "   • To rollback: sudo bash /opt/rollback_pterolite.sh"
    
    # Save update info
    cat > "$INSTALL_DIR/reinstall-info.txt" <<EOF
PteroLite Reinstall Information
==============================
Reinstall Date: $(date)
Domain: $DOMAIN
API Key: $API_KEY
Install Directory: $INSTALL_DIR
Web Root: $WEB_ROOT
Backup Location: $BACKUP_DIR
GitHub Repository: $GITHUB_REPO

Features:
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
    
    log_info "Reinstall information saved to $INSTALL_DIR/reinstall-info.txt"
}

# Create rollback script
create_rollback_script() {
    log_step "Creating rollback script..."
    
    cat > /opt/rollback_pterolite.sh <<EOF
#!/bin/bash
# PteroLite Rollback Script
set -e

echo "🔄 Rolling back PteroLite installation..."

# Stop current services
systemctl stop pterolite 2>/dev/null || true

# Restore backup
if [[ -d "$BACKUP_DIR" ]]; then
    echo "📁 Restoring from backup: $BACKUP_DIR"
    
    # Restore backend
    if [[ -d "$BACKUP_DIR/backend" ]]; then
        rm -rf "$INSTALL_DIR"
        cp -r "$BACKUP_DIR/backend" "$INSTALL_DIR"
    fi
    
    # Restore web root
    if [[ -d "$BACKUP_DIR/web_root" ]]; then
        rm -rf "$WEB_ROOT"
        cp -r "$BACKUP_DIR/web_root" "$WEB_ROOT"
        chown -R www-data:www-data "$WEB_ROOT"
    fi
    
    # Restore nginx config
    if [[ -f "$BACKUP_DIR/nginx-pterolite.conf.backup" ]]; then
        cp "$BACKUP_DIR/nginx-pterolite.conf.backup" "/etc/nginx/sites-available/pterolite.conf"
        nginx -t && systemctl reload nginx
    fi
    
    # Restart services
    systemctl daemon-reload
    systemctl enable pterolite
    systemctl start pterolite
    
    echo "✅ Rollback completed successfully"
else
    echo "❌ Backup directory not found: $BACKUP_DIR"
    exit 1
fi
EOF
    
    chmod +x /opt/rollback_pterolite.sh
    log_info "Rollback script created at /opt/rollback_pterolite.sh"
}

# Cleanup temporary files
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -rf "$TEMP_DIR"
    log_info "Cleanup completed"
}

# Main function
main() {
    echo ""
    echo "🔄 PteroLite Reinstall Script - GitHub Version"
    echo "=============================================="
    echo "This script will reinstall PteroLite with the latest version from:"
    echo "$GITHUB_REPO"
    echo ""
    echo "What this script will do:"
    echo "• Backup your current installation"
    echo "• Download latest version from GitHub"
    echo "• Update backend and frontend"
    echo "• Preserve your configuration and API key"
    echo "• Update all features and dependencies"
    echo ""
    
    # Validate inputs
    check_root
    get_existing_domain
    
    # Confirm before proceeding
    read -p "Do you want to proceed with the reinstall? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Reinstall cancelled by user"
        exit 0
    fi
    
    # Execute reinstall steps
    backup_installation
    stop_services
    download_latest
    update_backend
    update_frontend
    update_nginx_config
    start_services
    
    # Verify and show results
    verify_installation
    create_rollback_script
    show_summary
    cleanup
    
    # Final status
    echo ""
    if [[ "$BACKEND_STATUS" == "✅ Running" && "$NGINX_STATUS" == "✅ Running" ]]; then
        log_info "🎉 PteroLite reinstall completed successfully!"
        log_info "🌐 Visit your domain to access the updated PteroLite: $DOMAIN"
    else
        log_warn "⚠️ Reinstall completed with some issues. Please check the service status above."
        log_info "💡 You can rollback using: sudo bash /opt/rollback_pterolite.sh"
    fi
    echo ""
}

# Run main function
main "$@"
