import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from 'systems/AppContext';
import { tableStyles as s } from './BlackjackStyles';
import { text as t } from 'shared/text';
import { formatCurrency } from 'shared/utils';
// BlackJack game states - keep in sync with backend
const GAME_STATES = {
  BETTING: 'betting',
  DEALING: 'dealing', 
  INSURANCE_OFFERED: 'insurance_offered',
  DOUBLEDOWN_PROCESSING: 'doubledown_processing',
  PLAYING: 'playing',
  PLAYING_HAND_1: 'playing_hand_1',
  PLAYING_HAND_2: 'playing_hand_2',
  DEALER_TURN: 'dealer_turn',
  FINISHED: 'finished'
};
import Button from 'components/Button';
import Deck from 'components/Deck';
import Hand from 'components/Hand';
import WebSocketService from 'systems/websocket';

export default function Blackjack({ route }) {
  const navigation = useNavigation();
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const { playerBalance, loadingActions, 
          sendMessage, clearLoadingAction } = useApp();
  const [ gameState, setGameState ] = useState({
    gameStatus: GAME_STATES.BETTING, // 'betting', 'dealing', 'playing', 'dealer_turn', 'finished'
    dealerCards: [],
    dealerValue: 0,
    currentBets: [0], // Array of bets per hand
    totalHands: 1, // Total number of hands (1 or 2)
    handsCompleted: [], // Track which hands are completed
    playerHands: [[]], // Array of hands - index 0 for single-hand mode
    playerValues: [0], // Array of hand values
    target: 'player',
    handIndex: 0, // Currently active hand (0 for single-hand)
    result: null, // 'win', 'lose', 'push', 'blackjack'
    payout: 0,
  });
  const [ animationState, setAnimationState ] = useState('idle'); // 'idle', 'deck_shuffling', 'dealing_player', 'dealing_dealer', 'split_handoff', 'split_spread', 'split_dealing', 'finalizing'
  
  const [ deckCoordinates, setDeckCoordinates ] = useState({ x: 0, y: 0 });
  const [ dealerHand, setDealerHand ] = useState({animate: true, data: [[]]});
  const [ playerHand1, setPlayerHand1 ] = useState({animate: true, data: [[]]});
  const [ playerHand2, setPlayerHand2 ] = useState({animate: true, data: [[]]});  
  const [ buttonsDisabled, setButtonsDisabled ] = useState(false);
   
  const deckRef = useRef(null);
  
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
  
  const playerAreaY = screenHeight - gameConfigs.playerAreaOffset;
  const dealerAreaY = gameConfigs.dealerAreaOffset;
  const dealerPosition = { x: (screenWidth / 2) - (gameConfigs.handWidth / 2), y: dealerAreaY };
  const { selectedTier, tiers, maxMulti } = route?.params || {};
  
  // Get selected tier configuration
  const tierConfig = selectedTier !== undefined && tiers ? tiers[selectedTier] : [100, 200, 500];

  // Callback when deck shuffle completes
  const onShuffleComplete = () => {
    setAnimationState('idle');
    setButtonsDisabled(false);
  };
  
  
  // Shuffle deck function with animation state tracking
  const shuffleDeck = (times = 1) => {
    if (deckRef.current) {
      setAnimationState('deck_shuffling');
      setButtonsDisabled(true);
      deckRef.current.shuffle(times);
      // Animation state and button re-enabling handled by onShuffleComplete callback
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
    if (animationState === 'dealing_player') {
      setAnimationState('dealing_dealer');
      
      // Now animate dealer cards from master gameState
      setDealerHand({animate: true, data: [gameState.dealerCards]});
    }
    
    // Check if game is finished and show results after player animations complete
    if (gameState.gameStatus === 'finished' && animationState !== 'finalizing') {
      setAnimationState('finalizing');
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
    if (animationState === 'dealing_dealer') {
      setAnimationState('idle');
      setGameState(prev => ({
        ...prev,
        dealerCards: handsArray[0] || []
      }));
    }
    
    // Check if game is finished and show results after dealer animations complete
    if (gameState.gameStatus === 'finished' && animationState !== 'finalizing') {
      setAnimationState('finalizing');
    }
  };

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
    if (animationState === 'split_handoff') {
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
  

  // Compatibility layer - maintains existing API for single-hand access
  const getActivePlayerCards = () => gameState.playerHands[gameState.handIndex] || [];
  const getActiveCurrentBet = () => gameState.currentBets[gameState.handIndex] || 0;
  

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
    if (![GAME_STATES.PLAYING, GAME_STATES.PLAYING_HAND_1, GAME_STATES.PLAYING_HAND_2].includes(gameStatus)) {
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
    
    // Apply temporary disable logic - disable during animations or manual disables
    const isAnimating = animationState !== 'idle';
    const canHit = canHitBasic && !buttonsDisabled && !isAnimating;
    const canStand = canStandBasic && !buttonsDisabled && !isAnimating;
    const canDoubleDown = canDoubleDownBasic && !buttonsDisabled && !isAnimating;
    const canSplit = canSplitBasic && !buttonsDisabled && !isAnimating;
    const buyInsurance = buyInsuranceBasic && !buttonsDisabled && !isAnimating;
    
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
  const canBuyInsurance = gameState.gameStatus === GAME_STATES.INSURANCE_OFFERED && animationState === 'idle';
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
    if (gameState.gameStatus === GAME_STATES.BETTING) {
      const highestTierValue = Math.max(...tierConfig);
      const maxBetLimit = (maxMulti || 5) * highestTierValue;
      const currentBet = getActiveCurrentBet();
      const newBet = currentBet + betAmount;
      
      // Check if new bet would exceed limits
      if (newBet <= playerBalance && newBet <= maxBetLimit) {
        setGameState(prev => ({
          ...prev,
          currentBets: prev.currentBets.map((bet, index) => 
            index === prev.handIndex ? newBet : bet
          )
        }));
      }
    }
  };

  const onSubtractBet = (betAmount) => {
    if (gameState.gameStatus === GAME_STATES.BETTING) {
      const currentBet = getActiveCurrentBet();
      const newBet = Math.max(0, currentBet - betAmount);
      setGameState(prev => ({
        ...prev,
        currentBets: prev.currentBets.map((bet, index) => 
          index === prev.handIndex ? newBet : bet
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
        gameStatus: GAME_STATES.DEALING
      }));
      
      // Reset animation state for new game
      setAnimationState('idle');
      
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
          const isDisabled = gameState.gameStatus !== GAME_STATES.BETTING || isPageBlocked || animationState === 'deck_shuffling';
          
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
            (getActiveCurrentBet() === 0 || animationState === 'deck_shuffling') && s.placeBetButtonDisabled
          ]}
          disabled={getActiveCurrentBet() === 0 || animationState === 'deck_shuffling'}
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
              sendMessage('playerAction', {
                type: 'hit',
                target: 'player',
                handIndex: gameState.handIndex
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
                // Start split animation sequence
                setAnimationState('split_handoff');
                
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
                  target: 'player',
                  handIndex: gameState.handIndex
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
                target: 'player',
                handIndex: gameState.handIndex
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
      case GAME_STATES.BETTING:
        return 'Select your bet amount';
      case GAME_STATES.DEALING:
        return 'Dealing cards...';
      case GAME_STATES.INSURANCE_OFFERED:
        return 'Dealer shows Ace!';
      case GAME_STATES.DOUBLEDOWN_PROCESSING:
        return 'Doubling down...';
      case GAME_STATES.DEALER_TURN:
        return 'Dealer is playing...';
      case GAME_STATES.FINISHED:
        return animationState === 'finalizing' ? getGameResultMessage() : 'Finalizing...';
      default:
        return 'Make your move';
    }
  };

  // ========== Game Action Handlers - Ordered by gameplay sequence ==========
  // Handle initial bet placement and deal
  const onBetAction = (data) => {
    // Start player animation first, dealer cards will be handled after
    setAnimationState('dealing_player');
    
    // Calculate player card values in frontend
    const newPlayerValues = [parseInt(calculateHandValue(data.playerCards))];
    
    // Update player hand 1 state
    setPlayerHand1({animate: true, data: [data.playerCards]});
    
    // Update game state with both player and dealer cards (master copy)
    setGameState(prev => ({
      ...prev,
      currentBets: data.betAmount ? [data.betAmount] : prev.currentBets,
      gameStatus: data.gameStatus,
      playerHands: [data.playerCards],
      dealerCards: data.dealerCards, // Store dealer cards in master state
      playerValues: newPlayerValues,
      dealerValue: parseInt(calculateHandValue(data.dealerCards)),
      result: data.result || prev.result,
      payout: data.payout || prev.payout
    }));

    // Animation state will be managed by the state machine
  };


  // Handle split action - initial split with first cards
  const onSplitAction = (data) => {
    // Update player hand states - animated false for onSplitCalled
    setPlayerHand1({animate: false, data: [data.playerHands[0]]});
    setPlayerHand2({animate: false, data: [data.playerHands[1]]});
    
    // Update state to show we now have 2 hands with single cards
    setGameState(prev => ({
      ...prev,
      totalHands: 2,
      playerHands: data.playerHands, // First cards only
      playerValues: data.playerHands.map(hand => parseInt(calculateHandValue(hand))),
      currentBets: data.currentBets || [prev.currentBets[0], prev.currentBets[0]],
      target: data.target || 'player',
      handIndex: data.handIndex !== undefined ? data.handIndex : 0,
      gameStatus: data.gameStatus
    }));
    
    
    // First render both hands at center, then animate to spread positions
    setAnimationState('split_handoff');
    
    // Small delay to ensure both hands are rendered at center, then trigger spread
    setTimeout(() => {
      setAnimationState('split_spread');
      
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
    setAnimationState('split_dealing');
    
    // Step 1: Update Hand 1 first with animation
    setPlayerHand1({animate: true, data: [completeHands[0]]});

    setGameState(prev => ({
        ...prev,
        playerHands: [completeHands[0], prev.playerHands[1] || []], // Update only Hand 1
        playerValues: [parseInt(calculateHandValue(completeHands[0])), prev.playerValues[1] || 0],
        target: data.target || prev.target,
        handIndex: data.handIndex !== undefined ? data.handIndex : prev.handIndex
      }));
      
      // Step 2: After Hand 1 animates, update Hand 2
      setTimeout(() => {
        setPlayerHand2({animate: true, data: [completeHands[1]]});
        
        setGameState(prev => ({
          ...prev,
          playerHands: [completeHands[0], completeHands[1]], // Now update Hand 2
          playerValues: completeHands.map(hand => parseInt(calculateHandValue(hand))),
          target: data.target || prev.target,
        handIndex: data.handIndex !== undefined ? data.handIndex : prev.handIndex
        }));
        
        // Step 3: Complete split sequence after Hand 2 animates
        setTimeout(() => {
          setAnimationState('idle');
        }, gameConfigs.durations.cardDeal + 100);
      }, gameConfigs.durations.cardDeal + 100); // Wait for Hand 1 animation
  };

  // Handle all other actions (hit, stand, etc.)
  const onDefaultAction = (data) => {
    // For all other actions, update normally (no sequencing needed)
    const newPlayerHands = data.playerCards ? (() => {
      // For single playerCards response, update the correct hand in existing array
      const activeIndex = data.handIndex !== undefined ? data.handIndex : gameState.handIndex;
      const updatedHands = [...gameState.playerHands];
      updatedHands[activeIndex] = data.playerCards;
      return updatedHands;
    })() : data.playerHands ? data.playerHands : gameState.playerHands;
    const newDealerCards = data.dealerCards || gameState.dealerCards;
    
    // Update hand states with animation
    if (data.playerCards && data.target === 'player') {
      // For single playerCards response, update the correct hand based on handIndex from backend
      const activeIndex = data.handIndex !== undefined ? data.handIndex : gameState.handIndex;
      if (activeIndex === 0) {
        setPlayerHand1({animate: true, data: [data.playerCards]});
      } else if (activeIndex === 1) {
        setPlayerHand2({animate: true, data: [data.playerCards]});
      }
    } else if (data.playerHands) {
      if (data.playerHands[0]) setPlayerHand1({animate: true, data: [data.playerHands[0]]});
      if (data.playerHands[1]) setPlayerHand2({animate: true, data: [data.playerHands[1]]});
    }
    
    if (data.dealerCards) {
      // Check if this is the final dealer sequence (game finished)
      if (data.gameStatus === 'finished') {
        // Use proper dealer animation sequence like initial deal
        setAnimationState('dealing_dealer');
        setDealerHand({animate: true, data: [data.dealerCards]});
      } else {
        // Regular dealer update during game
        setDealerHand({animate: true, data: [data.dealerCards]});
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
      target: data.target || prev.target,
      handIndex: data.gameStatus === GAME_STATES.PLAYING_HAND_2 ? 1 : 
                 data.gameStatus === GAME_STATES.PLAYING_HAND_1 ? 0 :
                 data.handIndex !== undefined ? data.handIndex : prev.handIndex,
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
  };

  // ========== ALL useEffects - Defined at bottom for better organization ==========

  useEffect(() => {
    setTimeout(() => {
      shuffleDeck(2);
    }, 500);

    const BlackJackChannel = (data) => {
      if (!data.success) return;
      const actionType = data.actionType;
      clearLoadingAction(actionType);
      switch (actionType) {
        case 'bet':
          (data.playerCards && data.dealerCards) && onBetAction(data);
          break;
        case 'hit':
          onDefaultAction(data);
          if (data.handComplete) {
            sendMessage('playerAction', {
              type: 'stand',
              target: 'player',
              handIndex: data.handIndex
            });
          }
          break;
        case 'doubleDown':
          onDefaultAction(data);
          if (data.handComplete) {
            sendMessage('playerAction', {
              type: 'stand',
              target: 'player',
              handIndex: data.handIndex
            });
          }
          break;
        case 'split':
          data.playerHands && onSplitAction(data);
          break;
        case 'splitDeal':
          data.playerHands && onSplitDealAction(data);
          break;
        case 'nextHand':
          // Advance to next hand - just update game state
          setGameState(prev => ({
            ...prev,
            gameStatus: data.gameStatus,
            target: data.target,
            handIndex: data.handIndex,
            playerHands: data.playerHands,
            totalHands: data.totalHands
          }));
          break;
        case 'dealerTurn':
          // Dealer turn with final results
          setGameState(prev => ({
            ...prev,
            gameStatus: data.gameStatus,
            target: data.target,
            handIndex: data.handIndex,
            dealerCards: data.dealerCards,
            result: data.result,
            payout: data.payout,
            playerHands: data.playerHands,
            totalHands: data.totalHands
          }));
          // Animate dealer cards
          if (data.dealerCards) {
            setAnimationState('dealing_dealer');
            setDealerHand({animate: true, data: [data.dealerCards]});
          }
          break;
      }
      
      onFinishedGame(data);
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
            gameState.gameStatus === GAME_STATES.BETTING 
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
            onShuffleComplete={onShuffleComplete}
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
          hands={dealerHand}
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

        {gameState.totalHands === 1 ? (
          <Hand
            testID="singlePlayerHand"
            testFinder='testFinder'
            hands={playerHand1}
            activeHandIndex={gameState.handIndex}
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
              hands={handIndex === 0 ? playerHand1 : playerHand2}
              activeHandIndex={gameState.handIndex === handIndex ? 0 : -1}
              handLabels={[`Hand ${handIndex + 1}`]}
              handValues={[gameState.playerValues[handIndex] || 0]}
              betAmounts={[gameState.currentBets[handIndex] || 0]}
              isSplitHand={gameState.totalHands > 1}
              position={position}
              animatePosition={animationState === 'split_spread'}
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
        {gameState.gameStatus === GAME_STATES.BETTING && renderBettingControls()}
        {gameState.gameStatus === GAME_STATES.FINISHED && animationState === 'finalizing' && (
          <View style={s.dealingMessage}>
            <TouchableOpacity
              style={s.playAgainButton}
              onPress={() => {
                // Reset frontend state to betting mode
                setGameState(prev => ({
                  ...prev,
                  gameStatus: GAME_STATES.BETTING,
                  playerHands: [[]],
                  dealerCards: [],
                  playerValues: [0],
                  dealerValue: 0,
                  currentBets: [0],
                  target: 'player',
                  handIndex: 0,
                  totalHands: 1,
                  result: null,
                  payout: 0,
                  handsCompleted: []
                }));
                
                // Reset all hand states
                setDealerHand({animate: true, data: [[]]});
                setPlayerHand1({animate: true, data: [[]]});
                setPlayerHand2({animate: true, data: [[]]});
                
                // Reset animation state
                setAnimationState('idle');
                
                // Clear any temporary button disables
                
                
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
        {gameState.gameStatus === GAME_STATES.INSURANCE_OFFERED && animationState === 'idle' && (
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
        {[GAME_STATES.PLAYING, GAME_STATES.PLAYING_HAND_1, GAME_STATES.PLAYING_HAND_2].includes(gameState.gameStatus) && renderPlayingControls()}
      </View>
    </View>
  );
}