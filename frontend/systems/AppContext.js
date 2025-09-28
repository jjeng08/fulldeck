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

  const initiateLogin = (username, password) => {
    // Only allow login if currently idle
    if (authState.status !== 'idle') {
      console.log('Auth operation already in progress');
      return;
    }
    
    // Set status to logging_in
    setAuthState(prev => ({ ...prev, status: 'logging_in' }));
    addLoadingAction('login');
    
    // Make HTTP login request directly
    const config = getConfig();
    const apiBaseUrl = config.apiBaseUrl;
    
    fetch(`${apiBaseUrl}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
      if (data.status === 200) {
        onLogin({ success: true, ...data.data });
      } else {
        onLogin({ success: false, message: data.errorMessage });
      }
    })
    .catch(error => {
      console.error('Login request failed:', error);
      setAuthState(prev => ({ ...prev, status: 'idle' }));
      clearLoadingAction('login');
    });
  };

  const onLogin = (data) => {
    clearLoadingAction('login');
    logger.logAuthEvent('login_response_received', null, { 
      success: data.success, 
      userId: data.userId 
    });
    
    if (data.success) {
      // Store validation data for onTokenValidated to use
      pendingOperations.current.validationData = {
        token: data.accessToken,
        refreshToken: data.refreshToken,
        userData: {
          id: data.userId,
          username: data.username
        }
      };
      
      // Send token through validation flow for consistency
      WebSocketService.sendMessage('validateToken', { token: data.accessToken });
    } else {
      setAuthState(prev => ({ ...prev, status: 'idle' }));
      console.log('Login failed:', data.message);
    }
  };

  const initiateRegistration = (username, password) => {
    // Only allow registration if currently idle
    if (authState.status !== 'idle') {
      console.log('Auth operation already in progress');
      return;
    }
    
    // Set status to logging_in (registration uses same flow as login)
    setAuthState(prev => ({ ...prev, status: 'logging_in' }));
    addLoadingAction('register');
    
    // Make HTTP registration request directly
    const config = getConfig();
    const apiBaseUrl = config.apiBaseUrl;
    
    fetch(`${apiBaseUrl}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
      if (data.status === 200) {
        onRegister({ success: true, ...data.data });
      } else {
        onRegister({ success: false, message: data.errorMessage });
      }
    })
    .catch(error => {
      console.error('Registration request failed:', error);
      setAuthState(prev => ({ ...prev, status: 'idle' }));
      clearLoadingAction('register');
    });
  };

  const onRegister = (data) => {
    clearLoadingAction('register');
    
    if (data.success) {
      // Store validation data for onTokenValidated to use
      pendingOperations.current.validationData = {
        token: data.accessToken,
        refreshToken: data.refreshToken,
        userData: {
          id: data.userId,
          username: data.username
        }
      };
      
      // Send token through validation flow for consistency
      WebSocketService.sendMessage('validateToken', { token: data.accessToken });
      console.log(`Registration successful! Welcome, ${data.username}!`);
    } else {
      setAuthState(prev => ({ ...prev, status: 'idle' }));
      console.log('Registration failed:', data.message);
    }
  };

  const onTokenRefreshed = (data) => {
    if (data.success) {
      // Store validation data for onTokenValidated to use
      pendingOperations.current.validationData = {
        token: data.accessToken,
        refreshToken: authState.refreshToken, // Keep existing refresh token
        userData: authState.user
      };
      
      // Send token through validation flow for consistency
      WebSocketService.sendMessage('validateToken', { token: data.accessToken });
      
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

  const onTokenValidated = async (data) => {
    const validationData = pendingOperations.current.validationData;
    
    if (data.valid && validationData) {
      // Token validated - set authState with confirmed data
      setAuthState({
        user: validationData.userData,
        authToken: validationData.token,
        refreshToken: validationData.refreshToken,
        status: 'idle',
        attempts: 0,
        messageQueue: []
      });
      console.log(`Welcome back, ${validationData.userData.username}!`);
      
      // Save to AsyncStorage for future auto-login
      saveAuthData(validationData.token, validationData.refreshToken, validationData.userData);
      
      // Enable auto-reconnect for authenticated users
      WebSocketService.setShouldReconnect(true);
    } else {
      // No valid token or validation failed - stay on intro screen
      console.log(data.valid === false ? 'Token validation failed' : 'No token provided');
      if (validationData) {
        // Clear invalid saved data
        await clearAuthData();
      }
      // authState remains with default empty values (user stays on intro)
    }
    
    // Clear validation data
    pendingOperations.current.validationData = null;
  };

  const onConnected = async (data) => {
    logger.logWebSocketEvent('server_connected', { connectionId: data.connectionId });
    setConnected(true);
    
    // Check AsyncStorage for saved credentials
    try {
      const savedToken = await AsyncStorage.getItem('authToken');
      const savedRefreshToken = await AsyncStorage.getItem('refreshToken');
      const savedUser = await AsyncStorage.getItem('userData');
      
      if (savedToken && savedRefreshToken && savedToken !== 'null' && savedRefreshToken !== 'null' && savedUser) {
        const userData = JSON.parse(savedUser);
        console.log('Found saved credentials, validating token...');
        
        // Store validation data for onTokenValidated to use
        pendingOperations.current.validationData = {
          token: savedToken,
          refreshToken: savedRefreshToken,
          userData: userData
        };
        
        // Send validation request
        WebSocketService.sendMessage('validateToken', { token: savedToken });
      } else {
        console.log('No saved credentials found, staying on intro');
        // Send empty validation to indicate no token
        WebSocketService.sendMessage('validateToken', {});
      }
    } catch (error) {
      console.log('Error loading saved token:', error);
      logger.logError(error, { type: 'authentication_error', action: 'load_saved_auth' });
      // Send empty validation on error
      WebSocketService.sendMessage('validateToken', {});
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
      WebSocketService.onMessage('logout', onLogout);
      WebSocketService.onMessage('tokenRefreshed', onTokenRefreshed);
      WebSocketService.onMessage('tokenValidated', onTokenValidated);
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
        WebSocketService.removeMessageHandler('logout');
        WebSocketService.removeMessageHandler('tokenRefreshed');
        WebSocketService.removeMessageHandler('tokenValidated');
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
    hideToast,
    initiateLogin,
    initiateRegistration
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