#!/bin/bash

# PteroLite Uninstall Script
# This script will completely remove PteroLite and all associated containers and data

echo "=========================================="
echo "🗑️  PteroLite Uninstall Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root for security reasons."
   exit 1
fi

echo "⚠️  WARNING: This will completely remove PteroLite and ALL associated data!"
echo "This includes:"
echo "  - All Docker containers created by PteroLite"
echo "  - All container data and files"
echo "  - PteroLite application files"
echo "  - Docker images (optional)"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [[ $confirm != "yes" ]]; then
    print_warning "Uninstall cancelled."
    exit 0
fi

echo ""
print_status "Starting PteroLite uninstall process..."

# Step 1: Stop PteroLite services
print_status "Stopping PteroLite services..."

# Stop PM2 processes
if command -v pm2 &> /dev/null; then
    print_status "Stopping PM2 processes..."
    pm2 stop pterolite-backend 2>/dev/null || true
    pm2 stop pterolite-frontend 2>/dev/null || true
    pm2 delete pterolite-backend 2>/dev/null || true
    pm2 delete pterolite-frontend 2>/dev/null || true
    pm2 save 2>/dev/null || true
    print_success "PM2 processes stopped"
else
    print_warning "PM2 not found, skipping PM2 cleanup"
fi

# Stop any running processes on ports 3000 and 8088
print_status "Stopping processes on ports 3000 and 8088..."
sudo pkill -f "node.*3000" 2>/dev/null || true
sudo pkill -f "node.*8088" 2>/dev/null || true
sudo fuser -k 3000/tcp 2>/dev/null || true
sudo fuser -k 8088/tcp 2>/dev/null || true

# Step 2: Remove all PteroLite containers
print_status "Removing all PteroLite containers..."

# Get all containers (running and stopped)
containers=$(docker ps -a --format "{{.Names}}" 2>/dev/null | grep -E "^pterolite-|^ptero-" || true)

if [ ! -z "$containers" ]; then
    print_status "Found PteroLite containers: $containers"
    
    # Stop all containers
    echo "$containers" | xargs -r docker stop 2>/dev/null || true
    print_success "Stopped all PteroLite containers"
    
    # Remove all containers
    echo "$containers" | xargs -r docker rm -f 2>/dev/null || true
    print_success "Removed all PteroLite containers"
else
    print_warning "No PteroLite containers found"
fi

# Step 3: Remove container data folders
print_status "Removing container data folders..."

if [ -d "/tmp/pterolite-containers" ]; then
    sudo rm -rf /tmp/pterolite-containers
    print_success "Removed /tmp/pterolite-containers"
else
    print_warning "Container data folder not found"
fi

if [ -d "/tmp/pterolite-files" ]; then
    sudo rm -rf /tmp/pterolite-files
    print_success "Removed /tmp/pterolite-files"
else
    print_warning "Default files folder not found"
fi

if [ -d "/tmp/pterolite-uploads" ]; then
    sudo rm -rf /tmp/pterolite-uploads
    print_success "Removed /tmp/pterolite-uploads"
else
    print_warning "Uploads folder not found"
fi

# Step 4: Ask about Docker images
echo ""
read -p "Do you want to remove Docker images used by PteroLite? (yes/no): " remove_images

if [[ $remove_images == "yes" ]]; then
    print_status "Removing Docker images..."
    
    # Remove common images that might have been used
    common_images=("node:18" "node:16" "python:3.9" "python:3.8" "ubuntu:20.04" "ubuntu:22.04" "nginx:alpine" "postgres:13")
    
    for image in "${common_images[@]}"; do
        if docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^$image$"; then
            docker rmi "$image" 2>/dev/null && print_success "Removed image: $image" || print_warning "Could not remove image: $image (might be in use)"
        fi
    done
    
    # Remove dangling images
    dangling=$(docker images -f "dangling=true" -q)
    if [ ! -z "$dangling" ]; then
        docker rmi $dangling 2>/dev/null && print_success "Removed dangling images" || print_warning "Could not remove some dangling images"
    fi
else
    print_warning "Skipping Docker image removal"
fi

# Step 5: Remove application files
print_status "Removing PteroLite application files..."

# Get current directory
CURRENT_DIR=$(pwd)

# Check if we're in a PteroLite directory
if [[ "$CURRENT_DIR" == *"pterolite"* ]] || [ -f "package.json" ] && grep -q "pterolite" package.json 2>/dev/null; then
    print_warning "You are currently in the PteroLite directory: $CURRENT_DIR"
    echo "The application files will be removed after you exit this directory."
    echo "Please run the following commands after this script completes:"
    echo "  cd .."
    echo "  rm -rf $CURRENT_DIR"
else
    print_warning "Could not automatically detect PteroLite installation directory"
    echo "Please manually remove the PteroLite directory if needed"
fi

# Step 6: Clean up system
print_status "Cleaning up system..."

# Remove any systemd services (if they exist)
if [ -f "/etc/systemd/system/pterolite.service" ]; then
    sudo systemctl stop pterolite 2>/dev/null || true
    sudo systemctl disable pterolite 2>/dev/null || true
    sudo rm -f /etc/systemd/system/pterolite.service
    sudo systemctl daemon-reload
    print_success "Removed systemd service"
fi

# Clean Docker system (optional)
read -p "Do you want to clean Docker system (remove unused containers, networks, images)? (yes/no): " clean_docker

if [[ $clean_docker == "yes" ]]; then
    print_status "Cleaning Docker system..."
    docker system prune -f 2>/dev/null && print_success "Docker system cleaned" || print_warning "Could not clean Docker system"
fi

# Step 7: Final cleanup
print_status "Performing final cleanup..."

# Remove any remaining temp files
sudo rm -rf /tmp/pterolite-* 2>/dev/null || true

# Clear any cached data
if [ -d "$HOME/.pm2" ]; then
    rm -rf "$HOME/.pm2/logs/pterolite*" 2>/dev/null || true
fi

echo ""
echo "=========================================="
print_success "🎉 PteroLite Uninstall Complete!"
echo "=========================================="
echo ""
echo "Summary of what was removed:"
echo "  ✅ All PteroLite containers stopped and removed"
echo "  ✅ All container data folders deleted"
echo "  ✅ PM2 processes stopped and removed"
echo "  ✅ Temporary files cleaned up"
if [[ $remove_images == "yes" ]]; then
    echo "  ✅ Docker images removed"
fi
if [[ $clean_docker == "yes" ]]; then
    echo "  ✅ Docker system cleaned"
fi
echo ""
echo "Note: If you installed PteroLite in a specific directory,"
echo "you may need to manually remove that directory."
echo ""
print_warning "If you want to reinstall PteroLite in the future,"
print_warning "you can download it again from the official repository."
echo ""
