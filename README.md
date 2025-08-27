# 🐳 PteroLite - Docker Container Management Panel

[![GitHub release](https://img.shields.io/github/release/MyMasWayVPN/pterolite-full.svg)](https://github.com/MyMasWayVPN/pterolite-full/releases)
[![License](https://img.shields.io/github/license/MyMasWayVPN/pterolite-full.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue.svg)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

PteroLite adalah platform manajemen container Docker yang powerful dengan web interface yang modern dan user-friendly. Dibangun dengan Node.js, React, dan Docker API untuk memberikan pengalaman manajemen container yang seamless.

## ✨ Features

### 🐳 Container Management
- **Create & Deploy** - Buat container baru dengan berbagai Docker images
- **Start/Stop/Restart** - Kontrol penuh lifecycle container
- **Real-time Monitoring** - Monitor status dan resource usage
- **Container Logs** - View dan monitor container logs
- **Port Management** - Configure port mapping dan networking

### 📁 File Manager
- **Upload/Download** - Transfer files ke/dari container
- **File Editor** - Edit files langsung di browser
- **ZIP Extraction** - Extract ZIP files otomatis
- **Directory Management** - Create, delete, rename folders
- **File Permissions** - Manage file permissions

### 💻 Console Terminal
- **Interactive Shell** - Akses terminal langsung ke container
- **Command Execution** - Execute commands dengan real-time output
- **Multiple Sessions** - Support multiple terminal sessions
- **Command History** - Track command history

### ⚡ Script Executor
- **JavaScript (Node.js)** - Execute JavaScript scripts
- **Python Support** - Run Python scripts
- **Real-time Output** - View script execution output
- **Error Handling** - Comprehensive error reporting

### 🔧 Startup Manager
- **Auto-start Commands** - Configure commands yang dijalankan saat container start
- **Service Management** - Manage background services
- **Environment Variables** - Set environment variables
- **Startup Scripts** - Custom startup scripts

### 🐋 Docker Image Manager
- **Image Repository** - Browse available Docker images
- **Pull Images** - Download images dari Docker Hub
- **Image Information** - View image details dan layers
- **Cleanup Tools** - Remove unused images

## 📦 Installation Modes

PteroLite mendukung 2 mode instalasi:

### 🌐 Domain Mode
- **Requirements**: Domain name yang sudah pointing ke server
- **Features**: SSL dengan Let's Encrypt, Nginx reverse proxy
- **Access**: `http://yourdomain.com` atau `https://yourdomain.com`
- **API**: `http://yourdomain.com/external-api`
- **Structure**: Frontend di `/var/www/pterolite`, Backend di `/opt/pterolite`

### 🏠 Localhost Mode  
- **Requirements**: Tidak perlu domain
- **Features**: Direct port access, tanpa SSL
- **Access**: `http://localhost:8088` atau `http://SERVER-IP:8088`
- **API**: `http://localhost:8088/api`
- **Structure**: Frontend di `/opt/pterolite/public`, Backend di `/opt/pterolite`

## 🚀 Quick Installation

### One-Line Installation

```bash
bash <(curl -s https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/install_pterolite.sh)
```

Installer akan menanyakan pilihan mode instalasi:
```
Installation Type Selection
================================
Choose your installation type:
1) Install with Domain (requires domain name and optional SSL)
2) Install for Localhost Only (no domain required, HTTP only)

Choose installation type (1-2):
```

### Manual Installation

```bash
# Download installer
wget https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/install_pterolite.sh

# Make executable
chmod +x install_pterolite.sh

# Run installer
sudo bash install_pterolite.sh
```

### Clone & Install

```bash
# Clone repository
git clone https://github.com/MyMasWayVPN/pterolite-full.git
cd pterolite-full

# Run installer
sudo bash install_pterolite.sh
```

### 🔧 Complete Manager Tool

Untuk manajemen lengkap, gunakan PteroLite Manager:

```bash
# Download manager (curl version)
bash <(curl -s https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/pterolite-manager.sh)
```

Manager menyediakan:
- 🆕 **Fresh Install** - Instalasi baru dengan pilihan mode
- 🔄 **Reinstall** - Reinstall dengan backup otomatis  
- ⬆️ **Update** - Update ke versi terbaru
- 🗑️ **Uninstall** - Penghapusan lengkap dengan backup
- ℹ️ **Status** - Check status instalasi
- 🔧 **Service Management** - Start/Stop/Restart/Logs

## 📋 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Ubuntu 18.04+ / Debian 10+ | Ubuntu 20.04+ / Debian 11+ |
| **RAM** | 1GB | 2GB+ |
| **Storage** | 5GB free space | 10GB+ free space |
| **CPU** | 1 vCPU | 2+ vCPU |
| **Network** | Internet connection | Stable internet connection |

### Required Ports

#### Domain Mode
- **80** - HTTP (akan redirect ke HTTPS)
- **443** - HTTPS (web panel)
- **8088** - Backend API (internal)

#### Localhost Mode
- **8088** - Direct access (web panel + API)

## 🎯 Installation Process

### Domain Mode Setup
1. **Domain Configuration**
```
Enter your domain name (e.g., pterolite.xmwstore.web.id): your-domain.com
```

2. **SSL Certificate Setup**
```
SSL Certificate options:
1) Install Let's Encrypt SSL certificate (recommended)
2) Skip SSL setup (HTTP only - not recommended for production)

Choose an option (1-2): 1
```

3. **Email for SSL**
```
Enter email address for Let's Encrypt notifications: admin@your-domain.com
```

### Localhost Mode Setup
- Tidak ada konfigurasi domain
- SSL setup di-skip otomatis
- Langsung akses via port 8088

### Automatic Installation
Installer akan otomatis:
- ✅ Update system packages
- ✅ Install Node.js 18 LTS
- ✅ Install Docker CE
- ✅ Download PteroLite dari GitHub
- ✅ Setup backend dengan systemd service
- ✅ Build dan deploy frontend
- ✅ Configure Nginx (Domain mode) atau skip (Localhost mode)
- ✅ Verify installation

## 🌐 Access Your Panel

### Domain Mode
```
🌐 Web Panel HTTP: http://your-domain.com
🔒 Web Panel HTTPS: https://your-domain.com (jika SSL enabled)
🔗 API Endpoint: http://your-domain.com/external-api
📋 API Key: [your-generated-api-key]
```

### Localhost Mode
```
🏠 Web Panel: http://localhost:8088
🌍 Web Panel (IP): http://SERVER-IP:8088
🔗 API Endpoint: http://localhost:8088/api
📋 API Key: [your-generated-api-key]
```

- Akses langsung tanpa authentication untuk web panel
- Full featured web interface
- Real-time container management
- Untuk akses programmatic gunakan X-API-Key header

## 🔧 Management Commands

### Backend Management
```bash
# View logs
journalctl -u pterolite -f

# Restart backend
systemctl restart pterolite

# Stop backend
systemctl stop pterolite

# Check status
systemctl status pterolite
```

### Web Server Management (Domain Mode Only)
```bash
# Check nginx status
systemctl status nginx

# Restart nginx
systemctl restart nginx

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

## 🔄 Update & Maintenance

### Update PteroLite
```bash
# Download dan run update script
bash <(curl -s https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/update_pterolite.sh)
```

### Reinstall PteroLite
```bash
# Download dan run reinstall script
bash <(curl -s https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/reinstall_pterolite.sh)
```

### Backup Configuration
```bash
# Backup important files
sudo cp -r /opt/pterolite /opt/pterolite-backup-$(date +%Y%m%d)

# Domain mode - backup nginx config
sudo cp /etc/nginx/sites-available/pterolite.conf /opt/pterolite-backup-$(date +%Y%m%d)/

# Localhost mode - backup frontend
sudo cp -r /opt/pterolite/public /opt/pterolite-backup-$(date +%Y%m%d)/
```

## 🛠️ Development

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/MyMasWayVPN/pterolite-full.git
cd pterolite-full

# Setup backend
cd backend
npm install
cp .env.example .env
npm start

# Setup frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Project Structure
```
pterolite-full/
├── backend/                      # Node.js Express API
│   ├── server.js                # Main server file
│   ├── package.json             # Backend dependencies
│   └── .env                     # Environment variables
├── frontend/                     # React frontend
│   ├── src/                     # Source files
│   ├── public/                  # Static assets
│   ├── package.json             # Frontend dependencies
│   └── vite.config.js           # Vite configuration
├── install_pterolite.sh          # Main installer (dual mode)
├── reinstall_pterolite.sh        # Reinstaller (dual mode)
├── update_pterolite.sh           # Updater (dual mode)
├── pterolite-manager-curl.sh     # Complete manager (curl version)
├── pterolite-manager.sh          # Complete manager (local version)
└── README.md                     # This file
```

### API Endpoints

#### Container Management
```
GET    /api/containers              # List all containers
POST   /api/containers              # Create new container
POST   /api/containers/:id/start    # Start container
POST   /api/containers/:id/stop     # Stop container
DELETE /api/containers/:id          # Delete container
```

#### File Management
```
GET    /api/files                   # List files
POST   /api/files/upload            # Upload files
PUT    /api/files/:path             # Update file
DELETE /api/files/:path             # Delete file
```

#### Script Execution
```
POST   /api/execute/javascript      # Execute JavaScript
POST   /api/execute/python          # Execute Python
POST   /api/execute/command         # Execute shell command
```

## 🔐 Security

### Web Panel Security
- Web panel dapat diakses langsung tanpa API key
- Gunakan HTTPS untuk production (Domain mode)
- Implement proper firewall rules

### API Security
- API key required untuk external API access
- Use X-API-Key header untuk authentication
- Rate limiting implemented

### System Security
```bash
# Domain mode firewall setup
ufw enable
ufw allow ssh
ufw allow 80
ufw allow 443

# Localhost mode firewall setup
ufw enable
ufw allow ssh
ufw allow 8088
```

## 🐛 Troubleshooting

### Common Issues

#### Backend Not Starting
```bash
# Check logs
journalctl -u pterolite -f

# Check port
netstat -tulpn | grep 8088

# Restart
systemctl restart pterolite
```

#### Frontend Not Loading (Domain Mode)
```bash
# Check nginx
systemctl status nginx

# Check web root
ls -la /var/www/pterolite/

# Check nginx logs
tail -f /var/log/nginx/error.log
```

#### Frontend Not Loading (Localhost Mode)
```bash
# Check if frontend files exist
ls -la /opt/pterolite/public/

# Check port accessibility
curl http://localhost:8088

# Check firewall
ufw status
```

#### Docker Issues
```bash
# Check docker service
systemctl status docker

# Check permissions
docker ps

# Restart docker
systemctl restart docker
```

### Log Locations
- **Backend**: `journalctl -u pterolite -f`
- **Nginx Access** (Domain mode): `/var/log/nginx/access.log`
- **Nginx Error** (Domain mode): `/var/log/nginx/error.log`
- **System**: `journalctl -u nginx`

## 📚 Documentation

- **[Installation Guide](INSTALLATION_GUIDE.md)** - Detailed installation instructions
- **[Installation Modes](INSTALLATION_MODES.md)** - Dual mode explanation
- **[Manager Documentation](PTEROLITE_MANAGER.md)** - Complete manager guide
- **[API Documentation](API.md)** - Complete API reference
- **[User Guide](USER_GUIDE.md)** - How to use PteroLite
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues and solutions

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Reporting Issues
- Use GitHub Issues untuk bug reports
- Provide detailed information
- Include system information
- Add logs if applicable

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Docker** - Container platform
- **Node.js** - JavaScript runtime
- **React** - Frontend framework
- **Express.js** - Web framework
- **systemd** - Service manager
- **Nginx** - Web server

## 📞 Support

### Community Support
- **GitHub Issues**: [Report bugs](https://github.com/MyMasWayVPN/pterolite-full/issues)
- **GitHub Discussions**: [Ask questions](https://github.com/MyMasWayVPN/pterolite-full/discussions)
- **Wiki**: [Documentation](https://github.com/MyMasWayVPN/pterolite-full/wiki)

### Professional Support
For professional support, custom development, or enterprise features, please contact us through GitHub.

---

**Made with ❤️ for the Docker community**

**⭐ Star this repository if you find it useful!**
