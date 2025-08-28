#!/bin/bash
# PteroLite Complete Update Script (No Authentication)
set -e  # Exit on any error

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

# Configuration
INSTALL_DIR="/opt/pterolite"
WEB_ROOT="/var/www/pterolite"
BACKUP_DIR="/opt/pterolite-backup-$(date +%Y%m%d_%H%M%S)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Detect existing installation mode and get domain
get_existing_installation_info() {
    # Check if nginx config exists
    if [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        DOMAIN=$(grep "server_name" "/etc/nginx/sites-available/pterolite.conf" | head -1 | awk '{print $2}' | sed 's/;//')
        if [[ -n "$DOMAIN" && "$DOMAIN" != "localhost" && "$DOMAIN" != "_" ]]; then
            INSTALLATION_MODE="domain"
            log_info "Found existing domain installation: $DOMAIN"
        else
            INSTALLATION_MODE="localhost"
            DOMAIN="localhost"
            log_info "Found existing localhost installation"
        fi
    elif [[ -f "$INSTALL_DIR/public/index.html" ]]; then
        # Frontend in backend directory indicates localhost mode
        INSTALLATION_MODE="localhost"
        DOMAIN="localhost"
        log_info "Detected existing localhost mode installation (frontend in backend directory)"
    elif [[ -f "$WEB_ROOT/index.html" ]]; then
        # Frontend in web root but no nginx config - assume domain mode
        INSTALLATION_MODE="domain"
        if [[ -n "$PTEROLITE_DOMAIN" ]]; then
            DOMAIN="$PTEROLITE_DOMAIN"
            log_info "Using domain from environment: $DOMAIN"
        else
            log_warn "Found frontend in web root but no nginx configuration"
            read -p "Enter your domain name: " DOMAIN
        fi
    else
        log_error "Could not detect existing installation"
        exit 1
    fi
    
    log_info "Installation mode: $INSTALLATION_MODE"
    log_info "Domain: $DOMAIN"
}

# Detect installation type
detect_installation() {
    log_step "Detecting current installation type..."
    
    if systemctl is-active --quiet pterolite 2>/dev/null; then
        INSTALLATION_TYPE="systemd"
        log_info "Detected systemd installation"
    elif pm2 list 2>/dev/null | grep -q "pterolite"; then
        INSTALLATION_TYPE="pm2"
        log_info "Detected PM2 installation"
    elif [[ -f "$INSTALL_DIR/server.js" ]]; then
        INSTALLATION_TYPE="manual"
        log_info "Detected manual installation"
    else
        log_error "No PteroLite installation detected"
        exit 1
    fi
}

# Create backup
create_backup() {
    log_step "Creating backup..."
    
    # Remove old backups, keep only the latest one
    log_info "Cleaning up old backups..."
    OLD_BACKUPS=$(find /opt -name "pterolite-backup-*" -type d 2>/dev/null | sort -r | tail -n +2)
    if [[ -n "$OLD_BACKUPS" ]]; then
        echo "$OLD_BACKUPS" | xargs rm -rf
        log_info "Removed old backup directories"
    fi
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup application files
    if [[ -d "$INSTALL_DIR" ]]; then
        cp -r "$INSTALL_DIR" "$BACKUP_DIR/app"
        log_info "Application files backed up"
    fi
    
    # Backup web files
    if [[ -d "$WEB_ROOT" ]]; then
        cp -r "$WEB_ROOT" "$BACKUP_DIR/web"
        log_info "Web files backed up"
    fi
    
    # Backup nginx config
    if [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        mkdir -p "$BACKUP_DIR/nginx"
        cp "/etc/nginx/sites-available/pterolite.conf" "$BACKUP_DIR/nginx/"
        log_info "Nginx configuration backed up"
    fi
    
    # Backup systemd service if exists
    if [[ -f "/etc/systemd/system/pterolite.service" ]]; then
        mkdir -p "$BACKUP_DIR/systemd"
        cp "/etc/systemd/system/pterolite.service" "$BACKUP_DIR/systemd/"
        log_info "Systemd service backed up"
    fi
    
    log_info "Backup created at: $BACKUP_DIR"
}

# Stop services
stop_services() {
    log_step "Stopping services..."
    
    case $INSTALLATION_TYPE in
        "systemd")
            systemctl stop pterolite || true
            log_info "Systemd service stopped"
            ;;
        "pm2")
            pm2 stop pterolite || true
            pm2 delete pterolite || true
            log_info "PM2 process stopped and removed"
            ;;
        "manual")
            pkill -f "node.*server.js" || true
            log_info "Manual processes stopped"
            ;;
    esac
}

