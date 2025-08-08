const express = require('express');
const cors = require('cors');
const axios = require('axios');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
// NFL Players database (subset for MVP)
const nflPlayers = [
  { id: 1, name: 'Josh Allen', position: 'QB', team: 'BUF' },
  { id: 2, name: 'Patrick Mahomes', position: 'QB', team: 'KC' },
  { id: 3, name: 'Lamar Jackson', position: 'QB', team: 'BAL' },
  { id: 4, name: 'Christian McCaffrey', position: 'RB', team: 'SF' },
  { id: 5, name: 'Derrick Henry', position: 'RB', team: 'TEN' },
  { id: 6, name: 'Cooper Kupp', position: 'WR', team: 'LAR' },
  { id: 7, name: 'Davante Adams', position: 'WR', team: 'LV' },
  { id: 8, name: 'Travis Kelce', position: 'TE', team: 'KC' },
];

// Generate AI story for player performance
async function generatePlayerStory(player, stats) {
  try {
    const prompt = `Write a 1-2 sentence fantasy football update for ${player.name} (${player.position}, ${player.team}). Stats: ${stats.points} fantasy points, ${stats.status}. Make it engaging for fantasy owners checking during games.`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
    });

    return response.choices[0].message.content;
  } catch (error) {
    return `${player.name} has ${stats.points} fantasy points and is ${stats.status}.`;
  }
}

// Routes
app.get('/api/players', (req, res) => {
  res.json(nflPlayers);
});

app.get('/api/player/:id/stats', async (req, res) => {
  const playerId = parseInt(req.params.id);
  const player = nflPlayers.find(p => p.id === playerId);
  
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  // Mock real-time stats (in production, this would come from ESPN API)
  const mockStats = {
    points: Math.floor(Math.random() * 25) + 5,
    status: Math.random() > 0.3 ? 'Active' : 'Inactive',
    lastUpdate: new Date().toISOString(),
  };

  const story = await generatePlayerStory(player, mockStats);

  res.json({
    player,
    stats: mockStats,
    story,
    image: `https://via.placeholder.com/400x300/1e40af/ffffff?text=${player.name.replace(' ', '+')}`,
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Fantasy NFL API is running!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});