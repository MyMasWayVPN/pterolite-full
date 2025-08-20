// Configuration settings
const config = {
  API_KEY: process.env.API_KEY || "supersecretkey",
  JWT_SECRET: process.env.JWT_SECRET || "pterolite-jwt-secret-key",
  PORT: process.env.PORT || 8088,
  USERS_FILE: '/tmp/pterolite-users.json',
  UPLOAD_DIR: '/tmp/pterolite-uploads',
  CONTAINER_DIR: '/tmp/pterolite-containers',
  DEFAULT_FILES_DIR: '/tmp/pterolite-files'
};

module.exports = config;
