const express = require('express');
const cors = require('cors');
const axios = require('axios');
const OpenAI = require('openai');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '250kb' })); // For avatar uploads

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'fantasy-nfl-secret-key';

// In-memory storage (replace with database later)
const users = new Map();
const emailVerificationTokens = new Map();

// Create admin account on startup
const createAdminAccount = async () => {
  const adminEmail = 'admin@fantasynfl.com';
  const adminPassword = 'Admin123!';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  
  users.set(adminEmail, {
    id: 'admin-001',
    email: adminEmail,
    password: hashedPassword,
    teamName: 'Admin Team',
    isAdmin: true,
    isVerified: true,
    avatar: null,
    createdAt: new Date().toISOString(),
    roster: [],
    activeLineup: []
  });
  
  console.log('Admin account created: admin@fantasynfl.com / Admin123!');
};

// Simulation control (existing code)
let simulationEnabled = true;
let gameInProgress = true;
let currentQuarter = 2;
let timeRemaining = "8:45";

// NFL Players database with enhanced stats
const nflPlayers = [
  { id: 1, name: 'Josh Allen', position: 'QB', team: 'BUF', basePoints: 18 },
  { id: 2, name: 'Patrick Mahomes', position: 'QB', team: 'KC', basePoints: 22 },
  { id: 3, name: 'Lamar Jackson', position: 'QB', team: 'BAL', basePoints: 20 },
  { id: 4, name: 'Christian McCaffrey', position: 'RB', team: 'SF', basePoints: 15 },
  { id: 5, name: 'Derrick Henry', position: 'RB', team: 'TEN', basePoints: 12 },
  { id: 6, name: 'Cooper Kupp', position: 'WR', team: 'LAR', basePoints: 14 },
  { id: 7, name: 'Davante Adams', position: 'WR', team: 'LV', basePoints: 13 },
  { id: 8, name: 'Travis Kelce', position: 'TE', team: 'KC', basePoints: 11 },
  { id: 9, name: 'Justin Tucker', position: 'K', team: 'BAL', basePoints: 8 },
  { id: 10, name: 'Buffalo Bills', position: 'DEF', team: 'BUF', basePoints: 10 }
];

// System avatars
const systemAvatars = [
  'avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png', 'avatar5.png',
  'avatar6.png', 'avatar7.png', 'avatar8.png', 'avatar9.png', 'avatar10.png'
];

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// User registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, teamName, avatar } = req.body;

    // Validation
    if (!email || !password || !teamName) {
      return res.status(400).json({ error: 'Email, password, and team name are required' });
    }

    if (password.length < 8 || !/\d/.test(password)) {
      return res.status(400).json({ error: 'Password must be 8+ characters with at least 1 number' });
    }

    if (users.has(email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Check if team name is taken
    const teamNameTaken = Array.from(users.values()).some(user => 
      user.teamName.toLowerCase() === teamName.toLowerCase()
    );
    if (teamNameTaken) {
      return res.status(400).json({ error: 'Team name already taken' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token
    const verificationToken = uuidv4();
    emailVerificationTokens.set(verificationToken, email);

    // Create user
    const userId = uuidv4();
    users.set(email, {
      id: userId,
      email,
      password: hashedPassword,
      teamName,
      isAdmin: false,
      isVerified: false,
      avatar: avatar || systemAvatars[Math.floor(Math.random() * systemAvatars.length)],
      createdAt: new Date().toISOString(),
      roster: [],
      activeLineup: [],
      swapCredits: 0 // Track paid swaps
    });

    // In production, send verification email here
    console.log(`Verification link: /api/auth/verify-email?token=${verificationToken}`);

    res.status(201).json({
      message: 'Account created! Check your email for verification link.',
      verificationToken, // Remove this in production
      userId
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Email verification
app.get('/api/auth/verify-email', (req, res) => {
  try {
    const { token } = req.query;

    if (!emailVerificationTokens.has(token)) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const email = emailVerificationTokens.get(token);
    const user = users.get(email);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isVerified = true;
    emailVerificationTokens.delete(token);

    res.json({ message: 'Email verified successfully! You can now log in.' });

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = users.get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.isVerified) {
      return res.status(401).json({ error: 'Please verify your email before logging in' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        teamName: user.teamName,
        avatar: user.avatar,
        isAdmin: user.isAdmin
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get user profile
app.get('/api/auth/profile', authenticateToken, (req, res) => {
  const user = users.get(req.user.email);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    email: user.email,
    teamName: user.teamName,
    avatar: user.avatar,
    isAdmin: user.isAdmin,
    rosterSize: user.roster.length,
    activeLineupSize: user.activeLineup.length,
    swapCredits: user.swapCredits
  });
});

// Get system avatars
app.get('/api/avatars', (req, res) => {
  res.json({ systemAvatars });
});

// Admin: Get all users
app.get('/api/admin/users', authenticateToken, (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const allUsers = Array.from(users.values()).map(user => ({
    id: user.id,
    email: user.email,
    teamName: user.teamName,
    isVerified: user.isVerified,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
    rosterSize: user.roster.length
  }));

  res.json({ users: allUsers, total: allUsers.length });
});

// [Previous simulation and player code remains the same...]

// Game events that can happen
const gameEvents = [
  { type: 'touchdown', points: 6, positions: ['QB', 'RB', 'WR', 'TE'] },
  { type: 'field_goal', points: 3, positions: ['K'] },
  { type: 'interception', points: -2, positions: ['QB'] },
  { type: 'fumble', points: -2, positions: ['RB', 'WR'] },
  { type: 'big_play', points: 2, positions: ['QB', 'RB', 'WR', 'TE'] },
  { type: 'target', points: 1, positions: ['WR', 'TE'] },
  { type: 'carry', points: 0.5, positions: ['RB'] },
  { type: 'sack', points: 2, positions: ['DEF'] },
  { type: 'defensive_td', points: 6, positions: ['DEF'] }
];

// Store player game states
const playerGameStates = {};

// Initialize player states
nflPlayers.forEach(player => {
  playerGameStates[player.id] = {
    currentPoints: player.basePoints,
    lastEventTime: Date.now(),
    status: 'Active',
    recentEvents: []
  };
});

// [Rest of existing simulation code...]

// Routes (existing ones remain)
app.get('/api/players', (req, res) => {
  res.json(nflPlayers);
});

// [All existing simulation routes remain the same...]

app.get('/', (req, res) => {
  res.json({ 
    message: 'Fantasy NFL API is running!',
    simulation: simulationEnabled ? 'enabled' : 'disabled',
    gameStatus: gameInProgress ? `Q${currentQuarter} ${timeRemaining}` : 'Game over',
    users: users.size,
    admin: 'admin@fantasynfl.com'
  });
});

// Create admin account on startup
createAdminAccount();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Simulation mode: ${simulationEnabled ? 'ON' : 'OFF'}`);
  console.log('Admin account: admin@fantasynfl.com / Admin123!');
});
