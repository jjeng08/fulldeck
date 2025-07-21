import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from 'systems/AppContext';
import { tableStyles as s } from './BlackjackStyles';
import { text as t } from 'shared/text';
import { formatCurrency } from 'shared/utils';
import { styleConstants as sc } from 'shared/styleConstants';
import Button from 'components/Button';
import Deck from 'components/Deck';
import Hand from 'components/Hand';
import WebSocketService from 'systems/websocket';
import testLogger from 'shared/testLogger';

export default function Blackjack({ route }) {
  const navigation = useNavigation();
  const {  playerBalance, loadingActions, sendMessage, clearLoadingAction } = useApp();
  const deckRef = useRef(null);
  
  // Calculate hand area positions using config
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  
  // Central game config - all sizing and timing values
  const gameConfig = {
    // Card dimensions
    cardWidth: 90,
    cardHeight: 126,
    
    // Timing
    durations: {
      cardDeal: 500,
      cardFlip: 300,
      deckShuffle: 400,
      handUpdate: 200
    },
    buffers: {
      initialDeal: 500,
      dealerTurn: 1000,
      splitSpread: 400,
      splitDeal: 500
    },
    
    // Layout
    handWidth: screenWidth * 0.4,
    cardSpacing: 0.3, // Overlap spacing multiplier
    spreadLimit: 3, // Switch from spread to overlap when more than this many cards
    
    // Hand positioning
    dealerAreaOffset: 64 + 100 + 126 + 50, // deck paddingTop + half minHeight + deck height + spacing
    playerAreaOffset: 400 // from bottom of screen
  };
  
  // Dealer hand state
  const [dealerHands, setDealerHands] = useState([[]]);
  
  // Deck state management
  const [deckCards, setDeckCards] = useState([]);
  const [deckCoordinates, setDeckCoordinates] = useState({ x: 0, y: 0 });
  
  
  // Safety controls for button clicks
  const [temporarilyDisabledButtons, setTemporarilyDisabledButtons] = useState(new Set());
  
  // Track when hand totals should be visible (after card flip animations complete)
  const [showPlayerTotal, setShowPlayerTotal] = useState(false);
  const [showDealerTotal, setShowDealerTotal] = useState(false);
  
  // Track animated totals that update as each card animation completes
  const [animatedPlayerTotals, setAnimatedPlayerTotals] = useState([0]); // Array for split hands
  const [animatedDealerTotal, setAnimatedDealerTotal] = useState(0);
  
  // Track when final animations are complete for finished games
  const [finalAnimationsComplete, setFinalAnimationsComplete] = useState(false);
  
  // Track when deck shuffle animation is running
  const [isDeckShuffling, setIsDeckShuffling] = useState(false);
  
  // Split animation state management
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitSequence, setSplitSequence] = useState('idle'); // 'idle', 'handoff', 'spread', 'deal_first', 'deal_second'
  const [handPositions, setHandPositions] = useState([]);
  
  // Track when dealer animations are complete for insurance display
  const [dealerAnimationsComplete, setDealerAnimationsComplete] = useState(false);
  
  // Function to temporarily disable a button
  const temporarilyDisableButton = (buttonType) => {
    setTemporarilyDisabledButtons(prev => new Set(prev).add(buttonType));
    
    // Calculate timeout: card dealing duration + buffer
    const dealingDuration = gameConfig.durations.cardDeal; // 500ms
    const bufferTime = gameConfig.buffers.initialDeal; // 500ms buffer
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
  
  // Calculate single card value for progressive totals
  const calculateCardValue = (card) => {
    if (card.value === 'A') {
      return 11; // We'll handle soft aces in the progressive calculation
    } else if (['K', 'Q', 'J'].includes(card.value)) {
      return 10;
    } else {
      return parseInt(card.value);
    }
  };
  
  // Handle individual card animation completion for progressive totals
  const onCardAnimationComplete = (suit, value, handIndex, cardId, isDealer) => {
    const cardValue = calculateCardValue({ suit, value });
    
    if (isDealer) {
      setAnimatedDealerTotal(prev => prev + cardValue);
      setShowDealerTotal(true);
    } else {
      setAnimatedPlayerTotals(prev => 
        prev.map((total, index) => 
          index === handIndex ? total + cardValue : total
        )
      );
      setShowPlayerTotal(true);
    }
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
  
  // Initialize deck and shuffle when game starts
  useEffect(() => {
    setDeckCards(buildDeck(10));
    // Shuffle deck 2 times when game first loads
    setTimeout(() => {
      shuffleDeck(2);
    }, 500); // Small delay to ensure deck is rendered
  }, []);
  
  // Initialize test logger with sendMessage function
  useEffect(() => {
    testLogger.setSendMessage(sendMessage);
  }, [sendMessage]);
  
  // Shuffle deck function with animation state tracking
  const shuffleDeck = (times = 1) => {
    if (deckRef.current) {
      setIsDeckShuffling(true);
      deckRef.current.shuffle(times);
      
      // Calculate total shuffle duration: (duration * times) + small buffer
      const totalDuration = (gameConfig.durations.deckShuffle * times) + 200;
      
      setTimeout(() => {
        setIsDeckShuffling(false);
      }, totalDuration);
    }
  };
  
  // Split animation flow function
  const performSplitHandoff = (splitHands) => {
    // Step 1: Handoff - silently update hands with no animations
    // Backend now sends single-card hands, so we use them directly
    setSplitSequence('handoff');
    
    // Update hands immediately with single cards (no animations)
    setGameState(prev => ({
      ...prev,
      playerHands: splitHands, // Use the split hands as received from backend
      playerValues: splitHands.map(hand => parseInt(calculateHandValue(hand)))
    }));
    
    // Step 2: Spread hands apart horizontally
    setTimeout(() => {
      setSplitSequence('spread');
      
      // Step 3: Deal second card to first hand after spread completes
      setTimeout(() => {
        setSplitSequence('deal_first');
        
        // Send hit action to deal second card to first hand
        sendMessage('playerAction', {
          type: 'hit',
          playerCards: splitHands[0],
          handId: 'player-hand-0'
        });
        
        // Step 4: Deal second card to second hand after buffer
        setTimeout(() => {
          setSplitSequence('deal_second');
          
          // Send hit action to deal second card to second hand
          sendMessage('playerAction', {
            type: 'hit',
            playerCards: splitHands[1],
            handId: 'player-hand-1'
          });
          
          // Step 5: Complete split sequence
          setTimeout(() => {
            setSplitSequence('idle');
            setIsSplitting(false);
          }, gameConfig.durations.cardDeal + 100);
          
        }, gameConfig.buffers.splitDeal);
        
      }, gameConfig.durations.cardDeal + 100);
      
    }, gameConfig.buffers.splitSpread);
  };
  
  // Handle hand updates from Hand component
  const onHandUpdate = (newHands) => {
    setGameState(prev => ({
      ...prev,
      playerHands: newHands,
      playerValues: newHands.map(hand => calculateHandValue(hand))
    }));
    
    // Show player total after cards are dealt
    if (newHands[0] && newHands[0].length > 0) {
      setShowPlayerTotal(true);
    }
    
    // ONLY for initial deal sequence - trigger dealer animation after player cards finish
    if (dealingSequence === 'player' && pendingDealerCards.length > 0) {
      setDealingSequence('dealer');
      
      // Immediately start dealer animation - player cards are already finished
      setDealerHands([pendingDealerCards]);
      setPendingDealerCards([]);
    }
    
    // Check if game is finished and show results after player animations complete
    if (gameState.gameStatus === 'finished' && !finalAnimationsComplete) {
      setFinalAnimationsComplete(true);
    }
  };
  
  // Handle individual hand updates for split hands
  const onSingleHandUpdate = (handIndex, newHand) => {
    setGameState(prev => ({
      ...prev,
      playerHands: prev.playerHands.map((hand, index) => 
        index === handIndex ? newHand : hand
      ),
      playerValues: prev.playerHands.map((hand, index) => 
        index === handIndex ? parseInt(calculateHandValue(newHand)) : prev.playerValues[index]
      )
    }));
  };
  
  // Handle dealer hand updates
  const onDealerHandUpdate = (newHands) => {
    setDealerHands(newHands);
    
    // Show dealer total after cards are dealt
    if (newHands[0] && newHands[0].length > 0) {
      setShowDealerTotal(true);
    }
    
    // Complete the dealing sequence when dealer animation finishes
    if (dealingSequence === 'dealer') {
      setDealingSequence('idle');
      
      // Mark dealer animations as complete for insurance display
      setDealerAnimationsComplete(true);
      
      // Update game state with dealer cards now that animation is complete
      setGameState(prev => ({
        ...prev,
        dealerCards: newHands[0] || []
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
  
  const playerAreaY = screenHeight - gameConfig.playerAreaOffset;
  const dealerAreaY = gameConfig.dealerAreaOffset;
  
  // Calculate split hand positions
  const calculateSplitHandPositions = () => {
    const handSeparation = screenWidth * 0.25; // Distance between split hands
    const leftHandX = (screenWidth / 2) - handSeparation - (gameConfig.handWidth / 2);
    const rightHandX = (screenWidth / 2) + handSeparation - (gameConfig.handWidth / 2);
    
    return [
      { x: leftHandX, y: playerAreaY }, // Left hand position
      { x: rightHandX, y: playerAreaY } // Right hand position
    ];
  };
  
  // Hand positions for proper card placement (Hand component uses these internally)
  const singlePlayerPosition = { x: (screenWidth / 2) - (gameConfig.handWidth / 2), y: playerAreaY };
  const splitPositions = calculateSplitHandPositions();
  
  // Use split positions when totalHands > 1, otherwise use single position
  const getPlayerPositions = () => {
    return gameState.totalHands > 1 ? splitPositions : [singlePlayerPosition];
  };
  
  const dealerPosition = { x: (screenWidth / 2) - (gameConfig.handWidth / 2), y: dealerAreaY };
  
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
    const dealerValue = parseInt(calculateHandValue(dealerHands[0] || []));
    const playerCards = getActivePlayerCards();
    
    // Test logging
    testLogger.testLog('GAME_RESULT_MESSAGE', { result, payout, playerValue, dealerValue, playerCards });
    
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

  // Test shuffle animation
  const onTestShuffle = () => {
    shuffleDeck(1);
  };

  const onPlaceBet = (addLoadingCallback) => {
    const currentBet = getActiveCurrentBet();
    if (currentBet > 0) {
      // Test logging
      testLogger.testLog('BET_PLACED', { betAmount: currentBet, currentBets: gameState.currentBets, gameStatus: gameState.gameStatus });
      
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
  useEffect(() => {
    const onBlackJackChannel = (data) => {
      if (data.success) {
        // Test logging
        testLogger.testLog('ACTION_RESULT', { actionType: data.actionType, success: data.success, gameStatus: data.gameStatus, playerCards: data.playerCards, playerValue: data.playerValue, dealerCards: data.dealerCards, dealerValue: data.dealerValue, result: data.result, payout: data.payout, immediateResult: data.immediateResult });
        
        // Handle ALL player actions through this single handler
        const actionType = data.actionType;
        
        // Clear loading state for this action
        clearLoadingAction(actionType);
        
        // Handle split action with special animation sequence
        if (actionType === 'split' && data.playerHands) {
          // Store the split hands for animation coordination
          setPendingSplitCards(data.playerHands);
          
          // Update state to show we now have 2 hands
          setGameState(prev => ({
            ...prev,
            totalHands: 2,
            playerHands: [prev.playerHands[0], []], // Keep original first hand, add empty second
            playerValues: [prev.playerValues[0], 0],
            currentBets: data.currentBets || [prev.currentBets[0], prev.currentBets[0]], // Duplicate bet
            gameStatus: data.gameStatus
          }));
          
          // Start the split handoff sequence
          setTimeout(() => {
            performSplitHandoff(data.playerHands);
          }, 100);
          
        } else if ((actionType === 'bet' || actionType === 'doubleDown') && data.playerCards && data.dealerCards) {
          // Store dealer cards for later, start player animation first
          setPendingDealerCards(data.dealerCards);
          setDealingSequence('player');
          
          // Calculate player card values in frontend
          const newPlayerValues = [parseInt(calculateHandValue(data.playerCards))];
          
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
          
          // Don't update dealer hands yet - wait for player animation to complete
        } else {
          // For all other actions, update normally (no sequencing needed)
          const newPlayerHands = data.playerCards ? [data.playerCards] : 
                                data.playerHands ? data.playerHands : gameState.playerHands;
          const newDealerCards = data.dealerCards || gameState.dealerCards;
          
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
            result: data.result || prev.result,
            payout: data.payout || prev.payout
          }));
          
          // Update dealer hands for dealer Hand component
          if (newDealerCards.length > 0) {
            setDealerHands([newDealerCards]);
          }
          
          // Double down now returns complete game state like initial bet - no automatic stand needed
        }
        
        // Handle finished games - don't show results until animations complete
        if (data.gameStatus === 'finished') {
          // Results will be shown when Hand animations complete
        }
        
        // Reset hand total visibility and animated totals for new game
        if (actionType === 'bet') {
          setShowPlayerTotal(false);
          setShowDealerTotal(false);
          setAnimatedPlayerTotals([0]);
          setAnimatedDealerTotal(0);
          setDealerAnimationsComplete(false);
        }
        
        // Reset totals for split
        if (actionType === 'split') {
          setAnimatedPlayerTotals([0, 0]);
        }
        
        // Clear temporary disables if game state changes to non-playing
        if (data.gameStatus !== 'playing') {
          clearTemporaryDisables();
        }
      }
    };


    
    
    // Register unified message handler
    WebSocketService.onMessage('blackJackChannel', onBlackJackChannel);
    
    return () => {
      // Cleanup handler on unmount
      WebSocketService.removeMessageHandler('blackJackChannel');
    };
  }, []);

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
                playerCards: getActivePlayerCards(),
                handId: 'player-hand-0'
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
                  playerCards: getActivePlayerCards(),
                  dealerCards: gameState.dealerCards,
                  handId: 'player-hand-0'
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
                playerCards: getActivePlayerCards(),
                dealerCards: gameState.dealerCards
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
            gameConfig={gameConfig}
            onDeckCoordinatesChange={setDeckCoordinates}
          />
        </View>

        {/* Centered instruction text */}
        <View style={s.instructionSection}>
          <Text style={s.gameStatus}>
            {gameState.gameStatus === 'betting' ? 'Select your bet amount' : 
             gameState.gameStatus === 'dealing' ? 'Dealing cards...' : 
             gameState.gameStatus === 'insurance_offered' ? 'Dealer shows Ace!' :
             gameState.gameStatus === 'doubledown_processing' ? 'Doubling down...' :
             gameState.gameStatus === 'dealer_turn' ? 'Dealer is playing...' :
             gameState.gameStatus === 'finished' && finalAnimationsComplete ? getGameResultMessage() :
             gameState.gameStatus === 'finished' ? 'Finalizing...' :
             'Make your move'}
          </Text>
          
          {/* Insurance Question - only after dealer animations complete */}
          {canBuyInsurance && (
            <Text style={s.insuranceQuestion}>
              Buy insurance against dealer blackjack?
            </Text>
          )}
          
          {/* Current Bet Display */}
          {gameState.totalHands === 1 && (getActiveCurrentBet() > 0 || gameState.gameStatus === 'dealing') && (
            <Text style={s.currentBet}>
              Current Bet: {formatCurrency(getActiveCurrentBet())}
            </Text>
          )}
          
          {/* Split Hands Bet Display */}
          {gameState.totalHands > 1 && gameState.currentBets.some(bet => bet > 0) && (
            <View style={s.splitBetsContainer}>
              <Text style={s.splitBetsTitle}>Hand Bets:</Text>
              <View style={s.splitBetsRow}>
                <Text style={s.splitBetText}>Hand 1: {formatCurrency(gameState.currentBets[0] || 0)}</Text>
                <Text style={s.splitBetText}>Hand 2: {formatCurrency(gameState.currentBets[1] || 0)}</Text>
              </View>
            </View>
          )}
        </View>
        
        {/* Dealer Hand */}
        <Hand
          hands={dealerHands}
          activeHandIndex={0}
          handLabels={['Dealer Hand']}
          handValues={[0]}
          position={dealerPosition}
          deckCoordinates={deckCoordinates}
          gameConfig={gameConfig}
          cardLayout='spread'
          onHandUpdate={onDealerHandUpdate}
          onAnimationCallback={(suit, value, handIndex, cardId) => onCardAnimationComplete(suit, value, handIndex, cardId, true)}
          isDealer={true}
        />
        
        {/* Dealer Hand Total - Below dealer cards */}
        {showDealerTotal && dealerHands[0] && dealerHands[0].length > 0 && (
          <View style={[s.handTotalContainer, { 
            position: 'absolute',
            left: dealerPosition.x + (gameConfig.handWidth / 2) - 30,
            top: dealerPosition.y + gameConfig.cardHeight + 15,
            zIndex: 1001
          }]}>
            <Text style={s.handTotalText}>
              {animatedDealerTotal}
            </Text>
          </View>
        )}
        
        {/* Player Hand Totals - Above player cards */}
        {showPlayerTotal && gameState.totalHands === 1 && getActivePlayerCards().length > 0 && (
          <View style={[s.handTotalContainer, { 
            position: 'absolute',
            left: singlePlayerPosition.x + (gameConfig.handWidth / 2) - 30,
            top: singlePlayerPosition.y - 50,
            zIndex: 1001
          }]}>
            <Text style={s.handTotalText}>
              {animatedPlayerTotals[0]}
            </Text>
          </View>
        )}
        
        {/* Split Hand Totals */}
        {showPlayerTotal && gameState.totalHands > 1 && 
          getPlayerPositions().map((position, handIndex) => (
            gameState.playerHands[handIndex] && gameState.playerHands[handIndex].length > 0 && (
              <View key={`total-${handIndex}`} style={[s.handTotalContainer, { 
                position: 'absolute',
                left: position.x + (gameConfig.handWidth / 2) - 30,
                top: position.y - 50,
                zIndex: 1001
              }]}>
                <Text style={s.handTotalText}>
                  {animatedPlayerTotals[handIndex] || 0}
                </Text>
              </View>
            )
          ))
        }
        
        {/* Player Hand(s) */}
        {gameState.totalHands === 1 ? (
          <Hand
            hands={gameState.playerHands}
            activeHandIndex={gameState.activeHandIndex}
            handLabels={['Player Hand']}
            handValues={gameState.playerValues}
            position={singlePlayerPosition}
            deckCoordinates={deckCoordinates}
            gameConfig={gameConfig}
            onHandUpdate={onHandUpdate}
            onAnimationCallback={(suit, value, handIndex, cardId) => onCardAnimationComplete(suit, value, handIndex, cardId, false)}
            isDealer={false}
          />
        ) : (
          getPlayerPositions().map((position, handIndex) => (
            <Hand
              key={`hand-${handIndex}`}
              hands={[gameState.playerHands[handIndex] || []]}
              activeHandIndex={0}
              handLabels={[`Hand ${handIndex + 1}`]}
              handValues={[gameState.playerValues[handIndex] || 0]}
              position={position}
              deckCoordinates={deckCoordinates}
              gameConfig={gameConfig}
              onHandUpdate={(newHands) => onSingleHandUpdate(handIndex, newHands[0])}
              onAnimationCallback={(suit, value, _, cardId) => onCardAnimationComplete(suit, value, handIndex, cardId, false)}
              isDealer={false}
              disableAnimation={splitSequence === 'handoff'}
              style={{ zIndex: handIndex === 1 ? 1002 : 1001 }}
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
                setDealerHands([[]]);
                
                // Reset hand total visibility and animated totals
                setShowPlayerTotal(false);
                setShowDealerTotal(false);
                setAnimatedPlayerTotals([0]);
                setAnimatedDealerTotal(0);
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
      
      {/* TEST MENU - Right Side */}
      <View style={s.testMenu}>
        <Button 
          label={`Test: ${gameState.gameStatus}`}
          onPress={onTestStateChange}
          style={[s.testMenuButton, { backgroundColor: '#007AFF' }]}
        />
        <Button 
          label="Shuffle"
          onPress={onTestShuffle}
          style={[s.testMenuButton, { backgroundColor: '#FF6B35' }]}
        />
      </View>
      
    </View>
  );
}