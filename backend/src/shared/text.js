const text = {
  // Connection Messages
  connected: 'Connected to server. Please login to continue.',
  
  // Authentication Messages
  loginSuccess: 'Welcome back, {username}!',
  loginFailed: 'Invalid username or password. Please try again.',
  registrationSuccess: 'Registration successful! Welcome, {username}!',
  registrationFailed: 'Registration failed. Please try again.',
  usernameExists: 'Username already exists. Please choose a different username.',
  passwordTooShort: 'Password must be at least 3 characters long.',
  
  // Game Messages
  gameStarted: 'Game started! Make your move.',
  cardDealt: 'Card dealt: {value} of {suit}',
  betPlaced: 'Bet placed! Ready to deal cards.',
  newGameReady: 'Ready for a new game! Place your bet.',
  insufficientBalance: 'Insufficient balance for this bet!',
  
  // Game Results
  gameWin: 'Game win! Amount: ${amount}',
  gameLose: 'Game lose! Amount: ${amount}',
  gamePush: 'Game push! Bet returned.',
  surrenderResult: 'Game surrendered. Half bet lost.',
  doubleDownWin: 'Double down win! Amount: ${amount}',
  doubleDownLose: 'Double down lose! Amount: ${amount}',
  
  // Error Messages
  unknownMessageType: 'Unknown message type: {type}',
  invalidMessageFormat: 'Invalid message format',
  databaseError: 'Database error occurred. Please try again.',
  serverError: 'Server error occurred. Please try again.',
  unableToLogin: 'Unable to login at this time. Please try again.',
  unableToRegister: 'Unable to register at this time. Please try again.',
  invalidRefreshToken: 'No valid refresh token provided.',
  tokenRefreshFailed: 'Unable to refresh token at this time. Please login again.',
  
  // Validation Messages
  missingUsername: 'Username is required.',
  missingPassword: 'Password is required.',
  invalidBetAmount: 'Invalid bet amount.',
  userNotFound: 'User not found.',
  gameNotFound: 'Game not found.',
};

module.exports = { text };