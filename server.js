const express = require('express');
const cors = require('cors');
const axios = require('axios');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Simulation control
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
];

// Game events that can happen
const gameEvents = [
  { type: 'touchdown', points: 6, positions: ['QB', 'RB', 'WR', 'TE'] },
  { type: 'field_goal', points: 3, positions: ['K'] },
  { type: 'interception', points: -2, positions: ['QB'] },
  { type: 'fumble', points: -2, positions: ['RB', 'WR'] },
  { type: 'big_play', points: 2, positions: ['QB', 'RB', 'WR', 'TE'] },
  { type: 'target', points: 1, positions: ['WR', 'TE'] },
  { type: 'carry', points: 0.5, positions: ['RB'] },
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

// Simulate live game events
function simulateGameEvent(player) {
  if (!simulationEnabled || !gameInProgress) return null;

  const now = Date.now();
  const timeSinceLastEvent = now - playerGameStates[player.id].lastEventTime;
  
  // Events happen randomly, more frequent for skill positions
  const eventChance = player.position === 'QB' ? 0.3 : 
                     player.position === 'RB' ? 0.25 : 
                     player.position === 'WR' ? 0.2 : 0.15;

  if (Math.random() < eventChance && timeSinceLastEvent > 30000) { // At least 30 seconds between events
    const availableEvents = gameEvents.filter(event => 
      event.positions.includes(player.position)
    );
    
    const event = availableEvents[Math.floor(Math.random() * availableEvents.length)];
    const pointChange = event.points + (Math.random() * 2 - 1); // Add some variance
    
    playerGameStates[player.id].currentPoints += pointChange;
    playerGameStates[player.id].lastEventTime = now;
    playerGameStates[player.id].recentEvents.unshift({
      type: event.type,
      points: pointChange,
      time: now
    });
    
    // Keep only last 3 events
    if (playerGameStates[player.id].recentEvents.length > 3) {
      playerGameStates[player.id].recentEvents.pop();
    }
    
    return event;
  }
  
  return null;
}

// Generate contextual AI story based on recent events
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
        carry: 'had a rushing attempt'
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
    if (recentEvent) {
      const eventMap = {
        touchdown: 'found the end zone',
        interception: 'threw a costly pick',
        fumble: 'coughed up the ball',
        big_play: 'broke off a big gain',
        target: 'was involved in the passing game',
        carry: 'got the handoff'
      };
      return `${player.name} ${eventMap[recentEvent.type]} in Q${currentQuarter}! Now at ${stats.points.toFixed(1)} fantasy points.`;
    }
    return `${player.name} has ${stats.points.toFixed(1)} fantasy points in Q${currentQuarter}. ${stats.status} and contributing to your lineup.`;
  }
}

// Update game clock simulation
setInterval(() => {
  if (gameInProgress && simulationEnabled) {
    // Randomly advance time and quarters
    if (Math.random() < 0.1) { // 10% chance to advance quarter
      if (currentQuarter < 4) {
        currentQuarter++;
        timeRemaining = "15:00";
      } else if (Math.random() < 0.3) {
        gameInProgress = false;
        timeRemaining = "0:00";
      }
    }
  }
}, 60000); // Check every minute

// Routes
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
  
  // Reset all player stats
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

  // Simulate live event
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

app.get('/', (req, res) => {
  res.json({ 
    message: 'Fantasy NFL API is running!',
    simulation: simulationEnabled ? 'enabled' : 'disabled',
    gameStatus: gameInProgress ? `Q${currentQuarter} ${timeRemaining}` : 'Game over'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Simulation mode: ${simulationEnabled ? 'ON' : 'OFF'}`);
});
