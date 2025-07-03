import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WebSocketService from './websocket';
import { text as t } from '../shared/text';
import logger from '../shared/logger';

const AppContext = createContext();

export function AppProvider({ children }) {
  // Connection state
  const [connected, setConnected] = useState(false);
  
  // User state
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [availableGames, setAvailableGames] = useState([]);
  const [authToken, setAuthToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [messageQueue, setMessageQueue] = useState([]);
  
  // Toast state
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success'
  });
  
  // Game state
  const [gameState, setGameState] = useState('waiting_for_bet');
  const [currentBet, setCurrentBet] = useState(0);
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [gameMessage, setGameMessage] = useState();
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  
  // Table state
  const [tableState, setTableState] = useState({
    tableId: null,
    players: [],
    gameStatus: 'waiting',
    currentTurn: null,
    dealerCards: [],
    betLevel: 1,
    betAmounts: null,
    maxBet: null,
    bettingTimeLeft: 0,
    canBet: false,
    myStatus: 'observer'
  });

  useEffect(() => {
    // Load saved token on app startup
    loadSavedToken();
  }, []);

  const onLogin = (data) => {
    logger.logAuthEvent('login_response_received', null, { 
      success: data.success, 
      userId: data.userId 
    });
    if (data.success) {
      const userData = {
        id: data.userId,
        username: data.username,
        balance: data.balance
      };
      setAuthenticatedUser(userData, data.accessToken, data.refreshToken, data.availableGames);
    } else {
      setGameMessage(data.message);
    }
  };

  const onRegister = (data) => {
    if (data.success) {
      const userData = {
        id: data.userId,
        username: data.username,
        balance: data.balance
      };
      setAuthenticatedUser(userData, data.accessToken, data.refreshToken, data.availableGames);
      setGameMessage(`Registration successful! Welcome, ${data.username}!`);
    } else {
      setGameMessage(data.message);
    }
  };

  const onTokenRefreshed = (data) => {
    if (data.success) {
      const userData = {
        id: data.userId,
        username: data.username,
        balance: data.balance
      };
      setAuthToken(data.accessToken);
      setUser(userData);
      setIsRefreshing(false);
      setAvailableGames(data.availableGames);
      saveAuthData(data.accessToken, refreshToken, userData);
      processMessageQueue();
    } else {
      setUser(null);
      setAuthToken(null);
      setRefreshToken(null);
      setIsAuthenticated(false);
      setIsRefreshing(false);
      setMessageQueue([]);
      setGameMessage('Session expired. Please login again.');
      clearAuthData();
    }
  };

  const onConnected = (data) => {
    logger.logWebSocketEvent('server_connected', { connectionId: data.connectionId });
    setConnected(true);
  };

  const onBalance = (data) => {
    if (user) {
      setUser(prev => ({ ...prev, balance: data.balance }));
    }
  };

  const onGameConfigs = (data) => {
    setAvailableGames(data.availableGames);
  };

  useEffect(() => {
    // Initialize WebSocket connection and set up message handlers
    try {
      WebSocketService.connect();
      
      // Set up incoming message handlers
      WebSocketService.onMessage('balance', onBalance);
      WebSocketService.onMessage('connected', onConnected);
      WebSocketService.onMessage('gameConfigs', onGameConfigs);
      WebSocketService.onMessage('login', onLogin);
      WebSocketService.onMessage('register', onRegister);
      WebSocketService.onMessage('tokenRefreshed', onTokenRefreshed);
      
    } catch (error) {
      logger.logError(error, { type: 'websocket_error', action: 'initialization_failed' });
      setConnected(false);
    }

    // Cleanup on unmount
    return () => {
      try {
        WebSocketService.removeMessageHandler('balance');
        WebSocketService.removeMessageHandler('connected');
        WebSocketService.removeMessageHandler('gameConfigs');
        WebSocketService.removeMessageHandler('login');
        WebSocketService.removeMessageHandler('register');
        WebSocketService.removeMessageHandler('tokenRefreshed');
        WebSocketService.disconnect();
      } catch (error) {
        logger.logError(error, { type: 'websocket_error', action: 'disconnect_failed' });
      }
    };
  }, []);

  const loadSavedToken = async () => {
    try {
      const savedToken = await AsyncStorage.getItem('authToken');
      const savedRefreshToken = await AsyncStorage.getItem('refreshToken');
      
      if (savedToken && savedRefreshToken && savedToken !== 'null' && savedRefreshToken !== 'null') {
        const savedUser = await AsyncStorage.getItem('userData');
        if (savedUser) {
          setAuthToken(savedToken);
          setRefreshToken(savedRefreshToken);
          setUser(JSON.parse(savedUser));
          setIsAuthenticated(true);
          setGameMessage(`Welcome back, ${JSON.parse(savedUser).username}!`);
          
          // Set games immediately - we need to get them somehow
          // For now, hardcode until we can get them from backend
          setAvailableGames([
            {
              id: 'blackjack',
              name: 'Blackjack',
              available: true,
              description: 'Classic 21 card game',
              route: 'Blackjack'
            },
            {
              id: 'poker',
              name: 'Texas Hold\'em Poker',
              available: false,
              description: 'Coming Soon',
              route: 'Poker'
            },
            {
              id: 'baccarat',
              name: 'Baccarat',
              available: false,
              description: 'Coming Soon',
              route: 'Baccarat'
            }
          ]);
        }
      }
    } catch (error) {
      logger.logError(error, { type: 'authentication_error', action: 'load_saved_auth' });
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const saveAuthData = async (accessToken, refreshToken, userData) => {
    try {
      await AsyncStorage.setItem('authToken', accessToken);
      await AsyncStorage.setItem('refreshToken', refreshToken);
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
    } catch (error) {
      logger.logError(error, { type: 'authentication_error', action: 'save_auth_data' });
    }
  };

  const clearAuthData = async () => {
    try {
      await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'userData']);
    } catch (error) {
      logger.logError(error, { type: 'authentication_error', action: 'clear_auth_data' });
    }
  };

  const attemptTokenRefresh = () => {
    if (refreshToken && refreshToken !== 'null' && !isRefreshing) {
      setIsRefreshing(true);
      // Send refresh request with refresh token (not access token)
      WebSocketService.sendMessage('refreshToken', { 
        refreshToken: refreshToken 
      });
    } else {
      // No refresh token, clear auth state
      setUser(null);
      setAuthToken(null);
      setRefreshToken(null);
      setIsAuthenticated(false);
      setMessageQueue([]);
      setIsRefreshing(false);
      setGameMessage('Session expired. Please login again.');
      clearAuthData();
    }
  };

  const processMessageQueue = () => {
    const queuedMessages = [...messageQueue];
    setMessageQueue([]);
    queuedMessages.forEach(({ messageType, data }) => {
      // Re-process queued messages through sendMessage
      sendMessage(messageType, data);
    });
  };

  // Generic message sender with automatic token inclusion
  const sendMessage = (messageType, data = {}) => {
    // Messages that don't need authentication
    const unauthenticatedMessages = ['login', 'register', 'refreshToken'];
    
    if (unauthenticatedMessages.includes(messageType)) {
      // Send without token
      WebSocketService.sendMessage(messageType, data);
    } else {
      // Check if we have a valid token
      if (!authToken) {
        setGameMessage(t.loginToStart);
        return;
      }
      
      // Check if token is expired and refresh if needed
      if (isTokenExpired(authToken) && !isRefreshing) {
        // Queue the message and refresh token
        setMessageQueue(prev => [...prev, { messageType, data }]);
        attemptTokenRefresh();
      } else if (isRefreshing) {
        // Token is being refreshed, queue the message
        setMessageQueue(prev => [...prev, { messageType, data }]);
      } else {
        // Special validation for placeBet
        if (messageType === 'placeBet') {
          if (!user || data.amount > user.balance) {
            setGameMessage(t.insufficientBalance);
            return;
          }
        }
        // Send with token included in message
        WebSocketService.sendMessage(messageType, {
          ...data,
          token: authToken
        });
      }
    }
  };

  const isTokenExpired = (token) => {
    try {
      // React Native compatible base64 decode
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);
      const currentTime = Date.now() / 1000;
      // Check if token expires in next 5 minutes (buffer for refresh)
      return payload.exp < (currentTime + 300);
    } catch (error) {
      logger.logError(error, { type: 'authentication_error', action: 'token_decode' });
      return true; // If we can't decode, assume expired
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({
      visible: true,
      message,
      type
    });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, visible: false }));
  };

  const setAuthenticatedUser = (userData, accessToken, refreshToken, games = []) => {
    setUser(userData);
    setAuthToken(accessToken);
    setRefreshToken(refreshToken);
    setIsAuthenticated(true);
    setAvailableGames(games);
    saveAuthData(accessToken, refreshToken, userData);
  };

  const value = {
    // State
    connected,
    user,
    isAuthenticated,
    isLoadingAuth,
    availableGames,
    gameState,
    currentBet,
    playerHand,
    dealerHand,
    gameMessage,
    toast,
    tableState,
    
    // Actions
    sendMessage,
    setGameMessage,
    showToast,
    hideToast,
    setAuthenticatedUser
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}