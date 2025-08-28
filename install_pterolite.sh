#!/bin/bash
# PteroLite Auto Installer - No Authentication Version
set -e  # Exit on any error

# Configuration
GITHUB_REPO="https://github.com/MyMasWayVPN/pterolite-full"
INSTALL_DIR="/opt/pterolite"
WEB_ROOT="/var/www/pterolite"
TEMP_DIR="/tmp/pterolite-install"

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

# Generate random API key
generate_api_key() {
    openssl rand -hex 32
}

# Validate domain format
validate_domain() {
    # Allow subdomains like pterolite.xmwstore.web.id
    if [[ ! "$1" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$ ]]; then
        log_error "Invalid domain format: $1"
        log_error "Domain should be in format like: example.com, sub.example.com, or pterolite.xmwstore.web.id"
        return 1
    fi
    return 0
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Check Node.js version
check_node_version() {
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $NODE_VERSION -lt 18 ]]; then
            log_warn "Node.js version $NODE_VERSION is too old. Installing Node.js 18..."
            return 1
        else
            log_info "Node.js version $NODE_VERSION is compatible"
            return 0
        fi
    else
        log_warn "Node.js not found. Installing Node.js 18..."
        return 1
    fi
}

# Install Node.js 18 LTS
install_nodejs() {
    log_info "Installing Node.js 18 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    
    # Verify installation
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $NODE_VERSION -lt 18 ]]; then
        log_error "Failed to install Node.js 18"
        exit 1
    fi
    log_info "Node.js $(node -v) installed successfully"
}

# Install Docker
install_docker() {
    log_info "Installing Docker..."
    
    # Remove old versions
    apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # Install prerequisites
    apt-get update
    apt-get install -y ca-certificates curl gnupg lsb-release
    
    # Add Docker's official GPG key
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Set up repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker Engine
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    # Add current user to docker group (if not root)
    if [[ $SUDO_USER ]]; then
        usermod -aG docker $SUDO_USER
        log_info "Added $SUDO_USER to docker group"
    fi
    
    log_info "Docker installed successfully"
}

# Download project from GitHub
download_project() {
    log_step "Downloading PteroLite from GitHub..."
    
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
    
    log_info "Project downloaded and verified successfully"
}

# Choose installation type
choose_installation_type() {
    echo ""
    log_info "Installation Type Selection"
    echo "================================"
    echo "Choose your installation type:"
    echo "1) Install with Domain (requires domain name and optional SSL)"
    echo "2) Install for Localhost Only (no domain required, HTTP only)"
    echo ""
    
    while true; do
        read -p "Choose installation type (1-2): " install_choice
        
        case $install_choice in
            1)
                INSTALLATION_MODE="domain"
                log_info "Selected: Installation with Domain"
                break
                ;;
            2)
                INSTALLATION_MODE="localhost"
                log_info "Selected: Localhost Only Installation"
                break
                ;;
            *)
                log_error "Invalid choice. Please enter 1 or 2."
                ;;
        esac
    done
}

# Interactive domain input (only for domain mode)
get_domain() {
    if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
        DOMAIN="localhost"
        log_info "Using localhost for installation"
        return 0
    fi
    
    echo ""
    log_info "Domain Configuration"
    echo "================================"
    
    while true; do
        read -p "Enter your domain name (e.g., pterolite.xmwstore.web.id): " DOMAIN
        
        if [[ -z "$DOMAIN" ]]; then
            log_error "Domain cannot be empty. Please enter a valid domain."
            continue
        fi
        
        if validate_domain "$DOMAIN"; then
            log_info "Domain '$DOMAIN' is valid"
            break
        else
            log_error "Invalid domain format. Please enter a valid domain (e.g., pterolite.xmwstore.web.id)"
        fi
    done
}

