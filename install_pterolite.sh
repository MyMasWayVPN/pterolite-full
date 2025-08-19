#!/bin/bash
# PteroLite Auto Installer
DOMAIN="pterolite.mydomain.com"
API_KEY="supersecretkey"
INSTALL_DIR="/opt/pterolite"
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-nginx nodejs npm
mkdir -p $INSTALL_DIR && cd $INSTALL_DIR
# Backend
cat > server.js <<'EOF'
const express = require("express");
const Docker = require("dockerode");
const bodyParser = require("body-parser");

const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const app = express();
app.use(bodyParser.json());

const API_KEY = process.env.API_KEY || "supersecretkey";

app.use((req, res, next) => {
  if (req.headers["x-api-key"] !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.get("/containers", async (req, res) => {
  const containers = await docker.listContainers({ all: true });
  res.json(containers);
});

app.post("/containers", async (req, res) => {
  try {
    const { name, image, cmd } = req.body;
    const container = await docker.createContainer({
      Image: image,
      name,
      Cmd: cmd,
      Tty: true,
    });
    await container.start();
    res.json({ message: "Container created & started", id: container.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/containers/:id/start", async (req, res) => {
  try {
    await docker.getContainer(req.params.id).start();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/containers/:id/stop", async (req, res) => {
  try {
    await docker.getContainer(req.params.id).stop();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.listen(8088, () => console.log("PteroLite API running on port 8088"));
EOF
cat > package.json <<'EOF'
{
  "name": "pterolite",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "body-parser": "^1.20.2",
    "dockerode": "^4.0.0",
    "express": "^4.18.2"
  }
}
EOF
npm install
npm install -g pm2
pm2 start server.js --name pterolite --env production
pm2 save
pm2 startup systemd -u root --hp /root
# Nginx
cat > /etc/nginx/sites-available/pterolite.conf <<EOF
server {
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
ln -s /etc/nginx/sites-available/pterolite.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN
