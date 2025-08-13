// Fantasy NFL Backend Test Suite
const axios = require('axios');
const assert = require('assert');

const API_BASE = 'https://fantasy-nfl-app.vercel.app';

class FantasyNFLTester {
  constructor() {
    this.testResults = [];
    this.adminToken = null;
    this.userToken = null;
    this.testEmail = `test${Date.now()}@test.com`;
    this.testTeamName = `Test Team ${Date.now()}`;
  }

  async runAllTests() {
    console.log('🏈 Starting Fantasy NFL API Test Suite...\n');
    
    // Unit Tests
    await this.testBasicEndpoints();
    await this.testPlayerEndpoints();
    await this.testSimulationEndpoints();
    await this.testAvatarEndpoints();
    
    // Integration Tests
    await this.testUserRegistrationFlow();
    await this.testAdminAuthentication();
    await this.testUserAuthenticationFlow();
    await this.testProtectedRoutes();
    
    // System Tests
    await this.testGameSimulation();
    await this.testDataConsistency();
    
    this.printResults();
  }

  async test(name, testFn) {
    try {
      console.log(`Testing: ${name}...`);
      await testFn();
      this.testResults.push({ name, status: '✅ PASS' });
      console.log(`✅ PASS: ${name}\n`);
    } catch (error) {
      this.testResults.push({ name, status: `❌ FAIL: ${error.message}` });
      console.log(`❌ FAIL: ${name} - ${error.message}\n`);
    }
  }

  // UNIT TESTS
  async testBasicEndpoints() {
    await this.test('Main API endpoint', async () => {
      const response = await axios.get(`${API_BASE}/`);
      assert(response.status === 200);
      assert(response.data.message.includes('Fantasy NFL'));
      assert(typeof response.data.users === 'number');
    });
  }

  async testPlayerEndpoints() {
    await this.test('Get all players', async () => {
      const response = await axios.get(`${API_BASE}/api/players`);
      assert(response.status === 200);
      assert(Array.isArray(response.data));
      assert(response.data.length >= 10);
      assert(response.data.some(p => p.position === 'QB'));
      assert(response.data.some(p => p.position === 'K'));
      assert(response.data.some(p => p.position === 'DEF'));
    });

    await this.test('Get specific player stats', async () => {
      const response = await axios.get(`${API_BASE}/api/player/1/stats`);
      assert(response.status === 200);
      assert(response.data.player);
      assert(response.data.stats);
      assert(response.data.story);
      assert(typeof response.data.stats.points === 'number');
    });

    await this.test('Get kicker stats', async () => {
      const response = await axios.get(`${API_BASE}/api/player/9/stats`);
      assert(response.status === 200);
      assert(response.data.player.position === 'K');
    });

    await this.test('Get defense stats', async () => {
      const response = await axios.get(`${API_BASE}/api/player/10/stats`);
      assert(response.status === 200);
      assert(response.data.player.position === 'DEF');
    });

    await this.test('Invalid player ID returns 404', async () => {
      try {
        await axios.get(`${API_BASE}/api/player/999/stats`);
        throw new Error('Should have returned 404');
      } catch (error) {
        assert(error.response.status === 404);
      }
    });
  }

  async testSimulationEndpoints() {
    await this.test('Get game status', async () => {
      const response = await axios.get(`${API_BASE}/api/game-status`);
      assert(response.status === 200);
      assert(typeof response.data.simulationEnabled === 'boolean');
      assert(typeof response.data.gameInProgress === 'boolean');
      assert(typeof response.data.currentQuarter === 'number');
      assert(typeof response.data.timeRemaining === 'string');
    });

    await this.test('Toggle simulation', async () => {
      const response = await axios.post(`${API_BASE}/api/simulation/toggle`);
      assert(response.status === 200);
      assert(typeof response.data.simulationEnabled === 'boolean');
    });

    await this.test('Restart game', async () => {
      const response = await axios.post(`${API_BASE}/api/simulation/restart-game`);
      assert(response.status === 200);
      assert(response.data.message.includes('New game started'));
    });
  }

