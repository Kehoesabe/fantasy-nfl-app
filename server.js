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
app.use(express.json({ limit: '250kb' }));

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'fantasy-nfl-secret-key';

// In-memory storage
const users = new Map();
const emailVerificationTokens = new Map();

// Simulation control
let simulationEnabled = true;
let gameInProgress = true;
let currentQuarter = 2;
let timeRemaining = "8:45";

// NFL Players database with K and DEF
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

// Game events
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

// Create admin account
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
    avatar: systemAvatars[0],
    createdAt: new Date().toISOString(),
    roster: [],
    activeLineup: [],
    swapCredits: 0
  });
  
  console.log('Admin account created: admin@fantasynfl.com / Admin123!');
};

// Middleware
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

// Simulation functions
function simulateGameEvent(player) {
  if (!simulationEnabled || !gameInProgress) return null;

  const now = Date.now();
  const timeSinceLastEvent = now - playerGameStates[player.id].lastEventTime;
  
  const eventChance = player.position === 'QB' ? 0.3 : 
                     player.position === 'RB' ? 0.25 : 
                     player.position === 'WR' ? 0.2 : 
                     player.position === 'K' ? 0.15 :
                     player.position === 'DEF' ? 0.2 : 0.15;

  if (Math.random() < eventChance && timeSinceLastEvent > 30000) {
    const availableEvents = gameEvents.filter(event => 
      event.positions.includes(player.position)
    );
    
    if (availableEvents.length === 0) return null;
    
    const event = availableEvents[Math.floor(Math.random() * availableEvents.length)];
    const pointChange = event.points + (Math.random() * 2 - 1);
    
    playerGameStates[player.id].currentPoints += pointChange;
    playerGameStates[player.id].lastEventTime = now;
    playerGameStates[player.id].recentEvents.unshift({
      type: event.type,
      points: pointChange,
      time: now
    });
    
    if (playerGameStates[player.id].recentEvents.length > 3) {
      playerGameStates[player.id].recentEvents.pop();
    }
    
    return event;
  }
  
  return null;
}

async function generateEnhancedPlayerStory(player, stats, recentEvent) {
  try {
    let eventContext = '';
    if (recentEvent) {
      const eventDescriptions = {
        touchdown: 'just scored a touchdown',
        field_goal: 'kicked a field goal',
        interception: 'threw an interception',
        fumble: 'lost a fumble',
        big_play: 'made a big play',
        target: 'was targeted',
        carry: 'had a rushing attempt',
        sack: 'recorded a sack',
        defensive_td: 'scored a defensive touchdown'
      };
      eventContext = `${player.name} ${eventDescriptions[recentEvent.type]} in Q${currentQuarter}. `;
    }
    
    const gameContext = gameInProgress ? 
      `Currently Q${currentQuarter}, ${timeRemaining} remaining. ` : 
      'Game completed. ';
    
    const prompt = `${eventContext}${gameContext}Write a 1-2 sentence fantasy update for ${player.name} (${player.position}, ${player.team}). Current fantasy points: ${stats.points.toFixed(1)}. Make it exciting for fantasy owners.`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 60,
    });

    return response.choices[0].message.content;
  } catch (error) {
    return `${player.name} has ${stats.points.toFixed(1)} fantasy points in Q${currentQuarter}. ${stats.status} and contributing to your lineup.`;
  }
}

// Game clock simulation
setInterval(() => {
  if (gameInProgress && simulationEnabled) {
    if (Math.random() < 0.1) {
      if (currentQuarter < 4) {
        currentQuarter++;
        timeRemaining = "15:00";
      } else if (Math.random() < 0.3) {
        gameInProgress = false;
        timeRemaining = "0:00";
      }
    }
  }
}, 60000);

// ROUTES

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, teamName, avatar } = req.body;

    if (!email || !password || !teamName) {
      return res.status(400).json({ error: 'Email, password, and team name are required' });
    }

    if (password.length < 8 || !/\d/.test(password)) {
      return res.status(400).json({ error: 'Password must be 8+ characters with at least 1 number' });
    }

    if (users.has(email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const teamNameTaken = Array.from(users.values()).some(user => 
      user.teamName.toLowerCase() === teamName.toLowerCase()
    );
    if (teamNameTaken) {
      return res.status(400).json({ error: 'Team name already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = uuidv4();
    emailVerificationTokens.set(verificationToken, email);

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
      swapCredits: 0
    });

    res.status(201).json({
      message: 'Account created! Check your email for verification link.',
      verificationToken,
      userId
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

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

// Game and player routes
app.get('/api/players', (req, res) => {
  res.json(nflPlayers);
});

app.get('/api/game-status', (req, res) => {
  res.json({
    simulationEnabled,
    gameInProgress,
    currentQuarter,
    timeRemaining,
    message: simulationEnabled ? 
      (gameInProgress ? `Live simulation: Q${currentQuarter} ${timeRemaining}` : 'Game completed') :
      'Live data mode - simulation disabled'
  });
});

app.post('/api/simulation/toggle', (req, res) => {
  simulationEnabled = !simulationEnabled;
  res.json({ 
    simulationEnabled, 
    message: simulationEnabled ? 'Simulation enabled' : 'Simulation disabled - ready for live data' 
  });
});

app.post('/api/simulation/restart-game', (req, res) => {
  gameInProgress = true;
  currentQuarter = 1;
  timeRemaining = "15:00";
  
  nflPlayers.forEach(player => {
    playerGameStates[player.id] = {
      currentPoints: player.basePoints,
      lastEventTime: Date.now(),
      status: 'Active',
      recentEvents: []
    };
  });
  
  res.json({ message: 'New game started', currentQuarter, timeRemaining });
});

app.get('/api/player/:id/stats', async (req, res) => {
  const playerId = parseInt(req.params.id);
  const player = nflPlayers.find(p => p.id === playerId);
  
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  const recentEvent = simulateGameEvent(player);
  const playerState = playerGameStates[playerId];

  const stats = {
    points: simulationEnabled ? playerState.currentPoints : (Math.floor(Math.random() * 25) + 5),
    status: playerState.status,
    lastUpdate: new Date().toISOString(),
    quarter: currentQuarter,
    timeRemaining: timeRemaining,
    gameInProgress: gameInProgress
  };

  const story = await generateEnhancedPlayerStory(player, stats, recentEvent);

  res.json({
    player,
    stats,
    story,
    recentEvent: recentEvent ? {
      type: recentEvent.type,
      description: recentEvent.type.replace('_', ' '),
      pointsAdded: recentEvent.points
    } : null,
    simulation: {
      enabled: simulationEnabled,
      gameInProgress: gameInProgress
    },
    image: `https://via.placeholder.com/400x300/1e40af/ffffff?text=${player.name.replace(' ', '+')}`
  });
});

// System routes
app.get('/api/avatars', (req, res) => {
  res.json({ systemAvatars });
});

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

app.get('/', (req, res) => {
  res.json({ 
    message: 'Fantasy NFL API is running!',
    simulation: simulationEnabled ? 'enabled' : 'disabled',
    gameStatus: gameInProgress ? `Q${currentQuarter} ${timeRemaining}` : 'Game over',
    users: users.size,
    admin: 'admin@fantasynfl.com'
  });
});

// Initialize
createAdminAccount();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Admin account: admin@fantasynfl.com / Admin123!');
});
