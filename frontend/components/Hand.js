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
  handLabel = 'Player Hand', // Label for the hand
  handValue = 0, // Value for the hand
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
  
  // Calculate actual hand width from screen width and ratio
  const { width: screenWidth } = Dimensions.get('window');
  const handWidth = screenWidth * gameConfigs.handWidthRatio;

    // Dynamic styles using gameConfigs
  const dynamicStyles = {
    handContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: handWidth,
      height: cardConfigs.height,
      pointerEvents: 'none',
    },
    handCard: {
      position: 'absolute',
      width: cardConfigs.width,
      height: cardConfigs.height,
    },
    animatingCard: {
      position: 'absolute',
      width: cardConfigs.width,
      height: cardConfigs.height,
    },
  };

  const cardAnimations = useRef(new Map());
  const [internalCards, setInternalCards] = useState(cards || []);
  const [animatingCards, setAnimatingCards] = useState([]);
  const [nextCardId, setNextCardId] = useState(0);
  const [pendingAnimations, setPendingAnimations] = useState(0);
  
  // Track initial render and when we should notify parent
  const isInitialRender = useRef(true);
  const shouldNotifyParent = useRef(false);
  
  // Internal total management
  const [showHandTotal, setShowHandTotal] = useState(false);
  const [animatedTotal, setAnimatedTotal] = useState(0);
  
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
  
  // Use internal cards state for display
  const displayCards = internalCards.length > 0 ? internalCards : [];

  // Helper function to determine effective layout for cards
  const getEffectiveLayout = (cards) => {
    const layout = cardLayout || 'overlap'; // Default to overlap if no prop specified
    if (layout === 'spread' && cards.length > cardConfigs.spreadLimit) {
      return 'overlap';
    }
    return layout;
  };
  
  // Single source of truth for card positioning - calculates all positions at once
  const calculateAllCardPositions = (totalCards) => {
    const currentCards = displayCards || [];
    const cardSpacingValue = getCardSpacingValue(currentCards);
    const effectiveLayout = getEffectiveLayout(currentCards);

    const minPositioningCards = Math.max(totalCards, 2);

    let positioningCards, totalWidth, centeredStartX;
    
    if (effectiveLayout === 'spread') {
      positioningCards = minPositioningCards;
      totalWidth = cardConfigs.width + (positioningCards - 1) * cardSpacingValue;
      centeredStartX = (handWidth - totalWidth) / 2;
    } else {
      positioningCards = (minPositioningCards <= 2) ? 2 : totalCards;
      totalWidth = cardConfigs.width + (positioningCards - 1) * cardSpacingValue;
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
    const totalCards = displayCards.length + animatingCards.length;
    const effectiveLayout = getEffectiveLayout(displayCards);
    
    // Skip repositioning for first two cards in overlap layout only
    // BUT only if we currently have exactly 2 cards or fewer
    if (effectiveLayout === 'overlap' && displayCards.length <= 2 && totalCards <= 2) {
      return;
    }
    
    // Use single source of truth for positions
    const allPositions = calculateAllCardPositions(totalCards);
    
    displayCards.forEach((card, cardIndex) => {
      const targetPosition = allPositions[cardIndex];
      
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
  
  // Get card position using the unified calculation
  const getCardPosition = (cardIndex, totalCards) => {
    const allPositions = calculateAllCardPositions(totalCards);
    // Safety check: don't return position for cards beyond what we calculated
    if (cardIndex >= allPositions.length) {
      console.warn(`Attempted to get position for card ${cardIndex} but only ${allPositions.length} positions calculated`);
      return { x: 0, y: 0 }; // Return safe default position
    }
    return allPositions[cardIndex];
  };
  
  // Helper function to calculate card spacing value - eliminates redundancy
  const getCardSpacingValue = (cards) => {
    const effectiveLayout = getEffectiveLayout(cards);
    if (effectiveLayout === 'spread') {
      return cardConfigs.width + (cardConfigs.width * 0.2);
    } else {
      return cardConfigs.width * cardConfigs.spacing;
    }
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
    
    const targetPosition = getCardPosition(cardIndex, totalCards);
    
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
        }, cardConfigs.flip);
      }, gameConfigs.durations.cardDeal / 2 - cardConfigs.flip / 2);
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
      // Animation complete - add to hand and remove from animating
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

  // Detect when cards are being dealt and reposition immediately
  useEffect(() => {
    // Reposition existing cards immediately when a new card starts animating
    if (animatingCards.length > 0) {
      repositionCards();
    }
  }, [animatingCards.length]); // Trigger when dealing starts
  
  // Calculate totals from current cards state whenever cards change
  useEffect(() => {
    if (showTotal) {
      // Calculate actual total from current internal cards
      const currentTotal = calculateHandValue(displayCards);
      setAnimatedTotal(currentTotal);
      setShowHandTotal(displayCards.length > 0);
    }
  }, [internalCards, showTotal]); // Recalculate when internal cards change
  
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

  // Diff incoming cards with current cards and animate differences
  useEffect(() => {

    if (testFinder) {
      console.log(cards)
    }
    const cardsData = cards || [];
    const shouldAnimate = animate !== false;
    
    if (isInitialRender.current) {
      isInitialRender.current = false;
      // Initial render - just set the cards with IDs
      let currentId = nextCardId;
      const cardsWithIds = cardsData.map(card => {
        if (!card.id) {
          const newId = currentId;
          currentId++;
          return { ...card, id: newId };
        }
        return { ...card };
      });
      if (currentId !== nextCardId) {
        setNextCardId(currentId);
      }
      setInternalCards(cardsWithIds);
      return;
    }

    // Find differences between current and new cards
    const newCardsToAnimate = [];
    const cardsToUpdate = [];
    
    const currentCards = internalCards || [];
    
    // Check for cards that changed from null to real data (hole card reveals)
    for (let i = 0; i < Math.min(cardsData.length, currentCards.length); i++) {
      const currentCard = currentCards[i];
      const newCard = cardsData[i];
      
      // Skip if cards are identical (same suit and value)
      if (currentCard && newCard &&
          currentCard.suit === newCard.suit && 
          currentCard.value === newCard.value) {
        continue;
      }
      
      // If current card has null values but new card has real data, this is a hole card reveal
      if (currentCard && 
          (currentCard.suit === null || currentCard.value === null) &&
          newCard.suit !== null && newCard.value !== null) {
        cardsToUpdate.push({
          cardIndex: i,
          newCardData: newCard,
          currentCardId: currentCard.id
        });
      }
    }
    
    // If new cards array has more cards than current, handle the difference
    if (cardsData.length > currentCards.length) {
      if (shouldAnimate) {
        // Calculate final total cards (including all new cards)
        const finalTotalCards = cardsData.length;
        
        for (let i = currentCards.length; i < cardsData.length; i++) {
          // Ensure each card has a unique ID
          const cardData = cardsData[i];
          const cardWithId = {
            ...cardData,
            id: `card-${cardData.value}-${cardData.suit}-${i}`
          };
          
          // Use initialDeal timing for initial 2-card deal, dealerTurn timing for subsequent dealer cards
          const useInitialTiming = (currentCards.length + (i - currentCards.length)) <= 2;
          const delayBuffer = (!useInitialTiming) ? gameConfigs.buffers?.dealerTurn || 500 : gameConfigs.buffers?.initialDeal || 200;
          
          newCardsToAnimate.push({
            cardData: cardWithId,
            cardIndex: i,
            finalTotalCards: finalTotalCards,
            delay: (i - currentCards.length) * delayBuffer
          });
        }
      } else {
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
        
        // Update internal cards immediately
        setInternalCards(prev => [...prev, ...newCards]);
      }
    }

    // Combine card updates and new cards into a single sequence
    const allAnimations = [];
    
    // Add card updates as immediate actions
    cardsToUpdate.forEach(({ cardIndex, newCardData, currentCardId }) => {
      allAnimations.push({
        type: 'update',
        cardIndex,
        newCardData,
        currentCardId,
        delay: 0 // Card updates happen immediately
      });
    });
    
    // Add new cards to animate, with delays adjusted for card updates
    newCardsToAnimate.forEach(({ cardData, cardIndex, finalTotalCards, delay }) => {
      const adjustedDelay = cardsToUpdate.length > 0 ? 
        (gameConfigs.buffers?.dealerTurn || 500) + delay : 
        delay;
      
      allAnimations.push({
        type: 'deal',
        cardData,
        cardIndex,
        finalTotalCards,
        delay: adjustedDelay
      });
    });

    // Execute all animations in sequence
    if (allAnimations.length > 0) {
      shouldNotifyParent.current = true;
      setPendingAnimations(allAnimations.length);
      
      allAnimations.forEach((animation) => {
        setTimeout(() => {
          if (animation.type === 'update') {
            // Handle card data update - Card component handles animation
            setInternalCards(prev => {
              const newCards = [...prev];
              
              // Update the card with real data - Card component will handle animation
              newCards[animation.cardIndex] = {
                ...animation.newCardData,
                id: animation.currentCardId, // Keep the same ID
              };
              
              return newCards;
            });
            
            // Decrement pending animations immediately for updates
            setPendingAnimations(prev => prev - 1);
            
          } else if (animation.type === 'deal') {
            // Handle new card dealing
            dealCard(animation.cardData, animation.cardIndex, animation.finalTotalCards);
          }
        }, animation.delay);
      });
    } else if (cardsToUpdate.length === 0) {
      // Check if cards are actually different before updating
      const cardsAreDifferent = (() => {
        const currentCards = internalCards || [];
        
        // Different lengths mean cards are different
        if (cardsData.length !== currentCards.length) {
          return true;
        }
        
        // Check each card for differences
        return cardsData.some((newCard, cardIndex) => {
          const currentCard = currentCards[cardIndex];
          if (!currentCard) return true; // New card exists but current doesn't
          
          // Cards are different if suit or value differs
          return currentCard.suit !== newCard.suit || currentCard.value !== newCard.value;
        });
      })();
      
      // Only update if cards are actually different
      if (cardsAreDifferent) {
        let currentId = nextCardId;
        const cardsWithIds = cardsData.map(card => {
          if (!card.id) {
            const newId = currentId;
            currentId++;
            return { ...card, id: newId };
          }
          return { ...card };
        });
        if (currentId !== nextCardId) {
          setNextCardId(currentId);
        }
        setInternalCards(cardsWithIds);
      }
    }
  }, [cards, animate]);

  // Notify parent only when all animations are complete
  useEffect(() => {
    if (pendingAnimations === 0 && shouldNotifyParent.current) {
      shouldNotifyParent.current = false;
      onHandUpdate(internalCards);
    }
  }, [pendingAnimations, internalCards]);

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
      {showTotal === 'above' && showHandTotal && displayCards && displayCards.length > 0 && (
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
      {(displayCards || []).map((card, cardIndex) => {
        const animKey = `card-${card.id}`;
        
        // Initialize animation if not present
        if (!cardAnimations.current.has(animKey)) {
          const totalCards = displayCards.length;
          const allPositions = calculateAllCardPositions(totalCards);
          const defaultPosition = allPositions[cardIndex] || { x: 0, y: 0 };
          
          cardAnimations.current.set(animKey, {
            x: new Animated.Value(defaultPosition.x),
            y: new Animated.Value(defaultPosition.y)
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
      {showTotal === 'below' && showHandTotal && displayCards && displayCards.length > 0 && (
        <View style={[
          styles.handTotalContainer,
          {
            position: 'absolute',
            left: (handWidth / 2) - 30,
            top: cardConfigs.height + 15,
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
            top: cardConfigs.height + 65,
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