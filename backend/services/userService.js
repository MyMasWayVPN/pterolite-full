const fs = require("fs");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const config = require("../config");

// In-memory storage for users (in production, use database)
const users = new Map();

// Load users from file if exists
const loadUsers = () => {
  if (fs.existsSync(config.USERS_FILE)) {
    try {
      const userData = JSON.parse(fs.readFileSync(config.USERS_FILE, 'utf8'));
      userData.forEach(user => {
        users.set(user.username, user);
      });
      console.log(`Loaded ${users.size} users from file`);
    } catch (error) {
      console.error('Error loading users:', error.message);
    }
  }
};

// Save users to file
const saveUsers = () => {
  try {
    const userData = Array.from(users.values());
    fs.writeFileSync(config.USERS_FILE, JSON.stringify(userData, null, 2));
  } catch (error) {
    console.error('Error saving users:', error.message);
  }
};

// Get user by username
const getUser = (username) => {
  return users.get(username);
};

// Get all users
const getAllUsers = () => {
  return Array.from(users.values()).map(user => ({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    containerCount: user.containers.length
  }));
};

// Create new user
const createUser = async (userData) => {
  const { username, email, password, role } = userData;
  
  if (users.has(username)) {
    throw new Error("Username already exists");
  }

  if (!['admin', 'user'].includes(role)) {
    throw new Error("Invalid role");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: uuidv4(),
    username,
    email,
    password: hashedPassword,
    role,
    createdAt: new Date(),
    containers: []
  };

  users.set(username, newUser);
  saveUsers();

  return {
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    role: newUser.role
  };
};

// Delete user
const deleteUser = (username) => {
  if (users.has(username)) {
    users.delete(username);
    saveUsers();
    return true;
  }
  return false;
};

// Validate user credentials
const validateCredentials = async (username, password) => {
  const user = users.get(username);
  if (!user) {
    return null;
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };
};

// Update user container list
const updateUserContainers = (username, containers) => {
  const user = users.get(username);
  if (user) {
    user.containers = containers;
    users.set(username, user);
    saveUsers();
  }
};

// Add container to user
const addContainerToUser = (username, containerId) => {
  const user = users.get(username);
  if (user) {
    if (!user.containers.includes(containerId)) {
      user.containers.push(containerId);
      users.set(username, user);
      saveUsers();
    }
  }
};

// Remove container from user
const removeContainerFromUser = (username, containerId) => {
  const user = users.get(username);
  if (user) {
    user.containers = user.containers.filter(id => id !== containerId);
    users.set(username, user);
    saveUsers();
  }
};

// Initialize users on startup
loadUsers();

module.exports = {
  getUser,
  getAllUsers,
  createUser,
  deleteUser,
  validateCredentials,
  updateUserContainers,
  addContainerToUser,
  removeContainerFromUser,
  saveUsers
};
