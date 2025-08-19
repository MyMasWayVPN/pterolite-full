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