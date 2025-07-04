// MULTIPLAYER BLACKJACK REFERENCE
// This file contains the original multiplayer blackjack implementation using WebSockets
// Saved for future reference if multiplayer functionality needs to be restored

import React, { useState, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from 'systems/AppContext';
import { tableStyles as s } from './blackjack/BlackjackStyles';
import { text as t } from 'shared/text';
import { formatCurrency } from 'shared/utils';
import logger from 'shared/logger';
import Button from 'components/Button';

export default function MultiplayerBlackjack({ route }) {
  const navigation = useNavigation();
  const { 
    user, 
    sendMessage,
    playerBalance
  } = useApp();
  
  // Get navigation params
  const { selectedTier, tiers, maxMulti } = route?.params || {};

  // Local game state
  const [currentBet, setCurrentBet] = useState(0);
  const [gameMessage, setGameMessage] = useState('');
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
    myStatus: 'observer',
    autoSubmitTrigger: false
  });
  const [displayedBalance, setDisplayedBalance] = useState(playerBalance);
  const [showPill, setShowPill] = useState(false);
  const [pillOpacity] = useState(new Animated.Value(0));

  // Join single-player blackjack table when component mounts
  useEffect(() => {
    if (user && !tableState.tableId) {
      const joinParams = { gameMode: 'single' };
      if (selectedTier !== undefined && tiers) {
        joinParams.selectedTier = selectedTier;
        joinParams.tierConfig = tiers[selectedTier];
      }
      sendMessage('joinBlackjackTable', joinParams);
    }
  }, [user, selectedTier, tiers]);

  // Update displayed balance when player balance changes
  useEffect(() => {
    logger.logDebug('Current bet amount', { currentBet })
    setDisplayedBalance(playerBalance - currentBet);
  }, [playerBalance, currentBet]);

  // Handle pill fade in/out when gameMessage changes
  useEffect(() => {
    if (gameMessage) {
      setShowPill(true);
      // Fade in
      Animated.timing(pillOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Stay for 2.5 seconds, then fade out over 0.5 seconds
      const timer = setTimeout(() => {
        Animated.timing(pillOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => {
          setShowPill(false);
        });
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [gameMessage, pillOpacity]);

  // Handle auto bet submission when triggered by backend
  useEffect(() => {
    if (tableState.autoSubmitTrigger && currentBet > 0) {
      console.log(`Auto-submitting bet: $${currentBet}`);
      sendMessage('placeBet', { amount: currentBet });
    }
  }, [tableState.autoSubmitTrigger, currentBet, sendMessage]);

  const onLeaveTable = () => {
    sendMessage('leaveBlackjackTable');
    navigation.navigate('Lobby');
  };

  const onPlaceBet = () => {
    if (currentBet > 0) {
      sendMessage('placeBet', { amount: currentBet });
    }
  };

  const onAddBet = (amount) => {
    const maxBet = tableState.betAmounts?.maxBet || 2000;
    setCurrentBet(prev => Math.min(maxBet, prev + amount));
  };

  const onSubtractBet = (amount) => {
    setCurrentBet(prev => Math.max(0, prev - amount));
  };

  // Find current user in the players list
  const currentPlayer = tableState.players?.find(p => p.userId === user?.id);
  const otherPlayers = tableState.players?.filter(p => p.userId !== user?.id) || [];
  const betAmounts = tableState.betAmounts;
  console.log('tableState:', tableState);
  console.log('betAmounts:', betAmounts);

  const renderPlayer = (player, position) => {
    return (
      <View key={player.userId} style={s.playerSeat}>
        <Text style={s.playerName}>{player.username}</Text>
        <Text style={s.playerBalance}>{formatCurrency(player.userId === user?.id ? playerBalance : player.balance)}</Text>
        <Text style={s.playerStatus}>{player.status}</Text>
        {player.currentBet > 0 && (
          <Text style={s.playerBet}>Bet: {formatCurrency(player.currentBet)}</Text>
        )}
      </View>
    );
  };

  const renderBetControls = () => {
    const canBet = tableState.canBet;
    const isDisabled = !canBet;
    const maxBet = tableState.maxBet || 20;
    
    return (
      <View style={s.bettingArea}>
        <Text style={s.currentBetLabel}>Current Bet: {formatCurrency(currentBet)}</Text>
        
        <View style={s.betButtonsContainer}>
          {betAmounts && Object.entries(betAmounts)
            .filter(([level, amount]) => level !== 'maxBet')
            .map(([level, amount]) => (
            <View key={level} style={s.betGroup}>
              <Button 
                label={`+${formatCurrency(amount)}`}
                onPress={() => canBet && onAddBet(amount)}
                style={[s.betButton, isDisabled && s.disabled]}
                disabled={isDisabled}
              />
              <Button 
                label={`-${formatCurrency(amount)}`}
                onPress={() => canBet && onSubtractBet(amount)}
                style={[s.betButtonMinus, isDisabled && s.disabled]}
                disabled={isDisabled}
              />
            </View>
          ))}
        </View>
        
        <Button 
          label="Place Bet"
          onPress={onPlaceBet}
          style={[s.placeBetButton, currentBet === 0 && s.disabled]}
          disabled={currentBet === 0}
        />
        
        <Text style={s.userBalance}>
          {t.balance.replace('{balance}', formatCurrency(displayedBalance))}
        </Text>
      </View>
    );
  };

  const renderGameControls = () => {
    switch (tableState.gameStatus) {
      case 'playing':
        if (currentPlayer?.isCurrentTurn) {
          return (
            <View style={s.controls}>
              <Button label={"Hit"} onPress={() => sendMessage('hit')} style={s.actionButton} />
              <Button label={"Stand"} onPress={() => sendMessage('stand')} style={s.actionButton} />
            </View>
          );
        } else {
          return (
            <View style={s.controls}>
              <Text style={s.waitingMessage}>Waiting for other players...</Text>
            </View>
          );
        }
      default:
        return null; // Betting controls are at bottom
    }
  };

  // Don't render if not at a table
  if (!tableState.tableId) {
    return (
      <View style={s.container}>
        <View style={s.controls}>
          <Text style={s.gameStatus}>Not at a table. Please join from lobby.</Text>
          <Button 
            label={t.leaveTable}
            onPress={() => navigation.navigate('Lobby')}
            style={s.leaveButton}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Table header - absolutely positioned */}
      <View style={s.tableHeader}>
        <Text style={s.tableId}>Table {tableState.tableId?.slice(-8)}</Text>
        <View style={s.betLimitsContainer}>
          <Text style={s.tableBetLevel}>Min bet: $1  |  Max bet: {formatCurrency(tableState.betAmounts?.maxBet || 2000)}</Text>
        </View>
        <Button 
          label={t.leaveTable}
          onPress={onLeaveTable}
          style={s.leaveButton}
        />
      </View>

      {/* Message pill display */}
      {showPill && (
        <View style={s.messagePillRow}>
          <Animated.View style={[s.messagePill, { opacity: pillOpacity }]}>
            <Text style={s.messageText}>{gameMessage}</Text>
          </Animated.View>
        </View>
      )}

      {/* Betting timer circle */}
      {tableState.bettingTimeLeft > 0 && (
        <View style={s.timerCirclePosition}>
          <View style={s.timerCircle}>
            <Text style={s.timerText}>{tableState.bettingTimeLeft}</Text>
          </View>
        </View>
      )}

      {/* Table layout - dealer area */}
      <View style={s.dealerArea}>
        <Text style={s.dealerLabel}>{t.dealer}</Text>
        <View style={s.dealerCards}>
          {tableState.dealerCards?.length > 0 ? (
            <View>
              <Text style={s.cardCount}>
                Dealer Cards: {tableState.dealerCards.map(card => `${card.value}${card.suit}`).join(', ')}
              </Text>
            </View>
          ) : (
            <Text style={s.placeholder}>No cards dealt</Text>
          )}
        </View>
      </View>

      {/* Table seating area */}
      <View style={s.tableSeating}>
        {/* Current player cards */}
        {currentPlayer?.cards?.length > 0 && (
          <View style={s.playerCardsContainer}>
            <Text style={s.playerCardsLabel}>Your Cards:</Text>
            <Text style={s.cardCount}>
              {currentPlayer.cards.map(card => `${card.value}${card.suit}`).join(', ')}
            </Text>
            <Text style={s.handValue}>Hand Value: {currentPlayer.handValue}</Text>
          </View>
        )}
        
        {/* Other players - if any */}
        {otherPlayers.length > 0 && (
          <View style={s.otherPlayersContainer}>
            <Text style={s.otherPlayersLabel}>Other Players: {otherPlayers.length}</Text>
          </View>
        )}
      </View>

      {/* Game controls */}
      {renderGameControls()}

      {/* Fixed betting area at bottom */}
      <View style={s.bottomArea}>
        {renderBetControls()}
      </View>
    </View>
  );
}