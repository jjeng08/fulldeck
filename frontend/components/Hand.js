import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { View, Text, Dimensions, Animated, Easing } from 'react-native';
import { calculateHandValue } from '../games/blackjack/blackjackCore';
import Reanimated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming,
  Easing as ReanimatedEasing
} from 'react-native-reanimated';

import Card from './Card';

const Hand = forwardRef(({ 
  testFinder,
  cards = [], // Array of card objects for the hand
  animate = true, // Whether to animate card dealing
  betAmount = 0, // Bet amount for the hand
  isActiveHand = false, // Whether this hand is currently active
  position = { x: 0, y: 0 },
  animatePosition = false, // Whether to animate position changes
  deckCoordinates = { x: 0, y: 0 },
  cardConfigs = {
    width: 90,
    height: 126,
    spacing: 0.3, // Overlap spacing multiplier
    spreadLimit: 3, // Switch from spread to overlap when more than this many cards
    flip: 300
  },
  gameConfigs = {
    handWidthRatio: 0.4,
    durations: { cardDeal: 1000, handUpdate: 200 }
  },
  cardLayout = null, // Override for card layout (spread, overlap)
  onHandUpdate = () => {}, // Callback when hand is updated
  showTotal = null // 'above', 'below', or null to not show totals
}, ref) => {
  
  // Extract config values for cleaner code
  const { width: screenWidth } = Dimensions.get('window');
  const handWidth = screenWidth * gameConfigs.handWidthRatio;
  const cardWidth = cardConfigs.width;
  const cardHeight = cardConfigs.height;
  const cardSpacing = cardConfigs.spacing;
  const spreadLimit = cardConfigs.spreadLimit;
  const flipDuration = cardConfigs.flip;
  const startingCards = gameConfigs.startingCards;

    // Dynamic styles using gameConfigs
  const dynamicStyles = {
    handContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: handWidth,
      height: cardHeight,
      pointerEvents: 'none',
    },
    handCard: {
      position: 'absolute',
      width: cardWidth,
      height: cardHeight,
    },
    animatingCard: {
      position: 'absolute',
      width: cardWidth,
      height: cardHeight,
    },
  };

  const cardAnimations = useRef(new Map());
  const [internalCards, setInternalCards] = useState([]);
  const [animatingCards, setAnimatingCards] = useState([]);
  const [nextCardId, setNextCardId] = useState(0);
  const [pendingAnimations, setPendingAnimations] = useState(0);
  const [queueTrigger, setQueueTrigger] = useState(0);
  
  // Track when we should notify parent
  const shouldNotifyParent = useRef(false);
  
  // Single source of truth for card positions
  const currentPositions = useRef([]);
  
  // Track the target cards we're trying to reach and current animation queue
  const targetCards = useRef([]);
  const animationQueue = useRef([]);
  
  // Internal total management
  const [showHandTotal, setShowHandTotal] = useState(false);
  const [animatedTotal, setAnimatedTotal] = useState(0);

  useEffect(() => {
    return () => {cardAnimations.current.clear()};
  }, []);

    // Calculate totals from current cards state whenever cards change
  useEffect(() => {
    if (showTotal) {
      const currentTotal = calculateHandValue(internalCards);
      setAnimatedTotal(currentTotal);
      setShowHandTotal(internalCards.length > 0);
    }
  }, [internalCards, showTotal]);
  
  // Animate position changes - completely isolated from card animations
  useEffect(() => {
    if (position) {
      const currentX = positionX.value;
      const currentY = positionY.value;
      const targetX = position.x;
      const targetY = position.y;
      
      // Only animate if there's an actual position change
      const hasPositionChanged = Math.abs(currentX - targetX) > 1 || Math.abs(currentY - targetY) > 1;
      
      if (animatePosition && hasPositionChanged) {
        // Animate to new position with smooth easing
        positionX.value = withTiming(targetX, { 
          duration: 600,
          easing: ReanimatedEasing.out(ReanimatedEasing.cubic)
        });
        positionY.value = withTiming(targetY, { 
          duration: 600,
          easing: ReanimatedEasing.out(ReanimatedEasing.cubic)
        });
      } else if (!animatePosition) {
        // Snap to position immediately
        positionX.value = targetX;
        positionY.value = targetY;
      }
    }
  }, [position?.x, position?.y, animatePosition]);

  // Handle sequential animation processing
  useEffect(() => {
    console.log('Sequential processing:', { queueLength: animationQueue.current.length, pendingAnimations });
    // If we have animations in queue and current animations are done
    if (animationQueue.current.length > 0 && pendingAnimations === 0) {
      const nextAnimation = animationQueue.current.shift();
      console.log('Processing animation:', nextAnimation);
      
      if (nextAnimation.type === 'flip') {
        // Handle hole card flip - set up animation and wait for completion
        setPendingAnimations(1);
        
        // Create animation entry if it doesn't exist
        const animKey = `card-${nextAnimation.currentCardId}`;
        const currentCard = internalCards[nextAnimation.cardIndex];
        if (!cardAnimations.current.has(animKey) && currentCard) {
          cardAnimations.current.set(animKey, {
            x: new Animated.Value(currentCard.position?.x || 0),
            y: new Animated.Value(currentCard.position?.y || 0)
          });
        }
        
        // Update card data - Card component will handle flip animation
        setInternalCards(prev => {
          const newCards = [...prev];
          newCards[nextAnimation.cardIndex] = {
            ...nextAnimation.newCardData,
            id: nextAnimation.currentCardId,
          };
          return newCards;
        });
        
        // Wait for flip animation to complete (same duration as cardConfigs.flip)
        setTimeout(() => {
          setPendingAnimations(prev => prev - 1);
        }, cardConfigs.flip);
        
      } else if (nextAnimation.type === 'deal') {
        // Calculate positions and reposition before dealing
        const totalCards = nextAnimation.cardIndex + 1;
        calculateAllCardPositions(totalCards);
        repositionCards();
        
        // Deal the card
        setPendingAnimations(1);
        dealCard(nextAnimation.cardData, nextAnimation.cardIndex, totalCards);
      }
    }
  }, [internalCards, pendingAnimations, queueTrigger]);

  // Notify parent only when all animations are complete
  useEffect(() => {
    if (pendingAnimations === 0 && shouldNotifyParent.current && animationQueue.current.length === 0) {
      shouldNotifyParent.current = false;
      onHandUpdate(internalCards);
    }
  }, [pendingAnimations, internalCards]);

  // Setup animation sequence when cards prop changes
  useEffect(() => {
    const cardsData = cards || [];
    const shouldAnimate = animate !== false;
    
    // COMPLETE RESET when receiving empty array - restore to exact initial state
    if (cardsData.length === 0) {
      resetHandToDefault();
      animationQueue.current = [];
      targetCards.current = [];
      return;
    }

    const currentCards = internalCards || [];
    
    // Store target cards for reference
    targetCards.current = cardsData;
    
    // Create unified animation sequence: flips first, then new cards
    const newAnimations = [];
    
    // Step 1: Add hole card flips for existing cards
    for (let i = 0; i < Math.min(cardsData.length, currentCards.length); i++) {
      const currentCard = currentCards[i];
      const newCard = cardsData[i];
      
      // If current card has null values but new card has real data, this is a hole card reveal
      if (currentCard && 
          (currentCard.suit === null || currentCard.value === null) &&
          newCard.suit !== null && newCard.value !== null) {
        newAnimations.push({
          type: 'flip',
          cardIndex: i,
          newCardData: newCard,
          currentCardId: currentCard.id
        });
      }
    }
    
    // Step 2: Add new card deals for additional cards
    if (cardsData.length > currentCards.length && shouldAnimate) {
      for (let i = currentCards.length; i < cardsData.length; i++) {
        const cardData = cardsData[i];
        const cardWithId = {
          ...cardData,
          id: `card-${cardData.value}-${cardData.suit}-${i}`
        };
        
        newAnimations.push({
          type: 'deal',
          cardData: cardWithId,
          cardIndex: i,
          finalTotalCards: cardsData.length
        });
      }
    }
    
    // Set up animation queue and start processing
    if (newAnimations.length > 0) {
      shouldNotifyParent.current = true;
      animationQueue.current = newAnimations;
      // Trigger the sequential processing useEffect
      setQueueTrigger(prev => prev + 1);
      
    } else if (cardsData.length > currentCards.length && !shouldAnimate) {
      // No animation - just add cards immediately
      const newCards = [];
      for (let i = currentCards.length; i < cardsData.length; i++) {
        const cardData = cardsData[i];
        const cardWithId = {
          ...cardData,
          id: `card-${cardData.value}-${cardData.suit}-${i}`
        };
        newCards.push(cardWithId);
      }
      setInternalCards(prev => [...prev, ...newCards]);
    }

  }, [cards, animate]);
  
  // COMPLETE RESET FUNCTION - Restore to exact initial state
  const resetHandToDefault = () => {
    // Reset all state variables to their initial values
    setInternalCards([]);
    setAnimatingCards([]);
    setPendingAnimations(0);
    setShowHandTotal(false);
    setAnimatedTotal(0);
    
    // Reset all refs to their initial values
    cardAnimations.current.clear();
    shouldNotifyParent.current = false;
    currentPositions.current = [];
    animationQueue.current = [];
    targetCards.current = [];
    
    // DO NOT reset nextCardId - keep incrementing for unique keys across games
  };
  
  // Position animation using react-native-reanimated - initialize with current position
  const positionX = useSharedValue(position?.x || 0);
  const positionY = useSharedValue(position?.y || 0);
  
  // Initialize position values on mount
  useEffect(() => {
    if (position) {
      positionX.value = position.x;
      positionY.value = position.y;
    }
  }, []); // Only run on mount
  

  // Helper function to determine effective layout based on card count
  const getEffectiveLayout = (totalCards) => {
    const initialLayout = cardLayout || 'overlap';
    return (initialLayout === 'spread' && totalCards > spreadLimit) ? 'overlap' : initialLayout;
  };
  
  // Single source of truth for card positioning - calculates all positions at once
  const calculateAllCardPositions = (totalCards) => {
    const effectiveLayout = getEffectiveLayout(totalCards);
    
    // Calculate spacing based on the effective layout
    const cardSpacingValue = effectiveLayout === 'spread' 
      ? cardWidth + (cardWidth * cardSpacing)
      : cardWidth * cardSpacing;

    const minPositioningCards = Math.max(totalCards, startingCards);

    let positioningCards, totalWidth, centeredStartX;
    
    if (effectiveLayout === 'spread') {
      positioningCards = minPositioningCards;
      totalWidth = cardWidth + (positioningCards - 1) * cardSpacingValue;
      centeredStartX = (handWidth - totalWidth) / 2;
    } else {
      positioningCards = (minPositioningCards <= startingCards) ? startingCards : totalCards;
      totalWidth = cardWidth + (positioningCards - 1) * cardSpacingValue;
      centeredStartX = (handWidth - totalWidth) / 2;
    }
    
    // Calculate position for each card - ONLY create positions for actual cards
    const positions = [];
    for (let cardIndex = 0; cardIndex < totalCards; cardIndex++) {
      positions.push({
        x: centeredStartX + cardIndex * cardSpacingValue,
        y: 0 // Relative to Hand container
      });
    }
    
    // Update the ref with the new positions
    currentPositions.current = positions;
    console.log(positions);
    return positions;
  };
  
  // Reveal hole card function - updates first hole card found with real card data
  const revealHoleCard = (cardData) => {
    setInternalCards(prev => {
      const newCards = [...prev];
      
      // Find first hole card in the hand
      const holeCardIndex = newCards.findIndex(card => card.isHoleCard);
      
      if (holeCardIndex !== -1) {
        // Update the hole card with revealed data and trigger flip
        const updatedHoleCard = {
          ...newCards[holeCardIndex],
          suit: cardData.suit,
          value: cardData.value,
          isHoleCard: false,
        };
        
        // Update the card in the hand
        newCards[holeCardIndex] = updatedHoleCard;
      }
      
      return newCards;
    });
  };
  
  // Expose functions to parent component
  useImperativeHandle(ref, () => ({
    revealHoleCard
  }));
  
  const repositionCards = () => {
    internalCards.forEach((card, cardIndex) => {
      const targetPosition = currentPositions.current[cardIndex];
      
      const animKey = `card-${card.id}`;
      if (!cardAnimations.current.has(animKey)) {
        cardAnimations.current.set(animKey, {
          x: new Animated.Value(card.position?.x || targetPosition.x),
          y: new Animated.Value(card.position?.y || targetPosition.y)
        });
      }
      
      const cardAnim = cardAnimations.current.get(animKey);
      Animated.timing(cardAnim.x, {
        toValue: targetPosition.x,
        duration: gameConfigs.durations.handUpdate,
        useNativeDriver: false,
      }).start();
      
      Animated.timing(cardAnim.y, {
        toValue: targetPosition.y,
        duration: gameConfigs.durations.handUpdate,
        useNativeDriver: false,
      }).start();
    });
  };
  
  // Deal card function - with animation
  const dealCard = (cardData, specificCardIndex = null, finalTotalCards = null) => {
    // Use existing ID if available, otherwise generate new one
    const currentCardId = cardData.id || nextCardId;
    if (!cardData.id) {
      setNextCardId(prev => prev + 1);
    }
    
    const startPos = { x: deckCoordinates.x - position.x - 9, y: deckCoordinates.y - position.y + 9 };
    
    // Use provided finalTotalCards or calculate it
    const totalCards = finalTotalCards || (() => {
      const currentHandSize = internalCards.length || 0;
      return currentHandSize + animatingCards.length + 1;
    })();
    
    // Use specific card index if provided, otherwise calculate based on current position
    const cardIndex = specificCardIndex !== null ? specificCardIndex : (() => {
      const currentHandSize = internalCards.length || 0;
      return currentHandSize + animatingCards.length;
    })();
    
    // Safety check: cardIndex should never be >= totalCards
    if (cardIndex >= totalCards) {
      return;
    }
    
    const targetPosition = currentPositions.current[cardIndex];
    
    // Create animating card - start with null values so it stays face down
    const animatingCard = {
      id: currentCardId,
      suit: null, // All cards start face down
      value: null,
      isHoleCard: cardData.isHoleCard || false,
      animateX: new Animated.Value(startPos.x),
      animateY: new Animated.Value(startPos.y),
      realCardData: cardData, // Store real data for later reveal
    };

    setAnimatingCards(prev => [...prev, animatingCard]);
    
    // For regular cards (not hole cards), reveal the card data at the flip timing
    if (!cardData.isHoleCard) {
      setTimeout(() => {
        setAnimatingCards(prev => prev.map(card => 
          card.id === currentCardId ? {
            ...card,
            suit: cardData.suit,
            value: cardData.value
          } : card
        ));
        
        // Trigger animation callback after the flip animation completes
        setTimeout(() => {
          // Total calculation now handled by useEffect watching internalHands
        }, flipDuration);
      }, gameConfigs.durations.cardDeal / 2 - flipDuration / 2);
    }
    
    // Start animation
    Animated.parallel([
      Animated.timing(animatingCard.animateX, {
        toValue: targetPosition.x,
        duration: gameConfigs.durations.cardDeal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animatingCard.animateY, {
        toValue: targetPosition.y,
        duration: gameConfigs.durations.cardDeal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Animation complete - create animation entry then add to hand
      const animKey = `card-${currentCardId}`;
      
      // Create animation entry at the target position (where card just animated to)
      cardAnimations.current.set(animKey, {
        x: new Animated.Value(targetPosition.x),
        y: new Animated.Value(targetPosition.y)
      });
      
      setInternalCards(prev => {
        const cardWithId = {
          ...cardData,
          id: currentCardId,
          position: targetPosition,
          // Cards land with the data they received during animation
          suit: cardData.isHoleCard ? null : cardData.suit,
          value: cardData.isHoleCard ? null : cardData.value,
        };
        
        return [...prev, cardWithId];
      });
      
      setAnimatingCards(prev => prev.filter(c => c.id !== currentCardId));
      
      // Card data already revealed during animation for regular cards
      
      // Decrement pending animations counter
      setPendingAnimations(prev => prev - 1);
    });    
  };

  
  // Animated style for Hand container position
  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: positionX.value },
        { translateY: positionY.value }
      ]
    };
  });

  


  return (
    <Reanimated.View style={[
      dynamicStyles.handContainer, 
      containerAnimatedStyle,
      isActiveHand && {
        borderWidth: 3,
        borderColor: '#FFD700',
        borderRadius: 12,
      }
    ]}>
      {/* Bet Display - Above total */}
      {betAmount > 0 && (
        <View style={[
          styles.betDisplayContainer,
          {
            position: 'absolute',
            left: (handWidth / 2) - 60,
            top: showTotal === 'above' ? -100 : -50,
            zIndex: 1001
          }
        ]}>
          <Text style={styles.betDisplayText}>
            Current Bet: ${Math.floor(betAmount / 100).toLocaleString()}
          </Text>
        </View>
      )}
      
      {/* Hand Total - Above cards */}
      {showTotal === 'above' && showHandTotal && internalCards && internalCards.length > 0 && (
        <View style={[
          styles.handTotalContainer,
          {
            position: 'absolute',
            left: (handWidth / 2) - 30,
            top: -50,
            zIndex: 1001
          }
        ]}>
          <Text style={styles.handTotalText}>
            {animatedTotal || 0}
          </Text>
        </View>
      )}
            
      {/* Cards in Hand */}
      {(internalCards || []).map((card, cardIndex) => {
        const animKey = `card-${card.id}`;
        
        // All cards should have animations set up by dealCard or repositionCards
        if (!cardAnimations.current.has(animKey)) {
          console.warn(`Card ${card.id} missing animation - this should not happen`);
          // Fallback to prevent crash - use current positions if available
          const fallbackPosition = currentPositions.current[cardIndex] || { x: 0, y: 0 };
          cardAnimations.current.set(animKey, {
            x: new Animated.Value(fallbackPosition.x),
            y: new Animated.Value(fallbackPosition.y)
          });
        }
        
        const cardAnim = cardAnimations.current.get(animKey);
        
        return (
          <Animated.View
            key={card.id}
            style={[
              dynamicStyles.handCard,
              {
                transform: [
                  { translateX: cardAnim.x },
                  { translateY: cardAnim.y }
                ],
                zIndex: 100 + cardIndex,
              }
            ]}
          >
            <Card
              testID={`card-${card.id}`}
              suit={card.suit}
              value={card.value}
              cardConfigs={cardConfigs}
              style={styles.cardInHand}
            />
          </Animated.View>
        );
      })}
      
      {/* Hand Total - Below cards */}
      {showTotal === 'below' && showHandTotal && internalCards && internalCards.length > 0 && (
        <View style={[
          styles.handTotalContainer,
          {
            position: 'absolute',
            left: (handWidth / 2) - 30,
            top: cardHeight + 15,
            zIndex: 1001
          }
        ]}>
          <Text style={styles.handTotalText}>
            {animatedTotal || 0}
          </Text>
        </View>
      )}
      
      {/* Bet Display - Below total */}
      {betAmount > 0 && showTotal === 'below' && (
        <View style={[
          styles.betDisplayContainer,
          {
            position: 'absolute',
            left: (handWidth / 2) - 60,
            top: cardHeight + 65,
            zIndex: 1001
          }
        ]}>
          <Text style={styles.betDisplayText}>
            Current Bet: ${Math.floor(betAmount / 100).toLocaleString()}
          </Text>
        </View>
      )}
      
      {/* Animating Cards */}
      {animatingCards.map((card) => {
        return (
          <Animated.View
            key={card.id}
            style={[
              dynamicStyles.animatingCard,
              {
                transform: [
                  { translateX: card.animateX },
                  { translateY: card.animateY },
                ],
                zIndex: 1000,
              }
            ]}
          >
            <Card
              suit={card.suit}
              value={card.value}
              gameConfigs={gameConfigs}
              style={styles.cardInHand}
            />
          </Animated.View>
        );
      })}
    </Reanimated.View>
  );
});

Hand.displayName = 'Hand';

const styles = {
  cardInHand: {
    width: '100%',
    height: '100%',
  },
  handTotalContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    minWidth: 60,
  },
  handTotalText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  betDisplayContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'transparent',
    borderRadius: 8,
    minWidth: 120,
  },
  betDisplayText: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: 'bold',
    textAlign: 'center',
  },
};

export default Hand;