# Interactive SSL setup (only for domain mode)
setup_ssl_interactive() {
    if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
        log_info "Localhost mode selected - skipping SSL setup"
        SSL_ENABLED=false
        return 0
    fi
    
    echo ""
    log_info "SSL Certificate Configuration"
    echo "================================"
    
    while true; do
        echo "SSL Certificate options:"
        echo "1) Install Let's Encrypt SSL certificate (recommended)"
        echo "2) Skip SSL setup (HTTP only - not recommended for production)"
        echo ""
        read -p "Choose an option (1-2): " ssl_choice
        
        case $ssl_choice in
            1)
                log_info "Setting up Let's Encrypt SSL certificate..."
                
                # Get email for Let's Encrypt
                while true; do
                    read -p "Enter email for Let's Encrypt notifications: " ssl_email
                    
                    if [[ -z "$ssl_email" ]]; then
                        log_error "Email cannot be empty."
                        continue
                    fi
                    
                    if [[ ! "$ssl_email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
                        log_error "Invalid email format."
                        continue
                    fi
                    
                    break
                done
                
                # Attempt SSL certificate installation without redirect
                log_info "Installing SSL certificate for $DOMAIN..."
                if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$ssl_email" --no-redirect; then
                    log_info "SSL certificate installed successfully!"
                    log_info "Your site is available at both:"
                    log_info "  - http://$DOMAIN (HTTP)"
                    log_info "  - https://$DOMAIN (HTTPS)"
                    log_info "No automatic redirect to HTTPS is configured."
                    SSL_ENABLED=true
                else
                    log_warn "SSL certificate installation failed."
                    log_warn "Your site is available at: http://$DOMAIN"
                    log_warn "You can try installing SSL manually later with:"
                    log_warn "certbot --nginx -d $DOMAIN --no-redirect"
                    SSL_ENABLED=false
                fi
                break
                ;;
            2)
                log_warn "Skipping SSL setup. Your site will be available at: http://$DOMAIN"
                log_warn "This is not recommended for production use."
                SSL_ENABLED=false
                break
                ;;
            *)
                log_error "Invalid choice. Please enter 1 or 2."
                ;;
        esac
    done
}

