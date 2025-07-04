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
  const [authToken, setAuthToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [messageQueue, setMessageQueue] = useState([]);
  const [loadingActions, setLoadingActions] = useState(new Set());
  
  // Global state for balance and games - ONLY updated by their respective handlers
  const [playerBalance, setPlayerBalance] = useState(0);
  const [availableGames, setAvailableGames] = useState([]);
  
  // Toast state
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success'
  });
  
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  

  useEffect(() => {
    // Load saved token on app startup
    loadSavedToken();
  }, []);

  useEffect(() => {
    // When both connected and authenticated, request fresh data
    if (connected && isAuthenticated && authToken) {
      sendMessage('balance');
      sendMessage('availableGames');
    }
  }, [connected, isAuthenticated, authToken]);


  const onLogin = (data) => {
    clearLoadingAction('login');
    logger.logAuthEvent('login_response_received', null, { 
      success: data.success, 
      userId: data.userId 
    });
    if (data.success) {
      // Only handle auth data - balance and games handled by their own handlers
      const userData = {
        id: data.userId,
        username: data.username
      };
      setAuthenticatedUser(userData, data.accessToken, data.refreshToken);
    } else {
      // Login failed - handle error appropriately
      console.log('Login failed:', data.message);
    }
  };

  const onRegister = (data) => {
    clearLoadingAction('register');
    if (data.success) {
      // Only handle auth data - balance and games handled by their own handlers
      const userData = {
        id: data.userId,
        username: data.username
      };
      setAuthenticatedUser(userData, data.accessToken, data.refreshToken);
      console.log(`Registration successful! Welcome, ${data.username}!`);
    } else {
      console.log('Registration failed:', data.message);
    }
  };

  const onTokenRefreshed = (data) => {
    if (data.success) {
      // Only handle auth data - balance and games handled by their own handlers
      const userData = {
        id: data.userId,
        username: data.username
      };
      setAuthToken(data.accessToken);
      setUser(userData);
      setIsRefreshing(false);
      saveAuthData(data.accessToken, refreshToken, userData);
      processMessageQueue();
    } else {
      setUser(null);
      setAuthToken(null);
      setRefreshToken(null);
      setIsAuthenticated(false);
      setIsRefreshing(false);
      setMessageQueue([]);
      console.log('Session expired. Please login again.');
      clearAuthData();
    }
  };

  const onConnected = (data) => {
    logger.logWebSocketEvent('server_connected', { connectionId: data.connectionId });
    setConnected(true);
  };

  // ONLY place playerBalance is updated
  const onBalance = (data) => {
    setPlayerBalance(data.balance);
  };

  // ONLY place availableGames is updated  
  const onAvailableGames = (data) => {
    console.log('GOT GAMES')
    setAvailableGames(data.availableGames);
  };

  const onLogout = (data) => {
    clearLoadingAction('logout');
    
    // Clear all auth data regardless of success/failure
    setUser(null);
    setAuthToken(null);
    setRefreshToken(null);
    setIsAuthenticated(false);
    setMessageQueue([]);
    setIsRefreshing(false);
    
    // Reset global states
    setPlayerBalance(0);
    setAvailableGames([]);
    
    clearAuthData();
  };

  useEffect(() => {
    // Initialize WebSocket connection and set up message handlers
    try {
      WebSocketService.connect();
      
      // Set up incoming message handlers
      WebSocketService.onMessage('availableGames', onAvailableGames);
      WebSocketService.onMessage('balance', onBalance);
      WebSocketService.onMessage('connected', onConnected);
      WebSocketService.onMessage('login', onLogin);
      WebSocketService.onMessage('logout', onLogout);
      WebSocketService.onMessage('register', onRegister);
      WebSocketService.onMessage('tokenRefreshed', onTokenRefreshed);
      
    } catch (error) {
      logger.logError(error, { type: 'websocket_error', action: 'initialization_failed' });
      setConnected(false);
    }

    // Cleanup on unmount
    return () => {
      try {
        WebSocketService.removeMessageHandler('availableGames');
        WebSocketService.removeMessageHandler('balance');
        WebSocketService.removeMessageHandler('connected');
        WebSocketService.removeMessageHandler('login');
        WebSocketService.removeMessageHandler('logout');
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
          const userData = JSON.parse(savedUser);
          setAuthToken(savedToken);
          setRefreshToken(savedRefreshToken);
          setUser(userData);
          setIsAuthenticated(true);
          
          // Set saved balance from cached user data
          if (userData.balance !== undefined) {
            setPlayerBalance(userData.balance);
          }
          
          console.log(`Welcome back, ${userData.username}!`);
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
      // Include current balance in cached user data
      const userDataWithBalance = {
        ...userData,
        balance: playerBalance
      };
      await AsyncStorage.setItem('authToken', accessToken);
      await AsyncStorage.setItem('refreshToken', refreshToken);
      await AsyncStorage.setItem('userData', JSON.stringify(userDataWithBalance));
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
      console.log('Session expired. Please login again.');
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
        console.log('Please login to continue');
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
          if (!user || data.amount > playerBalance) {
            console.log('Insufficient balance for this bet');
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

  const setAuthenticatedUser = (userData, accessToken, refreshToken) => {
    setUser(userData);
    setAuthToken(accessToken);
    setRefreshToken(refreshToken);
    setIsAuthenticated(true);
    saveAuthData(accessToken, refreshToken, userData);
  };

  const addLoadingAction = (messageType) => {
    setLoadingActions(prev => new Set([...prev, messageType]));
  };

  const clearLoadingAction = (messageType) => {
    setLoadingActions(prev => {
      const newSet = new Set(prev);
      newSet.delete(messageType);
      return newSet;
    });
  };

  const value = {
    // State
    connected,
    user,
    isAuthenticated,
    isLoadingAuth,
    availableGames,
    playerBalance,
    toast,
    loadingActions,
    
    // Actions
    sendMessage,
    addLoadingAction,
    clearLoadingAction,
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