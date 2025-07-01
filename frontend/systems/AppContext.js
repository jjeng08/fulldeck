import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WebSocketService from './websocket';
import { text as t } from '../shared/text';

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

  // Handlers for messages coming FROM backend TO frontend
  const incomingMessages = {
    balanceReceived: (data) => {
      setUser(prev => prev ? { ...prev, balance: data.balance } : null);
    },
    
    balanceUpdated: (data) => {
      // Real-time balance update from external systems (ATM, admin, etc.)
      setUser(prev => prev ? { ...prev, balance: data.newBalance } : null);
      setGameMessage(t.balanceUpdated.replace('{balance}', data.newBalance.toFixed(2)));
    },
    
    betAccepted: (data) => {
      setCurrentBet(data.betAmount);
      setUser(prev => prev ? { ...prev, balance: data.newBalance } : null);
      setGameState('ready_to_deal');
      setGameMessage('Bet placed! Ready to deal cards.');
    },
    
    cardDealt: (data) => {
      setPlayerHand(data.playerHand || []);
      setGameMessage(`Card dealt: ${data.card?.value || 'Unknown'} of ${data.card?.suit || 'Unknown'}`);
    },
    
    connectionEstablished: (data) => {
      setConnected(true);
      setGameMessage('Connected to server. Please login to continue.');
    },
    
    errorOccurred: (data) => {
      setGameMessage(`Error: ${data.message}`);
    },
    
    gameEnded: (data) => {
      setGameState('game_ended');
      setDealerHand(data.dealerHand || []);
      setGameMessage(`Game ${data.result}! Amount: $${data.amountWon || data.amountLost || 0}`);
      
      // Update balance
      if (user) {
        const balanceChange = data.amountWon || -data.amountLost || 0;
        setUser(prev => ({ ...prev, balance: prev.balance + balanceChange }));
      }
    },
    
    gameStarted: (data) => {
      setGameState('game_active');
      setPlayerHand(data.playerHand || []);
      setDealerHand(data.dealerHand || []);
      setGameMessage('Game started! Make your move.');
    },
    
    loginCompleted: (data) => {
      if (data.success) {
        const userData = {
          id: data.userId,
          username: data.username,
          balance: data.balance
        };
        setUser(userData);
        setAuthToken(data.accessToken);
        setRefreshToken(data.refreshToken);
        setIsAuthenticated(true);
        setGameMessage(`Welcome back, ${data.username}!`);
        saveAuthData(data.accessToken, data.refreshToken, userData);
        
        // Auto-navigate to blackjack after successful login
        if (global.navigation) {
          global.navigation.navigate('Blackjack');
        }
      } else {
        setGameMessage(data.message || 'Login failed. Please try again.');
      }
    },
    
    betAccepted: (data) => {
      // Update user balance
      if (user) {
        setUser(prev => ({ ...prev, balance: data.newBalance }));
      }
      // Update table state if provided
      if (data.tableState) {
        setTableState(data.tableState);
      }
      setGameMessage(`Bet placed: $${data.betAmount}`);
    },
    
    gameStateUpdate: (data) => {
      setTableState(data);
      if (data.dealerCards?.length > 0) {
        setGameMessage('Cards dealt! Make your move.');
      }
    },
    
    tableJoinResult: (data) => {
      if (data.success) {
        setTableState(data.tableState);
        setGameMessage('Joined table successfully!');
      } else {
        setGameMessage(`Failed to join table: ${data.error}`);
      }
    },
    
    tableLeaveResult: (data) => {
      if (data.success) {
        // Update user balance if provided
        if (data.updatedBalance !== undefined && user) {
          setUser(prev => ({ ...prev, balance: data.updatedBalance }));
        }
        setGameMessage('Left table successfully');
        // Clear table state
        setTableState({});
      } else {
        setGameMessage(`Failed to leave table: ${data.message}`);
      }
    },
    
    gameReady: (data) => {
      setGameState('waiting_for_bet');
      setCurrentBet(0);
      setPlayerHand([]);
      setDealerHand([]);
      setUser(prev => prev ? { ...prev, balance: data.balance } : null);
      setGameMessage('Ready for a new game! Place your bet.');
    },
    
    registrationCompleted: (data) => {
      if (data.success) {
        const userData = {
          id: data.userId,
          username: data.username,
          balance: data.balance
        };
        setUser(userData);
        setAuthToken(data.accessToken);
        setRefreshToken(data.refreshToken);
        setIsAuthenticated(true);
        
        // Show success toast instead of auto-login
        setToast({
          visible: true,
          message: `Registration successful! Welcome, ${data.username}!`,
          type: 'success'
        });
        
        saveAuthData(data.accessToken, data.refreshToken, userData);
        
        // Auto-navigate to blackjack after successful registration
        if (global.navigation) {
          global.navigation.navigate('Blackjack');
        }
      } else {
        setGameMessage(data.message || 'Registration failed. Please try again.');
      }
    },
    
    tokenValidated: (data) => {
      if (!data.valid) {
        // Token is invalid, try to refresh
        attemptTokenRefresh();
      } else {
        // Token is valid, update user data
        const userData = {
          id: data.userId,
          username: data.username,
          balance: data.balance
        };
        setUser(userData);
        setIsAuthenticated(true);
        setGameMessage(`Welcome back, ${data.username}!`);
      }
    },
    
    tokenRefreshed: (data) => {
      if (data.success) {
        const userData = {
          id: data.userId,
          username: data.username,
          balance: data.balance
        };
        setAuthToken(data.accessToken);
        setUser(userData);
        setIsRefreshing(false);
        // Save updated auth data
        saveAuthData(data.accessToken, refreshToken, userData);
        // Process queued messages
        processMessageQueue();
      } else {
        // Refresh failed, clear auth state
        setUser(null);
        setAuthToken(null);
        setRefreshToken(null);
        setIsAuthenticated(false);
        setIsRefreshing(false);
        setMessageQueue([]);
        setGameMessage('Session expired. Please login again.');
        clearAuthData();
      }
    },
    
    tableJoinResult: (data) => {
      if (data.success) {
        console.log('DEBUG: tableJoinResult data:', data);
        console.log('DEBUG: user?.id:', user?.id);
        console.log('DEBUG: players:', data.tableState.players);
        
        const myPlayer = data.tableState.players.find(p => p.userId === user?.id);
        // If no round in progress and game is waiting, new players should be active
        const defaultStatus = (!data.tableState.roundInProgress && data.tableState.gameStatus === 'waiting') ? 'active' : 'observer';
        const myStatus = myPlayer?.status || defaultStatus;
        
        console.log('DEBUG: myPlayer:', myPlayer);
        console.log('DEBUG: defaultStatus logic:', defaultStatus);
        console.log('DEBUG: calculated myStatus:', myStatus);
        
        // Update table state
        setTableState({
          tableId: data.tableId,
          players: data.tableState.players,
          gameStatus: data.tableState.gameStatus,
          currentTurn: data.tableState.currentTurn,
          dealerCards: data.tableState.dealerCards,
          betLevel: data.tableState.betLevel,
          betAmounts: data.tableState.betAmounts,
          maxBet: data.tableState.maxBet || 20,
          bettingTimeLeft: data.tableState.bettingTimeLeft || 0,
          canBet: data.tableState.canBet || false,
          myStatus: myStatus
        });
        
        // Don't set any message here - let the backend welcome sequence handle it
      } else {
        setGameMessage(data.message || 'Failed to join table. Please try again.');
      }
    },
    
    tableLeaveResult: (data) => {
      if (data.success) {
        // Clear table state
        setTableState({
          tableId: null,
          players: [],
          gameStatus: 'waiting',
          currentTurn: null,
          dealerCards: [],
          betLevel: 1,
          betAmounts: null,
          myStatus: 'observer'
        });
        
        // Clear any existing message when leaving table
        setGameMessage('');
      } else {
        setGameMessage(data.message || 'Failed to leave table. Please try again.');
      }
    },
    
    gameMessage: (data) => {
      setGameMessage(data.message);
    },
    
    pillMessage: (data) => {
      setGameMessage(data.message);
    },
    
    bettingStarted: (data) => {
      setTableState(prev => ({
        ...prev,
        gameStatus: 'betting',
        bettingTimeLeft: data.timeLeft,
        canBet: true
      }));
    },
    
    bettingTimer: (data) => {
      setTableState(prev => ({
        ...prev,
        bettingTimeLeft: data.timeLeft
      }));
    },
    
    autoSubmitBets: (data) => {
      // Trigger auto-submission of current bet from TablePage
      setTableState(prev => ({
        ...prev,
        autoSubmitTrigger: Date.now() // Use timestamp to trigger effect
      }));
    }
  };

  // Handlers for messages going FROM frontend TO backend (local-only actions)
  const outgoingMessages = {
    performLogout: () => {
      setUser(null);
      setAuthToken(null);
      setRefreshToken(null);
      setIsAuthenticated(false);
      setGameState('waiting_for_bet');
      setCurrentBet(0);
      setPlayerHand([]);
      setDealerHand([]);
      setGameMessage();
      clearAuthData();
    }
  };

  useEffect(() => {
    // Initialize WebSocket connection (no token needed for connection)
    try {
      WebSocketService.connect();

      // Set up all incoming message handlers (from backend to frontend)
      Object.keys(incomingMessages).forEach(messageType => {
        WebSocketService.onMessage(messageType, incomingMessages[messageType]);
      });
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      setConnected(false);
    }

    // Cleanup on unmount
    return () => {
      try {
        WebSocketService.disconnect();
      } catch (error) {
        console.error('Error disconnecting WebSocket:', error);
      }
    };
  }, []); // No dependency on authToken - connect once

  const loadSavedToken = async () => {
    try {
      const savedToken = await AsyncStorage.getItem('authToken');
      const savedRefreshToken = await AsyncStorage.getItem('refreshToken');
      
      if (savedToken && savedRefreshToken) {
        const savedUser = await AsyncStorage.getItem('userData');
        if (savedUser) {
          setAuthToken(savedToken);
          setRefreshToken(savedRefreshToken);
          setUser(JSON.parse(savedUser));
          setIsAuthenticated(true);
          setGameMessage(`Welcome back, ${JSON.parse(savedUser).username}!`);
        }
      }
    } catch (error) {
      console.error('Error loading saved auth:', error);
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
      console.error('Error saving auth data:', error);
    }
  };

  const clearAuthData = async () => {
    try {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('refreshToken');
      await AsyncStorage.removeItem('userData');
    } catch (error) {
      console.error('Error clearing auth data:', error);
    }
  };

  const attemptTokenRefresh = () => {
    if (refreshToken && !isRefreshing) {
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
      // Send queued messages with token included
      WebSocketService.sendMessage(messageType, {
        ...data,
        token: authToken
      });
    });
  };

  // Generic message sender with automatic token inclusion
  const sendMessage = (messageType, data = {}) => {
    // Handle local-only actions (messages that don't go to backend)
    if (outgoingMessages[messageType]) {
      outgoingMessages[messageType](data);
    } else {
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
      console.error('Token decode error:', error);
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

  const value = {
    // State
    connected,
    user,
    isAuthenticated,
    isLoadingAuth,
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