  async testAvatarEndpoints() {
    await this.test('Get system avatars', async () => {
      const response = await axios.get(`${API_BASE}/api/avatars`);
      assert(response.status === 200);
      assert(Array.isArray(response.data.systemAvatars));
      assert(response.data.systemAvatars.length === 10);
    });
  }

  // INTEGRATION TESTS
  async testUserRegistrationFlow() {
    await this.test('User registration with valid data', async () => {
      const userData = {
        email: this.testEmail,
        password: 'TestPass123',
        teamName: this.testTeamName,
        avatar: 'avatar1.png'
      };

      const response = await axios.post(`${API_BASE}/api/auth/register`, userData);
      assert(response.status === 201);
      assert(response.data.message.includes('Account created'));
      assert(response.data.verificationToken);
    });

    await this.test('Duplicate email registration fails', async () => {
      const userData = {
        email: this.testEmail,
        password: 'TestPass123',
        teamName: 'Different Team Name'
      };

      try {
        await axios.post(`${API_BASE}/api/auth/register`, userData);
        throw new Error('Should have failed with duplicate email');
      } catch (error) {
        assert(error.response.status === 400);
        assert(error.response.data.error.includes('already registered'));
      }
    });

    await this.test('Invalid password registration fails', async () => {
      const userData = {
        email: 'test2@test.com',
        password: 'weak',
        teamName: 'Test Team 2'
      };

      try {
        await axios.post(`${API_BASE}/api/auth/register`, userData);
        throw new Error('Should have failed with weak password');
      } catch (error) {
        assert(error.response.status === 400);
        assert(error.response.data.error.includes('8+ characters'));
      }
    });
  }

  async testAdminAuthentication() {
    await this.test('Admin login with correct credentials', async () => {
      const loginData = {
        email: 'admin@fantasynfl.com',
        password: 'Admin123!'
      };

      const response = await axios.post(`${API_BASE}/api/auth/login`, loginData);
      assert(response.status === 200);
      assert(response.data.token);
      assert(response.data.user.isAdmin === true);
      
      this.adminToken = response.data.token;
    });

    await this.test('Admin can access user list', async () => {
      assert(this.adminToken, 'Admin token required');
      
      const response = await axios.get(`${API_BASE}/api/admin/users`, {
        headers: { Authorization: `Bearer ${this.adminToken}` }
      });
      
      assert(response.status === 200);
      assert(Array.isArray(response.data.users));
      assert(response.data.total >= 1);
    });
  }

  async testUserAuthenticationFlow() {
    await this.test('Email verification', async () => {
      // Get verification token from registration response
      const userData = {
        email: `verify${Date.now()}@test.com`,
        password: 'TestPass123',
        teamName: `Verify Team ${Date.now()}`
      };

      const regResponse = await axios.post(`${API_BASE}/api/auth/register`, userData);
      const verificationToken = regResponse.data.verificationToken;

      const response = await axios.get(`${API_BASE}/api/auth/verify-email?token=${verificationToken}`);
      assert(response.status === 200);
      assert(response.data.message.includes('verified successfully'));
    });

    await this.test('Login with invalid credentials fails', async () => {
      const loginData = {
        email: 'wrong@email.com',
        password: 'wrongpassword'
      };

      try {
        await axios.post(`${API_BASE}/api/auth/login`, loginData);
        throw new Error('Should have failed with invalid credentials');
      } catch (error) {
        assert(error.response.status === 401);
      }
    });
  }

