import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Dimensions, Animated, Easing } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from 'systems/AppContext';
import { tableStyles as s } from './BlackjackStyles';
import { text as t } from 'shared/text';
import { formatCurrency } from 'shared/utils';
import Button from 'components/Button';
import Deck from 'components/Deck';
import Hand from 'components/Hand';

export default function Blackjack({ route }) {
  const navigation = useNavigation();
  const {  playerBalance, loadingActions, sendMessage } = useApp();
  const deckRef = useRef(null);
  
  // Central animation duration config
  const durations = {
    cardDeal: 1000,
    cardFlip: 300,
    deckShuffle: 800,
    handUpdate: 200
  };
  
  // Player hand state
  const [handCards, setHandCards] = useState([]);
  
  // Deck state management
  const [deckCards, setDeckCards] = useState([]);
  const [isShuffling, setIsShuffling] = useState(false);
  const [shuffleTimes, setShuffleTimes] = useState(0);
  const [portalCards, setPortalCards] = useState([]);
  const [nextCardId, setNextCardId] = useState(0);
  const [deckCoordinates, setDeckCoordinates] = useState({ x: 0, y: 0 });
  
  // Build deck with specified number of cards
  const buildDeck = (numCards) => {
    const deck = [];
    for (let i = 0; i < numCards; i++) {
      deck.push({
        id: `card${i}`,
        zIndex: i,
        top: i * 1,
        right: i * 1
      });
    }
    return deck;
  };
  
  // Initialize deck
  useEffect(() => {
    setDeckCards(buildDeck(10));
  }, []);
  
  // Shuffle deck function
  const shuffleDeck = (times = 1) => {
    if (isShuffling) return;
    setShuffleTimes(times);
    setIsShuffling(true);
  };
  
  // Shuffle effect
  useEffect(() => {
    if (isShuffling && shuffleTimes > 0) {
      // Trigger shuffle animation in deck
      setShuffleTimes(prev => {
        const remaining = prev - 1;
        if (remaining <= 0) {
          setIsShuffling(false);
        }
        return remaining;
      });
    }
  }, [isShuffling, shuffleTimes]);
  
  // Deal card function
  const dealCard = (cardData, targetPosition) => {
    const cardToDeal = cardData;
    const newCardId = nextCardId;
    setNextCardId(prev => prev + 1);
    
    const startPos = { x: deckCoordinates.x - 9, y: deckCoordinates.y + 9 };
    
    // Create portal card for animation with Animated.Values
    const portalCard = {
      id: newCardId,
      ...cardToDeal,
      startPosition: startPos,
      targetPosition: targetPosition,
      animateX: new Animated.Value(startPos.x),
      animateY: new Animated.Value(startPos.y),
      animateRotateY: new Animated.Value(0),
      isFlipping: false,
    };

    setPortalCards(prev => [...prev, portalCard]);
    
    // Start position animation
    Animated.parallel([
      Animated.timing(portalCard.animateX, {
        toValue: targetPosition.x,
        duration: durations.cardDeal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(portalCard.animateY, {
        toValue: targetPosition.y,
        duration: durations.cardDeal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Animation complete - move to hand
      setHandCards(prev => {
        const newHand = [...prev, {
          id: portalCard.id,
          suit: portalCard.suit,
          value: portalCard.value,
          faceUp: true,
        }];
        // Recalculate positions for all cards in hand
        return newHand.map((c, index) => ({
          ...c,
          position: getPlayerCardPosition(index, newHand.length),
        }));
      });
      
      // Remove from portal
      setPortalCards(prev => prev.filter(c => c.id !== portalCard.id));
    });
    
    // Flip animation - starts halfway through deal
    setTimeout(() => {
      Animated.timing(portalCard.animateRotateY, {
        toValue: 180,
        duration: durations.cardFlip,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, durations.cardDeal / 2);
    
    // Change to red background at middle of flip animation
    setTimeout(() => {
      setPortalCards(prev => prev.map(c => 
        c.id === portalCard.id ? { ...c, isFlipping: true } : c
      ));
    }, durations.cardDeal / 2 + durations.cardFlip / 2);
    
    return portalCard;
  };
  
  // Calculate player area position
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const playerAreaY = screenHeight - 400;
  
  // Calculate card position in player hand
  const getPlayerCardPosition = (cardIndex, totalCards) => {
    const CARD_WIDTH = 90;
    const CARD_OVERLAP = 0.3 * CARD_WIDTH; // 30% overlap
    const totalWidth = CARD_WIDTH + (totalCards - 1) * CARD_OVERLAP;
    const centerStart = (screenWidth - totalWidth) / 2;
    const leftOffset = cardIndex * CARD_OVERLAP;
    
    return {
      x: centerStart + leftOffset,
      y: playerAreaY,
    };
  };
  
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
    gameStatus: 'betting', // 'betting', 'playing'
    canHit: false,
    canStand: false,
    canSplit: false,
    buyInsurance: false
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

  // Temporary function to test state transitions
  const onTestStateChange = () => {
    setGameState(prev => ({
      ...prev,
      gameStatus: prev.gameStatus === 'betting' ? 'playing' : 'betting',
      canHit: prev.gameStatus === 'betting',
      canStand: prev.gameStatus === 'betting',
      canSplit: prev.gameStatus === 'betting' && Math.random() > 0.5,
      buyInsurance: prev.gameStatus === 'betting' && Math.random() > 0.7
    }));
  };

  // Test card dealing
  const onTestDeal = () => {
    const currentHandSize = handCards.length;
    const targetPosition = getPlayerCardPosition(currentHandSize, currentHandSize + 1);
    dealCard({ suit: 'hearts', value: 'A' }, targetPosition);
  };

  // Test shuffle animation
  const onTestShuffle = () => {
    shuffleDeck(1);
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
        gameStatus: 'playing'
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

  const renderBettingControls = () => {
    return (
      <>
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
      </>
    );
  };

  const renderPlayingControls = () => {
    const isPageBlocked = loadingActions.size > 0;
    
    return (
      <View style={s.playingControlsContainer}>
        {/* Main Action Buttons */}
        <View style={s.mainActionsRow}>
          <Button
            label="Hit"
            onPress={() => console.log('Hit pressed')}
            style={s.actionButton}
            disabled={!gameState.canHit || isPageBlocked}
            testID="hitButton"
          />
          
          <Button
            label="Stand"
            onPress={() => console.log('Stand pressed')}
            style={s.actionButton}
            disabled={!gameState.canStand || isPageBlocked}
            testID="standButton"
          />
        </View>
        
        {/* Secondary Action Buttons */}
        <View style={s.secondaryActionsRow}>
          {gameState.canSplit && (
            <Button
              label="Split"
              onPress={() => console.log('Split pressed')}
              style={s.secondaryActionButton}
              disabled={isPageBlocked}
              testID="splitButton"
            />
          )}
          
          <Button
            label="Double Down"
            onPress={() => console.log('Double Down pressed')}
            style={s.secondaryActionButton}
            disabled={isPageBlocked}
            testID="doubleDownButton"
          />
          
          {gameState.buyInsurance && (
            <Button
              label="Insurance"
              onPress={() => console.log('Insurance pressed')}
              style={s.secondaryActionButton}
              disabled={isPageBlocked}
              testID="insuranceButton"
            />
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      {/* TOP SECTION - Dark Green Banner */}
      <View style={s.topBanner}>
        <Text style={s.title}>Blackjack</Text>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <Button 
            label={`Test: ${gameState.gameStatus}`}
            onPress={onTestStateChange}
            style={[s.leaveButton, { backgroundColor: '#007AFF', minWidth: 60 }]}
          />
          <Button 
            label="Deal"
            onPress={onTestDeal}
            style={[s.leaveButton, { backgroundColor: '#28a745', minWidth: 60 }]}
          />
          <Button 
            label="Shuffle"
            onPress={onTestShuffle}
            style={[s.leaveButton, { backgroundColor: '#FF6B35', minWidth: 60 }]}
          />
          <Button 
            label="Lobby"
            onPress={onLeaveTable}
            style={[s.leaveButton, { minWidth: 60 }]}
          />
        </View>
      </View>

      {/* CENTER SECTION - Light Green Game Area */}
      <View style={s.centerGameArea}>
        {/* Deck Component at top with spacing */}
        <View style={s.deckSection}>
          <Deck 
            ref={deckRef}
            cards={deckCards}
            portalCards={portalCards}
            isShuffling={isShuffling}
            shuffleTimes={shuffleTimes}
            durations={durations}
            onDeckCoordinatesChange={setDeckCoordinates}
          />
        </View>

        {/* Centered instruction text */}
        <View style={s.instructionSection}>
          <Text style={s.gameStatus}>
            {gameState.gameStatus === 'betting' ? 'Select your bet amount' : 'Make your move'}
          </Text>
          
          {/* Current Bet Display */}
          {gameState.currentBet > 0 && (
            <Text style={s.currentBet}>
              Current Bet: {formatCurrency(gameState.currentBet)}
            </Text>
          )}
        </View>
        
        {/* Player Hand */}
        <Hand 
          cards={handCards}
        />
      </View>

      {/* BOTTOM SECTION - Dark Green Controls */}
      <View style={s.bottomControlsArea}>
        {/* Player Balance */}
        <Text style={s.balance}>
          {t.balance.replace('{balance}', formatCurrency(playerBalance - gameState.currentBet))}
        </Text>
        
        {/* Conditional Controls Based on Game Status */}
        {gameState.gameStatus === 'betting' && renderBettingControls()}
        {gameState.gameStatus === 'playing' && renderPlayingControls()}
      </View>
    </View>
  );
}