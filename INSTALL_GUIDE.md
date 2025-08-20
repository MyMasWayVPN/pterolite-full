# PteroLite Installation Guide - GitHub Version

## 📋 Overview

PteroLite adalah platform manajemen container Docker yang powerful dengan web interface yang user-friendly. Installer ini akan mengunduh dan menginstall PteroLite langsung dari GitHub repository.

## 🚀 Quick Installation

### Metode 1: Download dan Install (Recommended)

```bash
# Download installer
wget https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/install_pterolite.sh

# Make executable
chmod +x install_pterolite.sh

# Run installer
sudo bash install_pterolite.sh
```

### Metode 2: Clone Repository

```bash
# Clone repository
git clone https://github.com/MyMasWayVPN/pterolite-full.git
cd pterolite-full

# Run installer
sudo bash install_pterolite.sh
```

## 📋 System Requirements

### Minimum Requirements
- **OS**: Ubuntu 18.04+ / Debian 10+ / CentOS 7+
- **RAM**: 1GB minimum, 2GB recommended
- **Storage**: 5GB free space
- **Network**: Internet connection for downloading dependencies

### Required Permissions
- Root access (sudo)
- Port 80 dan 443 terbuka (untuk web access)
- Port 8088 terbuka (untuk backend API)

## 🔧 Pre-Installation Checklist

1. **Update System**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Check Available Space**
   ```bash
   df -h
   ```

3. **Verify Internet Connection**
   ```bash
   ping -c 4 google.com
   ```

4. **Check Domain DNS** (jika menggunakan domain)
   ```bash
   nslookup your-domain.com
   ```

## 📦 What Gets Installed

### System Dependencies
- **Node.js 18 LTS** - Runtime untuk backend
- **Docker CE** - Container management
- **Nginx** - Web server dan reverse proxy
- **PM2** - Process manager untuk backend
- **Certbot** - SSL certificate management
- **Python3** - Script execution support

### PteroLite Components
- **Backend API** - Express.js server di port 8088
- **Frontend Web Panel** - React application dengan Vite
- **Container Management** - Docker integration
- **File Manager** - Upload/download/edit files
- **Console Terminal** - Command execution
- **Script Executor** - JavaScript & Python support

## 🎯 Installation Process

### Step 1: Domain Configuration
Installer akan meminta domain name:
```
Enter your domain name (e.g., pterolite.xmwstore.web.id): 
```

**Format yang didukung:**
- `pterolite.example.com`
- `panel.mydomain.net`
- `pterolite.xmwstore.web.id`

### Step 2: SSL Certificate Setup
Pilihan SSL certificate:
```
SSL Certificate options:
1) Install Let's Encrypt SSL certificate (recommended)
2) Skip SSL setup (HTTP only - not recommended for production)
```

**Recommended**: Pilih option 1 untuk SSL otomatis

### Step 3: Automatic Installation
Installer akan otomatis:
1. ✅ Update system packages
2. ✅ Install Node.js 18 LTS
3. ✅ Install Docker CE
4. ✅ Download PteroLite dari GitHub
5. ✅ Setup backend dengan PM2
6. ✅ Build dan deploy frontend
7. ✅ Configure Nginx
8. ✅ Setup SSL certificate (jika dipilih)
9. ✅ Verify installation

## 🌐 Post-Installation

### Access Information
Setelah instalasi selesai, Anda akan mendapat informasi:

```
🌐 ACCESS INFORMATION:
================================
Web Panel: https://your-domain.com (tanpa authentication)
API Eksternal: https://your-domain.com/external-api (perlu X-API-Key header)
```

### API Key
API key akan di-generate otomatis dan ditampilkan:
```
API Key: [64-character-hex-string]
```

**⚠️ PENTING**: Simpan API key ini dengan aman!

### Available Features
- 🐳 **Container Management** - Create, start, stop, delete Docker containers
- 📁 **File Manager** - Upload, edit, delete files & extract ZIP
- 💻 **Console Terminal** - Execute server commands
- ⚡ **Script Executor** - Run JavaScript (Node.js) & Python scripts
- 🔧 **Startup Manager** - Manage startup commands
- 🐋 **Docker Image Manager** - Manage Docker images