  async testProtectedRoutes() {
    await this.test('Protected route without token fails', async () => {
      try {
        await axios.get(`${API_BASE}/api/auth/profile`);
        throw new Error('Should have failed without token');
      } catch (error) {
        assert(error.response.status === 401);
      }
    });

    await this.test('Protected route with valid admin token works', async () => {
      assert(this.adminToken, 'Admin token required');
      
      const response = await axios.get(`${API_BASE}/api/auth/profile`, {
        headers: { Authorization: `Bearer ${this.adminToken}` }
      });
      
      assert(response.status === 200);
      assert(response.data.email === 'admin@fantasynfl.com');
      assert(response.data.isAdmin === true);
    });

    await this.test('Non-admin cannot access admin routes', async () => {
      // First create and verify a regular user
      const userData = {
        email: `regular${Date.now()}@test.com`,
        password: 'TestPass123',
        teamName: `Regular Team ${Date.now()}`
      };

      const regResponse = await axios.post(`${API_BASE}/api/auth/register`, userData);
      await axios.get(`${API_BASE}/api/auth/verify-email?token=${regResponse.data.verificationToken}`);
      
      const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, {
        email: userData.email,
        password: userData.password
      });

      try {
        await axios.get(`${API_BASE}/api/admin/users`, {
          headers: { Authorization: `Bearer ${loginResponse.data.token}` }
        });
        throw new Error('Regular user should not access admin routes');
      } catch (error) {
        assert(error.response.status === 403);
      }
    });
  }

  // SYSTEM TESTS
  async testGameSimulation() {
    await this.test('Game simulation produces changing stats', async () => {
      // Get initial stats
      const initial = await axios.get(`${API_BASE}/api/player/1/stats`);
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get stats again
      const updated = await axios.get(`${API_BASE}/api/player/1/stats`);
      
      // Stats should potentially be different due to simulation
      assert(initial.data.stats.lastUpdate !== updated.data.stats.lastUpdate);
    });

    await this.test('Simulation toggle affects game state', async () => {
      // Turn simulation off
      await axios.post(`${API_BASE}/api/simulation/toggle`);
      let status = await axios.get(`${API_BASE}/api/game-status`);
      
      // Turn simulation back on
      await axios.post(`${API_BASE}/api/simulation/toggle`);
      status = await axios.get(`${API_BASE}/api/game-status`);
      
      assert(status.data.simulationEnabled === true);
    });
  }

  async testDataConsistency() {
    await this.test('Player data consistency', async () => {
      const players = await axios.get(`${API_BASE}/api/players`);
      
      // Test each player has required fields
      players.data.forEach(player => {
        assert(player.id);
        assert(player.name);
        assert(player.position);
        assert(player.team);
        assert(typeof player.basePoints === 'number');
      });
    });

    await this.test('API response times are reasonable', async () => {
      const start = Date.now();
      await axios.get(`${API_BASE}/api/players`);
      const playerTime = Date.now() - start;
      
      const start2 = Date.now();
      await axios.get(`${API_BASE}/api/game-status`);
      const statusTime = Date.now() - start2;
      
      assert(playerTime < 5000, `Player API too slow: ${playerTime}ms`);
      assert(statusTime < 2000, `Status API too slow: ${statusTime}ms`);
    });
  }

  printResults() {
    console.log('\n' + '='.repeat(50));
    console.log('🏈 FANTASY NFL API TEST RESULTS');
    console.log('='.repeat(50));
    
    const passed = this.testResults.filter(r => r.status.includes('PASS')).length;
    const failed = this.testResults.filter(r => r.status.includes('FAIL')).length;
    
    console.log(`\nSUMMARY: ${passed} passed, ${failed} failed\n`);
    
    this.testResults.forEach(result => {
      console.log(`${result.status}: ${result.name}`);
    });
    
    console.log('\n' + '='.repeat(50));
    
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! Your Fantasy NFL API is working perfectly!');
    } else {
      console.log(`⚠️  ${failed} tests failed. Check the details above.`);
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new FantasyNFLTester();
  tester.runAllTests().catch(console.error);
}

module.exports = FantasyNFLTester;
