const text = {
  // App and General
  appName: 'FullDeck',
  
  // Connection Status
  connected: 'Connected',
  disconnected: 'Disconnected',
  
  // Intro Page
  welcome: 'Welcome to Primero Full Deck',
  login: 'Login',
  register: 'Register',
  
  // Form Fields
  username: 'Username',
  password: 'Password',
  confirmPassword: 'Confirm Password',
  enterUsername: 'Enter username',
  enterPassword: 'Enter password',
  confirmYourPassword: 'Confirm your password',
  logIn: 'Log In',
  cancel: 'Cancel',
  submit: 'Submit',
  
  // Lobby Page
  account: 'Account',
  welcomeUser: 'Welcome, {username}!',
  balance: 'Balance: {balance}',
  joinTable: 'Join Table',
  viewAccount: 'View Account',
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  shop: 'Shop',
  buyChips: 'Buy Chips',
  logOut: 'LogOut',
  chooseYourGame: 'Choose Your Game',
  
  // Table Page
  currentBet: 'Current Bet: ${bet}',
  dealer: 'Dealer',
  player: 'Player ({username})',
  playerGuest: 'Player (Guest)',
  dealerCards: 'Dealer cards will appear here',
  playerCards: 'Your cards will appear here',
  leaveTable: 'Leave Table',
  
  // Game Actions
  newGame: 'New Game',
  hit: 'Hit',
  stand: 'Stand',
  doubleDown: 'Double Down',
  surrender: 'Surrender',
  dealCards: 'Deal Cards',
  
  // Betting
  bet10: 'Bet $10',
  bet25: 'Bet $25',
  bet50: 'Bet $50',
  
  // Game Messages
  welcomeMessage: 'Welcome! Please login to start playing.',
  loginToStart: 'Connected to server. Please login to continue.',
  welcomeBack: 'Welcome back, {username}!',
  registrationSuccess: 'Registration successful! Welcome, {username}!',
  registrationFailed: 'Registration failed. Please try again.',
  gameStarted: 'Game started! Make your move.',
  cardDealt: 'Card dealt: {value} of {suit}',
  gameWin: 'Game win! Amount: ${amount}',
  gameLose: 'Game lose! Amount: ${amount}',
  gamePush: 'Game push! Bet returned.',
  surrenderResult: 'Game surrendered. Half bet lost.',
  doubleDownWin: 'Double down win! Amount: ${amount}',
  doubleDownLose: 'Double down lose! Amount: ${amount}',
  betPlaced: 'Bet placed! Ready to deal cards.',
  newGameReady: 'Ready for a new game! Place your bet.',
  insufficientBalance: 'Insufficient balance for this bet!',
  welcomeToTable: 'Welcome to the table! Place your bet to start.',
  loggedOut: 'Logged out. Please login to continue.',
  balanceUpdated: 'Balance updated: ${balance}',
  
  // Hand Display
  dealerHand: 'Dealer Hand ({count} cards)',
  yourHand: 'Your Hand ({count} cards)',
  
  // Authentication Messages
  loginSuccess: 'Welcome back, {username}!',
  loginFailed: 'Invalid username or password. Please try again.',
  
  // Error Messages
  error: 'Error: {message}',
  unknownCard: 'Unknown',
  unknownMessageType: 'Unknown message type: {type}',
  invalidMessageFormat: 'Invalid message format',
  databaseError: 'Database error occurred. Please try again.',
  serverError: 'Server error occurred. Please try again.',
  unableToLogin: 'Unable to login at this time. Please try again.',
  unableToRegister: 'Unable to register at this time. Please try again.',
  invalidRefreshToken: 'No valid refresh token provided.',
  tokenRefreshFailed: 'Unable to refresh token at this time. Please login again.',
  
  // Registration Errors
  usernameExists: 'Username already exists. Please choose a different username.',
  passwordTooShort: 'Password must be at least 3 characters long.',
  registrationError: 'Registration failed. Please try again.',
  passwordMismatch: 'Passwords do not match.',
  
  // Form Validation Errors
  enterUsernameAndPassword: 'Please enter both username and password.',
  enterAllFields: 'Please fill in all required fields.',
  missingUsername: 'Username is required.',
  missingPassword: 'Password is required.',
  invalidBetAmount: 'Invalid bet amount.',
  userNotFound: 'User not found.',
  gameNotFound: 'Game not found.',
};



module.exports = { text };