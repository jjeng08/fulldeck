const { getLeaderboards } = require('../shared/DBUtils');
const logger = require('../shared/logger');

// Cache for leaderboard data
let leaderboardCache = null;
let updateInterval = null;

/**
 * Update leaderboards and cache results
 */
async function updateLeaderboards() {
  try {
    logger.logInfo('Starting leaderboard update');
    
    const leaderboardData = await getLeaderboards(10);
    leaderboardCache = leaderboardData;
    
    logger.logInfo('Leaderboard update completed', { 
      periods: Object.keys(leaderboardData.leaderboards),
      counts: Object.fromEntries(
        Object.entries(leaderboardData.leaderboards).map(([k, v]) => [k, v.length])
      )
    });
    
    return leaderboardData;
  } catch (error) {
    logger.logError('Error updating leaderboards', { error: error.message });
    throw error;
  }
}

/**
 * Get cached leaderboard data
 */
function getCachedLeaderboards() {
  return leaderboardCache;
}

/**
 * Start the hourly leaderboard update service
 */
function startLeaderboardService() {
  // Update immediately on start
  updateLeaderboards().catch(error => {
    logger.logError('Initial leaderboard update failed', { error: error.message });
  });
  
  // Schedule updates every hour (3600000 ms)
  updateInterval = setInterval(() => {
    updateLeaderboards().catch(error => {
      logger.logError('Scheduled leaderboard update failed', { error: error.message });
    });
  }, 3600000); // 1 hour
  
  logger.logInfo('Leaderboard service started - updates every hour');
}

/**
 * Stop the leaderboard service
 */
function stopLeaderboardService() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    logger.logInfo('Leaderboard service stopped');
  }
}

module.exports = {
  updateLeaderboards,
  getCachedLeaderboards,
  startLeaderboardService,
  stopLeaderboardService
};