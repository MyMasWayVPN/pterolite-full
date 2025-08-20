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

## 🚀 Quick Installation

### One-Line Installation

```bash
bash <(curl -s https://raw.githubusercontent.com/MyMasWayVPN/pterolite-full/main/install_pterolite.sh)
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

## 📋 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Ubuntu 18.04+ / Debian 10+ | Ubuntu 20.04+ / Debian 11+ |
| **RAM** | 1GB | 2GB+ |
| **Storage** | 5GB free space | 10GB+ free space |
| **CPU** | 1 vCPU | 2+ vCPU |
| **Network** | Internet connection | Stable internet connection |

### Required Ports
- **80** - HTTP (akan redirect ke HTTPS)
- **443** - HTTPS (web panel)
- **8088** - Backend API (internal)

## 🎯 Installation Process

### 1. Domain Configuration
```
Enter your domain name (e.g., pterolite.xmwstore.web.id): your-domain.com
```

### 2. SSL Certificate Setup
```
SSL Certificate options:
1) Install Let's Encrypt SSL certificate (recommended)
2) Skip SSL setup (HTTP only - not recommended for production)

Choose an option (1-2): 1
```

### 3. Email for SSL
```
Enter email address for Let's Encrypt notifications: admin@your-domain.com
```

### 4. Automatic Installation
Installer akan otomatis:
- ✅ Update system packages
- ✅ Install Node.js 18 LTS
- ✅ Install Docker CE
- ✅ Download PteroLite dari GitHub
- ✅ Setup backend dengan systemd service
- ✅ Build dan deploy frontend
- ✅ Configure Nginx dengan SSL
- ✅ Verify installation

## 🌐 Access Your Panel

Setelah instalasi selesai:

### Web Panel
```
🌐 Web Panel: https://your-domain.com
```
- Akses langsung tanpa authentication
- Full featured web interface
- Real-time container management

### API Access
```
🔗 API Endpoint: https://your-domain.com/external-api
📋 API Key: [your-generated-api-key]
```
- Untuk akses programmatic
- Gunakan X-API-Key header
- RESTful API endpoints

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

### Web Server Management
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
sudo cp /etc/nginx/sites-available/pterolite.conf /opt/pterolite-backup-$(date +%Y%m%d)/
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
├── backend/                 # Node.js Express API
│   ├── server.js           # Main server file
│   ├── package.json        # Backend dependencies
│   └── .env               # Environment variables
├── frontend/               # React frontend
│   ├── src/               # Source files
│   ├── public/            # Static assets
│   ├── package.json       # Frontend dependencies
│   └── vite.config.js     # Vite configuration
├── install_pterolite.sh    # Main installer
├── reinstall_pterolite.sh  # Reinstaller
├── update_pterolite.sh     # Updater
└── README.md              # This file
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
- Gunakan HTTPS untuk production
- Implement proper firewall rules

### API Security
- API key required untuk external API access
- Use X-API-Key header untuk authentication
- Rate limiting implemented

### System Security
```bash
# Recommended firewall setup
ufw enable
ufw allow ssh
ufw allow 80
ufw allow 443
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

#### Frontend Not Loading
```bash
# Check nginx
systemctl status nginx

# Check web root
ls -la /var/www/pterolite/

# Check nginx logs
tail -f /var/log/nginx/error.log
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
- **Nginx Access**: `/var/log/nginx/access.log`
- **Nginx Error**: `/var/log/nginx/error.log`
- **System**: `journalctl -u nginx`

## 📚 Documentation

- **[Installation Guide](INSTALL_GUIDE.md)** - Detailed installation instructions
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

