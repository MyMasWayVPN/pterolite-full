#!/bin/bash
# PteroLite Complete Update & SSL Fix Script
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

# Get domain from nginx config or environment
get_domain() {
    if [[ -n "$PTEROLITE_DOMAIN" ]]; then
        DOMAIN="$PTEROLITE_DOMAIN"
        log_info "Using domain from environment: $DOMAIN"
    elif [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        DOMAIN=$(grep "server_name" "/etc/nginx/sites-available/pterolite.conf" | head -1 | awk '{print $2}' | sed 's/;//')
        if [[ -n "$DOMAIN" ]]; then
            log_info "Found domain from nginx config: $DOMAIN"
        else
            log_error "Could not extract domain from nginx config"
            exit 1
        fi
    else
        log_error "No domain found. Please set PTEROLITE_DOMAIN environment variable or ensure nginx config exists"
        exit 1
    fi
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
        log_info "Dependencies updated"
    fi
    
    # Set proper permissions
    chown -R root:root "$INSTALL_DIR"
    chmod -R 755 "$INSTALL_DIR"
    chmod 644 "$INSTALL_DIR"/*.js "$INSTALL_DIR"/*.json 2>/dev/null || true
}

# Build and deploy frontend
update_frontend() {
    log_step "Building and deploying frontend..."
    
    if [[ -d "$SCRIPT_DIR/frontend" ]]; then
        cd "$SCRIPT_DIR/frontend"
        
        # Install dependencies and build
        npm install
        npm run build
        
        # Deploy to web root
        mkdir -p "$WEB_ROOT"
        rm -rf "$WEB_ROOT"/*
        cp -r dist/* "$WEB_ROOT/"
        
        # Set proper permissions
        chown -R www-data:www-data "$WEB_ROOT"
        chmod -R 755 "$WEB_ROOT"
        
        log_info "Frontend built and deployed from local directory"
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
            
            # Deploy to web root
            mkdir -p "$WEB_ROOT"
            rm -rf "$WEB_ROOT"/*
            cp -r dist/* "$WEB_ROOT/"
            
            # Set proper permissions
            chown -R www-data:www-data "$WEB_ROOT"
            chmod -R 755 "$WEB_ROOT"
            
            log_info "Frontend downloaded, built and deployed"
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
Description=PteroLite Container Management API
After=network.target
Wants=network.target

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

# Check SSL certificate status
check_ssl_status() {
    log_step "Checking SSL certificate status..."
    
    SSL_CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    SSL_KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
    
    if [[ -f "$SSL_CERT_PATH" && -f "$SSL_KEY_PATH" ]]; then
        log_info "SSL certificate files found"
        
        # Check certificate expiry
        EXPIRY_DATE=$(openssl x509 -enddate -noout -in "$SSL_CERT_PATH" | cut -d= -f2)
        EXPIRY_TIMESTAMP=$(date -d "$EXPIRY_DATE" +%s)
        CURRENT_TIMESTAMP=$(date +%s)
        DAYS_UNTIL_EXPIRY=$(( (EXPIRY_TIMESTAMP - CURRENT_TIMESTAMP) / 86400 ))
        
        if [[ $DAYS_UNTIL_EXPIRY -gt 0 ]]; then
            log_info "SSL certificate is valid for $DAYS_UNTIL_EXPIRY more days"
            SSL_STATUS="valid"
        else
            log_warn "SSL certificate has expired"
            SSL_STATUS="expired"
        fi
    else
        log_warn "SSL certificate files not found"
        SSL_STATUS="missing"
    fi
}

# Update nginx configuration
update_nginx_config() {
    log_step "Updating nginx configuration..."
    
    # Create updated nginx configuration without HTTPS redirect
    if [[ "$SSL_STATUS" == "valid" ]]; then
        log_info "Creating nginx configuration with SSL support (no redirect)..."
        cat > /etc/nginx/sites-available/pterolite.conf <<EOF
# HTTP server (no redirect)
server {
    listen 80;
    server_name $DOMAIN;
    root $WEB_ROOT;
    index index.html;

    # Serve static files (React frontend)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Authentication endpoints
    location /auth/ {
        proxy_pass http://127.0.0.1:8088/auth/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
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

    # Security headers (without HTTPS enforcement)
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}

# HTTPS server (optional, no redirect from HTTP)
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    root $WEB_ROOT;
    index index.html;

    # SSL Configuration
    ssl_certificate $SSL_CERT_PATH;
    ssl_certificate_key $SSL_KEY_PATH;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Serve static files (React frontend)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Authentication endpoints
    location /auth/ {
        proxy_pass http://127.0.0.1:8088/auth/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
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

    # Security headers (without HTTPS enforcement)
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
EOF
    else
        log_info "Creating nginx configuration for HTTP only..."
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

    # Authentication endpoints
    location /auth/ {
        proxy_pass http://127.0.0.1:8088/auth/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
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

    # Security headers (without HTTPS enforcement)
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
EOF
    fi
    
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
    
    log_info "Nginx configuration updated successfully"
}

# Fix or install SSL certificate
fix_ssl_certificate() {
    log_step "Fixing SSL certificate..."
    
    case $SSL_STATUS in
        "missing")
            log_info "Installing new SSL certificate..."
            if command -v certbot >/dev/null 2>&1; then
                if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --no-redirect; then
                    log_info "SSL certificate installed successfully (no redirect)"
                    SSL_STATUS="valid"
                    # Update nginx config with SSL
                    update_nginx_config
                else
                    log_warn "Failed to install SSL certificate automatically"
                fi
            else
                log_warn "Certbot not installed. Installing..."
                apt-get update
                apt-get install -y certbot python3-certbot-nginx
                if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --no-redirect; then
                    log_info "SSL certificate installed successfully (no redirect)"
                    SSL_STATUS="valid"
                    # Update nginx config with SSL
                    update_nginx_config
                else
                    log_warn "Failed to install SSL certificate"
                fi
            fi
            ;;
        "expired")
            log_info "Renewing expired SSL certificate..."
            if certbot renew --nginx; then
                log_info "SSL certificate renewed successfully"
                SSL_STATUS="valid"
                # Update nginx config with SSL
                update_nginx_config
            else
                log_error "Failed to renew SSL certificate"
            fi
            ;;
        "valid")
            log_info "SSL certificate is already valid"
            ;;
    esac
}

# Start services
start_services() {
    log_step "Starting services..."
    
    # Start PteroLite service
    systemctl start pterolite
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
    
    # Ensure nginx is running
    if ! systemctl is-active --quiet nginx; then
        systemctl start nginx
    fi
    
    log_info "All services started successfully"
}

# Test services
test_services() {
    log_step "Testing services..."
    
    # Test backend API through nginx proxy
    sleep 5
    if [[ "$SSL_STATUS" == "valid" ]]; then
        if curl -s -k "https://$DOMAIN/api/containers" >/dev/null 2>&1; then
            log_info "✅ Backend API is responding (HTTPS)"
        elif curl -s "http://localhost:8088/containers" >/dev/null 2>&1; then
            log_info "✅ Backend API is responding (direct connection)"
        else
            log_error "❌ Backend API is not responding"
            return 1
        fi
    else
        if curl -s "http://$DOMAIN/api/containers" >/dev/null 2>&1; then
            log_info "✅ Backend API is responding (HTTP)"
        elif curl -s "http://localhost:8088/containers" >/dev/null 2>&1; then
            log_info "✅ Backend API is responding (direct connection)"
        else
            log_error "❌ Backend API is not responding"
            return 1
        fi
    fi
    
    # Test frontend
    if [[ "$SSL_STATUS" == "valid" ]]; then
        if curl -s -I "https://$DOMAIN" | grep -q "HTTP/"; then
            log_info "✅ HTTPS frontend is accessible"
        else
            log_error "❌ HTTPS frontend is not accessible"
            return 1
        fi
    else
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
    log_info "🎉 PteroLite Update & SSL Fix Completed!"
    echo "================================"
    
    log_info "Installation Details:"
    log_info "• Installation Type: systemd service"
    log_info "• Application Directory: $INSTALL_DIR"
    log_info "• Web Root: $WEB_ROOT"
    log_info "• Backup Location: $BACKUP_DIR"
    
    echo ""
    log_info "🌐 ACCESS INFORMATION:"
    echo "================================"
    if [[ "$SSL_STATUS" == "valid" ]]; then
        log_info "Web Panel HTTP: http://$DOMAIN"
        log_info "Web Panel HTTPS: https://$DOMAIN"
        log_info "API Eksternal HTTP: http://$DOMAIN/external-api"
        log_info "API Eksternal HTTPS: https://$DOMAIN/external-api"
        log_info "Note: No automatic redirect to HTTPS - both HTTP and HTTPS work"
    else
        log_info "Web Panel: http://$DOMAIN (HTTP only)"
        log_info "API Eksternal: http://$DOMAIN/external-api (HTTP only)"
        log_warn "SSL certificate not found - run: certbot --nginx -d $DOMAIN --no-redirect"
    fi
    
    # New Features
    echo ""
    log_info "🆕 NEW FEATURES:"
    echo "================================"
    log_info "• Dark theme interface"
    log_info "• Container path isolation"
    log_info "• Enhanced file manager with container restrictions"
    log_info "• Console with automatic container working directory"
    log_info "• Improved security with path validation"
    
    echo ""
    log_info "🔧 MANAGEMENT COMMANDS:"
    echo "================================"
    log_info "• Start service: systemctl start pterolite"
    log_info "• Stop service: systemctl stop pterolite"
    log_info "• Restart service: systemctl restart pterolite"
    log_info "• View logs: journalctl -u pterolite -f"
    log_info "• Check status: systemctl status pterolite"
    log_info "• Renew SSL: certbot renew"
    
    echo ""
    log_info "📁 CONTAINER ISOLATION:"
    echo "================================"
    log_info "• Each container has isolated file access"
    log_info "• File Manager restricted to container folders"
    log_info "• Console commands execute in container directory"
    log_info "• Path traversal protection enabled"
    
    # Save update info
    cat > "$INSTALL_DIR/update-info.txt" <<EOF
PteroLite Update Information
===========================
Update Date: $(date)
Domain: $DOMAIN
SSL Status: $SSL_STATUS
Installation Type: systemd
Backup Location: $BACKUP_DIR

Services:
- Backend: systemd (pterolite)
- Web Server: nginx
- SSL: Let's Encrypt

New Features:
- Dark theme interface
- Container path isolation
- Enhanced security
- Improved file manager
- Console with container restrictions

Management Commands:
- systemctl start/stop/restart pterolite
- journalctl -u pterolite -f
- certbot renew
EOF
    
    log_info "Update information saved to $INSTALL_DIR/update-info.txt"
}

# Main function
main() {
    echo ""
    echo "🚀 PteroLite Complete Update & SSL Fix"
    echo "====================================="
    echo "This script will update PteroLite and fix SSL issues"
    echo ""
    
    check_root
    get_domain
    detect_installation
    create_backup
    stop_services
    update_application
    update_frontend
    migrate_to_systemd
    check_ssl_status
    update_nginx_config
    fix_ssl_certificate
    start_services
    
    if test_services; then
        show_summary
        echo ""
        log_info "🎉 Update completed successfully!"
        log_info "Your PteroLite installation is now updated with the latest features and SSL is properly configured."
    else
        log_error "❌ Some services are not working properly. Please check the logs."
        log_info "Backup is available at: $BACKUP_DIR"
        exit 1
    fi
}

# Run main function
main "$@"