## 🔧 Management Commands

### Backend Management
```bash
# View logs
pm2 logs pterolite

# Restart backend
pm2 restart pterolite

# Stop backend
pm2 stop pterolite

# Check status
pm2 status
```

### Web Server Management
```bash
# Check nginx status
systemctl status nginx

# Restart nginx
systemctl restart nginx

# Reload nginx config
systemctl reload nginx

# Test nginx config
nginx -t
```

### Docker Management
```bash
# Check docker status
systemctl status docker

# View containers
docker ps -a

# View images
docker images
```

### SSL Certificate Management
```bash
# Check certificate status
certbot certificates

# Renew certificates
certbot renew

# Test renewal
certbot renew --dry-run
```

## 🔄 Update & Maintenance

### Update PteroLite
```bash
# Download update script
wget https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/update_pterolite.sh
chmod +x update_pterolite.sh

# Run update
sudo bash update_pterolite.sh
```

### Reinstall PteroLite
```bash
# Download reinstall script
wget https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/reinstall_pterolite.sh
chmod +x reinstall_pterolite.sh

# Run reinstall
sudo bash reinstall_pterolite.sh
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. Installation Failed
```bash
# Check system requirements
cat /etc/os-release
free -h
df -h

# Check internet connection
ping -c 4 github.com

# Re-run installer
sudo bash install_pterolite.sh
```

#### 2. Backend Not Starting
```bash
# Check PM2 logs
pm2 logs pterolite

# Check port usage
netstat -tulpn | grep 8088

# Restart backend
pm2 restart pterolite
```

#### 3. Frontend Not Loading
```bash
# Check nginx status
systemctl status nginx

# Check nginx logs
tail -f /var/log/nginx/error.log

# Check web root
ls -la /var/www/pterolite/
```

#### 4. SSL Certificate Issues
```bash
# Check certificate
certbot certificates

# Manual SSL setup
certbot --nginx -d your-domain.com

# Check nginx SSL config
nginx -t
```

#### 5. Docker Issues
```bash
# Check docker status
systemctl status docker

# Start docker
systemctl start docker

# Check docker permissions
docker ps
```

### Log Locations
- **Backend Logs**: `pm2 logs pterolite`
- **Nginx Access**: `/var/log/nginx/access.log`
- **Nginx Error**: `/var/log/nginx/error.log`
- **System Logs**: `journalctl -u nginx` atau `journalctl -u docker`

### Configuration Files
- **Backend**: `/opt/pterolite/`
- **Frontend**: `/var/www/pterolite/`
- **Nginx**: `/etc/nginx/sites-available/pterolite.conf`
- **Environment**: `/opt/pterolite/.env`

## 🔐 Security Considerations

### API Security
- Web panel dapat diakses langsung tanpa API key
- API key hanya diperlukan untuk endpoint `/external-api/*`
- Gunakan HTTPS untuk production
- Simpan API key dengan aman

### System Security
- Gunakan firewall (ufw/iptables)
- Update system secara berkala
- Monitor logs secara rutin
- Backup konfigurasi penting

### Recommended Firewall Rules
```bash
# Enable firewall
ufw enable

# Allow SSH
ufw allow ssh

# Allow HTTP/HTTPS
ufw allow 80
ufw allow 443

# Allow backend (optional, jika perlu akses langsung)
ufw allow 8088
```

## 📞 Support

### GitHub Repository
- **Main Repository**: https://github.com/MyMasWayVPN/pterolite-full
- **Issues**: https://github.com/MyMasWayVPN/pterolite-full/issues
- **Documentation**: https://github.com/MyMasWayVPN/pterolite-full/wiki

### Community Support
- Buat issue di GitHub untuk bug reports
- Diskusi fitur baru di GitHub Discussions
- Kontribusi code melalui Pull Requests

## 📄 License

PteroLite is open source software. Please check the repository for license information.

---

**Happy Container Management with PteroLite! 🐳**
