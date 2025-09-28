import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WebSocketService from './websocket';
import { text as t } from '../core/text';
import { getConfig } from '../shared/environment';
import logger from '../shared/logger';

const AppContext = createContext();

export function AppProvider({ children }) {
  // Connection state
  const [connected, setConnected] = useState(false);
  
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
  
  // Unified auth state management - ALL auth data in one place
  const [authState, setAuthState] = useState({
    // User data
    user: null,
    authToken: null,
    refreshToken: null,
    
    // Operational state
    status: 'idle', // 'idle', 'logging_in', 'refreshing', 'processing_queue'
    attempts: 0,
    messageQueue: []
  });
  
  // Single ref for async operations
  const pendingOperations = React.useRef({
    refresh: null
  });

  useEffect(() => {
    // Only request availableGames after authState is fully populated with validated data
    if (authState.user && authState.authToken && authState.status === 'idle') {
      sendMessage('availableGames');
    }
  }, [authState.user, authState.authToken, authState.status]);

  const onLogin = (data) => {
    clearLoadingAction('login');
    logger.logAuthEvent('login_response_received', null, { 
      success: data.success, 
      userId: data.userId 
    });
    
    if (data.success) {
      const userData = {
        id: data.userId,
        username: data.username
      };
      
      // Directly set auth state - no validation needed
      setAuthState({
        user: userData,
        authToken: data.accessToken,
        refreshToken: data.refreshToken,
        status: 'idle',
        attempts: 0,
        messageQueue: []
      });
      
      // Save to AsyncStorage for future auto-login
      saveAuthData(data.accessToken, data.refreshToken, userData);
      
      // Enable auto-reconnect for authenticated users
      WebSocketService.setShouldReconnect(true);
      
      console.log(`Welcome back, ${data.username}!`);
    } else {
      setAuthState(prev => ({ ...prev, status: 'idle' }));
      console.log('Login failed:', data.message);
    }
  };

  // Registration initiation removed - now handled directly by components via WebSocket

  const onRegister = (data) => {
    clearLoadingAction('register');
    
    if (data.success) {
      const userData = {
        id: data.userId,
        username: data.username
      };
      
      // Directly set auth state - no validation needed
      setAuthState({
        user: userData,
        authToken: data.accessToken,
        refreshToken: data.refreshToken,
        status: 'idle',
        attempts: 0,
        messageQueue: []
      });
      
      // Save to AsyncStorage for future auto-login
      saveAuthData(data.accessToken, data.refreshToken, userData);
      
      // Enable auto-reconnect for authenticated users
      WebSocketService.setShouldReconnect(true);
      
      console.log(`Registration successful! Welcome, ${data.username}!`);
    } else {
      setAuthState(prev => ({ ...prev, status: 'idle' }));
      console.log('Registration failed:', data.message);
    }
  };

  const onTokenRefreshed = (data) => {
    if (data.success) {
      // Update auth state directly with new access token
      setAuthState(prev => ({
        ...prev,
        authToken: data.accessToken,
        status: 'idle'
      }));
      
      // Save updated token to AsyncStorage
      saveAuthData(data.accessToken, authState.refreshToken, authState.user);
      
      processMessageQueue();
      
      // Resolve the pending promise
      if (pendingOperations.current.refreshResolve) {
        pendingOperations.current.refreshResolve(data.accessToken);
      }
      pendingOperations.current.refresh = null;
      pendingOperations.current.refreshResolve = null;
      pendingOperations.current.refreshReject = null;
    } else {
      setAuthState(prev => {
        const newAttempts = prev.attempts + 1;
        
        // Only logout after 3 failed attempts
        if (newAttempts >= 3) {
          console.log('Session expired. Please login again.');
          clearAuthData();
          
          // Reject the pending promise
          if (pendingOperations.current.refreshReject) {
            pendingOperations.current.refreshReject(new Error('Token refresh failed'));
          }
          pendingOperations.current.refresh = null;
          pendingOperations.current.refreshResolve = null;
          pendingOperations.current.refreshReject = null;
          
          return { 
            user: null,
            authToken: null,
            refreshToken: null,
            status: 'idle',
            attempts: 0,
            messageQueue: []
          };
        } else {
          // Retry after a short delay - reset status to idle for retry
          pendingOperations.current.refresh = null; // Clear current promise
          pendingOperations.current.refreshResolve = null;
          pendingOperations.current.refreshReject = null;
          setTimeout(() => {
            attemptTokenRefresh();
          }, 1000 * newAttempts); // Exponential backoff
          
          return { ...prev, status: 'idle', attempts: newAttempts };
        }
      });
    }
  };

  // Token validation removed - auth state set directly by login/register handlers

  const onConnected = async (data) => {
    logger.logWebSocketEvent('server_connected', { connectionId: data.connectionId });
    setConnected(true);
    
    // Check AsyncStorage for saved credentials and restore auth state directly
    try {
      const savedToken = await AsyncStorage.getItem('authToken');
      const savedRefreshToken = await AsyncStorage.getItem('refreshToken');
      const savedUser = await AsyncStorage.getItem('userData');
      
      if (savedToken && savedRefreshToken && savedToken !== 'null' && savedRefreshToken !== 'null' && savedUser) {
        const userData = JSON.parse(savedUser);
        console.log('Found saved credentials, restoring auth state...');
        
        // Directly restore auth state - no validation needed
        setAuthState({
          user: userData,
          authToken: savedToken,
          refreshToken: savedRefreshToken,
          status: 'idle',
          attempts: 0,
          messageQueue: []
        });
        
        // Enable auto-reconnect for authenticated users
        WebSocketService.setShouldReconnect(true);
      } else {
        console.log('No saved credentials found, staying on intro');
      }
    } catch (error) {
      console.log('Error loading saved token:', error);
      logger.logError(error, { type: 'authentication_error', action: 'load_saved_auth' });
    }
  };

  // ONLY place playerBalance is updated
  const onBalance = (data) => {
    setPlayerBalance(data.balance);
  };


  const onAvailableGames = (data) => {
    setAvailableGames(data.availableGames);
  };

  const onLogout = (data) => {
    clearLoadingAction('logout');
    
    // Clear all auth data regardless of success/failure
    setAuthState({
      user: null,
      authToken: null,
      refreshToken: null,
      status: 'idle',
      attempts: 0,
      messageQueue: []
    });
    
    // Reset global states
    setPlayerBalance(0);
    setAvailableGames([]);
    
    // Disable auto-reconnect when logged out
    WebSocketService.setShouldReconnect(false);
    
    clearAuthData();
  };

  useEffect(() => {
    // Initialize WebSocket connection and set up message handlers
    try {
      // Set up incoming message handlers
      WebSocketService.onMessage('availableGames', onAvailableGames);
      WebSocketService.onMessage('balance', onBalance);
      WebSocketService.onMessage('connected', onConnected);
      WebSocketService.onMessage('login', onLogin);
      WebSocketService.onMessage('logout', onLogout);
      WebSocketService.onMessage('register', onRegister);
      WebSocketService.onMessage('tokenRefreshed', onTokenRefreshed);
      WebSocketService.connect();
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


  const saveAuthData = async (accessToken, refreshToken, userData) => {
    try {
      // Atomic write using multiSet
      await AsyncStorage.multiSet([
        ['authToken', accessToken],
        ['refreshToken', refreshToken],
        ['userData', JSON.stringify(userData)]
      ]);
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
    // Return existing promise if refresh already in progress
    if (pendingOperations.current.refresh) {
      return pendingOperations.current.refresh;
    }
    
    // Create new refresh promise
    pendingOperations.current.refresh = new Promise((resolve, reject) => {
      if (authState.refreshToken && authState.refreshToken !== 'null' && authState.status === 'idle') {
        setAuthState(prev => ({ ...prev, status: 'refreshing' }));
        
        // Store resolve/reject for later use in onTokenRefreshed
        pendingOperations.current.refreshResolve = resolve;
        pendingOperations.current.refreshReject = reject;
        
        // Send refresh request with refresh token (not access token)
        WebSocketService.sendMessage('refreshToken', { 
          refreshToken: authState.refreshToken 
        });
      } else {
        // No refresh token, clear auth state
        setAuthState({
          user: null,
          authToken: null,
          refreshToken: null,
          status: 'idle',
          attempts: 0,
          messageQueue: []
        });
        console.log('Session expired. Please login again.');
        setAuthState(prev => ({ ...prev, ...initialAuthState }));
        reject(new Error('No refresh token available'));
      }
    });
    
    return pendingOperations.current.refresh;
  };

  const processMessageQueue = () => {
    // Use functional update to ensure atomic queue processing
    setAuthState(currentState => {
      // Process all queued messages with fresh token
      currentState.messageQueue.forEach(({ messageType, data }) => {
        // Send queued messages directly with fresh token (skip expiration check)
        WebSocketService.sendMessage(messageType, {
          ...data,
          token: currentState.authToken
        });
      });
      
      // Clear the queue and reset status atomically
      return { ...currentState, status: 'idle', messageQueue: [] };
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
      if (!authState.authToken) {
        console.log('Please login to continue');
        return;
      }
      
      // Check if token is expired and refresh if needed
      if (isTokenExpired(authState.authToken)) {
        // Add to message queue atomically
        setAuthState(prev => ({
          ...prev,
          messageQueue: [...prev.messageQueue, { messageType, data }]
        }));
        
        // Only start refresh if not already refreshing
        if (authState.status === 'idle') {
          attemptTokenRefresh();
        }
      } else {
        // Send with token included in message
        WebSocketService.sendMessage(messageType, {
          ...data,
          token: authState.authToken
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
      // Check if token expires in next 2 minutes (buffer for refresh)
      return payload.exp < (currentTime + 120);
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
    user: authState.user,
    authToken: authState.authToken,
    refreshToken: authState.refreshToken,
    availableGames,
    playerBalance,
    toast,
    loadingActions,
    
    // Actions
    sendMessage,
    addLoadingAction,
    clearLoadingAction,
    showToast,
    hideToast
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