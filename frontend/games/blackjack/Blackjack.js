import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from 'systems/AppContext';
import { tableStyles as s } from './BlackjackStyles';
import { text as t } from 'shared/text';
import { formatCurrency } from 'shared/utils';
import Button from 'components/Button';

export default function Blackjack({ route }) {
  const navigation = useNavigation();
  const { 
    user, 
    playerBalance,
    loadingActions,
    sendMessage
  } = useApp();
  
  // Get navigation params
  const { selectedTier, tiers, maxMulti } = route?.params || {};
  
  // Get selected tier configuration
  const tierConfig = selectedTier !== undefined && tiers ? tiers[selectedTier] : [100, 200, 500];

  // Simplified game state
  const [gameState, setGameState] = useState({
    playerCards: [],
    dealerCards: [],
    playerValue: 0,
    dealerValue: 0,
    currentBet: 0,
    gameStatus: 'betting', // 'betting', 'playing', 'finished'
    result: null, // 'win', 'lose', 'push', 'blackjack'
    canHit: false,
    canStand: false
  });

  const formatCurrencyButton = (cents) => {
    if (cents < 100) {
      return `${cents}¢`;
    }
    return `$${(cents / 100).toLocaleString()}`;
  };

  const onAddBet = (betAmount) => {
    if (gameState.gameStatus === 'betting') {
      const highestTierValue = Math.max(...tierConfig);
      const maxBetLimit = (maxMulti || 5) * highestTierValue;
      const newBet = gameState.currentBet + betAmount;
      
      // Check if new bet would exceed limits
      if (newBet <= playerBalance && newBet <= maxBetLimit) {
        setGameState(prev => ({
          ...prev,
          currentBet: newBet
        }));
      }
    }
  };

  const onSubtractBet = (betAmount) => {
    if (gameState.gameStatus === 'betting') {
      const newBet = Math.max(0, gameState.currentBet - betAmount);
      setGameState(prev => ({
        ...prev,
        currentBet: newBet
      }));
    }
  };

  const onLeaveTable = () => {
    navigation.navigate('Lobby');
  };

  const onPlaceBet = (addLoadingCallback) => {
    if (gameState.currentBet > 0) {
      addLoadingCallback();
      sendMessage('placeBet', {
        amount: gameState.currentBet
      });
    }
  };

  // Reset bet when balance changes (indicating bet was processed)
  useEffect(() => {
    if (gameState.gameStatus === 'betting' && gameState.currentBet > 0) {
      setGameState(prev => ({
        ...prev,
        currentBet: 0,
        gameStatus: 'dealing'
      }));
    }
  }, [playerBalance]);

  const renderBetButtons = () => {
    const buttonStyleNames = ['Blue', 'Red', 'Black'];
    const isPageBlocked = loadingActions.size > 0;

    return (
      <View style={s.betButtonsContainer}>
        {tierConfig.map((betAmount, index) => {
          const styleName = buttonStyleNames[index] || 'Blue';
          const isDisabled = gameState.gameStatus !== 'betting' || isPageBlocked;
          
          return (
            <View key={index} style={s.betButtonColumn}>
              <TouchableOpacity
                style={[
                  s.betButton,
                  s[`betButton${styleName}`],
                  isDisabled && { opacity: 0.5 }
                ]}
                onPress={() => onAddBet(betAmount)}
                disabled={isDisabled}
                testID={`betButton${styleName}`}
              >
                <Text style={s.betButtonText}>
                  {formatCurrencyButton(betAmount)}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  s.minusButton,
                  isDisabled && { opacity: 0.5 }
                ]}
                onPress={() => onSubtractBet(betAmount)}
                disabled={isDisabled}
                testID={`minusButton${styleName}`}
              >
                <Text style={s.minusButtonText}>-</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Blackjack</Text>
        <Button 
          label="Back to Lobby"
          onPress={onLeaveTable}
          style={s.leaveButton}
        />
      </View>

      {/* Game Area */}
      <View style={s.gameArea}>
        <Text style={s.gameStatus}>
          {gameState.gameStatus === 'betting' ? 'Select your bet amount' : 'Game in progress'}
        </Text>
        
        {/* Current Bet Display */}
        {gameState.currentBet > 0 && (
          <Text style={s.currentBet}>
            Current Bet: {formatCurrency(gameState.currentBet)}
          </Text>
        )}
      </View>

      {/* Betting Buttons */}
      <View style={s.bottomArea}>
        {/* Player Balance */}
        <Text style={s.balance}>
          {t.balance.replace('{balance}', formatCurrency(playerBalance - gameState.currentBet))}
        </Text>
        
        {renderBetButtons()}
        
        {/* Place Bet Button */}
        <Button
          label="Place Bet"
          onPress={onPlaceBet}
          style={[
            s.placeBetButton,
            gameState.currentBet === 0 && s.placeBetButtonDisabled
          ]}
          disabled={gameState.currentBet === 0}
          testID="placeBetButton"
          messageType="placeBet"
        />
      </View>
    </View>
  );
}