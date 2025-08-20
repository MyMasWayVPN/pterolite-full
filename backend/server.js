const express = require("express");
const bodyParser = require("body-parser");
const config = require("./config");

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Import routes
const authRoutes = require("./routes/auth");
const containerRoutes = require("./routes/containers");
const fileRoutes = require("./routes/files");
const processRoutes = require("./routes/processes");
const consoleRoutes = require("./routes/console");
const scriptRoutes = require("./routes/scripts");
const startupRoutes = require("./routes/startup");
const dockerRoutes = require("./routes/docker");
const externalRoutes = require("./routes/external");

// Mount routes
app.use("/auth", authRoutes);
app.use("/containers", containerRoutes);
app.use("/files", fileRoutes);
app.use("/processes", processRoutes);
app.use("/console", consoleRoutes);
app.use("/scripts", scriptRoutes);
app.use("/startup-commands", startupRoutes);
app.use("/docker", dockerRoutes);
app.use("/api", externalRoutes); // External API with API key auth

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    version: "2.0.0-modular"
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`🚀 PteroLite API (Modular) running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Authentication: JWT-based`);
  console.log(`🐳 Docker integration: Active`);
  console.log(`📁 File management: Active`);
  console.log(`💻 Console & Scripts: Active`);
});

module.exports = app;
