import React, { createContext, useContext } from 'react';

import { useApp } from './AppContext';
import { getConfig } from '../shared/environment';
import logger from '../shared/logger';

const UtilsContext = createContext();

const { apiBaseUrl } = getConfig();

export function UtilsProvider({ children }) {
  const { authToken, refreshToken } = useApp();

  // API endpoint definitions
  const endpointMap = {
    creditAccount: {
      method: 'POST',
      url: 'credit-account'
    },
    debitAccount: {
      method: 'POST',
      url: 'debit-account'
    },
    getBalance: {
      method: 'GET',
      url: (params) => `balance/${params.playerId}`
    },
    getPlayer: {
      method: 'GET',
      url: (params) => `player/${params.playerId}`
    },
    getPlayerByUsername: {
      method: 'GET',
      url: (params) => `player-by-username/${params.username}`
    },
    getAccountLogsByUsername: {
      method: 'GET',
      url: (params) => `account-logs-by-username/${params.username}`
    },
    login: {
      method: 'POST',
      url: 'login'
    },
    register: {
      method: 'POST',
      url: 'register'
    }
  };

  const getRequestConfig = (endpointId, params, newAccessToken) => {
    const endpoint = endpointMap[endpointId];
    if (!endpoint) {
      throw new Error(`Unknown endpoint: ${endpointId}`);
    }

    const token = newAccessToken || authToken;
    const url = typeof endpoint.url === 'function' ? endpoint.url(params) : endpoint.url;
    
    return {
      method: endpoint.method,
      url: `${apiBaseUrl}/api/${url}`,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    };
  };

  const handleCallResponse = (response, callback, props) => {
    const responseData = {
      status: response.status,
      data: response.status === 200 ? response.data.data : {},
      ...(response.status !== 200 && { errorMessage: response.data.errorMessage })
    };
    
    callback(responseData, props);
  };

  const handleErrorResponse = async (originalCall, endpointId, callback, params, props, errorResponse) => {
    if (errorResponse?.status === 401 && refreshToken) {
      // Token expired, attempt refresh and retry
      try {
        const refreshResponse = await fetch(`${apiBaseUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            refreshToken: refreshToken
          })
        });
        
        const refreshData = await refreshResponse.json();
        if (refreshData?.accessToken) {
          // Retry original call with new token
          return originalCall(endpointId, callback, params, props, refreshData.accessToken);
        }
      } catch (refreshError) {
        logger.logError(refreshError, { type: 'api_error', action: 'token_refresh_failed' });
      }
    }

    // Handle error response
    const errorData = {
      status: errorResponse?.status || 500,
      data: {},
      errorMessage: errorResponse?.data?.errorMessage || 'Request failed'
    };
    
    callback(errorData, props);
  };

  const callAPI = async (endpointId, callback, params = {}, props) => {
    try {
      // Use token from props if provided, otherwise use authToken
      const tokenToUse = props?.token || authToken;
      
      // Debug: Log token status
      console.log('UtilsContext - using token:', tokenToUse ? (props?.token ? 'props override' : 'authToken') : 'missing');
      console.log('UtilsContext - token preview:', tokenToUse ? tokenToUse.substring(0, 20) + '...' : 'none');
      
      // Use the selected token
      const reqConfig = getRequestConfig(endpointId, params, tokenToUse);
      
      // Debug: Log request details
      console.log('Request URL:', reqConfig.url);
      console.log('Request headers:', reqConfig.headers);
      
      let fetchOptions = {
        method: reqConfig.method,
        headers: reqConfig.headers
      };

      let url = reqConfig.url;
      
      if (reqConfig.method === 'GET') {
        // For GET requests, URL is already constructed with all needed params
        // No additional query params needed since URL functions handle everything
      } else {
        // Add params to body for POST/PUT/DELETE methods
        fetchOptions.body = JSON.stringify(params);
      }

      const response = await fetch(url, fetchOptions);
      const data = await response.json();
      
      const responseObj = {
        data: data,
        status: response.status
      };
      
      handleCallResponse(responseObj, callback, props);
    } catch (err) {
      await handleErrorResponse(callAPI, endpointId, callback, params, props, err);
    }
  };

  const value = {
    callAPI
  };

  return (
    <UtilsContext.Provider value={value}>
      {children}
    </UtilsContext.Provider>
  );
}

export function useUtils() {
  const context = useContext(UtilsContext);
  if (!context) {
    throw new Error('useUtils must be used within a UtilsProvider');
  }
  return context;
}