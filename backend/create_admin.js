const bcrypt = require("bcrypt");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Configuration
const USERS_FILE = '/tmp/pterolite-users.json';

async function createAdminUser(username, email, password) {
  try {
    console.log('Creating admin user...');
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create admin user object
    const adminUser = {
      id: uuidv4(),
      username: username,
      email: email,
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date(),
      containers: []
    };
    
    // Load existing users if file exists
    let users = [];
    if (fs.existsSync(USERS_FILE)) {
      try {
        const userData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        users = userData;
      } catch (error) {
        console.warn('Warning: Could not read existing users file, creating new one');
        users = [];
      }
    }
    
    // Check if admin user already exists
    const existingAdmin = users.find(user => user.username === username);
    if (existingAdmin) {
      console.log(`Admin user '${username}' already exists. Updating password...`);
      existingAdmin.password = hashedPassword;
      existingAdmin.email = email;
      existingAdmin.updatedAt = new Date();
    } else {
      console.log(`Creating new admin user '${username}'...`);
      users.push(adminUser);
    }
    
    // Save users to file
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    
    console.log('✅ Admin user created successfully!');
    console.log(`Username: ${username}`);
    console.log(`Email: ${email}`);
    console.log(`Role: admin`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to create admin user:', error.message);
    return false;
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length !== 3) {
  console.error('Usage: node create_admin.js <username> <email> <password>');
  process.exit(1);
}

const [username, email, password] = args;

// Validate inputs
if (!username || !email || !password) {
  console.error('Error: All fields (username, email, password) are required');
  process.exit(1);
}

// Basic email validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  console.error('Error: Invalid email format');
  process.exit(1);
}

// Password strength validation
if (password.length < 6) {
  console.error('Error: Password must be at least 6 characters long');
  process.exit(1);
}

// Create admin user
createAdminUser(username, email, password)
  .then(success => {
    if (success) {
      console.log('\n🎉 Admin user setup completed!');
      console.log('You can now login to the PteroLite web panel with these credentials.');
      process.exit(0);
    } else {
      console.error('\n❌ Admin user setup failed!');
      process.exit(1);
    }
  })
.catch(error => {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
});
