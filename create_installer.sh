#!/bin/bash
# Create Standalone Installer for PteroLite
# This script creates a self-contained installer that can be downloaded and run

set -e

# Configuration
INSTALLER_NAME="pterolite-installer.sh"
GITHUB_REPO="https://github.com/MyMasWayVPN/pterolite-full"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Create standalone installer
create_installer() {
    log_step "Creating standalone installer..."
    
    cat > "$INSTALLER_NAME" <<'EOF'
#!/bin/bash
# PteroLite Standalone Installer
# This installer downloads and installs PteroLite from GitHub

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
        log_error "Please run: sudo bash $0"
        exit 1
    fi
}

# Check system compatibility
check_system() {
    log_step "Checking system compatibility..."
    
    # Check OS
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        log_info "Detected OS: $NAME $VERSION"
        
        case $ID in
            ubuntu|debian)
                log_info "✅ Supported OS detected"
                ;;
            centos|rhel|fedora)
                log_warn "⚠️ CentOS/RHEL/Fedora detected - may need manual adjustments"
                ;;
            *)
                log_warn "⚠️ Unsupported OS detected - proceeding anyway"
                ;;
        esac
    else
        log_warn "⚠️ Could not detect OS version"
    fi
    
    # Check architecture
    ARCH=$(uname -m)
    case $ARCH in
        x86_64|amd64)
            log_info "✅ Supported architecture: $ARCH"
            ;;
        aarch64|arm64)
            log_info "✅ Supported architecture: $ARCH"
            ;;
        *)
            log_warn "⚠️ Unsupported architecture: $ARCH"
            ;;
    esac
    
    # Check available space
    AVAILABLE_SPACE=$(df / | awk 'NR==2 {print $4}')
    REQUIRED_SPACE=5242880  # 5GB in KB
    
    if [[ $AVAILABLE_SPACE -gt $REQUIRED_SPACE ]]; then
        log_info "✅ Sufficient disk space available"
    else
        log_warn "⚠️ Low disk space - installation may fail"
    fi
    
    # Check memory
    TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
    if [[ $TOTAL_MEM -gt 1024 ]]; then
        log_info "✅ Sufficient memory available: ${TOTAL_MEM}MB"
    else
        log_warn "⚠️ Low memory detected: ${TOTAL_MEM}MB - may affect performance"
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
    
    # Remove existing Node.js
    apt-get remove -y nodejs npm 2>/dev/null || true
    
    # Install Node.js 18
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

# Interactive domain input
get_domain() {
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

# Interactive SSL setup
setup_ssl_interactive() {
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
                    read -p "Enter email address for Let's Encrypt notifications: " ssl_email
                    if [[ "$ssl_email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
                        break
                    else
                        log_error "Invalid email format. Please enter a valid email address."
                    fi
                done
                
                # Attempt SSL certificate installation
                log_info "Installing SSL certificate for $DOMAIN..."
                if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$ssl_email"; then
                    log_info "SSL certificate installed successfully!"
                    log_info "Your site is now available at: https://$DOMAIN"
                else
                    log_warn "SSL certificate installation failed."
                    log_warn "Your site is available at: http://$DOMAIN"
                    log_warn "You can try installing SSL manually later with:"
                    log_warn "certbot --nginx -d $DOMAIN"
                fi
                break
                ;;
            2)
                log_warn "Skipping SSL setup. Your site will be available at: http://$DOMAIN"
                log_warn "This is not recommended for production use."
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
    
    # Install additional dependencies for new features
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
    
    # Create web root and copy built frontend
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

# Configure Nginx
configure_nginx() {
    log_step "Configuring Nginx..."
    
    # Create nginx configuration
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
    
    # Check Nginx service
    if systemctl is-active --quiet nginx; then
        log_info "✅ Nginx web server is running"
        NGINX_STATUS="✅ Running"
    else
        log_error "❌ Nginx failed to start"
        NGINX_STATUS="❌ Failed"
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
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost" | grep -q "200\|301\|302"; then
        log_info "✅ Website is accessible via HTTP"
        HTTP_ACCESS="✅ Accessible"
    else
        log_warn "⚠️ Website not accessible via HTTP"
        HTTP_ACCESS="⚠️ Not Accessible"
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
    if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
        log_info "Web Panel: https://$DOMAIN (tanpa authentication)"
        log_info "API Eksternal: https://$DOMAIN/external-api (perlu X-API-Key header)"
    else
        log_info "Web Panel: http://$DOMAIN (tanpa authentication)"
        log_info "API Eksternal: http://$DOMAIN/external-api (perlu X-API-Key header)"
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
    
    # Management Commands
    echo ""
    log_info "🔧 MANAGEMENT COMMANDS:"
    echo "================================"
    log_info "• View backend logs: journalctl -u pterolite -f"
    log_info "• Restart backend: systemctl restart pterolite"
    log_info "• Stop backend: systemctl stop pterolite"
    log_info "• Check backend status: systemctl status pterolite"
    log_info "• Check nginx status: systemctl status nginx"
    log_info "• Restart nginx: systemctl restart nginx"
    log_info "• Check docker status: systemctl status docker"
    
    # Security Reminder
    echo ""
    log_info "🔐 SECURITY REMINDER:"
    echo "================================"
    log_info "• Web Panel dapat diakses langsung tanpa API key"
    log_info "• API key untuk akses eksternal: $API_KEY"
    log_info "• API key hanya diperlukan untuk endpoint /external-api/*"
    log_info "• Gunakan X-API-Key header untuk authentication API eksternal"
    
    # Save installation info
    cat > "$INSTALL_DIR/installation-info.txt" <<EOF
PteroLite Installation Information
================================
Installation Date: $(date)
Domain: $DOMAIN
API Key: $API_KEY
Install Directory: $INSTALL_DIR
Web Root: $WEB_ROOT
GitHub Repository: $GITHUB_REPO

Services:
- Backend: systemd service (pterolite)
- Web Server: Nginx
- Docker: Container Management
- SSL: Let's Encrypt (if configured)

Commands:
- View backend logs: journalctl -u pterolite -f
- Restart backend: systemctl restart pterolite
- Check backend status: systemctl status pterolite
- Check nginx status: systemctl status nginx
- Renew SSL: certbot renew

Features:
- Container Management
- File Manager
- Console Terminal
- Script Executor
- Startup Manager
- Docker Image Manager
EOF
    
    log_info "Installation information saved to $INSTALL_DIR/installation-info.txt"
}

# Cleanup temporary files
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -rf "$TEMP_DIR"
    log_info "Cleanup completed"
}

# Main installation function
main() {
    echo ""
    echo "🐳 PteroLite Standalone Installer"
    echo "================================="
    echo "This installer will download and install PteroLite from:"
    echo "$GITHUB_REPO"
    echo ""
    echo "Features to be installed:"
    echo "• Container Management with Docker"
    echo "• File Manager with upload/download"
    echo "• Console Terminal"
    echo "• Script Executor (JavaScript & Python)"
    echo "• Startup Manager"
    echo "• Docker Image Manager"
    echo ""
    
    # Check prerequisites
    check_root
    check_system
    
    # Interactive domain input
    get_domain
    
    # System updates
    log_step "Updating system packages..."
    apt-get update && apt-get upgrade -y
    
    # Install basic dependencies
    log_info "Installing basic dependencies..."
    apt-get install -y curl git nginx certbot python3-certbot-nginx openssl build-essential python3 python3-pip unzip wget net-tools
    
    # Install Node.js if needed
    if ! check_node_version; then
        install_nodejs
    fi
    
    # Install Docker
    if ! command -v docker >/dev/null 2>&1; then
        install_docker
    else
        log_info "Docker already installed"
    fi
    
    # Download project from GitHub
    download_project
    
    # Setup components
    setup_backend
    setup_frontend
    start_services
    configure_nginx
    
    # Interactive SSL setup
    setup_ssl_interactive
    
    # Verify installation
    verify_installation
    
    # Show summary
    show_summary
    
    # Cleanup
    cleanup
    
    # Final status
    echo ""
    if [[ "$BACKEND_STATUS" == "✅ Running" && "$NGINX_STATUS" == "✅ Running" ]]; then
        log_info "🎉 Installation completed successfully! All core services are running."
        log_info "🌐 Visit your domain to start using PteroLite: $DOMAIN"
    else
        log_warn "⚠️ Installation completed with some issues. Please check the service status above."
    fi
    echo ""
}

# Run main function
main "$@"
EOF
    
    chmod +x "$INSTALLER_NAME"
    log_info "Standalone installer created: $INSTALLER_NAME"
}

# Create download instructions
create_download_instructions() {
    log_step "Creating download instructions..."
    
    cat > "DOWNLOAD_INSTRUCTIONS.md" <<EOF
# PteroLite Download & Installation Instructions

## Quick Installation Methods

### Method 1: Direct Download & Run (Recommended)
\`\`\`bash
# Download and run installer in one command
curl -fsSL https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/pterolite-installer.sh | sudo bash
\`\`\`

### Method 2: Download First, Then Run
\`\`\`bash
# Download installer
wget https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/pterolite-installer.sh

# Make executable
chmod +x pterolite-installer.sh

# Run installer
sudo bash pterolite-installer.sh
\`\`\`

### Method 3: Clone Repository
\`\`\`bash
# Clone repository
git clone https://github.com/MyMasWayVPN/pterolite-full.git
cd pterolite-full

# Run installer
sudo bash install_pterolite.sh
\`\`\`

## Alternative Installers

### Update Existing Installation
\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/update_pterolite.sh | sudo bash
\`\`\`

### Reinstall (Clean Install)
\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/reinstall_pterolite.sh | sudo bash
\`\`\`

## System Requirements

- **OS**: Ubuntu 18.04+ / Debian 10+ / CentOS 7+
- **RAM**: 1GB minimum, 2GB recommended
- **Storage**: 5GB free space
- **Network**: Internet connection
- **Permissions**: Root access (sudo)

## What Gets Installed

- Node.js 18 LTS
- Docker CE
- Nginx with SSL support
- PM2 Process Manager
- PteroLite Backend & Frontend
- All required dependencies

## Post-Installation

After installation, you'll get:
- Web Panel URL
- API Key for external access
- Management commands
- Service status information

## Support

- GitHub Issues: https://github.com/MyMasWayVPN/pterolite-full/issues
- Documentation: https://github.com/MyMasWayVPN/pterolite-full/wiki
EOF
    
    log_info "Download instructions created: DOWNLOAD_INSTRUCTIONS.md"
}

# Main function
main() {
    echo ""
    echo "🔧 PteroLite Installer Creator"
    echo "=============================="
    echo "This script creates a standalone installer for PteroLite"
    echo ""
    
    create_installer
    create_download_instructions
    
    echo ""
    log_info "✅ Installer creation completed!"
    echo ""
    log_info "📁 Files created:"
    log_info "  • $INSTALLER_NAME - Standalone installer"
    log_info "  • DOWNLOAD_INSTRUCTIONS.md - Download instructions"
    echo ""
    log_info "🚀 Usage:"
    log_info "  • Upload $INSTALLER_NAME to your GitHub repository"
    log_info "  • Users can download and run: sudo bash $INSTALLER_NAME"
    log_info "  • Or use direct download: curl -fsSL [raw-github-url] | sudo bash"
    echo ""
}

# Run main function
main "$@"
