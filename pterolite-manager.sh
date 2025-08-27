#!/bin/bash
# PteroLite Manager - Complete Installation Management Script (Curl Version)
set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
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

log_success() {
    echo -e "${CYAN}[SUCCESS]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        log_error "Please run: sudo bash $0"
        exit 1
    fi
}

# Show main menu
show_main_menu() {
    clear
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║                    🐳 PteroLite Manager                      ║${NC}"
    echo -e "${PURPLE}║                  Complete Installation Tool                  ║${NC}"
    echo -e "${PURPLE}║                     (GitHub Curl Version)                   ║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}Choose an option:${NC}"
    echo ""
    echo -e "${GREEN}1)${NC} 🆕 Fresh Install - Install PteroLite for the first time"
    echo -e "${BLUE}2)${NC} 🔄 Reinstall - Reinstall PteroLite (preserves configuration)"
    echo -e "${YELLOW}3)${NC} ⬆️  Update - Update PteroLite to latest version"
    echo -e "${PURPLE}4)${NC} ℹ️  Status - Check PteroLite installation status"
    echo -e "${CYAN}5)${NC} 🔧 Manage Services - Start/Stop/Restart services"
    echo -e "${RED}6)${NC} 🗑️  Uninstall - Completely remove PteroLite"
    echo -e "${GREEN}0)${NC} ❌ Exit"
    echo ""
}

# Check installation status
check_installation_status() {
    INSTALL_DIR="/opt/pterolite"
    WEB_ROOT="/var/www/pterolite"
    
    # Check if backend exists
    if [[ -d "$INSTALL_DIR" && -f "$INSTALL_DIR/server.js" ]]; then
        BACKEND_INSTALLED=true
    else
        BACKEND_INSTALLED=false
    fi
    
    # Check systemd service
    if systemctl list-unit-files | grep -q "pterolite.service"; then
        SERVICE_INSTALLED=true
        if systemctl is-active --quiet pterolite; then
            SERVICE_STATUS="✅ Running"
        else
            SERVICE_STATUS="⚠️ Stopped"
        fi
    else
        SERVICE_INSTALLED=false
        SERVICE_STATUS="❌ Not installed"
    fi
    
    # Detect installation mode
    if [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        DOMAIN=$(grep "server_name" "/etc/nginx/sites-available/pterolite.conf" | head -1 | awk '{print $2}' | sed 's/;//')
        if [[ -n "$DOMAIN" && "$DOMAIN" != "localhost" && "$DOMAIN" != "_" ]]; then
            INSTALLATION_MODE="domain"
        else
            INSTALLATION_MODE="localhost"
        fi
    elif [[ -f "$INSTALL_DIR/public/index.html" ]]; then
        INSTALLATION_MODE="localhost"
        DOMAIN="localhost"
    elif [[ -f "$WEB_ROOT/index.html" ]]; then
        INSTALLATION_MODE="domain"
    else
        INSTALLATION_MODE="unknown"
    fi
    
    # Check nginx
    if systemctl is-active --quiet nginx; then
        NGINX_STATUS="✅ Running"
    else
        NGINX_STATUS="⚠️ Not running"
    fi
    
    # Check docker
    if systemctl is-active --quiet docker; then
        DOCKER_STATUS="✅ Running"
    else
        DOCKER_STATUS="⚠️ Not running"
    fi
    
    # Get API key if exists
    if [[ -f "$INSTALL_DIR/.env" ]]; then
        API_KEY=$(grep "API_KEY=" "$INSTALL_DIR/.env" | cut -d'=' -f2 2>/dev/null || echo "Not found")
    else
        API_KEY="Not found"
    fi
}

# Show status
show_status() {
    check_installation_status
    
    echo ""
    echo -e "${CYAN}📊 PteroLite Installation Status${NC}"
    echo "=================================="
    printf "%-20s %s\n" "Backend:" "$([ "$BACKEND_INSTALLED" = true ] && echo "✅ Installed" || echo "❌ Not installed")"
    printf "%-20s %s\n" "Service:" "$SERVICE_STATUS"
    printf "%-20s %s\n" "Installation Mode:" "$INSTALLATION_MODE"
    printf "%-20s %s\n" "Domain:" "${DOMAIN:-"Not set"}"
    printf "%-20s %s\n" "Nginx:" "$NGINX_STATUS"
    printf "%-20s %s\n" "Docker:" "$DOCKER_STATUS"
    printf "%-20s %s\n" "API Key:" "${API_KEY:0:16}..."
    
    if [[ "$INSTALLATION_MODE" == "localhost" ]]; then
        echo ""
        echo -e "${GREEN}🌐 Access Information:${NC}"
        echo "• Web Panel: http://localhost:8088"
        echo "• Web Panel (IP): http://$(hostname -I | awk '{print $1}'):8088"
        echo "• API: http://localhost:8088/api"
    elif [[ "$INSTALLATION_MODE" == "domain" && -n "$DOMAIN" ]]; then
        echo ""
        echo -e "${GREEN}🌐 Access Information:${NC}"
        echo "• Web Panel: http://$DOMAIN"
        echo "• API: http://$DOMAIN/external-api"
        
        # Check SSL
        if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
            echo "• HTTPS: https://$DOMAIN"
        fi
    fi
    
    echo ""
    read -p "Press Enter to continue..."
}

# Fresh install
fresh_install() {
    log_step "Starting fresh installation..."
    
    # Check if already installed
    if [[ "$BACKEND_INSTALLED" == true ]]; then
        log_warn "PteroLite is already installed!"
        echo ""
        read -p "Do you want to continue with fresh install? This will overwrite existing installation (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Fresh install cancelled"
            return
        fi
    fi
    
    log_info "This will download and run the installation script from GitHub"
    log_info "You will be prompted to choose installation mode (Domain or Localhost)"
    
    read -p "Continue with installation? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        return
    fi
    
    # Run the install script using curl
    log_step "Executing installation script from GitHub..."
    echo ""
    
    if bash <(curl -s https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/install_pterolite.sh); then
        log_success "Fresh installation completed successfully!"
    else
        log_error "Installation failed!"
    fi
    
    echo ""
    read -p "Press Enter to continue..."
}

# Reinstall
reinstall() {
    log_step "Starting reinstall process..."
    
    if [[ "$BACKEND_INSTALLED" != true ]]; then
        log_error "PteroLite is not installed. Use Fresh Install instead."
        read -p "Press Enter to continue..."
        return
    fi
    
    log_info "This will download and run the reinstall script from GitHub"
    log_info "Current installation will be backed up before reinstall"
    
    read -p "Continue with reinstall? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Reinstall cancelled"
        return
    fi
    
    # Run the reinstall script using curl
    log_step "Executing reinstall script from GitHub..."
    echo ""
    
    if bash <(curl -s https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/reinstall_pterolite.sh); then
        log_success "Reinstall completed successfully!"
    else
        log_error "Reinstall failed!"
    fi
    
    echo ""
    read -p "Press Enter to continue..."
}

# Update
update() {
    log_step "Starting update process..."
    
    if [[ "$BACKEND_INSTALLED" != true ]]; then
        log_error "PteroLite is not installed. Use Fresh Install instead."
        read -p "Press Enter to continue..."
        return
    fi
    
    log_info "This will download and run the update script from GitHub"
    log_info "Current installation will be updated to the latest version"
    
    read -p "Continue with update? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Update cancelled"
        return
    fi
    
    # Run the update script using curl
    log_step "Executing update script from GitHub..."
    echo ""
    
    if bash <(curl -s https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/update_pterolite.sh); then
        log_success "Update completed successfully!"
    else
        log_error "Update failed!"
    fi
    
    echo ""
    read -p "Press Enter to continue..."
}

# Uninstall
uninstall() {
    log_step "Starting uninstall process..."
    
    if [[ "$BACKEND_INSTALLED" != true ]]; then
        log_warn "PteroLite is not installed."
        read -p "Press Enter to continue..."
        return
    fi
    
    echo ""
    log_warn "⚠️  WARNING: This will completely remove PteroLite!"
    echo "The following will be removed:"
    echo "• Backend application (/opt/pterolite)"
    echo "• Frontend files (/var/www/pterolite)"
    echo "• Systemd service"
    echo "• Nginx configuration"
    echo "• All containers and data"
    echo ""
    
    read -p "Are you sure you want to uninstall PteroLite? Type 'UNINSTALL' to confirm: " confirm
    
    if [[ "$confirm" != "UNINSTALL" ]]; then
        log_info "Uninstall cancelled"
        return
    fi
    
    log_step "Creating final backup before uninstall..."
    FINAL_BACKUP="/opt/pterolite-final-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$FINAL_BACKUP"
    
    if [[ -d "/opt/pterolite" ]]; then
        cp -r "/opt/pterolite" "$FINAL_BACKUP/backend"
        log_info "Backend backed up to $FINAL_BACKUP/backend"
    fi
    
    if [[ -d "/var/www/pterolite" ]]; then
        cp -r "/var/www/pterolite" "$FINAL_BACKUP/frontend"
        log_info "Frontend backed up to $FINAL_BACKUP/frontend"
    fi
    
    log_step "Stopping services..."
    systemctl stop pterolite 2>/dev/null || true
    systemctl disable pterolite 2>/dev/null || true
    
    log_step "Removing files and configurations..."
    
    # Remove backend
    if [[ -d "/opt/pterolite" ]]; then
        rm -rf "/opt/pterolite"
        log_info "Removed backend directory"
    fi
    
    # Remove frontend
    if [[ -d "/var/www/pterolite" ]]; then
        rm -rf "/var/www/pterolite"
        log_info "Removed frontend directory"
    fi
    
    # Remove systemd service
    if [[ -f "/etc/systemd/system/pterolite.service" ]]; then
        rm -f "/etc/systemd/system/pterolite.service"
        systemctl daemon-reload
        log_info "Removed systemd service"
    fi
    
    # Remove nginx configuration
    if [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        rm -f "/etc/nginx/sites-available/pterolite.conf"
        rm -f "/etc/nginx/sites-enabled/pterolite.conf"
        systemctl reload nginx 2>/dev/null || true
        log_info "Removed nginx configuration"
    fi
    
    # Remove any remaining files
    rm -f /opt/rollback_pterolite.sh 2>/dev/null || true
    
    log_success "PteroLite has been completely uninstalled!"
    log_info "Final backup saved at: $FINAL_BACKUP"
    
    echo ""
    read -p "Press Enter to continue..."
}

# Manage services
manage_services() {
    while true; do
        clear
        echo -e "${CYAN}🔧 Service Management${NC}"
        echo "====================="
        
        check_installation_status
        
        if [[ "$BACKEND_INSTALLED" != true ]]; then
            log_error "PteroLite is not installed."
            read -p "Press Enter to return to main menu..."
            return
        fi
        
        echo ""
        echo "Current Status:"
        printf "%-20s %s\n" "PteroLite Service:" "$SERVICE_STATUS"
        printf "%-20s %s\n" "Nginx:" "$NGINX_STATUS"
        printf "%-20s %s\n" "Docker:" "$DOCKER_STATUS"
        
        echo ""
        echo "Choose an action:"
        echo "1) Start PteroLite"
        echo "2) Stop PteroLite"
        echo "3) Restart PteroLite"
        echo "4) View Logs"
        echo "5) Start All Services"
        echo "6) Stop All Services"
        echo "0) Back to Main Menu"
        echo ""
        
        read -p "Choose option (0-6): " service_choice
        
        case $service_choice in
            1)
                log_step "Starting PteroLite service..."
                systemctl start pterolite
                log_success "PteroLite service started"
                ;;
            2)
                log_step "Stopping PteroLite service..."
                systemctl stop pterolite
                log_success "PteroLite service stopped"
                ;;
            3)
                log_step "Restarting PteroLite service..."
                systemctl restart pterolite
                log_success "PteroLite service restarted"
                ;;
            4)
                log_step "Showing PteroLite logs (Press Ctrl+C to exit)..."
                journalctl -u pterolite -f
                ;;
            5)
                log_step "Starting all services..."
                systemctl start docker
                systemctl start nginx
                systemctl start pterolite
                log_success "All services started"
                ;;
            6)
                log_step "Stopping all services..."
                systemctl stop pterolite
                systemctl stop nginx
                log_success "Services stopped"
                ;;
            0)
                return
                ;;
            *)
                log_error "Invalid choice"
                ;;
        esac
        
        if [[ "$service_choice" != "4" ]]; then
            echo ""
            read -p "Press Enter to continue..."
        fi
    done
}

# Main function
main() {
    check_root
    
    while true; do
        check_installation_status
        show_main_menu
        
        read -p "Choose option (0-6): " choice
        
        case $choice in
            1)
                fresh_install
                ;;
            2)
                reinstall
                ;;
            3)
                update
                ;;
            4)
                show_status
                ;;
            5)
                manage_services
                ;;
            6)
                uninstall
                ;;
            0)
                echo ""
                log_success "Thank you for using PteroLite Manager!"
                exit 0
                ;;
            *)
                log_error "Invalid choice. Please enter 0-6."
                sleep 2
                ;;
        esac
    done
}

# Run main function
main "$@"
