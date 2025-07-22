import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { View, Text, Dimensions, Animated, Easing } from 'react-native';
import Reanimated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming
} from 'react-native-reanimated';

import Card from './Card';

const Hand = forwardRef(({ 
  hands = {animate: true, data: []}, // Object with animation flag and hands data
  activeHandIndex = 0, // Which hand is currently active
  handLabels = [], // Labels for each hand
  handValues = [], // Values for each hand
  position = { x: 0, y: 0 },
  animatePosition = false, // Whether to animate position changes
  deckCoordinates = { x: 0, y: 0 },
  gameConfig = {
    cardWidth: 90,
    cardHeight: 126,
    cardSpacing: 0.3, // Overlap spacing multiplier
    spreadLimit: 3, // Switch from spread to overlap when more than this many cards
    handWidth: 300,
    durations: { cardDeal: 1000, cardFlip: 300, handUpdate: 200 }
  },
  cardLayout = null, // Override for card layout (spread, overlap)
  cardData = null, // New card data to deal
  onHandUpdate = () => {}, // Callback when hand is updated
  onAnimationCallback = () => {}, // Callback when individual card animation completes
  isDealer = false, // Flag to distinguish dealer vs player hands
  showTotal = null // 'above', 'below', or null to not show totals
}, ref) => {
  
  const cardAnimations = useRef(new Map());
  const [internalHands, setInternalHands] = useState(hands.data || []);
  const [animatingCards, setAnimatingCards] = useState([]);
  const [nextCardId, setNextCardId] = useState(0);
  const [pendingAnimations, setPendingAnimations] = useState(0);
  
  // Track initial render and when we should notify parent
  const isInitialRender = useRef(true);
  const shouldNotifyParent = useRef(false);
  
  // Internal total management
  const [showHandTotal, setShowHandTotal] = useState(false);
  const [animatedTotals, setAnimatedTotals] = useState([0]);
  
  // Position animation using react-native-reanimated
  const positionX = useSharedValue(position?.x || 0);
  const positionY = useSharedValue(position?.y || 0);
  
  // Notify parent only when all animations are complete
  useEffect(() => {
    if (pendingAnimations === 0 && shouldNotifyParent.current) {
      shouldNotifyParent.current = false;
      onHandUpdate(internalHands);
    }
  }, [pendingAnimations, internalHands]);
  
  // Calculate hand value with proper Ace handling
  const calculateHandValue = (cards) => {
    if (!cards || cards.length === 0) return 0;
    
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
    
    return value;
  };

  // Removed: calculateCardValue - now using calculateHandValue for totals

  // Helper function to determine effective layout for a hand
  const getEffectiveLayout = (handCards) => {
    const layout = cardLayout || 'overlap'; // Default to overlap if no prop specified
    if (layout === 'spread' && handCards.length > gameConfig.spreadLimit) {
      return 'overlap';
    }
    return layout;
  };
  
  // Single source of truth for card positioning - calculates all positions at once
  const calculateAllCardPositions = (handIndex, totalCards) => {
    const currentHand = displayHands[handIndex] || [];
    const cardSpacingValue = getCardSpacingValue(currentHand);
    const effectiveLayout = getEffectiveLayout(currentHand);
    
    // ALWAYS use consistent positioning - calculate as if we have at least 2 cards
    // This ensures first card positioning doesn't shift when second card is dealt
    const minPositioningCards = Math.max(totalCards, 2);
    
    // For spread layout, use total width calculation
    // For overlap layout, use 2-card positioning when <= 2 cards
    let positioningCards, totalWidth, centeredStartX;
    
    if (effectiveLayout === 'spread') {
      // Spread: calculate width for positioning cards, but don't force minimum
      positioningCards = minPositioningCards;
      totalWidth = gameConfig.cardWidth + (positioningCards - 1) * cardSpacingValue;
      centeredStartX = (gameConfig.handWidth - totalWidth) / 2;
    } else {
      // Overlap: use 2-card positioning for consistency when <= 2 cards
      positioningCards = (minPositioningCards <= 2) ? 2 : totalCards;
      totalWidth = gameConfig.cardWidth + (positioningCards - 1) * cardSpacingValue;
      centeredStartX = (gameConfig.handWidth - totalWidth) / 2;
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
  const revealHoleCard = (cardData, handIndex = 0) => {
    setInternalHands(prev => {
      const newHands = [...prev];
      const targetHand = newHands[handIndex] || [];
      
      // Find first hole card in the hand
      const holeCardIndex = targetHand.findIndex(card => card.isHoleCard);
      
      if (holeCardIndex !== -1) {
        // Update the hole card with revealed data and trigger flip
        const updatedHoleCard = {
          ...targetHand[holeCardIndex],
          suit: cardData.suit,
          value: cardData.value,
          isHoleCard: false,
        };
        
        // Update the card in the hand
        const newHand = [...targetHand];
        newHand[holeCardIndex] = updatedHoleCard;
        newHands[handIndex] = newHand;
      }
      
      return newHands;
    });
  };
  
  // Expose functions to parent component
  useImperativeHandle(ref, () => ({
    revealHoleCard
  }));
  
  const repositionCards = () => {
    displayHands.forEach((handCards, handIndex) => {
      const animatingToThisHand = animatingCards.filter(card => card.targetHandIndex === handIndex).length;
      const totalCards = handCards.length + animatingToThisHand;
      const effectiveLayout = getEffectiveLayout(handCards);
      
      // Skip repositioning for first two cards in overlap layout only
      // BUT only if we currently have exactly 2 cards or fewer
      if (effectiveLayout === 'overlap' && handCards.length <= 2 && totalCards <= 2) {
        return;
      }
      
      // Use single source of truth for positions
      const allPositions = calculateAllCardPositions(handIndex, totalCards);
      
      handCards.forEach((card, cardIndex) => {
        const targetPosition = allPositions[cardIndex];
        
        const animKey = `${handIndex}-${card.id}`;
        if (!cardAnimations.current.has(animKey)) {
          cardAnimations.current.set(animKey, {
            x: new Animated.Value(card.position?.x || targetPosition.x),
            y: new Animated.Value(card.position?.y || targetPosition.y)
          });
        }
        
        const cardAnim = cardAnimations.current.get(animKey);
        Animated.timing(cardAnim.x, {
          toValue: targetPosition.x,
          duration: gameConfig.durations.handUpdate,
          useNativeDriver: false,
        }).start();
        
        Animated.timing(cardAnim.y, {
          toValue: targetPosition.y,
          duration: gameConfig.durations.handUpdate,
          useNativeDriver: false,
        }).start();
      });
    });
  };
  
  // Get card position using the unified calculation
  const getCardPosition = (cardIndex, totalCards, handIndex = 0) => {
    const allPositions = calculateAllCardPositions(handIndex, totalCards);
    // Safety check: don't return position for cards beyond what we calculated
    if (cardIndex >= allPositions.length) {
      console.warn(`Attempted to get position for card ${cardIndex} but only ${allPositions.length} positions calculated`);
      return { x: 0, y: 0 }; // Return safe default position
    }
    return allPositions[cardIndex];
  };
  
  // Helper function to calculate card spacing value - eliminates redundancy
  const getCardSpacingValue = (handCards) => {
    const effectiveLayout = getEffectiveLayout(handCards);
    if (effectiveLayout === 'spread') {
      return gameConfig.cardWidth + (gameConfig.cardWidth * 0.2);
    } else {
      return gameConfig.cardWidth * gameConfig.cardSpacing;
    }
  };
  
  // Card animations now handled by individual Card components
  
  // Deal card function - with animation
  const dealCard = (cardData, handIndex = 0, specificCardIndex = null, finalTotalCards = null) => {
    // Use existing ID if available, otherwise generate new one
    const currentCardId = cardData.id || nextCardId;
    if (!cardData.id) {
      setNextCardId(prev => prev + 1);
    }
    
    const startPos = { x: deckCoordinates.x - position.x - 9, y: deckCoordinates.y - position.y + 9 };
    
    // Use provided finalTotalCards or calculate it
    const totalCards = finalTotalCards || (() => {
      const currentHandSize = internalHands[handIndex]?.length || 0;
      const animatingToThisHand = animatingCards.filter(card => card.targetHandIndex === handIndex).length;
      return currentHandSize + animatingToThisHand + 1;
    })();
    
    // Use specific card index if provided, otherwise calculate based on current position
    const cardIndex = specificCardIndex !== null ? specificCardIndex : (() => {
      const currentHandSize = internalHands[handIndex]?.length || 0;
      const animatingToThisHand = animatingCards.filter(card => card.targetHandIndex === handIndex).length;
      return currentHandSize + animatingToThisHand;
    })();
    
    // Safety check: cardIndex should never be >= totalCards
    if (cardIndex >= totalCards) {
      return;
    }
    
    const targetPosition = getCardPosition(cardIndex, totalCards, handIndex);
    
    // Create animating card - start with null values so it stays face down
    const animatingCard = {
      id: currentCardId,
      suit: null, // All cards start face down
      value: null,
      isHoleCard: cardData.isHoleCard || false,
      animateX: new Animated.Value(startPos.x),
      animateY: new Animated.Value(startPos.y),
      targetHandIndex: handIndex,
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
          onAnimationCallback(cardData.suit, cardData.value, handIndex, currentCardId);
          // Total calculation now handled by useEffect watching internalHands
        }, gameConfig.durations.cardFlip);
      }, gameConfig.durations.cardDeal / 2 - gameConfig.durations.cardFlip / 2);
    }
    
    // Start animation
    Animated.parallel([
      Animated.timing(animatingCard.animateX, {
        toValue: targetPosition.x,
        duration: gameConfig.durations.cardDeal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animatingCard.animateY, {
        toValue: targetPosition.y,
        duration: gameConfig.durations.cardDeal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Animation complete - add to hand and remove from animating
      setInternalHands(prev => {
        const newHands = [...prev];
        const targetHand = newHands[handIndex] || [];
        const cardWithId = {
          ...cardData,
          id: currentCardId,
          position: targetPosition,
          // Cards land with the data they received during animation
          suit: cardData.isHoleCard ? null : cardData.suit,
          value: cardData.isHoleCard ? null : cardData.value,
        };
        
        newHands[handIndex] = [...targetHand, cardWithId];
        return newHands;
      });
      
      setAnimatingCards(prev => prev.filter(c => c.id !== currentCardId));
      
      // Card data already revealed during animation for regular cards
      
      // Decrement pending animations counter
      setPendingAnimations(prev => prev - 1);
    });
    
    // Cards now manage their own flipping based on data presence
  };
  
  
  // Detect when cards are being dealt and reposition immediately
  useEffect(() => {
    // Reposition existing cards immediately when a new card starts animating
    if (animatingCards.length > 0) {
      repositionCards();
    }
  }, [animatingCards.length]); // Trigger when dealing starts
  
  // Calculate totals from current hand state whenever hands change
  useEffect(() => {
    if (showTotal) {
      // Calculate actual totals from current internal hands
      const currentTotals = displayHands.map(hand => calculateHandValue(hand));
      setAnimatedTotals(currentTotals);
      setShowHandTotal(displayHands.some(hand => hand.length > 0));
    }
  }, [internalHands, showTotal]); // Recalculate when internal hands change
  
  // Animate position changes
  useEffect(() => {
    if (animatePosition && position) {
      positionX.value = withTiming(position.x, { duration: 600 });
      positionY.value = withTiming(position.y, { duration: 600 });
    } else if (position) {
      positionX.value = position.x;
      positionY.value = position.y;
    }
  }, [position?.x, position?.y, animatePosition]);
  
  // Use internal hands state for display
  const displayHands = internalHands.length > 0 ? internalHands : [[]];
  const displayLabels = handLabels.length > 0 ? handLabels : ['Player Hand'];
  const displayValues = handValues.length > 0 ? handValues : [0];
  
  // Diff incoming hands with current hands and animate differences
  useEffect(() => {
    const handsData = hands.data || [];
    const shouldAnimate = hands.animate !== false;
    
    if (isInitialRender.current) {
      isInitialRender.current = false;
      // Initial render - just set the hands with IDs
      let currentId = nextCardId;
      const handsWithIds = handsData.map(hand => 
        hand.map(card => {
          if (!card.id) {
            const newId = currentId;
            currentId++;
            return { ...card, id: newId };
          }
          return { ...card };
        })
      );
      if (currentId !== nextCardId) {
        setNextCardId(currentId);
      }
      setInternalHands(handsWithIds);
      return;
    }

    // Find differences between current and new hands
    const newCardsToAnimate = [];
    const cardsToUpdate = [];
    
    handsData.forEach((newHand, handIndex) => {
      const currentHand = internalHands[handIndex] || [];
      
      // Check for cards that changed from null to real data (hole card reveals)
      for (let i = 0; i < Math.min(newHand.length, currentHand.length); i++) {
        const currentCard = currentHand[i];
        const newCard = newHand[i];
        
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
            handIndex,
            cardIndex: i,
            newCardData: newCard,
            currentCardId: currentCard.id
          });
        }
      }
      
      // If new hand has more cards than current, handle the difference
      if (newHand.length > currentHand.length) {
        if (shouldAnimate) {
          // Calculate final total cards for this hand (including all new cards)
          const finalTotalCards = newHand.length;
          
          for (let i = currentHand.length; i < newHand.length; i++) {
            // Ensure each card has a unique ID
            const cardData = newHand[i];
            const cardWithId = {
              ...cardData,
              id: `${handIndex}-${cardData.value}-${cardData.suit}-${i}`
            };
            
            // Use initialDeal timing for initial 2-card deal, dealerTurn timing for subsequent dealer cards
            const useInitialTiming = (currentHand.length + (i - currentHand.length)) <= 2;
            const delayBuffer = (isDealer && !useInitialTiming) ? gameConfig.buffers.dealerTurn : gameConfig.buffers.initialDeal;
            
            newCardsToAnimate.push({
              cardData: cardWithId,
              handIndex: handIndex,
              cardIndex: i,
              finalTotalCards: finalTotalCards,
              delay: (i - currentHand.length) * delayBuffer
            });
          }
        } else {
          // No animation - just add cards immediately
          const newCards = [];
          for (let i = currentHand.length; i < newHand.length; i++) {
            const cardData = newHand[i];
            const cardWithId = {
              ...cardData,
              id: `${handIndex}-${cardData.value}-${cardData.suit}-${i}`
            };
            newCards.push(cardWithId);
          }
          
          // Update internal hands immediately
          setInternalHands(prev => {
            const newHands = [...prev];
            newHands[handIndex] = [...currentHand, ...newCards];
            return newHands;
          });
        }
      }
    });

    // Combine card updates and new cards into a single sequence
    const allAnimations = [];
    
    // Add card updates as immediate actions
    cardsToUpdate.forEach(({ handIndex, cardIndex, newCardData, currentCardId }) => {
      allAnimations.push({
        type: 'update',
        handIndex,
        cardIndex,
        newCardData,
        currentCardId,
        delay: 0 // Card updates happen immediately
      });
    });
    
    // Add new cards to animate, with delays adjusted for card updates
    newCardsToAnimate.forEach(({ cardData, handIndex, cardIndex, finalTotalCards, delay }) => {
      // If there are card updates, delay new cards by dealer delay
      const adjustedDelay = cardsToUpdate.length > 0 ? 
        gameConfig.buffers.dealerTurn + delay : 
        delay;
      
      allAnimations.push({
        type: 'deal',
        cardData,
        handIndex,
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
            setInternalHands(prev => {
              const newHands = [...prev];
              const targetHand = [...(newHands[animation.handIndex] || [])];
              
              // Update the card with real data - Card component will handle animation
              targetHand[animation.cardIndex] = {
                ...animation.newCardData,
                id: animation.currentCardId, // Keep the same ID
              };
              
              newHands[animation.handIndex] = targetHand;
              return newHands;
            });
            
            // Trigger animation callback after the flip animation completes
            setTimeout(() => {
              onAnimationCallback(animation.newCardData.suit, animation.newCardData.value, animation.handIndex, animation.currentCardId);
              // Total calculation now handled by useEffect watching internalHands
            }, gameConfig.durations.cardFlip);
            
            // Decrement pending animations immediately for updates
            setPendingAnimations(prev => prev - 1);
            
          } else if (animation.type === 'deal') {
            // Handle new card dealing
            dealCard(animation.cardData, animation.handIndex, animation.cardIndex, animation.finalTotalCards);
          }
        }, animation.delay);
      });
    } else if (cardsToUpdate.length === 0) {
      // Check if hands are actually different before updating
      const handsAreDifferent = handsData.some((newHand, handIndex) => {
        const currentHand = internalHands[handIndex] || [];
        
        // Different lengths mean hands are different
        if (newHand.length !== currentHand.length) {
          return true;
        }
        
        // Check each card for differences
        return newHand.some((newCard, cardIndex) => {
          const currentCard = currentHand[cardIndex];
          if (!currentCard) return true; // New card exists but current doesn't
          
          // Cards are different if suit or value differs
          return currentCard.suit !== newCard.suit || currentCard.value !== newCard.value;
        });
      });
      
      // Only update if hands are actually different
      if (handsAreDifferent) {
        let currentId = nextCardId;
        const handsWithIds = handsData.map(hand => 
          hand.map(card => {
            if (!card.id) {
              const newId = currentId;
              currentId++;
              return { ...card, id: newId };
            }
            return { ...card };
          })
        );
        if (currentId !== nextCardId) {
          setNextCardId(currentId);
        }
        setInternalHands(handsWithIds);
      }
    }
  }, [hands]);
  
  const { width: screenWidth } = Dimensions.get('window');
  const isSplit = displayHands.length > 1;

  const calculateHandPosition = (handIndex, totalHands) => {
    if (totalHands === 1) {
      return { x: position.x, y: position.y };
    }
    
    // For split hands, position them side by side
    const currentHand = displayHands[handIndex] || [];
    const cardSpacingValue = getCardSpacingValue(currentHand);
    
    const handWidth = gameConfig.cardWidth + (Math.max(0, (displayHands[handIndex]?.length || 1) - 1) * cardSpacingValue);
    const totalWidth = handWidth * totalHands + (totalHands - 1) * 40; // 40px gap between hands
    const startX = (screenWidth - totalWidth) / 2;
    const handX = startX + handIndex * (handWidth + 40);
    
    return { x: handX, y: position.y };
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
  
  // Dynamic styles using gameConfig
  const dynamicStyles = {
    handContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: gameConfig.handWidth,
      height: gameConfig.cardHeight,
      pointerEvents: 'none',
    },
    handCard: {
      position: 'absolute',
      width: gameConfig.cardWidth,
      height: gameConfig.cardHeight,
    },
    animatingCard: {
      position: 'absolute',
      width: gameConfig.cardWidth,
      height: gameConfig.cardHeight,
    },
  };

  return (
    <Reanimated.View style={[dynamicStyles.handContainer, containerAnimatedStyle]}>
      {displayHands.map((handCards, handIndex) => {
        const handPosition = calculateHandPosition(handIndex, displayHands.length);
        const isActive = handIndex === activeHandIndex;
        
        return (
          <View key={`hand-${handIndex}`} style={styles.singleHandContainer}>
            {/* Hand Total - Above cards */}
            {showTotal === 'above' && showHandTotal && handCards && handCards.length > 0 && (
              <View style={[
                styles.handTotalContainer,
                {
                  position: 'absolute',
                  left: (gameConfig.handWidth / 2) - 30,
                  top: -50,
                  zIndex: 1001
                }
              ]}>
                <Text style={styles.handTotalText}>
                  {animatedTotals[handIndex] || 0}
                </Text>
              </View>
            )}
            
            {/* Hand Label and Value */}
            {isSplit && (
              <View style={[
                styles.handInfo,
                {
                  left: handPosition.x,
                  top: handPosition.y - 60,
                  zIndex: 100
                }
              ]}>
                <Text style={[
                  styles.handLabel,
                  isActive && styles.activeHandLabel
                ]}>
                  {displayLabels[handIndex] || `Hand ${handIndex + 1}`}
                </Text>
                <Text style={[
                  styles.handValue,
                  isActive && styles.activeHandValue
                ]}>
                  {displayValues[handIndex] || 0}
                </Text>
              </View>
            )}
            
            {/* Hand Border for Active Hand */}
            {isSplit && isActive && (
              <View style={[
                styles.activeHandBorder,
                {
                  left: handPosition.x - 10,
                  top: handPosition.y - 10,
                  width: (() => {
                    const cardSpacingValue = getCardSpacingValue(handCards);
                    return gameConfig.cardWidth + (Math.max(0, (handCards?.length || 1) - 1) * cardSpacingValue) + 20;
                  })(),
                  height: 126 + 20, // card height + padding
                  zIndex: 40
                }
              ]} />
            )}
            
            {/* Cards in Hand */}
            {(handCards || []).map((card, cardIndex) => {
              const animKey = `${handIndex}-${card.id}`;
              
              // Initialize animation if not present
              if (!cardAnimations.current.has(animKey)) {
                const totalCards = handCards.length;
                const allPositions = calculateAllCardPositions(handIndex, totalCards);
                const defaultPosition = allPositions[cardIndex];
                
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
                    testID={`hand-${handIndex}-card-${card.id}`}
                    suit={card.suit}
                    value={card.value}
                    gameConfig={gameConfig}
                    style={styles.cardInHand}
                  />
                </Animated.View>
              );
            })}
            
            {/* Hand Total - Below cards */}
            {showTotal === 'below' && showHandTotal && handCards && handCards.length > 0 && (
              <View style={[
                styles.handTotalContainer,
                {
                  position: 'absolute',
                  left: (gameConfig.handWidth / 2) - 30,
                  top: gameConfig.cardHeight + 15,
                  zIndex: 1001
                }
              ]}>
                <Text style={styles.handTotalText}>
                  {animatedTotals[handIndex] || 0}
                </Text>
              </View>
            )}
          </View>
        );
      })}
      
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
              gameConfig={gameConfig}
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
  singleHandContainer: {
    position: 'relative',
  },
  handInfo: {
    position: 'absolute',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    minWidth: 80,
  },
  handLabel: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '500',
    textAlign: 'center',
  },
  activeHandLabel: {
    color: '#FFD700', // Gold color for active hand
    fontWeight: 'bold',
  },
  handValue: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
  },
  activeHandValue: {
    color: '#FFD700', // Gold color for active hand
  },
  activeHandBorder: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#FFD700',
    borderRadius: 12,
  },
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
};

export default Hand;