# Setup backend
setup_backend() {
    log_step "Setting up backend..."
    
    # Create install directory
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    # Copy backend files
    log_info "Copying backend files..."
    cp -r "$TEMP_DIR/pterolite-full/backend"/* "$INSTALL_DIR/"
    
    # Install backend dependencies
    log_info "Installing backend dependencies..."
    npm install
    
    # Install additional dependencies (core only, no auth dependencies)
    log_info "Installing additional backend dependencies..."
    npm install multer archiver unzipper uuid
    
    # Generate API key
    API_KEY=$(generate_api_key)
    
    # Set up environment
    cat > .env <<EOF
API_KEY=$API_KEY
NODE_ENV=production
PORT=8088
EOF
    
    # Update server.js to use environment variables properly
    if grep -q 'const API_KEY = process.env.API_KEY || "supersecretkey";' server.js; then
        sed -i 's/const API_KEY = process.env.API_KEY || "supersecretkey";/const API_KEY = process.env.API_KEY;/' server.js
    fi
    
    log_info "Backend setup completed"
}

# Setup frontend
setup_frontend() {
    log_step "Setting up frontend..."
    
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
        log_error "Check the build logs above for errors"
        exit 1
    fi
    
    if [[ ! -f "dist/index.html" ]]; then
        log_error "Frontend build failed - index.html not found in dist"
        log_error "Build may have completed but output structure is incorrect"
        exit 1
    fi
    
    log_info "Frontend build completed successfully"
    
    if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
        # For localhost mode, copy frontend to backend directory for direct serving
        log_info "Deploying frontend files to backend directory for direct serving..."
        mkdir -p "$INSTALL_DIR/public"
        cp -r dist/* "$INSTALL_DIR/public/"
        
        # Verify deployment
        if [[ ! -f "$INSTALL_DIR/public/index.html" ]]; then
            log_error "Frontend deployment failed - index.html not found in backend public directory"
            exit 1
        fi
        
        log_info "Frontend deployed to backend public directory"
        
        # Set proper permissions
        chown -R root:root "$INSTALL_DIR/public"
        chmod -R 755 "$INSTALL_DIR/public"
    else
        # For domain mode, use nginx web root
        log_info "Deploying frontend files to web root..."
        mkdir -p "$WEB_ROOT"
        cp -r dist/* "$WEB_ROOT/"
        
        # Verify deployment
        if [[ ! -f "$WEB_ROOT/index.html" ]]; then
            log_error "Frontend deployment failed - index.html not found in web root"
            exit 1
        fi
        
        log_info "Frontend deployed successfully"
        
        # Set proper permissions
        chown -R www-data:www-data "$WEB_ROOT"
        chmod -R 755 "$WEB_ROOT"
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
        exit 1
    fi
}

# Configure Nginx for domain mode (without authentication endpoints)
configure_nginx_domain() {
    log_step "Configuring Nginx for domain mode..."
    
    # Create nginx configuration without authentication endpoints
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
    
    log_info "Nginx configured for domain mode without authentication"
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

# Configure Nginx (main function)
configure_nginx() {
    if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
        configure_nginx_localhost
    else
        configure_nginx_domain
        
        # Enable site
        ln -sf /etc/nginx/sites-available/pterolite.conf /etc/nginx/sites-enabled/
        
        # Remove default site if exists
        rm -f /etc/nginx/sites-enabled/default
        
        # Test nginx configuration
        log_info "Testing Nginx configuration..."
        if nginx -t; then
            log_info "Nginx configuration is valid"
            systemctl reload nginx
        else
            log_error "Nginx configuration test failed"
            exit 1
        fi
        
        log_info "Nginx configured successfully"
    fi
}

# Verify installation
verify_installation() {
    log_step "Verifying installation..."
    
    # Check systemd service
    if systemctl is-active --quiet pterolite; then
        log_info "✅ Backend service (systemd) is running"
        BACKEND_STATUS="✅ Running"
    else
        log_error "❌ Backend service failed to start"
        BACKEND_STATUS="❌ Failed"
    fi
    
    # Check Nginx service (only for domain mode)
    if [[ "$INSTALLATION_MODE" != "localhost" ]]; then
        if systemctl is-active --quiet nginx; then
            log_info "✅ Nginx web server is running"
            NGINX_STATUS="✅ Running"
        else
            log_error "❌ Nginx failed to start"
            NGINX_STATUS="❌ Failed"
        fi
    else
        NGINX_STATUS="N/A (Localhost Mode)"
    fi
    
    # Check Docker service
    if systemctl is-active --quiet docker; then
        log_info "✅ Docker service is running"
        DOCKER_STATUS="✅ Running"
    else
        log_warn "⚠️ Docker service is not running"
        DOCKER_STATUS="⚠️ Not Running"
    fi
    
    # Check if backend port is listening
    if netstat -tuln 2>/dev/null | grep -q ":8088 " || ss -tuln 2>/dev/null | grep -q ":8088 "; then
        log_info "✅ Backend is listening on port 8088"
        PORT_STATUS="✅ Listening"
    else
        log_warn "⚠️ Backend port 8088 not detected"
        PORT_STATUS="⚠️ Not Detected"
    fi
    
    # Check if website is accessible
    if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
        if curl -s -o /dev/null -w "%{http_code}" "http://localhost:8088" | grep -q "200\|301\|302"; then
            log_info "✅ Website is accessible via localhost:8088"
            HTTP_ACCESS="✅ Accessible"
        else
            log_warn "⚠️ Website not accessible via localhost:8088"
            HTTP_ACCESS="⚠️ Not Accessible"
        fi
    else
        if curl -s -o /dev/null -w "%{http_code}" "http://localhost" | grep -q "200\|301\|302"; then
            log_info "✅ Website is accessible via HTTP"
            HTTP_ACCESS="✅ Accessible"
        else
            log_warn "⚠️ Website not accessible via HTTP"
            HTTP_ACCESS="⚠️ Not Accessible"
        fi
    fi
    
    log_info "Installation verification completed"
}

# Show installation summary
show_summary() {
    echo ""
    log_info "🎉 PteroLite installation completed!"
    echo "================================"
    
    # Service Status Summary
    echo ""
    log_info "📊 SERVICE STATUS SUMMARY:"
    echo "================================"
    printf "%-20s %s\n" "Backend Service:" "$BACKEND_STATUS"
    printf "%-20s %s\n" "Nginx Server:" "$NGINX_STATUS"
    printf "%-20s %s\n" "Docker Service:" "$DOCKER_STATUS"
    printf "%-20s %s\n" "Backend Port:" "$PORT_STATUS"
    printf "%-20s %s\n" "HTTP Access:" "$HTTP_ACCESS"
    
    # Installation Details
    echo ""
    log_info "📋 INSTALLATION DETAILS:"
    echo "================================"
    log_info "Domain: $DOMAIN"
    log_info "API Key: $API_KEY"
    log_info "Backend Port: 8088"
    log_info "Install Directory: $INSTALL_DIR"
    log_info "Web Root: $WEB_ROOT"
    log_info "GitHub Repository: $GITHUB_REPO"
    
    # Access Information
    echo ""
    log_info "🌐 ACCESS INFORMATION:"
    echo "================================"
    if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
        log_info "Web Panel: http://localhost:8088 (No Authentication Required)"
        log_info "Web Panel (IP): http://$(hostname -I | awk '{print $1}'):8088"
        log_info "API Eksternal: http://localhost:8088/api (Requires X-API-Key header)"
        log_info "API Eksternal (IP): http://$(hostname -I | awk '{print $1}'):8088/api"
        log_info "Mode: Localhost Only (Direct Port Access, No Authentication)"
        PANEL_URL="http://localhost:8088"
    elif [[ "$SSL_ENABLED" == "true" ]]; then
        log_info "Web Panel HTTP: http://$DOMAIN (No Authentication Required)"
        log_info "Web Panel HTTPS: https://$DOMAIN (No Authentication Required)"
        log_info "API Eksternal HTTP: http://$DOMAIN/external-api (Requires X-API-Key header)"
        log_info "API Eksternal HTTPS: https://$DOMAIN/external-api (Requires X-API-Key header)"
        log_info "Note: No automatic redirect to HTTPS - both HTTP and HTTPS work"
        PANEL_URL="http://$DOMAIN"
    else
        log_info "Web Panel: http://$DOMAIN (No Authentication Required)"
        log_info "API Eksternal: http://$DOMAIN/external-api (Requires X-API-Key header)"
        PANEL_URL="http://$DOMAIN"
    fi
    
    # Features
    echo ""
    log_info "🚀 AVAILABLE FEATURES:"
    echo "================================"
    log_info "• 🐳 Container Management - Create, start, stop, delete Docker containers"
    log_info "• 📁 File Manager - Upload, edit, delete files & extract ZIP"
    log_info "• 💻 Console Terminal - Execute server commands"
    log_info "• ⚡ Script Executor - Run JavaScript (Node.js) & Python scripts"
    log_info "• 🔧 Startup Manager - Manage startup commands"
    log_info "• 🐋 Docker Image Manager - Manage Docker images"
    log_info "• 🌐 No Authentication Required - Direct access to web panel"
    log_info "• 🔓 Open Access - All users can manage all containers"
    
    # Management Commands
    echo ""
    log_info "🔧 MANAGEMENT COMMANDS:"
    echo "================================"
    log_info "• View backend logs: journalctl -u pterolite -f"
    log_info "• Restart backend: systemctl restart pterolite"
    log_info "• Stop backend: systemctl stop pterolite"
    log_info "• Check backend status: systemctl status pterolite"
    if [[ "$INSTALLATION_MODE" != "localhost" ]]; then
        log_info "• Check nginx status: systemctl status nginx"
        log_info "• Restart nginx: systemctl restart nginx"
    fi
    log_info "• Check docker status: systemctl status docker"
    
    # Security Information
    echo ""
    log_info "🔐 SECURITY INFORMATION:"
    echo "================================"
    log_info "• Web Panel: No authentication required - direct access"
    log_info "• API key for external access: $API_KEY"
    log_info "• External API requires X-API-Key header: /external-api/*"
    log_info "• All users have full access to all containers and files"
    
    echo ""
    log_info "🎯 NEXT STEPS:"
    echo "================================"
    log_info "1. Visit $PANEL_URL to access the web panel"
    log_info "2. Create your first container to get started"
    log_info "3. Upload files and manage your containers"
    log_info "4. Use the console to run commands and scripts"
    log_info "5. Enjoy the full container management experience"
    
    # Save installation info
    cat > "$INSTALL_DIR/installation-info.txt" <<EOF
PteroLite Installation Information
================================
Installation Date: $(date)
Domain: $DOMAIN
Panel URL: $PANEL_URL
API Key: $API_KEY
Install Directory: $INSTALL_DIR
Web Root: $WEB_ROOT
GitHub Repository: $GITHUB_REPO
Authentication: Disabled (No login required)

Services:
- Backend: systemd service (pterolite)
- Web Server:
