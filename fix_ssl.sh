#!/bin/bash
# PteroLite SSL Fix Script
set -e

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

# Get domain from nginx config
get_domain() {
    if [[ -f "/etc/nginx/sites-available/pterolite.conf" ]]; then
        DOMAIN=$(grep "server_name" "/etc/nginx/sites-available/pterolite.conf" | head -1 | awk '{print $2}' | sed 's/;//')
        if [[ -n "$DOMAIN" ]]; then
            log_info "Found domain: $DOMAIN"
        else
            log_error "Could not extract domain from nginx config"
            exit 1
        fi
    else
        log_error "Nginx config not found"
        exit 1
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

# Fix nginx configuration for SSL
fix_nginx_ssl_config() {
    log_step "Fixing nginx SSL configuration..."
    
    WEB_ROOT="/var/www/pterolite"
    
    if [[ "$SSL_STATUS" == "valid" ]]; then
        log_info "Creating nginx configuration with SSL support..."
        cat > /etc/nginx/sites-available/pterolite.conf <<EOF
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server
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
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
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
    fi
    
    # Test nginx configuration
    log_info "Testing nginx configuration..."
    if nginx -t; then
        log_info "Nginx configuration is valid"
        systemctl reload nginx
        log_info "Nginx reloaded successfully"
    else
        log_error "Nginx configuration test failed"
        exit 1
    fi
}

# Renew or install SSL certificate
fix_ssl_certificate() {
    log_step "Fixing SSL certificate..."
    
    case $SSL_STATUS in
        "missing")
            log_info "Installing new SSL certificate..."
            read -p "Enter email address for Let's Encrypt: " ssl_email
            if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$ssl_email"; then
                log_info "SSL certificate installed successfully"
                SSL_STATUS="valid"
            else
                log_error "Failed to install SSL certificate"
                return 1
            fi
            ;;
        "expired")
            log_info "Renewing expired SSL certificate..."
            if certbot renew --nginx; then
                log_info "SSL certificate renewed successfully"
                SSL_STATUS="valid"
            else
                log_error "Failed to renew SSL certificate"
                return 1
            fi
            ;;
        "valid")
            log_info "SSL certificate is already valid"
            ;;
    esac
}

# Test HTTPS access
test_https_access() {
    log_step "Testing HTTPS access..."
    
    if [[ "$SSL_STATUS" == "valid" ]]; then
        log_info "Testing HTTPS connection..."
        if curl -s -I "https://$DOMAIN" | grep -q "HTTP/"; then
            log_info "✅ HTTPS is working correctly"
            return 0
        else
            log_error "❌ HTTPS is not accessible"
            return 1
        fi
    else
        log_info "Testing HTTP connection..."
        if curl -s -I "http://$DOMAIN" | grep -q "HTTP/"; then
            log_info "✅ HTTP is working correctly"
            return 0
        else
            log_error "❌ HTTP is not accessible"
            return 1
        fi
    fi
}

# Show status summary
show_summary() {
    echo ""
    log_info "🔒 SSL Fix Summary"
    echo "================================"
    
    log_info "Domain: $DOMAIN"
    log_info "SSL Status: $SSL_STATUS"
    
    if [[ "$SSL_STATUS" == "valid" ]]; then
        log_info "✅ HTTPS: https://$DOMAIN"
        log_info "✅ HTTP redirects to HTTPS automatically"
    else
        log_info "🌐 HTTP: http://$DOMAIN"
        log_warn "⚠️ HTTPS not available"
    fi
    
    echo ""
    log_info "🔧 Useful Commands:"
    echo "================================"
    log_info "• Check SSL certificate: certbot certificates"
    log_info "• Renew SSL certificate: certbot renew"
    log_info "• Test nginx config: nginx -t"
    log_info "• Reload nginx: systemctl reload nginx"
    log_info "• Check nginx status: systemctl status nginx"
}

# Main function
main() {
    echo ""
    echo "🔒 PteroLite SSL Fix Script"
    echo "=========================="
    echo "This script will diagnose and fix SSL/HTTPS issues"
    echo ""
    
    check_root
    get_domain
    check_ssl_status
    
    echo ""
    log_info "Current SSL Status: $SSL_STATUS"
    echo ""
    
    # Ask user what to do
    case $SSL_STATUS in
        "missing")
            echo "SSL certificate is missing. Options:"
            echo "1) Install new SSL certificate with Let's Encrypt"
            echo "2) Configure for HTTP only"
            echo "3) Exit"
            read -p "Choose option (1-3): " choice
            case $choice in
                1) fix_ssl_certificate && fix_nginx_ssl_config ;;
                2) fix_nginx_ssl_config ;;
                3) exit 0 ;;
                *) log_error "Invalid choice"; exit 1 ;;
            esac
            ;;
        "expired")
            echo "SSL certificate has expired. Options:"
            echo "1) Renew SSL certificate"
            echo "2) Configure for HTTP only"
            echo "3) Exit"
            read -p "Choose option (1-3): " choice
            case $choice in
                1) fix_ssl_certificate && fix_nginx_ssl_config ;;
                2) SSL_STATUS="missing"; fix_nginx_ssl_config ;;
                3) exit 0 ;;
                *) log_error "Invalid choice"; exit 1 ;;
            esac
            ;;
        "valid")
            echo "SSL certificate is valid but HTTPS might not be working. Options:"
            echo "1) Fix nginx SSL configuration"
            echo "2) Test HTTPS access only"
            echo "3) Exit"
            read -p "Choose option (1-3): " choice
            case $choice in
                1) fix_nginx_ssl_config ;;
                2) ;; # Just test access
                3) exit 0 ;;
                *) log_error "Invalid choice"; exit 1 ;;
            esac
            ;;
    esac
    
    # Test access
    test_https_access
    
    # Show summary
    show_summary
    
    echo ""
    if [[ "$SSL_STATUS" == "valid" ]]; then
        log_info "🎉 SSL fix completed! HTTPS should now be working."
    else
        log_info "🌐 Configuration updated for HTTP access."
    fi
}

# Run main function
main "$@"
