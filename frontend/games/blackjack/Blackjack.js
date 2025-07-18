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
      deckShuffle: 800,
      handUpdate: 200
    },
    buffers: {
      initialDeal: 500,
      dealerTurn: 1000
    },
    
    // Layout
    handWidth: screenWidth * 0.4,
    cardSpacing: 0.3,
    cardLayout: 'overlap',
    spreadLimit: 3,
    
    // Hand positioning
    dealerAreaOffset: 64 + 100 + 126 + 50, // deck paddingTop + half minHeight + deck height + spacing
    playerAreaOffset: 400 // from bottom of screen
  };
  
  // Dealer hand state
  const [dealerHands, setDealerHands] = useState([[]]);
  const [dealerCardToDeal, setDealerCardToDeal] = useState(null);
  
  // Deck state management
  const [deckCards, setDeckCards] = useState([]);
  const [deckCoordinates, setDeckCoordinates] = useState({ x: 0, y: 0 });
  const [cardToDeal, setCardToDeal] = useState(null);
  
  // Central card dealing queue
  const [cardQueue, setCardQueue] = useState([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  
  // Safety controls for button clicks
  const [temporarilyDisabledButtons, setTemporarilyDisabledButtons] = useState(new Set());
  
  // Track when hand totals should be visible (after card flip animations complete)
  const [showPlayerTotal, setShowPlayerTotal] = useState(false);
  const [showDealerTotal, setShowDealerTotal] = useState(false);
  
  // Track when final animations are complete for finished games
  const [finalAnimationsComplete, setFinalAnimationsComplete] = useState(false);
  
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
  
  // Initialize deck
  useEffect(() => {
    setDeckCards(buildDeck(10));
  }, []);
  
  // Shuffle deck function
  const shuffleDeck = (times = 1) => {
    if (deckRef.current) {
      deckRef.current.shuffle(times);
    }
  };
  
  // Handle hand updates from Hand component
  const onHandUpdate = (newHands) => {
    setGameState(prev => ({
      ...prev,
      playerHands: newHands,
      playerValues: newHands.map(hand => calculateBlackjackValue(hand))
    }));
  };
  
  // Handle dealer hand updates
  const onDealerHandUpdate = (newHands) => {
    setDealerHands(newHands);
  };
  
  const playerAreaY = screenHeight - gameConfig.playerAreaOffset;
  const dealerAreaY = gameConfig.dealerAreaOffset;
  
  // Hand positions for proper card placement (Hand component uses these internally)
  const playerPosition = { x: (screenWidth / 2) - (gameConfig.handWidth / 2), y: playerAreaY };
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
  const getActivePlayerValue = () => gameState.playerValues[gameState.activeHandIndex] || 0;
  const getActiveCurrentBet = () => gameState.currentBets[gameState.activeHandIndex] || 0;
  
  // Helper functions for multi-hand state management
  const updateActiveHand = (cards, value) => {
    setGameState(prev => ({
      ...prev,
      playerHands: prev.playerHands.map((hand, index) => 
        index === prev.activeHandIndex ? cards : hand
      ),
      playerValues: prev.playerValues.map((val, index) => 
        index === prev.activeHandIndex ? value : val
      )
    }));
  };
  
  const updateActiveHandCards = (cards) => {
    setGameState(prev => ({
      ...prev,
      playerHands: prev.playerHands.map((hand, index) => 
        index === prev.activeHandIndex ? cards : hand
      )
    }));
  };
  
  const updateActiveHandValue = (value) => {
    setGameState(prev => ({
      ...prev,
      playerValues: prev.playerValues.map((val, index) => 
        index === prev.activeHandIndex ? value : val
      )
    }));
  };

  // Frontend logic to determine button states based on game data
  const getButtonStates = () => {
    const { gameStatus, dealerCards } = gameState;
    const playerCards = getActivePlayerCards();
    const playerValue = getActivePlayerValue();
    
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
  
  // Check if insurance is available
  const canBuyInsurance = gameState.gameStatus === 'insurance_offered';
  const insuranceAmount = Math.floor(getActiveCurrentBet() / 2);

  // Calculate blackjack hand value with Ace flexibility
  const calculateBlackjackValue = (cards) => {
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
    
    // Show both values if applicable
    const lowValue = value - (aces * 10);
    if (aces > 0 && value > 21 && lowValue <= 21) {
      return `${lowValue}/${value}`;
    }
    
    // Adjust for soft aces
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }
    
    return value.toString();
  };
  
  // Calculate centered position for hand total relative to hand position
  const calculateHandTotalPosition = (cards, handPosition, isDealer = false) => {
    const CARD_WIDTH = gameConfig.cardWidth;
    const CARD_HEIGHT = gameConfig.cardHeight;
    const numCards = cards?.length || 2;
    
    // Use same logic as Hand component for spread layout
    const cardSpacingValue = CARD_WIDTH + (CARD_WIDTH * 0.2); // 20% spacing for spread
    
    // For blackjack: first two cards use 2-card positioning, then normal shifting
    const positioningCards = numCards <= 2 ? 2 : numCards;
    const totalWidth = CARD_WIDTH + (positioningCards - 1) * cardSpacingValue;
    const centerStart = (screenWidth - totalWidth) / 2;
    const handCenterX = centerStart + totalWidth / 2;
    
    return {
      left: handCenterX - 30, // Center the 60px wide total container
      top: isDealer 
        ? handPosition.y + CARD_HEIGHT + 15  // Below dealer hand
        : handPosition.y - 50                // Above player hand
    };
  };

  const formatCurrencyButton = (cents) => {
    if (cents < 100) {
      return `${cents}¢`;
    }
    return `$${(cents / 100).toLocaleString()}`;
  };

  // Generate detailed game result message
  const getGameResultMessage = () => {
    const { result, payout, dealerValue, dealerCards } = gameState;
    const playerValue = getActivePlayerValue();
    const playerCards = getActivePlayerCards();
    
    // Debug logging
    console.log('Game result data:', { result, payout, playerValue, dealerValue, playerCards, dealerCards });
    
    if (result === 'lose') {
      // Player busted
      if (playerValue > 21) {
        return `You busted with ${playerValue}! You lose.`;
      }
      // Dealer won
      if (dealerValue <= 21) {
        return `Dealer wins with ${dealerValue} vs your ${playerValue}. You lose.`;
      }
      // Dealer blackjack
      if (dealerCards?.length === 2 && dealerValue === 21) {
        return `Dealer has blackjack! You lose.`;
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

  // Test card dealing - simulates initial blackjack deal
  const onTestDeal = () => {
    // Generate four cards for initial deal following proper blackjack sequence
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    // Proper blackjack deal sequence: Player 1 → Player 2 → Dealer face-up → Dealer hole card
    const dealCards = [
      { suit: suits[Math.floor(Math.random() * suits.length)], value: values[Math.floor(Math.random() * values.length)], target: 'player' }, // Player card 1
      { suit: suits[Math.floor(Math.random() * suits.length)], value: values[Math.floor(Math.random() * values.length)], target: 'player' }, // Player card 2
      { suit: suits[Math.floor(Math.random() * suits.length)], value: values[Math.floor(Math.random() * values.length)], target: 'dealer' }, // Dealer face-up
      { suit: null, value: null, isHoleCard: true, target: 'dealer' } // Dealer hole card
    ];
    
    // Clear existing hands
    setPlayerHands([[]]);
    setDealerHands([[]]);
    
    // Add cards to central queue for sequential dealing
    setCardQueue(dealCards);
  };

  // Test shuffle animation
  const onTestShuffle = () => {
    shuffleDeck(1);
  };

  // Test reveal hole card
  const onTestRevealHoleCard = () => {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    const revealCard = {
      suit: suits[Math.floor(Math.random() * suits.length)],
      value: values[Math.floor(Math.random() * values.length)],
      revealHoleCard: true,
      target: 'dealer'
    };
    
    setCardQueue([revealCard]);
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

  // Central card queue processor - deals cards with appropriate timing
  useEffect(() => {
    if (cardQueue.length > 0 && !isProcessingQueue) {
      setIsProcessingQueue(true);
      const nextCard = cardQueue[0];
      
      // Deal card to appropriate hand
      if (nextCard.target === 'player') {
        setCardToDeal(nextCard);
        setTimeout(() => setCardToDeal(null), gameConfig.durations.handUpdate);
        
        // Show player total after card flip animation completes (if not a hole card)
        if (!nextCard.isHoleCard) {
          setTimeout(() => {
            setShowPlayerTotal(true);
          }, gameConfig.durations.cardDeal + gameConfig.durations.cardFlip);
        }
      } else if (nextCard.target === 'dealer') {
        setDealerCardToDeal(nextCard);
        setTimeout(() => setDealerCardToDeal(null), gameConfig.durations.handUpdate);
        
        // If revealing hole card, update game state immediately with revealed card
        if (nextCard.revealHoleCard) {
          setGameState(prev => ({
            ...prev,
            dealerCards: prev.dealerCards.map((card, index) => 
              index === 1 ? { ...nextCard, isHoleCard: false } : card
            )
          }));
        }
        
        // Show dealer total after card flip animation completes (if not a hole card OR if revealing hole card)
        if (!nextCard.isHoleCard || nextCard.revealHoleCard) {
          setTimeout(() => {
            setShowDealerTotal(true);
          }, gameConfig.durations.cardDeal + gameConfig.durations.cardFlip);
        }
      }
      
      // Remove processed card from queue
      setCardQueue(prev => prev.slice(1));
      
      // Use dealer turn buffer for cards marked as dealer turn, otherwise use initial deal buffer
      const delay = nextCard.dealerTurn ? gameConfig.buffers.dealerTurn : gameConfig.buffers.initialDeal;
      
      // Wait appropriate time before processing next card
      setTimeout(() => {
        setIsProcessingQueue(false);
      }, delay);
    }
  }, [cardQueue, isProcessingQueue]);
  
  // Handle blackjack game start response
  useEffect(() => {
    const onBlackjackGameStarted = (data) => {
      if (data.success) {
        // Clear existing hands and set up new game
        setPlayerHands([[]]);
        setDealerHands([[]]);
        
        // Reset hand total visibility for new game
        setShowPlayerTotal(false);
        setShowDealerTotal(false);
        
        // Handle immediate blackjack results
        if (data.immediateResult) {
          // Both cards are revealed immediately for blackjack scenarios
          setGameState(prev => ({
            ...prev,
            currentBet: data.betAmount,
            gameStatus: data.gameState.gameStatus,
            playerCards: data.gameState.playerCards,
            dealerCards: data.gameState.dealerCards,
            playerValue: data.gameState.playerValue,
            dealerValue: data.gameState.dealerValue,
            result: data.gameState.result,
            payout: data.gameState.payout
          }));
          
          // Add all cards to queue for visual dealing
          const dealCards = [
            { ...data.gameState.playerCards[0], target: 'player' },
            { ...data.gameState.playerCards[1], target: 'player' },
            { ...data.gameState.dealerCards[0], target: 'dealer' },
            { ...data.gameState.dealerCards[1], target: 'dealer' } // Hole card revealed
          ];
          
          setCardQueue(dealCards);
          
          // Show final result after dealing animation
          setTimeout(() => {
            setGameState(prev => ({
              ...prev,
              gameStatus: 'finished'
            }));
          }, dealCards.length * gameConfig.durations.cardDeal + gameConfig.durations.handUpdate);
        } else {
          // Normal game flow - hide hole card
          setGameState(prev => ({
            ...prev,
            currentBet: data.betAmount,
            gameStatus: data.gameState.gameStatus,
            playerCards: data.gameState.playerCards,
            dealerCards: data.gameState.dealerCards,
            playerValue: data.gameState.playerValue,
            dealerValue: data.gameState.dealerValue,
            result: null,
            payout: 0
          }));
          
          // Add cards to queue for visual dealing
          const dealCards = [
            { ...data.gameState.playerCards[0], target: 'player' },
            { ...data.gameState.playerCards[1], target: 'player' },
            { ...data.gameState.dealerCards[0], target: 'dealer' },
            { suit: null, value: null, isHoleCard: true, target: 'dealer' }
          ];
          
          setCardQueue(dealCards);
          
          // Disable all buttons during dealing animation
          temporarilyDisableButton('dealing');
        }
      }
    };

    const onActionResult = (data) => {
      if (data.success) {
        // Handle ALL player actions through this single handler
        const actionType = data.actionType;
        
        // Clear loading state for this action
        clearLoadingAction(actionType);
        
        // Special handling for bet action (game start)
        if (actionType === 'bet') {
          // Reset hand total visibility for new game
          setShowPlayerTotal(false);
          setShowDealerTotal(false);
          
          // Handle immediate blackjack results
          if (data.immediateResult) {
            setGameState(prev => ({
              ...prev,
              currentBets: [data.betAmount],
              gameStatus: data.gameStatus,
              playerHands: [[]],  // Start with empty hands for card dealing animation
              dealerCards: [],
              playerValues: [0],
              dealerValue: 0,
              result: data.result,
              payout: data.payout
            }));
            
            // Show final result after dealing animation
            setTimeout(() => {
              setGameState(prev => ({
                ...prev,
                gameStatus: 'finished',
                playerHands: [data.playerCards],
                dealerCards: data.dealerCards,
                playerValues: [data.playerValue],
                dealerValue: data.dealerValue
              }));
              setFinalAnimationsComplete(true);
            }, data.cardsToShow.length * gameConfig.buffers.initialDeal + gameConfig.durations.handUpdate);
          } else {
            // Normal game flow
            setGameState(prev => ({
              ...prev,
              currentBets: [data.betAmount],
              gameStatus: data.gameStatus,
              playerHands: [[]],  // Start with empty hands for card dealing animation
              dealerCards: [],
              playerValues: [0],
              dealerValue: 0,
              result: null,
              payout: 0
            }));
            
            // Disable all buttons during dealing animation
            temporarilyDisableButton('dealing');
          }
        } else {
          // Handle all other actions
          setGameState(prev => ({
            ...prev,
            gameStatus: data.gameStatus,
            playerValues: data.playerValue ? [data.playerValue] : prev.playerValues,
            dealerValue: data.dealerValue || prev.dealerValue,
            playerHands: data.playerCards ? [data.playerCards] : prev.playerHands,
            dealerCards: data.dealerCards || prev.dealerCards,
            result: data.result || prev.result,
            payout: data.payout || prev.payout
          }));
        }
        
        // Handle double down sequence - player gets card first, then dealer plays
        if (data.needsDealerPlay) {
          // Update player cards state immediately
          setGameState(prev => ({
            ...prev,
            playerHands: [data.cards],
            playerValues: [data.handValue],
            gameStatus: 'dealer_turn'
          }));
          
          // First phase: Deal player's double down card
          if (data.newCard) {
            const playerCard = {
              ...data.newCard,
              target: 'player'
            };
            setCardQueue([playerCard]);
            
            // After player's card is dealt, automatically trigger dealer's turn
            setTimeout(() => {
              sendMessage('playerAction', {
                type: 'playDealerAfterDoubleDown',
                playerCards: data.cards,
                dealerCards: gameState.dealerCards
              });
            }, gameConfig.buffers.initialDeal + gameConfig.durations.handUpdate);
          }
        }
        // Process any cards that need to be dealt
        else if (data.cardsToShow) {
          const cardQueue = data.cardsToShow.map(cardData => ({
            ...cardData.card,
            target: cardData.target,
            revealHoleCard: cardData.action === 'reveal',
            dealerTurn: gameState.gameStatus === 'dealer_turn' || data.gameStatus === 'dealer_turn'
          }));
          setCardQueue(cardQueue);
          
          // For finished games, ensure the finished state persists after all cards are dealt
          if (data.gameStatus === 'finished') {
            // Calculate total time based on card types in queue
            const totalTime = cardQueue.reduce((total, card) => {
              return total + (card.dealerTurn ? gameConfig.buffers.dealerTurn : gameConfig.buffers.initialDeal);
            }, 0) + gameConfig.durations.handUpdate;
            
            setTimeout(() => {
              setGameState(prev => ({
                ...prev,
                gameStatus: 'finished'
              }));
              // Set final animations complete flag after all cards are dealt
              setFinalAnimationsComplete(true);
            }, totalTime);
          }
        }
        // Handle finished games with no cards to show (immediate results)
        else if (data.gameStatus === 'finished' && !data.cardsToShow && !data.needsDealerPlay) {
          // No cards to deal, animations are immediately complete
          setFinalAnimationsComplete(true);
        }
        
        // Clear temporary disables if game state changes to non-playing
        if (data.gameStatus !== 'playing') {
          clearTemporaryDisables();
        }
      }
    };


    
    
    // Register message handlers
    WebSocketService.onMessage('blackjackGameStarted', onBlackjackGameStarted);
    WebSocketService.onMessage('actionResult', onActionResult);
    
    return () => {
      // Cleanup handlers on unmount
      WebSocketService.removeMessageHandler('blackjackGameStarted');
      WebSocketService.removeMessageHandler('actionResult');
    };
  }, []);

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
            getActiveCurrentBet() === 0 && s.placeBetButtonDisabled
          ]}
          disabled={getActiveCurrentBet() === 0}
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
        {/* Main Action Buttons */}
        <View style={s.mainActionsRow}>
          <TouchableOpacity
            onPress={() => {
              temporarilyDisableButton('hit');
              sendMessage('playerAction', {
                type: 'hit',
                playerCards: getActivePlayerCards(),
                handId: 'player-hand-0'
              });
            }}
            style={[
              s.actionButton,
              !buttonStates.canHit && { opacity: 0.5 }
            ]}
            disabled={!buttonStates.canHit}
            testID="hitButton"
          >
            <View style={sc.componentStyles.buttonContent}>
              <Text style={sc.componentStyles.buttonText}>Hit</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => {
              sendMessage('playerAction', {
                type: 'stand',
                playerCards: getActivePlayerCards(),
                dealerCards: gameState.dealerCards
              });
            }}
            style={[
              s.actionButton,
              !buttonStates.canStand && { opacity: 0.5 }
            ]}
            disabled={!buttonStates.canStand}
            testID="standButton"
          >
            <View style={sc.componentStyles.buttonContent}>
              <Text style={sc.componentStyles.buttonText}>Stand</Text>
            </View>
          </TouchableOpacity>
        </View>
        
        {/* Secondary Action Buttons */}
        <View style={s.secondaryActionsRow}>
          {buttonStates.canSplit && (
            <TouchableOpacity
              onPress={() => {
                temporarilyDisableButton('split');
                // TODO: Implement split logic
              }}
              style={[
                s.secondaryActionButton,
                !buttonStates.canSplit && { opacity: 0.5 }
              ]}
              disabled={!buttonStates.canSplit}
              testID="splitButton"
            >
              <View style={sc.componentStyles.buttonContent}>
                <Text style={sc.componentStyles.buttonText}>Split</Text>
              </View>
            </TouchableOpacity>
          )}
          
          {buttonStates.canDoubleDown && (
            <TouchableOpacity
              onPress={() => {
                sendMessage('playerAction', {
                  type: 'doubleDown',
                  playerCards: getActivePlayerCards(),
                  dealerCards: gameState.dealerCards,
                  handId: 'player-hand-0'
                });
              }}
              style={[
                s.secondaryActionButton,
                !buttonStates.canDoubleDown && { opacity: 0.5 }
              ]}
              disabled={!buttonStates.canDoubleDown}
              testID="doubleDownButton"
            >
              <View style={sc.componentStyles.buttonContent}>
                <Text style={sc.componentStyles.buttonText}>Double Down</Text>
              </View>
            </TouchableOpacity>
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
        <Text style={s.balanceHeader}>
          {t.balance.replace('{balance}', formatCurrency(playerBalance - (getActiveCurrentBet() || 0)))}
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
          
          {/* Insurance Question */}
          {canBuyInsurance && (
            <Text style={s.insuranceQuestion}>
              Buy insurance against dealer blackjack?
            </Text>
          )}
          
          {/* Current Bet Display */}
          {(getActiveCurrentBet() > 0 || gameState.gameStatus === 'dealing') && (
            <Text style={s.currentBet}>
              Current Bet: {formatCurrency(getActiveCurrentBet())}
            </Text>
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
          cardData={dealerCardToDeal}
          onHandUpdate={onDealerHandUpdate}
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
              {calculateBlackjackValue(dealerHands[0])}
            </Text>
          </View>
        )}
        
        {/* Player Hand Total - Above player cards */}
        {showPlayerTotal && getActivePlayerCards().length > 0 && (
          <View style={[s.handTotalContainer, { 
            position: 'absolute',
            left: playerPosition.x + (gameConfig.handWidth / 2) - 30,
            top: playerPosition.y - 50,
            zIndex: 1001
          }]}>
            <Text style={s.handTotalText}>
              {calculateBlackjackValue(getActivePlayerCards())}
            </Text>
          </View>
        )}
        
        {/* Player Hand(s) */}
        <Hand
          hands={gameState.playerHands}
          activeHandIndex={gameState.activeHandIndex}
          handLabels={['Player Hand']}
          handValues={gameState.playerValues}
          position={playerPosition}
          deckCoordinates={deckCoordinates}
          gameConfig={gameConfig}
          cardData={cardToDeal}
          onHandUpdate={onHandUpdate}
          isDealer={false}
        />
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
                
                // Reset hand total visibility
                setShowPlayerTotal(false);
                setShowDealerTotal(false);
                
                // Reset final animations complete flag
                setFinalAnimationsComplete(false);
                
                // Clear any temporary button disables
                clearTemporaryDisables();
                
                // Clear card queue
                setCardQueue([]);
              }}
              testID="playAgainButton"
            >
              <Text style={s.playAgainButtonText}>Play Again</Text>
            </TouchableOpacity>
          </View>
        )}
        {gameState.gameStatus === 'insurance_offered' && (
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
          label="Deal"
          onPress={onTestDeal}
          style={[s.testMenuButton, { backgroundColor: '#28a745' }]}
        />
        <Button 
          label="Reveal Hole Card"
          onPress={onTestRevealHoleCard}
          style={[s.testMenuButton, { backgroundColor: '#6f42c1' }]}
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