# Update application files
update_application() {
    log_step "Updating application files..."
    
    # Download and setup backend files
    if [[ -d "$SCRIPT_DIR/backend" ]]; then
        cp -r "$SCRIPT_DIR/backend/"* "$INSTALL_DIR/"
        log_info "Backend files updated from local directory"
    else
        log_warn "Backend directory not found in script location"
        log_info "Downloading backend files from GitHub..."
        TEMP_DIR="/tmp/pterolite-update-$(date +%s)"
        mkdir -p "$TEMP_DIR"
        cd "$TEMP_DIR"
        
        if git clone https://github.com/MyMasWayVPN/pterolite-full.git; then
            cp -r pterolite-full/backend/* "$INSTALL_DIR/"
            log_info "Backend files downloaded and updated"
        else
            log_error "Failed to download backend files from GitHub"
            exit 1
        fi
        
        # Cleanup temp directory
        rm -rf "$TEMP_DIR"
    fi
    
    # Install/update dependencies
    cd "$INSTALL_DIR"
    if [[ -f "package.json" ]]; then
        npm install --production
        
        # Install additional dependencies (core only, no auth dependencies)
        log_info "Installing additional dependencies..."
        npm install multer archiver unzipper uuid
        
        log_info "Dependencies updated"
    fi
    
    # Set proper permissions
    chown -R root:root "$INSTALL_DIR"
    chmod -R 755 "$INSTALL_DIR"
    chmod 644 "$INSTALL_DIR"/*.js "$INSTALL_DIR"/*.json 2>/dev/null || true
    
    log_info "Backend updated successfully"
}

# Build and deploy frontend
update_frontend() {
    log_step "Building and deploying frontend..."
    
    if [[ -d "$SCRIPT_DIR/frontend" ]]; then
        cd "$SCRIPT_DIR/frontend"
        
        # Install dependencies and build
        npm install
        npm run build
        
        if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
            # For localhost mode, deploy to backend directory
            log_info "Deploying frontend to backend directory for direct serving..."
            mkdir -p "$INSTALL_DIR/public"
            rm -rf "$INSTALL_DIR/public"/*
            cp -r dist/* "$INSTALL_DIR/public/"
            
            # Set proper permissions
            chown -R root:root "$INSTALL_DIR/public"
            chmod -R 755 "$INSTALL_DIR/public"
            
            log_info "Frontend deployed to backend public directory"
        else
            # For domain mode, deploy to web root
            mkdir -p "$WEB_ROOT"
            rm -rf "$WEB_ROOT"/*
            cp -r dist/* "$WEB_ROOT/"
            
            # Set proper permissions
            chown -R www-data:www-data "$WEB_ROOT"
            chmod -R 755 "$WEB_ROOT"
            
            log_info "Frontend built and deployed from local directory"
        fi
    else
        log_warn "Frontend directory not found in script location"
        log_info "Downloading and building frontend from GitHub..."
        TEMP_DIR="/tmp/pterolite-frontend-$(date +%s)"
        mkdir -p "$TEMP_DIR"
        cd "$TEMP_DIR"
        
        if git clone https://github.com/MyMasWayVPN/pterolite-full.git; then
            cd pterolite-full/frontend
            npm install
            npm run build
            
            if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
                # For localhost mode, deploy to backend directory
                log_info "Deploying frontend to backend directory for direct serving..."
                mkdir -p "$INSTALL_DIR/public"
                rm -rf "$INSTALL_DIR/public"/*
                cp -r dist/* "$INSTALL_DIR/public/"
                
                # Set proper permissions
                chown -R root:root "$INSTALL_DIR/public"
                chmod -R 755 "$INSTALL_DIR/public"
                
                log_info "Frontend deployed to backend public directory"
            else
                # For domain mode, deploy to web root
                mkdir -p "$WEB_ROOT"
                rm -rf "$WEB_ROOT"/*
                cp -r dist/* "$WEB_ROOT/"
                
                # Set proper permissions
                chown -R www-data:www-data "$WEB_ROOT"
                chmod -R 755 "$WEB_ROOT"
                
                log_info "Frontend downloaded, built and deployed"
            fi
        else
            log_error "Failed to download frontend files from GitHub"
            exit 1
        fi
        
        # Cleanup temp directory
        rm -rf "$TEMP_DIR"
    fi
}

# Migrate from PM2 to systemd
migrate_to_systemd() {
    if [[ "$INSTALLATION_TYPE" == "pm2" ]]; then
        log_step "Migrating from PM2 to systemd..."
        
        # Get API key from PM2 environment or .env file
        API_KEY=""
        if [[ -f "$INSTALL_DIR/.env" ]]; then
            API_KEY=$(grep "API_KEY=" "$INSTALL_DIR/.env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        fi
        
        if [[ -z "$API_KEY" ]]; then
            API_KEY=$(openssl rand -hex 32)
            log_info "Generated new API key: $API_KEY"
        fi
        
        # Create .env file
        cat > "$INSTALL_DIR/.env" <<EOF
API_KEY=$API_KEY
NODE_ENV=production
PORT=8088
EOF
        
        # Create systemd service
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
        
        # Enable and start systemd service
        systemctl daemon-reload
        systemctl enable pterolite
        
        log_info "Migrated from PM2 to systemd"
    fi
}

# Configure nginx for domain mode (without authentication endpoints)
configure_nginx_domain() {
    log_step "Configuring nginx for domain mode..."
    
    # Create nginx configuration without authentication endpoints
    log_info "Creating nginx configuration without authentication..."
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

    # Container management endpoints
    location /containers {
        proxy_pass http://127.0.0.1:8088/containers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # File management endpoints
    location /files {
        proxy_pass http://127.0.0.1:8088/files;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 100M;
    }

    # Process management endpoints
    location /processes {
        proxy_pass http://127.0.0.1:8088/processes;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Console endpoints
    location /console {
        proxy_pass http://127.0.0.1:8088/console;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Script execution endpoints
    location /scripts {
        proxy_pass http://127.0.0.1:8088/scripts;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Startup commands endpoints
    location /startup-commands {
        proxy_pass http://127.0.0.1:8088/startup-commands;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Docker management endpoints
    location /docker {
        proxy_pass http://127.0.0.1:8088/docker;
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
    
    log_info "Nginx configuration created without authentication endpoints"
}

# Configure for localhost mode (skip nginx, use direct port access)
configure_nginx_localhost() {
    log_step "Configuring localhost mode (direct port access)..."
    
    # For localhost mode, we skip nginx configuration
    # Users will access directly via http://localhost:8088
    log_info "Localhost mode selected - skipping nginx configuration"
    log_info "Application will be accessible directly on port 8088"
    
    # Disable nginx site to avoid conflicts
    rm -f /etc/nginx/sites-enabled/pterolite.conf
    rm -f /etc/nginx/sites-available/pterolite.conf
    
    # Reload nginx to remove any existing configuration
    if systemctl is-active --quiet nginx; then
        systemctl reload nginx
        log_info "Nginx configuration cleared for localhost mode"
    fi
}

# Update nginx configuration
update_nginx_config() {
    if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
        configure_nginx_localhost
    else
        configure_nginx_domain
        
        # Enable site
        ln -sf /etc/nginx/sites-available/pterolite.conf /etc/nginx/sites-enabled/
        
        # Remove default site if exists
        rm -f /etc/nginx/sites-enabled/default
        
        # Test nginx configuration
        log_info "Testing nginx configuration..."
        if nginx -t; then
            log_info "Nginx configuration is valid"
            systemctl reload nginx
        else
            log_error "Nginx configuration test failed"
            log_error "Restoring backup nginx configuration..."
            if [[ -f "$BACKUP_DIR/nginx/pterolite.conf" ]]; then
                cp "$BACKUP_DIR/nginx/pterolite.conf" /etc/nginx/sites-available/pterolite.conf
                nginx -t && systemctl reload nginx
                log_warn "Backup nginx configuration restored"
            fi
            exit 1
        fi
    fi
}

# Start services
start_services() {
    log_step "Starting services..."
    
    # Start PteroLite service
    systemctl start pterolite
    systemctl restart pterolite
    systemctl enable pterolite
    
    # Check if service started successfully
    sleep 3
    if systemctl is-active --quiet pterolite; then
        log_info "PteroLite service started successfully"
    else
        log_error "Failed to start PteroLite service"
        log_error "Service status:"
        systemctl status pterolite --no-pager
        exit 1
    fi
    
    # Ensure nginx is running (if not localhost mode)
    if [[ "$INSTALLATION_MODE" != "localhost" ]] && ! systemctl is-active --quiet nginx; then
        systemctl start nginx
    fi
    
    log_info "All services started successfully"
}

# Test services
test_services() {
    log_step "Testing services..."
    
    # Test backend API
    sleep 5
    if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
        # For localhost mode, test direct connection
        if curl -s "http://localhost:8088/containers" >/dev/null 2>&1; then
            log_info "✅ Backend API is responding (localhost:8088)"
        else
            log_error "❌ Backend API is not responding on localhost:8088"
            return 1
        fi
        
        # Test frontend (served by backend)
        if curl -s -I "http://localhost:8088" | grep -q "HTTP/"; then
            log_info "✅ Frontend is accessible (localhost:8088)"
        else
            log_error "❌ Frontend is not accessible on localhost:8088"
            return 1
        fi
    else
        # For domain mode, test through nginx proxy
        if curl -s "http://$DOMAIN/external-api/containers" >/dev/null 2>&1; then
            log_info "✅ Backend API is responding (HTTP)"
        elif curl -s "http://localhost:8088/containers" >/dev/null 2>&1; then
            log_info "✅ Backend API is responding (direct connection)"
        else
            log_error "❌ Backend API is not responding"
            return 1
        fi
        
        # Test frontend
        if curl -s -I "http://$DOMAIN" | grep -q "HTTP/"; then
            log_info "✅ HTTP frontend is accessible"
        else
            log_error "❌ HTTP frontend is not accessible"
            return 1
        fi
    fi
    
    return 0
}

# Show completion summary
show_summary() {
    echo ""
    log_info "🎉 PteroLite Update Completed!"
    echo "================================"
    
    log_info "Installation Details:"
    log_info "• Installation Type: systemd service"
    log_info "• Application Directory: $INSTALL_DIR"
    log_info "• Web Root: $WEB_ROOT"
    log_info "• Backup Location: $BACKUP_DIR"
    
    echo ""
    log_info "🌐 ACCESS INFORMATION:"
    echo "================================"
    if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
        log_info "Web Panel: http://localhost:8088"
        log_info "Web Panel (IP): http://$(hostname -I | awk '{print $1}'):8088"
        log_info "API: http://localhost:8088/api"
        log_info "API (IP): http://$(hostname -I | awk '{print $1}'):8088/api"
        log_info "Mode: Localhost Only (Direct Port Access, No Authentication)"
    else
        log_info "Web Panel: http://$DOMAIN (No Authentication Required)"
        log_info "API Eksternal: http://$DOMAIN/external-api (Requires X-API-Key header)"
    fi
    
    echo ""
    log_info "🆕 FEATURES:"
    echo "================================"
    log_info "• No authentication required for web panel"
    log_info "• Container management without user restrictions"
    log_info "• File manager with full access"
    log_info "• Console and script execution"
    log_info "• Docker image management"
    
    echo ""
    log_info "🔧 MANAGEMENT COMMANDS:"
    echo "================================"
    log_info "• Start service: systemctl start pterolite"
    log_info "• Stop service: systemctl stop pterolite"
    log_info "• Restart service: systemctl restart pterolite"
    log_info "• View logs: journalctl -u pterolite -f"
    log_info "• Check status: systemctl status pterolite"
    
    # Save update info
    cat > "$INSTALL_DIR/update-info.txt" <<EOF
PteroLite Update Information
===========================
Update Date: $(date)
Domain: $DOMAIN
Installation Type: systemd
Backup Location: $BACKUP_DIR
Authentication: Disabled (No login required)

Services:
- Backend: systemd (pterolite)
- Web Server: nginx (if domain mode)

Features:
- No authentication required
- Direct container access
- Full file management
- Console and script execution

Management Commands:
- systemctl start/stop/restart pterolite
- journalctl -u pterolite -f
EOF
    
    log_info "Update information saved to $INSTALL_DIR/update-info.txt"
}

# Main function
main() {
    echo ""
    echo "🚀 PteroLite Complete Update (No Authentication)"
    echo "=============================================="
    echo "This script will update PteroLite without authentication system"
    echo ""
    
    check_root
    get_existing_installation_info
    detect_installation
    create_backup
    stop_services
    update_application
    update_frontend
    migrate_to_systemd
    update_nginx_config
    start_services
    
    if test_services; then
        show_summary
        echo ""
        log_info "🎉 Update completed successfully!"
        log_info "Your PteroLite installation is now updated without authentication."
        log_info "Web panel is accessible directly without login."
    else
        log_error "❌ Some services are not working properly. Please check the logs."
        log_info "Backup is available at: $BACKUP_DIR"
        exit 1
    fi
}

# Run main function
main "$@"
