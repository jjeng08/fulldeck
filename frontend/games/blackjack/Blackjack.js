import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from 'systems/AppContext';
import { tableStyles as s } from './BlackjackStyles';
import { text as t } from 'shared/text';
import { formatCurrency } from 'shared/utils';
import Button from 'components/Button';
import Deck from 'components/Deck';
import Hand from 'components/Hand';
import WebSocketService from 'systems/websocket';

export default function Blackjack({ route }) {
  const navigation = useNavigation();
  const {  playerBalance, loadingActions, sendMessage, clearLoadingAction } = useApp();
  const deckRef = useRef(null);
  
  // Calculate hand area positions using config
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  const deckConfigs = {
    shuffle: 400,
    times: 2
  }

  const cardConfigs = {
    width: 90,
    height: 126,
    flip: 300,
    spacing: 0.3, 
    spreadLimit: 3,
    flip: 300
  }
  
  // Central game config - all sizing and timing values
  const gameConfigs = {
    
    // Timing
    durations: {
      cardDeal: 1000,
      delay: 500,
      handUpdate: 200
    },
    buffers: {
      initialDeal: 500,
      dealerTurn: 1000,
      splitSpread: 600,
    },
    
    // Layout
    handWidth: screenWidth * 0.4,
    cardSpacing: 0.3, // Overlap spacing multiplier
    spreadLimit: 3, // Switch from spread to overlap when more than this many cards
    
    // Hand positioning
    dealerAreaOffset: 64 + 100 + 126 + 50, // deck paddingTop + half minHeight + deck height + spacing
    playerAreaOffset: 400 // from bottom of screen
  };
  
  // Individual hand states - each Hand component manages its own state
  const [dealerHandState, setDealerHandState] = useState({animate: true, data: [[]]});
  const [playerHand1State, setPlayerHand1State] = useState({animate: true, data: [[]]});
  const [playerHand2State, setPlayerHand2State] = useState({animate: true, data: [[]]});
  
  // Deck state management
  const [deckCards, setDeckCards] = useState([]);
  const [deckCoordinates, setDeckCoordinates] = useState({ x: 0, y: 0 });
  
  
  // Safety controls for button clicks
  const [temporarilyDisabledButtons, setTemporarilyDisabledButtons] = useState(new Set());
  
  // Removed: Total management now handled by Hand component
  
  // Track when final animations are complete for finished games
  const [finalAnimationsComplete, setFinalAnimationsComplete] = useState(false);
  
  // Track when deck shuffle animation is running
  const [isDeckShuffling, setIsDeckShuffling] = useState(false);
  
  // Split animation state management
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitSequence, setSplitSequence] = useState('idle'); // 'idle', 'handoff', 'spread', 'deal_first', 'deal_second'
  
  // Track when dealer animations are complete for insurance display
  const [dealerAnimationsComplete, setDealerAnimationsComplete] = useState(false);
  
  // Function to temporarily disable a button
  const temporarilyDisableButton = (buttonType) => {
    setTemporarilyDisabledButtons(prev => new Set(prev).add(buttonType));
    
    // Calculate timeout: card dealing duration + buffer
    const dealingDuration = gameConfigs.durations.cardDeal; // 500ms
    const bufferTime = gameConfigs.buffers.initialDeal; // 500ms buffer
    const totalTimeout = dealingDuration + bufferTime; // 1000ms
    
    setTimeout(() => {
      setTemporarilyDisabledButtons(prev => {
        const newSet = new Set(prev);
        newSet.delete(buttonType);
        return newSet;
      });
    }, totalTimeout);
  };
  
  // Function to clear all temporary disables (when game state changes)
  const clearTemporaryDisables = () => {
    setTemporarilyDisabledButtons(new Set());
  };
  
  // Build deck with specified number of cards
  const buildDeck = (numCards) => {
    const deck = [];
    for (let i = 0; i < numCards; i++) {
      deck.push({
        id: `card${i}`,
        zIndex: i,
        top: i * 1,
        right: i * 1,
        animating: false
      });
    }
    return deck;
  };
  
  
  // Shuffle deck function with animation state tracking
  const shuffleDeck = (times = 1) => {
    if (deckRef.current) {
      setIsDeckShuffling(true);
      deckRef.current.shuffle(times);
      
      // Calculate total shuffle duration: (duration * times) + small buffer
      const totalDuration = (deckConfigs.shuffle * deckConfigs.times) + 200;
      
      setTimeout(() => {
        setIsDeckShuffling(false);
      }, totalDuration);
    }
  };
  
  // Handle hand updates from Hand component
  const onHandUpdate = (newHands) => {
    const handsArray = Array.isArray(newHands) ? newHands : (newHands?.data || []);
    setGameState(prev => ({
      ...prev,
      playerHands: handsArray,
      playerValues: handsArray.map(hand => calculateHandValue(hand))
    }));
    
    // Hand component now manages total display internally
    
    // ONLY for initial deal sequence - trigger dealer animation after player cards finish
    if (dealingSequence === 'player' && pendingDealerCards.length > 0) {
      setDealingSequence('dealer');
      
      // Immediately start dealer animation - player cards are already finished
      setDealerHandState({animate: true, data: [pendingDealerCards]});
      setPendingDealerCards([]);
    }
    
    // Check if game is finished and show results after player animations complete
    if (gameState.gameStatus === 'finished' && !finalAnimationsComplete) {
      setFinalAnimationsComplete(true);
    }
  };
  
  // Handle individual hand updates for split hands
  const onSingleHandUpdate = (handIndex, newHand) => {
    const handArray = Array.isArray(newHand) ? newHand : (newHand?.data?.[0] || []);
    setGameState(prev => ({
      ...prev,
      playerHands: prev.playerHands.map((hand, index) => 
        index === handIndex ? handArray : hand
      ),
      playerValues: prev.playerHands.map((hand, index) => 
        index === handIndex ? parseInt(calculateHandValue(handArray)) : prev.playerValues[index]
      )
    }));
  };
  
  // Handle dealer hand updates
  const onDealerHandUpdate = (newHands) => {
    const handsArray = Array.isArray(newHands) ? newHands : (newHands?.data || []);
    
    // Hand component now manages total display internally
    
    // Complete the dealing sequence when dealer animation finishes
    if (dealingSequence === 'dealer') {
      setDealingSequence('idle');
      
      // Mark dealer animations as complete for insurance display
      setDealerAnimationsComplete(true);
      
      // Update game state with dealer cards now that animation is complete
      setGameState(prev => ({
        ...prev,
        dealerCards: handsArray[0] || []
      }));
    }
    
    // Check if game is finished and show results after dealer animations complete
    if (gameState.gameStatus === 'finished' && !finalAnimationsComplete) {
      setFinalAnimationsComplete(true);
    }
  };

  // State to manage card dealing sequence
  const [pendingDealerCards, setPendingDealerCards] = useState([]);
  const [dealingSequence, setDealingSequence] = useState('idle'); // 'idle', 'player', 'dealer'
  
  // Split hand management
  const [pendingSplitCards, setPendingSplitCards] = useState([[], []]); // [hand1, hand2] for split
  
  const playerAreaY = screenHeight - gameConfigs.playerAreaOffset;
  const dealerAreaY = gameConfigs.dealerAreaOffset;
  
  // Calculate split hand positions
  const calculateSplitHandPositions = () => {
    const handSeparation = screenWidth * 0.3; // Distance between split hands - wider separation
    const leftHandX = (screenWidth / 2) - handSeparation - (gameConfigs.handWidth / 2);
    const rightHandX = (screenWidth / 2) + handSeparation - (gameConfigs.handWidth / 2);
    
    return [
      { x: leftHandX, y: playerAreaY }, // Left hand position
      { x: rightHandX, y: playerAreaY } // Right hand position
    ];
  };
  
  // Hand positions for proper card placement (Hand component uses these internally)
  const singlePlayerPosition = { x: (screenWidth / 2) - (gameConfigs.handWidth / 2), y: playerAreaY };
  const splitPositions = calculateSplitHandPositions();
  
  // Get current hand positions based on split state and animation sequence
  const getCurrentHandPositions = () => {
    if (gameState.totalHands === 1) {
      return [singlePlayerPosition];
    }
    // For splits during handoff: Hand 1 at center, Hand 2 offset by card spacing
    if (splitSequence === 'handoff') {
      const cardSpacing = cardConfigs.width * cardConfigs.spacing; // Overlap spacing
      const hand2StartPosition = {
        x: singlePlayerPosition.x + cardSpacing, // Offset Hand 2 by one card spacing
        y: singlePlayerPosition.y
      };
      return [singlePlayerPosition, hand2StartPosition];
    }
    // For splits during spread or after (idle): hands are at split positions
    return splitPositions;
  };
  
  const dealerPosition = { x: (screenWidth / 2) - (gameConfigs.handWidth / 2), y: dealerAreaY };
  
  
  
  // Get navigation params
  const { selectedTier, tiers, maxMulti } = route?.params || {};
  
  // Get selected tier configuration
  const tierConfig = selectedTier !== undefined && tiers ? tiers[selectedTier] : [100, 200, 500];

  // Multi-hand game state with backward compatibility
  const [gameState, setGameState] = useState({
    // Multi-hand internal structure
    playerHands: [[]], // Array of hands - index 0 for single-hand mode
    playerValues: [0], // Array of hand values
    currentBets: [0], // Array of bets per hand
    activeHandIndex: 0, // Currently active hand (0 for single-hand)
    totalHands: 1, // Total number of hands (1 or 2)
    
    // Existing single properties
    dealerCards: [],
    dealerValue: 0,
    gameStatus: 'betting', // 'betting', 'dealing', 'playing', 'dealer_turn', 'finished'
    result: null, // 'win', 'lose', 'push', 'blackjack'
    payout: 0,
    handsCompleted: [] // Track which hands are completed
  });

  // Compatibility layer - maintains existing API for single-hand access
  const getActivePlayerCards = () => gameState.playerHands[gameState.activeHandIndex] || [];
  const getActiveCurrentBet = () => gameState.currentBets[gameState.activeHandIndex] || 0;
  

  // Calculate hand value with proper Ace handling
  const calculateHandValue = (cards) => {
    if (!cards || cards.length === 0) return '0';
    
    let value = 0;
    let aces = 0;
    
    for (const card of cards) {
      // Skip hole cards (cards with null value)
      if (card.value === null || card.value === undefined) {
        continue;
      }
      
      if (card.value === 'A') {
        aces++;
        value += 11;
      } else if (['K', 'Q', 'J'].includes(card.value)) {
        value += 10;
      } else {
        const numValue = parseInt(card.value);
        if (!isNaN(numValue)) {
          value += numValue;
        }
      }
    }
    
    // Adjust for soft aces to get the highest valid value
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }
    
    return value.toString();
  };

  // Frontend logic to determine button states based on game data
  const getButtonStates = () => {
    const { gameStatus, dealerCards } = gameState;
    const playerCards = getActivePlayerCards();
    const playerValue = parseInt(calculateHandValue(playerCards)); // Use corrected calculation
    
    // Only show buttons during player's turn (not during insurance phase)
    if (gameStatus !== 'playing') {
      return {
        canHit: false,
        canStand: false,
        canDoubleDown: false,
        canSplit: false,
        buyInsurance: false
      };
    }
    
    // Basic rules for playing state
    const canHitBasic = playerValue < 21;
    const canStandBasic = true; // Can always stand while playing
    const canDoubleDownBasic = playerCards.length === 2 && playerValue < 21; // Only on first 2 cards
    const canSplitBasic = playerCards.length === 2 && playerCards[0].value === playerCards[1].value && gameState.totalHands === 1; // Only on first hand
    const buyInsuranceBasic = dealerCards.length > 0 && dealerCards[0].value === 'A'; // If dealer shows Ace
    
    // Apply temporary disable logic
    const isDealingDisabled = temporarilyDisabledButtons.has('dealing');
    const canHit = canHitBasic && !temporarilyDisabledButtons.has('hit') && !isDealingDisabled;
    const canStand = canStandBasic && !isDealingDisabled;
    const canDoubleDown = canDoubleDownBasic && !isDealingDisabled;
    const canSplit = canSplitBasic && !temporarilyDisabledButtons.has('split') && !isDealingDisabled;
    const buyInsurance = buyInsuranceBasic && !temporarilyDisabledButtons.has('insurance') && !isDealingDisabled;
    
    return {
      canHit,
      canStand,
      canDoubleDown,
      canSplit,
      buyInsurance
    };
  };

  // Get current button states
  const buttonStates = getButtonStates();
  
  // Check if insurance is available - only after dealer animations complete
  const canBuyInsurance = gameState.gameStatus === 'insurance_offered' && dealerAnimationsComplete;
  const insuranceAmount = Math.floor(getActiveCurrentBet() / 2);

  

  const formatCurrencyButton = (cents) => {
    if (cents < 100) {
      return `${cents}¢`;
    }
    return `$${(cents / 100).toLocaleString()}`;
  };

  // Generate detailed game result message
  const getGameResultMessage = () => {
    const { result, payout } = gameState;
    // Use the properly calculated hand values that are displayed
    const playerValue = parseInt(calculateHandValue(getActivePlayerCards()));
    const dealerValue = parseInt(calculateHandValue(gameState.dealerCards || []));
    const playerCards = getActivePlayerCards();
    
    if (result === 'lose') {
      // Player busted
      if (playerValue > 21) {
        return `You busted with ${playerValue}! You lose.`;
      }
      // Dealer blackjack - check this first
      if (playerCards?.length === 2 && dealerValue === 21) {
        return `Dealer has blackjack! You lose.`;
      }
      // Dealer won with regular hand
      if (dealerValue <= 21) {
        return `Dealer wins with ${dealerValue} vs your ${playerValue}. You lose.`;
      }
      return 'You lose!';
    }
    
    if (result === 'win') {
      // Dealer busted
      if (dealerValue > 21) {
        return `Dealer busted with ${dealerValue}! You win ${formatCurrency(payout)}!`;
      }
      // Player won with higher value
      return `You win with ${playerValue} vs dealer's ${dealerValue}! You win ${formatCurrency(payout)}!`;
    }
    
    if (result === 'blackjack') {
      return `Blackjack! You win ${formatCurrency(payout)}!`;
    }
    
    if (result === 'push') {
      return `Push! Both have ${playerValue}. Your bet is returned.`;
    }
    
    if (result === 'dealer_blackjack') {
      return `Dealer has blackjack! You lose.`;
    }
    
    // Handle undefined/null results
    if (!result) {
      return `Game finished. Result: undefined`;
    }
    
    return `Game finished. Result: ${result}`;
  };

  const onAddBet = (betAmount) => {
    if (gameState.gameStatus === 'betting') {
      const highestTierValue = Math.max(...tierConfig);
      const maxBetLimit = (maxMulti || 5) * highestTierValue;
      const currentBet = getActiveCurrentBet();
      const newBet = currentBet + betAmount;
      
      // Check if new bet would exceed limits
      if (newBet <= playerBalance && newBet <= maxBetLimit) {
        setGameState(prev => ({
          ...prev,
          currentBets: prev.currentBets.map((bet, index) => 
            index === prev.activeHandIndex ? newBet : bet
          )
        }));
      }
    }
  };

  const onSubtractBet = (betAmount) => {
    if (gameState.gameStatus === 'betting') {
      const currentBet = getActiveCurrentBet();
      const newBet = Math.max(0, currentBet - betAmount);
      setGameState(prev => ({
        ...prev,
        currentBets: prev.currentBets.map((bet, index) => 
          index === prev.activeHandIndex ? newBet : bet
        )
      }));
    }
  };

  const onLeaveTable = () => {
    navigation.navigate('Lobby');
  };

  const onPlaceBet = (addLoadingCallback) => {
    const currentBet = getActiveCurrentBet();
    if (currentBet > 0) {      
      // Immediately switch to dealing state to hide betting controls
      setGameState(prev => ({
        ...prev,
        gameStatus: 'dealing'
      }));
      
      // Reset final animations complete flag for new game
      setFinalAnimationsComplete(false);
      
      addLoadingCallback();
      sendMessage('playerAction', {
        type: 'bet',
        betAmount: currentBet
      });
    }
  };


  // Handle all blackjack game messages through unified channel

  const renderBetButtons = () => {
    const buttonStyleNames = ['Blue', 'Red', 'Black'];
    const isPageBlocked = loadingActions.size > 0;

    return (
      <View style={s.betButtonsContainer}>
        {tierConfig.map((betAmount, index) => {
          const styleName = buttonStyleNames[index] || 'Blue';
          const isDisabled = gameState.gameStatus !== 'betting' || isPageBlocked || isDeckShuffling;
          
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
            (getActiveCurrentBet() === 0 || isDeckShuffling) && s.placeBetButtonDisabled
          ]}
          disabled={getActiveCurrentBet() === 0 || isDeckShuffling}
          testID="placeBetButton"
          messageType="bet"
        />
      </>
    );
  };

  const renderPlayingControls = () => {
    const isPageBlocked = loadingActions.size > 0;
    
    return (
      <View style={s.playingControlsContainer}>
        {/* All Action Buttons in Single Row */}
        <View style={s.secondaryActionsRow}>
          <Button
            label="Hit"
            onPress={() => {
              temporarilyDisableButton('hit');
              sendMessage('playerAction', {
                type: 'hit',
                handId: 'player-hand-0',
                activeHandIndex: gameState.activeHandIndex
              });
            }}
            disabled={!buttonStates.canHit}
            testID="hitButton"
            style={[s.secondaryActionButton, { backgroundColor: '#dc3545' }]}
          />
          
          {buttonStates.canSplit && (
            <Button
              label="Split"
              onPress={() => {
                temporarilyDisableButton('split');
                // Start split animation sequence
                setIsSplitting(true);
                setSplitSequence('handoff');
                
                // Send split action to backend
                sendMessage('playerAction', {
                  type: 'split',
                  playerCards: getActivePlayerCards(),
                  currentBet: getActiveCurrentBet()
                });
              }}
              disabled={!buttonStates.canSplit}
              testID="splitButton"
              style={s.secondaryActionButton}
            />
          )}
          
          {buttonStates.canDoubleDown && (
            <Button
              label="Double Down"
              onPress={() => {
                sendMessage('playerAction', {
                  type: 'doubleDown',
                  handId: 'player-hand-0',
                  activeHandIndex: gameState.activeHandIndex
                });
              }}
              disabled={!buttonStates.canDoubleDown}
              testID="doubleDownButton"
              style={s.secondaryActionButton}
            />
          )}
          
          <Button
            label="Stand"
            onPress={() => {
              sendMessage('playerAction', {
                type: 'stand',
                activeHandIndex: gameState.activeHandIndex
              });
            }}
            disabled={!buttonStates.canStand}
            testID="standButton"
            style={[s.secondaryActionButton, { backgroundColor: '#dc3545' }]}
          />
          
        </View>
      </View>
    );
  };

  // Get status message based on current game state
  const getStatusMessage = () => {
    switch (gameState.gameStatus) {
      case 'betting':
        return 'Select your bet amount';
      case 'dealing':
        return 'Dealing cards...';
      case 'insurance_offered':
        return 'Dealer shows Ace!';
      case 'doubledown_processing':
        return 'Doubling down...';
      case 'dealer_turn':
        return 'Dealer is playing...';
      case 'finished':
        return finalAnimationsComplete ? getGameResultMessage() : 'Finalizing...';
      default:
        return 'Make your move';
    }
  };

  // ========== Game Action Handlers - Ordered by gameplay sequence ==========

  // Handle initial bet placement and deal
  const onBetAction = (data) => {
    // Store dealer cards for later, start player animation first
    setPendingDealerCards(data.dealerCards);
    setDealingSequence('player');
    
    // Calculate player card values in frontend
    const newPlayerValues = [parseInt(calculateHandValue(data.playerCards))];
    
    // Update player hand 1 state
    setPlayerHand1State({animate: true, data: [data.playerCards]});
    
    // Update game state with player cards only
    setGameState(prev => ({
      ...prev,
      currentBets: data.betAmount ? [data.betAmount] : prev.currentBets,
      gameStatus: data.gameStatus,
      playerHands: [data.playerCards],
      dealerCards: [], // Keep dealer cards empty until player finishes
      playerValues: newPlayerValues,
      dealerValue: 0, // No dealer cards shown yet
      result: data.result || prev.result,
      payout: data.payout || prev.payout
    }));

    // Reset dealer animations complete flag
    setDealerAnimationsComplete(false);
  };


  // Handle split action - initial split with first cards
  const onSplitAction = (data) => {
    // Update player hand states - animated false for onSplitCalled
    setPlayerHand1State({animate: false, data: [data.playerHands[0]]});
    setPlayerHand2State({animate: false, data: [data.playerHands[1]]});
    
    // Update state to show we now have 2 hands with single cards
    setGameState(prev => ({
      ...prev,
      totalHands: 2,
      playerHands: data.playerHands, // First cards only
      playerValues: data.playerHands.map(hand => parseInt(calculateHandValue(hand))),
      currentBets: data.currentBets || [prev.currentBets[0], prev.currentBets[0]],
      activeHandIndex: data.activeHandIndex !== undefined ? data.activeHandIndex : 0,
      gameStatus: data.gameStatus
    }));
    
    setIsSplitting(true);
    
    // First render both hands at center, then animate to spread positions
    setSplitSequence('handoff');
    
    // Small delay to ensure both hands are rendered at center, then trigger spread
    setTimeout(() => {
      setSplitSequence('spread');
      
      // After spread animation completes, request the second cards
      setTimeout(() => {
        sendMessage('playerAction', {
          type: 'splitDeal'
        });
      }, gameConfigs.buffers.splitSpread); // Wait for spread animation
    }, 100); // Small delay for initial render

    // Hand component now manages split totals internally
  };

  // Handle split deal - adding second cards to split hands
  const onSplitDealAction = (data) => {
    const completeHands = data.playerHands;
    
    // Enable animations for card dealing
    setSplitSequence('idle');
    
    // Step 1: Update Hand 1 first with animation
    setPlayerHand1State({animate: true, data: [completeHands[0]]});

    setGameState(prev => ({
        ...prev,
        playerHands: [completeHands[0], prev.playerHands[1] || []], // Update only Hand 1
        playerValues: [parseInt(calculateHandValue(completeHands[0])), prev.playerValues[1] || 0],
        activeHandIndex: data.activeHandIndex !== undefined ? data.activeHandIndex : prev.activeHandIndex
      }));
      
      // Step 2: After Hand 1 animates, update Hand 2
      setTimeout(() => {
        setPlayerHand2State({animate: true, data: [completeHands[1]]});
        
        setGameState(prev => ({
          ...prev,
          playerHands: [completeHands[0], completeHands[1]], // Now update Hand 2
          playerValues: completeHands.map(hand => parseInt(calculateHandValue(hand))),
          activeHandIndex: data.activeHandIndex !== undefined ? data.activeHandIndex : prev.activeHandIndex
        }));
        
        // Step 3: Complete split sequence after Hand 2 animates
        setTimeout(() => {
          setIsSplitting(false);
        }, gameConfigs.durations.cardDeal + 100);
      }, gameConfigs.durations.cardDeal + 100); // Wait for Hand 1 animation
  };

  // Handle all other actions (hit, stand, etc.)
  const onDefaultAction = (data) => {
    // For all other actions, update normally (no sequencing needed)
    const newPlayerHands = data.playerCards ? (() => {
      // For single playerCards response, update the correct hand in existing array
      const activeIndex = data.activeHandIndex !== undefined ? data.activeHandIndex : gameState.activeHandIndex;
      const updatedHands = [...gameState.playerHands];
      updatedHands[activeIndex] = data.playerCards;
      return updatedHands;
    })() : data.playerHands ? data.playerHands : gameState.playerHands;
    const newDealerCards = data.dealerCards || gameState.dealerCards;
    
    // Update hand states with animation
    if (data.playerCards) {
      // For single playerCards response, update the correct hand based on activeHandIndex
      const activeIndex = data.activeHandIndex !== undefined ? data.activeHandIndex : gameState.activeHandIndex;
      if (activeIndex === 0) {
        setPlayerHand1State({animate: true, data: [data.playerCards]});
      } else if (activeIndex === 1) {
        setPlayerHand2State({animate: true, data: [data.playerCards]});
      }
    } else if (data.playerHands) {
      if (data.playerHands[0]) setPlayerHand1State({animate: true, data: [data.playerHands[0]]});
      if (data.playerHands[1]) setPlayerHand2State({animate: true, data: [data.playerHands[1]]});
    }
    
    if (data.dealerCards) {
      // Check if this is the final dealer sequence (game finished)
      if (data.gameStatus === 'finished') {
        // Use proper dealer animation sequence like initial deal
        setDealingSequence('dealer');
        setDealerHandState({animate: true, data: [data.dealerCards]});
      } else {
        // Regular dealer update during game
        setDealerHandState({animate: true, data: [data.dealerCards]});
      }
    }
    
    // Calculate card values in frontend instead of using backend values
    const newPlayerValues = newPlayerHands.map(hand => parseInt(calculateHandValue(hand)));
    const newDealerValue = parseInt(calculateHandValue(newDealerCards));
    
    // Update game state immediately - Hand components will handle animations
    setGameState(prev => ({
      ...prev,
      currentBets: data.betAmount ? [data.betAmount] : 
                  data.currentBets ? data.currentBets : prev.currentBets,
      gameStatus: data.gameStatus,
      playerHands: newPlayerHands,
      dealerCards: newDealerCards,
      playerValues: newPlayerValues,
      dealerValue: newDealerValue,
      totalHands: data.playerHands ? data.playerHands.length : prev.totalHands,
      activeHandIndex: data.activeHandIndex !== undefined ? data.activeHandIndex : prev.activeHandIndex,
      result: data.result || prev.result,
      payout: data.payout || prev.payout
    }));
  };

  // Handle finished game cleanup
  const onFinishedGame = (data) => {
    // Handle finished games - don't show results until animations complete
    if (data.gameStatus === 'finished') {
      // Results will be shown when Hand animations complete
    }
    
    // Clear temporary disables if game state changes to non-playing
    data.gameStatus !== 'playing' && clearTemporaryDisables();
  };

  // ========== ALL useEffects - Defined at bottom for better organization ==========
  
  // Initialize deck and shuffle when game starts
  useEffect(() => {
    setDeckCards(buildDeck(10));
    // Shuffle deck 2 times when game first loads
    setTimeout(() => {
      shuffleDeck(2);
    }, 500); // Small delay to ensure deck is rendered
  }, []);
  
  // No more Animated.View wrapper logic - Hand components handle their own position animations
  
  // Handle all blackjack game messages through unified channel
  useEffect(() => {
    const BlackJackChannel = (data) => {
      if (data.success) {        
        const actionType = data.actionType;

        // Clear loading state for this action
        clearLoadingAction(actionType);

        // Route to appropriate handler based on action type
        switch (actionType) {
          case 'bet':
            (data.playerCards && data.dealerCards) && onBetAction(data);
            break;
          case 'doubleDown':
            onDefaultAction(data);
            // If hand complete, move to next hand or end
            if (data.handComplete) {
              setGameState(prev => {
                if (prev.totalHands > 1 && prev.activeHandIndex < prev.totalHands - 1) {
                  // Move to next hand
                  return { ...prev, activeHandIndex: prev.activeHandIndex + 1 };
                } else {
                  // All hands complete - TODO: trigger dealer play
                  return prev;
                }
              });
            }
            break;
          case 'split':
            data.playerHands && onSplitAction(data);
            break;
          case 'splitDeal':
            data.playerHands && onSplitDealAction(data);
            break;
          default:
            onDefaultAction(data);
            // If hand complete, move to next hand or end
            if (data.handComplete) {
              setGameState(prev => {
                if (prev.totalHands > 1 && prev.activeHandIndex < prev.totalHands - 1) {
                  // Move to next hand
                  return { ...prev, activeHandIndex: prev.activeHandIndex + 1 };
                } else {
                  // All hands complete - TODO: trigger dealer play
                  return prev;
                }
              });
            }
            break;
        }    
        onFinishedGame(data);
      }
    };
    
    // Register unified message handler
    WebSocketService.onMessage('blackJackChannel', BlackJackChannel);
    
    return () => {
      // Cleanup handler on unmount
      WebSocketService.removeMessageHandler('blackJackChannel');
    };
  }, []);

  return (
    <View style={s.container}>
      {/* TOP SECTION - Dark Green Banner */}
      <View style={s.topBanner}>
        <Text style={s.title}>Blackjack</Text>
        <Text style={s.balanceHeader}>
          {t.balance.replace('{balance}', formatCurrency(
            gameState.gameStatus === 'betting' 
              ? playerBalance - (getActiveCurrentBet() || 0)
              : playerBalance
          ))}
        </Text>
        <Button 
          label="Lobby"
          onPress={onLeaveTable}
          style={[s.leaveButton, { minWidth: 60 }]}
        />
      </View>

      {/* CENTER SECTION - Light Green Game Area */}
      <View style={s.centerGameArea}>
        {/* Deck Component at top with spacing */}
        <View style={s.deckSection}>
          <Deck 
            ref={deckRef}
            deckConfigs={deckConfigs}
            cardConfigs={cardConfigs}
            onDeckCoordinatesChange={setDeckCoordinates}
          />
        </View>

        {/* Centered instruction text */}
        <View style={s.instructionSection}>
          <Text style={s.gameStatus}>
            {getStatusMessage()}
          </Text>
          
          {/* Insurance Question - only after dealer animations complete */}
          {canBuyInsurance && (
            <Text style={s.insuranceQuestion}>
              Buy insurance against dealer blackjack?
            </Text>
          )}
          
        </View>
        
        {/* Dealer Hand */}
        <Hand
          hands={dealerHandState}
          activeHandIndex={0}
          handLabels={['Dealer Hand']}
          handValues={[0]}
          position={dealerPosition}
          deckCoordinates={deckCoordinates}
          cardConfigs={cardConfigs}
          gameConfigs={gameConfigs}
          cardLayout='spread'
          onHandUpdate={onDealerHandUpdate}
          isDealer={true}
          showTotal="below"
        />
        
        {/* Total display now handled by Hand component internally */}
        
        {/* Player Hand(s) - Simplified without Animated.View wrappers */}
        {gameState.totalHands === 1 ? (
          <Hand
            testID="singlePlayerHand"
            testFinder='testFinder'
            hands={playerHand1State}
            activeHandIndex={gameState.activeHandIndex}
            handLabels={['Player Hand']}
            handValues={gameState.playerValues}
            betAmounts={gameState.currentBets}
            position={singlePlayerPosition}
            animatePosition={false}
            deckCoordinates={deckCoordinates}
            cardConfigs={cardConfigs}
            gameConfigs={gameConfigs}
            onHandUpdate={onHandUpdate}
            isDealer={false}
            showTotal="above"
          />
        ) : (
          getCurrentHandPositions().map((position, handIndex) => (
            <Hand
              key={`split-hand-${handIndex}`}
              testID={`splitPlayerHand${handIndex}`}
              hands={handIndex === 0 ? playerHand1State : playerHand2State}
              activeHandIndex={gameState.activeHandIndex === handIndex ? 0 : -1}
              handLabels={[`Hand ${handIndex + 1}`]}
              handValues={[gameState.playerValues[handIndex] || 0]}
              betAmounts={[gameState.currentBets[handIndex] || 0]}
              isSplitHand={gameState.totalHands > 1}
              position={position}
              animatePosition={splitSequence === 'spread'}
              deckCoordinates={deckCoordinates}
              cardConfigs={cardConfigs}
              gameConfigs={gameConfigs}
              onHandUpdate={(newHands) => onSingleHandUpdate(handIndex, newHands[0])}
              isDealer={false}
              showTotal="above"
            />
          ))
        )}
      </View>

      {/* BOTTOM SECTION - Dark Green Controls */}
      <View style={s.bottomControlsArea}>
        {/* Conditional Controls Based on Game Status */}
        {gameState.gameStatus === 'betting' && renderBettingControls()}
        {gameState.gameStatus === 'finished' && finalAnimationsComplete && (
          <View style={s.dealingMessage}>
            <TouchableOpacity
              style={s.playAgainButton}
              onPress={() => {
                // Reset frontend state to betting mode
                setGameState(prev => ({
                  ...prev,
                  gameStatus: 'betting',
                  playerHands: [[]],
                  dealerCards: [],
                  playerValues: [0],
                  dealerValue: 0,
                  currentBets: [0],
                  activeHandIndex: 0,
                  totalHands: 1,
                  result: null,
                  payout: 0,
                  handsCompleted: []
                }));
                
                // Reset all hand states
                setDealerHandState({animate: true, data: [[]]});
                setPlayerHand1State({animate: true, data: [[]]});
                setPlayerHand2State({animate: true, data: [[]]});
                
                // Reset dealer animations complete flag
                setDealerAnimationsComplete(false);
                
                // Reset final animations complete flag
                setFinalAnimationsComplete(false);
                
                // Clear any temporary button disables
                clearTemporaryDisables();
                
                
                // Shuffle deck 2 times when starting new game
                setTimeout(() => {
                  shuffleDeck(2);
                }, 100); // Small delay to ensure state is reset
              }}
              testID="playAgainButton"
            >
              <Text style={s.playAgainButtonText}>Play Again</Text>
            </TouchableOpacity>
          </View>
        )}
        {gameState.gameStatus === 'insurance_offered' && dealerAnimationsComplete && (
          <View style={s.insuranceControlsContainer}>
            <View style={s.insuranceButtonsRow}>
              <TouchableOpacity
                style={s.insuranceButton}
                onPress={() => {
                  sendMessage('playerAction', {
                    type: 'buyInsurance',
                    playerCards: getActivePlayerCards(),
                    dealerCards: gameState.dealerCards,
                    insuranceAmount: insuranceAmount
                  });
                }}
                testID="buyInsuranceButton"
              >
                <Text style={s.insuranceButtonText}>
                  Buy Insurance {formatCurrency(insuranceAmount)}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={s.skipInsuranceButton}
                onPress={() => {
                  sendMessage('playerAction', {
                    type: 'skipInsurance',
                    playerCards: getActivePlayerCards(),
                    dealerCards: gameState.dealerCards
                  });
                }}
                testID="skipInsuranceButton"
              >
                <Text style={s.skipInsuranceButtonText}>
                  No Insurance
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {gameState.gameStatus === 'playing' && renderPlayingControls()}
      </View>
    </View>
  );
}