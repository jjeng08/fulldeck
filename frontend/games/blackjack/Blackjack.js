import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from 'systems/AppContext';
import { tableStyles as s } from './BlackjackStyles';
import { text as t } from 'shared/text';
import { formatCurrency, formatCurrencyButton } from 'shared/utils';
import { GAME_STATES, calculateHandValue } from './blackjackCore';
import Button from 'components/Button';
import Deck from 'components/Deck';
import Hand from 'components/Hand';
import WebSocketService from 'systems/websocket';

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

const gameConfigs = {  
  // Timing
  durations: {
    cardDeal: 900,
    flipDelay: 300,
    splitSpread: 600,
  },
  
  // Layout (ratios and absolute values only)
  startingCards: 2,
  handWidthRatio: 0.4,
  handSeparationRatio: 0.3, // Distance between split hands
  cardSpacing: 0.3, // Overlap spacing multiplier
  spreadLimit: 3, // Switch from spread to overlap when more than this many cards
  
  // Hand positioning
  dealerAreaOffset: 64 + 100 + 126 + 50, // deck paddingTop + half minHeight + deck height + spacing
  playerAreaOffset: 400 // from bottom of screen
};

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
    target: 'player',
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
  const activeHandIndex = useRef(0); // Currently active hand index (0 for single-hand, 0 or 1 for split)
  
  const playerAreaY = screenHeight - gameConfigs.playerAreaOffset;
  const dealerAreaY = gameConfigs.dealerAreaOffset;
  const handWidth = screenWidth * gameConfigs.handWidthRatio;
  const dealerPosition = { x: (screenWidth / 2) - (handWidth / 2), y: dealerAreaY };
  const { tierConfig, maxMulti } = route?.params || {};
  const tier = tierConfig || [100, 200, 500];
  const buttonStates = getButtonStates();

  useEffect(() => {
    setTimeout(() => {
      shuffleDeck(2);
    }, 500);

    const BlackjackChannel = (data) => {
      if (!data.success) return;
      const actionType = data.actionType;
      clearLoadingAction(actionType);
      switch (actionType) {
        case 'bet':
          (data.playerHands && data.dealerCards) && onBetAction(data);
          if (data.handComplete) {
            sendMessage('playerAction', {
              type: 'dealerComplete'
            });
          }
          break;
        case 'hit':
          onDefaultAction(data);
          if (data.handComplete) {
            sendMessage('playerAction', {
              type: 'stand',
              target: 'player',
              handIndex: activeHandIndex.current
            });
          }
          break;
        case 'doubleDown':
          onDefaultAction(data);
          if (data.handComplete) {
            sendMessage('playerAction', {
              type: 'stand',
              target: 'player',
              handIndex: activeHandIndex.current
            });
          }
          break;
        case 'split':
          data.playerHands && onSplitAction(data);
          break;
        case 'splitDeal':
          data.playerHands && onSplitDealAction(data);
          break;
        case 'insurance':
          onDefaultAction(data);
          // If dealer had blackjack, game is finished
          if (data.gameStatus === GAME_STATES.FINISHED) {
            setAnimationState('finalizing');
          }
          break;
        case 'nextHand':
          // Advance to next hand - update local activeHandIndex and game state
          activeHandIndex.current = activeHandIndex.current + 1;
          setGameState(prev => ({
            ...prev,
            gameStatus: data.gameStatus,
            target: data.target,
            playerHands: data.playerHands,
            totalHands: data.totalHands
          }));
          break;
        case 'dealerTurn':
          // Dealer turn - animate cards and handle completion
          setGameState(prev => ({
            ...prev,
            gameStatus: data.gameStatus,
            target: data.target,
            dealerCards: data.dealerCards,
            playerHands: data.playerHands,
            totalHands: data.totalHands,
            handComplete: data.handComplete // Store handComplete for onHandUpdate
          }));
          // Animate dealer cards
          if (data.dealerCards) {
            setAnimationState('dealing_dealer');
            setDealerHand({animate: true, data: [data.dealerCards]});
          }
          break;
        case 'dealerComplete':
          // Final game results
          setGameState(prev => ({
            ...prev,
            gameStatus: data.gameStatus,
            target: data.target,
            dealerCards: data.dealerCards,
            result: data.result,
            payout: data.payout,
            playerHands: data.playerHands,
            totalHands: data.totalHands
          }));
          // Game is finished, set to finalizing state
          if (data.gameStatus === GAME_STATES.FINISHED) {
            setAnimationState('finalizing');
          }
          break;
      }
      onFinishedGame(data);
    };    
    WebSocketService.onMessage('blackJackChannel', BlackjackChannel);
    return () => {
      WebSocketService.removeMessageHandler('blackJackChannel');
    };
  }, []);

  // Helper functions for onDefaultAction
  const updatePlayerHandAnimations = (data) => {
    if (data.playerHands) {
      if (data.playerHands[0]) setPlayerHand1({animate: true, data: [data.playerHands[0]]});
      if (data.playerHands[1]) setPlayerHand2({animate: true, data: [data.playerHands[1]]});
    }
  };

  const updateDealerHandAnimation = (data) => {
    if (data.dealerCards) {
      if (data.gameStatus === 'finished') {
        setAnimationState('dealing_dealer');
        setDealerHand({animate: true, data: [data.dealerCards]});
      } else {
        setDealerHand({animate: true, data: [data.dealerCards]});
      }
    }
  };

  const calculateUpdatedValues = (playerHands, dealerCards) => {
    const newDealerValue = calculateHandValue(dealerCards);
    return { newDealerValue };
  };

  const updateGameStateFromAction = (data, playerHands, dealerCards, dealerValue) => {
    setGameState(prev => ({
      ...prev,
      currentBets: data.betAmount ? [data.betAmount] : 
                  data.currentBets ? data.currentBets : prev.currentBets,
      gameStatus: data.gameStatus,
      playerHands: playerHands,
      dealerCards: dealerCards,
      dealerValue: dealerValue,
      totalHands: data.playerHands ? data.playerHands.length : prev.totalHands,
      target: data.target || prev.target,
      result: data.result || prev.result,
      payout: data.payout || prev.payout
    }));
  };

  const onDefaultAction = (data) => {
    const newPlayerHands = data.playerHands || gameState.playerHands;
    const newDealerCards = data.dealerCards || gameState.dealerCards;
    
    updatePlayerHandAnimations(data);
    updateDealerHandAnimation(data);
    
    const { newDealerValue } = calculateUpdatedValues(newPlayerHands, newDealerCards);
    updateGameStateFromAction(data, newPlayerHands, newDealerCards, newDealerValue);
  };

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
  
  // Handle hand updates from Hand component (both dealer and player)
  const onHandUpdate = (newHands, isDealer = false) => {
    const handsArray = Array.isArray(newHands) ? newHands : (newHands?.data || []);
    if (isDealer) {
      // Handle dealer hand updates
      if (animationState === 'dealing_dealer') {
        setAnimationState('idle');
        setGameState(prev => ({
          ...prev,
          dealerCards: handsArray[0] || []
        }));
        
        // If dealer's turn just finished, send dealerComplete message
        if (gameState.gameStatus === GAME_STATES.DEALER_TURN && gameState.handComplete) {
          sendMessage('playerAction', {
            type: 'dealerComplete'
          });
        }
      } else if (gameState.gameStatus === 'finished' && animationState !== 'finalizing') {
        setAnimationState('finalizing');
      }
    } else {
      // Handle player hand updates
      setGameState(prev => ({
        ...prev,
        playerHands: handsArray
      }));
            
      // ONLY for initial deal sequence - trigger dealer animation after player cards finish
      if (animationState === 'dealing_player') {
        setAnimationState('dealing_dealer');        
        setDealerHand({animate: true, data: [gameState.dealerCards]});
      } else if (gameState.gameStatus === 'finished' && animationState !== 'finalizing') {
        // Check if game is finished and show results after player animations complete
        setAnimationState('finalizing');
      }
    }
  };

  // Calculate split hand positions
  const calculateSplitHandPositions = () => {
    const handSeparation = screenWidth * gameConfigs.handSeparationRatio;
    const handWidth = screenWidth * gameConfigs.handWidthRatio;
    const leftHandX = (screenWidth / 2) - handSeparation - (handWidth / 2);
    const rightHandX = (screenWidth / 2) + handSeparation - (handWidth / 2);
    
    return [
      { x: leftHandX, y: playerAreaY }, // Left hand position
      { x: rightHandX, y: playerAreaY } // Right hand position
    ];
  };
  
  // Hand positions for proper card placement (Hand component uses these internally)
  const singlePlayerPosition = { x: (screenWidth / 2) - (handWidth / 2), y: playerAreaY };
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
  
  function getActivePlayerCards() {return gameState.playerHands[activeHandIndex.current] || []};
  function getActiveCurrentBet() {return gameState.currentBets[activeHandIndex.current] || 0};

  function getButtonStates() {
    const gameStatus = gameState.gameStatus;
    const playerCards = getActivePlayerCards();
    const playerValue = calculateHandValue(playerCards);
    
    // Calculate temporary disable logic once - disable during animations or manual disables
    const isTemporarilyDisabled = buttonsDisabled || animationState !== 'idle';
    
    // Handle insurance state separately
    if (gameStatus === GAME_STATES.INSURANCE_OFFERED) {
      return {
        canHit: false,
        canStand: false,
        canDoubleDown: false,
        canSplit: false,
        buyInsurance: !isTemporarilyDisabled,
        insuranceAmount: Math.floor(getActiveCurrentBet() / 2)
      };
    }
    
    // Only show playing buttons during player's turn
    if (![GAME_STATES.PLAYING, GAME_STATES.PLAYING_HAND_1, GAME_STATES.PLAYING_HAND_2].includes(gameStatus)) {
      return {
        canHit: false,
        canStand: false,
        canDoubleDown: false,
        canSplit: false,
        buyInsurance: false,
        insuranceAmount: 0
      };
    }
    
    // Basic rules for playing state, then apply temporary disable
    const canHit = playerValue < 21 && !isTemporarilyDisabled;
    const canStand = true && !isTemporarilyDisabled; // Can always stand while playing
    const canDoubleDown = playerCards.length === 2 && playerValue < 21 && !isTemporarilyDisabled; // Only on first 2 cards
    const canSplit = playerCards.length === 2 && playerCards[0].value === playerCards[1].value && gameState.totalHands === 1 && !isTemporarilyDisabled; // Only on first hand
    
    return {
      canHit,
      canStand,
      canDoubleDown,
      canSplit,
      buyInsurance: false,
      insuranceAmount: 0
    };
  };

  // Get current button states

  // Generate detailed game result message

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

  function getGameResultMessage() {
    const { result, payout } = gameState;
    const playerValue = calculateHandValue(getActivePlayerCards());
    const dealerValue = calculateHandValue(gameState.dealerCards || []);
    const playerCards = getActivePlayerCards();
    switch (result) {
      case 'lose':
        if (playerValue > 21) {
          return `You busted with ${playerValue}! You lose.`;
        }
        if (playerCards?.length === 2 && dealerValue === 21) {
          return `Dealer has blackjack! You lose.`;
        }
        if (dealerValue <= 21) {
          return `Dealer wins with ${dealerValue} vs your ${playerValue}. You lose.`;
        }
        return 'You lose!';
      case 'win':
        if (dealerValue > 21) {
          return `Dealer busted with ${dealerValue}! You win ${formatCurrency(payout)}!`;
        }
        return `You win with ${playerValue} vs dealer's ${dealerValue}! You win ${formatCurrency(payout)}!`;
      case 'blackjack':
        return `Blackjack! You win ${formatCurrency(payout)}!`;
      case 'push':
        return `Push! Both have ${playerValue}. Your bet is returned.`;
      case 'dealer_blackjack':
        return `Dealer has blackjack! You lose.`;
      case null:
      case undefined:
        return `Game finished. Result: undefined`;
      default:
        return `Game finished. Result: ${result}`;
    }
  };

  const onAddBet = (betAmount) => {
    if (gameState.gameStatus === GAME_STATES.BETTING) {
      const highestTierValue = Math.max(...tier);
      const maxBetLimit = (maxMulti || 5) * highestTierValue;
      const currentBet = getActiveCurrentBet();
      const newBet = currentBet + betAmount;
      
      // Check if new bet would exceed limits
      if (newBet <= playerBalance && newBet <= maxBetLimit) {
        setGameState(prev => ({
          ...prev,
          currentBets: prev.currentBets.map((bet, index) => 
            index === activeHandIndex.current ? newBet : bet
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
          index === activeHandIndex.current ? newBet : bet
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
      setGameState(prev => ({
        ...prev,
        gameStatus: GAME_STATES.DEALING
      }));      
      setAnimationState('idle');
      addLoadingCallback();
      sendMessage('playerAction', {
        type: 'bet',
        betAmount: currentBet
      });
    }
  };

  const renderBetButtons = () => {
    const buttonStyleNames = ['Blue', 'Red', 'Black'];
    const isPageBlocked = loadingActions.size > 0;

    return (
      <View style={s.betButtonsContainer}>
        {tier.map((betAmount, index) => {
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
                handIndex: activeHandIndex.current
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
                  playerHands: gameState.playerHands,
                  activeHandIndex: activeHandIndex.current,
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
                  handIndex: activeHandIndex.current
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
                handIndex: activeHandIndex.current
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


  // ========== Game Action Handlers - Ordered by gameplay sequence ==========
  // Handle initial bet placement and deal
  const onBetAction = (data) => {
    // Reset active hand index for new game
    activeHandIndex.current = 0;
    
    // Start player animation first, dealer cards will be handled after
    setAnimationState('dealing_player');
    
    // Update player hand 1 state
    const firstHand = data.playerHands[0];
    setPlayerHand1({animate: true, data: [firstHand]});
    
    // Update game state with both player and dealer cards (master copy)
    setGameState(prev => ({
      ...prev,
      currentBets: data.betAmount ? [data.betAmount] : prev.currentBets,
      gameStatus: data.gameStatus,
      playerHands: data.playerHands,
      dealerCards: data.dealerCards, // Store dealer cards in master state
      dealerValue: calculateHandValue(data.dealerCards),
      result: data.result || prev.result,
      payout: data.payout || prev.payout
    }));

    // Animation state will be managed by the state machine
  };


  // Handle split action - initial split with first cards
  const onSplitAction = (data) => {
    // Set active hand to first hand (0) when splitting
    activeHandIndex.current = 0;
    
    // Update player hand states - animated false for onSplitCalled
    setPlayerHand1({animate: false, data: [data.playerHands[0]]});
    setPlayerHand2({animate: false, data: [data.playerHands[1]]});
    
    // Update state to show we now have 2 hands with single cards
    setGameState(prev => ({
      ...prev,
      totalHands: 2,
      playerHands: data.playerHands, // First cards only
      currentBets: data.currentBets || [prev.currentBets[0], prev.currentBets[0]],
      target: data.target || 'player',
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
      }, gameConfigs.durations.splitSpread); // Wait for spread animation
    }, 100); // Small delay for initial render
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
        target: data.target || prev.target
      }));
      
      // Step 2: After Hand 1 animates, update Hand 2
      setTimeout(() => {
        setPlayerHand2({animate: true, data: [completeHands[1]]});
        setGameState(prev => ({
          ...prev,
          playerHands: [completeHands[0], completeHands[1]], // Now update Hand 2
          target: data.target || prev.target
        }));
        
        // Step 3: Complete split sequence after Hand 2 animates
        setTimeout(() => {
          setAnimationState('idle');
        }, gameConfigs.durations.cardDeal + 100);
      }, gameConfigs.durations.cardDeal + 100); // Wait for Hand 1 animation
  };

  // Handle finished game cleanup
  const onFinishedGame = (data) => {
    // Handle finished games - don't show results until animations complete
    if (data.gameStatus === 'finished') {
      // Results will be shown when Hand animations complete
    }
    
    // Clear temporary disables if game state changes to non-playing
  };

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
          {buttonStates.buyInsurance && (
            <Text style={s.insuranceQuestion}>
              Buy insurance against dealer blackjack?
            </Text>
          )}
        </View>
        
        {/* Dealer Hand */}
        <Hand
          cards={dealerHand.data?.[0] || []}
          animate={dealerHand.animate}
          handLabel="Dealer Hand"
          handValue={gameState.dealerValue}
          betAmount={0}
          position={dealerPosition}
          deckCoordinates={deckCoordinates}
          cardConfigs={cardConfigs}
          gameConfigs={gameConfigs}
          cardLayout='spread'
          onHandUpdate={(newCards) => onHandUpdate([newCards], true)}
          showTotal="below"
        />

        {gameState.totalHands === 1 ? (
          <Hand
            testID="singlePlayerHand"
            cards={playerHand1.data?.[0] || []}
            animate={playerHand1.animate}
            handLabel="Player Hand"
            handValue={calculateHandValue(gameState.playerHands[0] || [])}
            betAmount={gameState.currentBets[0] || 0}
            position={singlePlayerPosition}
            animatePosition={false}
            deckCoordinates={deckCoordinates}
            cardConfigs={cardConfigs}
            gameConfigs={gameConfigs}
            onHandUpdate={(newCards) => onHandUpdate([newCards])}
            showTotal="above"
          />
        ) : (
          getCurrentHandPositions().map((position, handIndex) => {
            const isActiveHand = activeHandIndex.current === handIndex;
            const handCards = handIndex === 0 ? playerHand1.data?.[0] || [] : playerHand2.data?.[0] || [];
            const handAnimate = handIndex === 0 ? playerHand1.animate : playerHand2.animate;
            
            return (
              <Hand
                key={`split-hand-${handIndex}`}
                testID={`splitPlayerHand${handIndex}`}
                cards={handCards}
                animate={handAnimate}
                handLabel={`Hand ${handIndex + 1}`}
                handValue={calculateHandValue(gameState.playerHands[handIndex] || [])}
                betAmount={gameState.currentBets[handIndex] || 0}
                position={position}
                animatePosition={animationState === 'split_spread'}
                deckCoordinates={deckCoordinates}
                cardConfigs={cardConfigs}
                gameConfigs={gameConfigs}
                onHandUpdate={(newCards) => {
                  // Update the specific hand in the array
                  const updatedHands = [...gameState.playerHands];
                  updatedHands[handIndex] = newCards;
                  onHandUpdate(updatedHands);
                }}
                showTotal="above"
                isActiveHand={isActiveHand}
              />
            );
          })
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
                  dealerValue: 0,
                  currentBets: [0],
                  target: 'player',
                  totalHands: 1,
                  result: null,
                  payout: 0,
                  handsCompleted: []
                }));
                
                // Reset active hand index
                activeHandIndex.current = 0;
                
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
        {buttonStates.buyInsurance && (
          <View style={s.insuranceControlsContainer}>
            <View style={s.insuranceButtonsRow}>
              <TouchableOpacity
                style={s.insuranceButton}
                onPress={() => {
                  sendMessage('playerAction', {
                    type: 'insurance',
                    buy: true
                  });
                }}
                testID="buyInsuranceButton"
              >
                <Text style={s.insuranceButtonText}>
                  Buy Insurance {formatCurrency(buttonStates.insuranceAmount)}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={s.skipInsuranceButton}
                onPress={() => {
                  sendMessage('playerAction', {
                    type: 'insurance',
                    buy: false
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