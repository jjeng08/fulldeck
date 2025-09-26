const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const logger = require('../../shared/logger');
const { text: t } = require('../../core/text');
const { prisma } = require('../../shared/DBUtils');
const JWT_SECRET = process.env.JWT_SECRET || 'fulldeck-secret-key';

const validateToken = async (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    
    // Check if user still exists in database via DBUtils
    const user = await DBUtils.getPlayerById(decoded.userId)
    
    if (!user) {
      return { valid: false, error: 'User not found' }
    }
    
    return {
      valid: true,
      userId: user.id,
      username: user.username,
      balance: user.balance
    }
  } catch (error) {
    return { valid: false, error: error.message }
  }
};

// No imports from server to avoid circular dependency

// Helper function to complete authentication process - sends response and returns user info
function completeAuthentication(ws, user, accessToken, refreshToken, responseType) {
  // Send auth response using the SAME message type as the request
  const authResponse = {
    type: responseType,
    data: {
      success: true,
      userId: user.id,
      username: user.username,
      accessToken: accessToken,
      refreshToken: refreshToken
    }
  };
  ws.send(JSON.stringify(authResponse));
  
  // Send balance message directly through this connection
  if (ws.readyState === 1) { // WebSocket.OPEN
    const balanceMessage = {
      type: 'balance',
      data: {
        balance: user.balance
      }
    };
    ws.send(JSON.stringify(balanceMessage));
  }
  
  // Return user info so server can associate connection
  return { userId: user.id, username: user.username };
}

async function onLogin(ws, data) {
  logger.logAuthEvent('login_attempt', null, { username: data.username });
  try {
    // Find user by username
    const user = await prisma.player.findUnique({
      where: { username: data.username }
    });
    
    if (!user) {
      const response = {
        type: 'login',
        data: {
          success: false,
          message: t.loginFailed
        }
      };
      ws.send(JSON.stringify(response));
      return;
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(data.password, user.passwordHash);
    if (!passwordMatch) {
      const response = {
        type: 'login',
        data: {
          success: false,
          message: t.loginFailed
        }
      };
      ws.send(JSON.stringify(response));
      return;
    }
    
    // Update last seen
    await prisma.player.update({
      where: { id: user.id },
      data: { lastSeen: new Date() }
    });
    
    // Generate JWT tokens
    const accessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    const refreshToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        type: 'refresh'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Complete authentication - send response and get user info
    const userInfo = completeAuthentication(ws, user, accessToken, refreshToken, 'login');
    return userInfo; // Return to router so it can associate connection
    
  } catch (error) {
    logger.logError(error, { username: data.username, action: 'login' });
    const response = {
      type: 'login',
      data: {
        success: false,
        message: t.unableToLogin
      }
    };
    ws.send(JSON.stringify(response));
  }
}

async function onRegister(ws, data) {
  logger.logAuthEvent('registration_attempt', null, { username: data.username });
  try {
    // Check if username already exists
    const existingUser = await prisma.player.findUnique({
      where: { username: data.username }
    });
    
    if (existingUser) {
      const response = {
        type: 'register',
        data: {
          success: false,
          message: t.usernameExists
        }
      };
      ws.send(JSON.stringify(response));
      return;
    }
    
    // Validate password
    if (!data.password || data.password.length < 3) {
      const response = {
        type: 'register',
        data: {
          success: false,
          message: t.passwordTooShort
        }
      };
      ws.send(JSON.stringify(response));
      return;
    }
    
    // Hash password securely
    const hashedPassword = await bcrypt.hash(data.password, 12);
    
    // Create new user
    const newUser = await prisma.player.create({
      data: {
        username: data.username,
        passwordHash: hashedPassword,
        createdOn: new Date(),
        lastSeen: new Date()
      }
    });
    
    // Generate JWT tokens
    const accessToken = jwt.sign(
      {
        userId: newUser.id,
        username: newUser.username,
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    const refreshToken = jwt.sign(
      {
        userId: newUser.id,
        username: newUser.username,
        type: 'refresh'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Complete authentication - send response and get user info
    const userInfo = completeAuthentication(ws, newUser, accessToken, refreshToken, 'register');
    return userInfo; // Return to router so it can associate connection
    
  } catch (error) {
    logger.logError(error, { username: data.username, action: 'register' });
    const response = {
      type: 'register',
      data: {
        success: false,
        message: t.unableToRegister
      }
    };
    ws.send(JSON.stringify(response));
  }
}

async function onRefreshToken(ws, data) {
  logger.logAuthEvent('token_refresh_request', null, { refreshTokenProvided: !!data.refreshToken });
  
  let decoded, user;
  
  try {
    if (!data.refreshToken || data.refreshToken === 'null' || data.refreshToken === null) {
      const response = {
        type: 'tokenRefreshed',
        data: {
          success: false,
          error: 'No valid refresh token'
        }
      };
      ws.send(JSON.stringify(response));
      return;
    }
    
    decoded = jwt.verify(data.refreshToken, JWT_SECRET);
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token type');
    }
    
    // Verify user still exists
    user = await prisma.player.findUnique({
      where: { id: decoded.userId }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Generate new access token
    const newAccessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    // Complete authentication - send response and get user info
    const userInfo = completeAuthentication(ws, user, newAccessToken, data.refreshToken, 'tokenRefreshed');
    return userInfo; // Return to router so it can associate connection
    
  } catch (error) {
    logger.logError(error, { userId: user?.id || decoded?.userId || 'unknown', action: 'token_refresh' });
    const response = {
      type: 'tokenRefreshed',
      data: {
        success: false,
        error: t.loginFailed
      }
    };
    ws.send(JSON.stringify(response));
  }
}

async function onValidateToken(ws, data, userId) {
  logger.logAuthEvent('token_validation_request', userId, { userId });
  
  const validation = await validateToken(data.token);
  
  // Send directly through WebSocket since user might not exist
  const response = {
    type: 'tokenValidated',
    data: validation
  };
  ws.send(JSON.stringify(response));
}

async function onLogout(ws, data, userId) {
  logger.logAuthEvent('logout_request', userId, { userId });
  
  try {
    // Clear user session (if any session management needed)
    // Send success response directly through WebSocket to avoid circular dependency
    const response = {
      type: 'logout',
      data: {
        success: true,
        message: 'Logged out successfully'
      }
    };
    ws.send(JSON.stringify(response));
    logger.logAuthEvent('logout_completed', userId, { userId });
  } catch (error) {
    logger.logError(error, { userId, action: 'logout' });
    const response = {
      type: 'logout',
      data: {
        success: false,
        message: 'Logout failed'
      }
    };
    ws.send(JSON.stringify(response));
  }
}

module.exports = {
  onLogin,
  onLogout,
  onRefreshToken,
  onRegister,
  onValidateToken
};