import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { View, Text, Dimensions, Animated, Easing } from 'react-native';

import Card from './Card';

const Hand = forwardRef(({ 
  hands = [], // Array of hands for split support
  activeHandIndex = 0, // Which hand is currently active
  handLabels = [], // Labels for each hand
  handValues = [], // Values for each hand
  position = { x: 0, y: 0 },
  deckCoordinates = { x: 0, y: 0 },
  gameConfig = {
    cardWidth: 90,
    cardHeight: 126,
    cardSpacing: 0.3,
    cardLayout: 'overlap',
    spreadLimit: 3,
    handWidth: 300,
    durations: { cardDeal: 1000, cardFlip: 300, handUpdate: 200 }
  },
  cardData = null, // New card data to deal
  onHandUpdate = () => {}, // Callback when hand is updated
  isDealer = false // Flag to distinguish dealer vs player hands
}, ref) => {
  
  const cardAnimations = useRef(new Map());
  const [internalHands, setInternalHands] = useState(hands);
  const [animatingCards, setAnimatingCards] = useState([]);
  const [nextCardId, setNextCardId] = useState(0);
  
  // Helper function to determine effective layout for a hand
  const getEffectiveLayout = (handCards) => {
    if (gameConfig.cardLayout === 'spread' && handCards.length > gameConfig.spreadLimit) {
      return 'overlap';
    }
    return gameConfig.cardLayout;
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
          faceUp: true, // This will trigger the Card component's flip animation
        };
        
        // Update the card in the hand
        const newHand = [...targetHand];
        newHand[holeCardIndex] = updatedHoleCard;
        newHands[handIndex] = newHand;
        
        onHandUpdate(newHands);
      }
      
      return newHands;
    });
  };
  
  // Expose functions to parent component
  useImperativeHandle(ref, () => ({
    revealHoleCard
  }));
  
  const repositionCards = () => {
    // Force re-render to trigger new positioning calculations
    displayHands.forEach((handCards, handIndex) => {
      const totalCards = handCards.length + 1; // +1 for the incoming card
      const effectiveLayout = getEffectiveLayout(handCards);
      
      let cardSpacingValue;
      if (effectiveLayout === 'spread') {
        // Spread layout: 20% of card width between cards
        cardSpacingValue = gameConfig.cardWidth + (gameConfig.cardWidth * 0.2);
      } else {
        // Overlap layout: Show portion of previous card
        cardSpacingValue = gameConfig.cardWidth * gameConfig.cardSpacing;
      }
      
      const totalWidth = gameConfig.cardWidth + (totalCards - 1) * cardSpacingValue;
      const centeredStartX = (gameConfig.handWidth - totalWidth) / 2; // Center within Hand container
      
      handCards.forEach((card, cardIndex) => {
        const targetX = centeredStartX + cardIndex * cardSpacingValue;
        const targetY = 0; // Relative to Hand container
        
        const animKey = `${handIndex}-${card.id}`;
        if (!cardAnimations.current.has(animKey)) {
          cardAnimations.current.set(animKey, {
            x: new Animated.Value(card.position?.x || targetX),
            y: new Animated.Value(card.position?.y || targetY)
          });
        }
        
        const cardAnim = cardAnimations.current.get(animKey);
        Animated.timing(cardAnim.x, {
          toValue: targetX,
          duration: gameConfig.durations.handUpdate,
          useNativeDriver: true,
        }).start();
        
        Animated.timing(cardAnim.y, {
          toValue: targetY,
          duration: gameConfig.durations.handUpdate,
          useNativeDriver: true,
        }).start();
      });
    });
  };
  
  // Calculate card position in hand - updated for split hands and blackjack positioning
  const getCardPosition = (cardIndex, totalCards, handIndex = 0, totalHands = 1) => {
    const CARD_WIDTH = gameConfig.cardWidth;
    const currentHand = displayHands[handIndex] || [];
    const effectiveLayout = getEffectiveLayout(currentHand);
    let cardSpacingValue;
    
    if (effectiveLayout === 'spread') {
      // Spread layout: 20% of card width between cards
      cardSpacingValue = CARD_WIDTH + (CARD_WIDTH * 0.2);
    } else {
      // Overlap layout: Show portion of previous card
      cardSpacingValue = gameConfig.cardSpacing * CARD_WIDTH;
    }
    
    if (totalHands === 1) {
      // Single hand - center on screen
      // For blackjack: first two cards use 2-card positioning, then normal shifting
      const positioningCards = totalCards <= 2 ? 2 : totalCards;
      const totalWidth = CARD_WIDTH + (positioningCards - 1) * cardSpacingValue;
      const leftOffset = cardIndex * cardSpacingValue;
      
      return {
        x: (gameConfig.handWidth - totalWidth) / 2 + leftOffset, // Centered within the Hand container
        y: 0, // Relative to the Hand container top
      };
    } else {
      // Split hands - position side by side
      // For blackjack: first two cards use 2-card positioning, then normal shifting
      const positioningCards = totalCards <= 2 ? 2 : totalCards;
      const handWidth = CARD_WIDTH + (positioningCards - 1) * cardSpacingValue;
      const handGap = 40; // Gap between hands
      const totalWidth = handWidth * totalHands + handGap * (totalHands - 1);
      const startX = (screenWidth - totalWidth) / 2;
      const handStartX = startX + handIndex * (handWidth + handGap);
      const cardX = handStartX + cardIndex * cardSpacingValue;
      
      return {
        x: cardX,
        y: position.y,
      };
    }
  };
  
  // Deal card function - with animation
  const dealCard = (cardData, handIndex = 0) => {
    const currentCardId = nextCardId;
    setNextCardId(prev => prev + 1);
    
    const startPos = { x: deckCoordinates.x - position.x - 9, y: deckCoordinates.y - position.y + 9 };
    // Calculate position based on current hand size plus cards currently animating to this hand
    const currentHandSize = internalHands[handIndex]?.length || 0;
    const animatingToThisHand = animatingCards.filter(card => card.targetHandIndex === handIndex).length;
    const effectiveHandSize = currentHandSize + animatingToThisHand;
    const targetPosition = getCardPosition(effectiveHandSize, effectiveHandSize + 1, handIndex, internalHands.length);
    
    // Create animating card
    const animatingCard = {
      id: currentCardId,
      suit: cardData.suit,
      value: cardData.value,
      isHoleCard: cardData.isHoleCard || false,
      animateX: new Animated.Value(startPos.x),
      animateY: new Animated.Value(startPos.y),
      animateRotateY: new Animated.Value(0),
      isFlipping: false,
      targetHandIndex: handIndex,
    };

    setAnimatingCards(prev => [...prev, animatingCard]);
    
    // Start animation
    Animated.parallel([
      Animated.timing(animatingCard.animateX, {
        toValue: targetPosition.x,
        duration: gameConfig.durations.cardDeal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(animatingCard.animateY, {
        toValue: targetPosition.y,
        duration: gameConfig.durations.cardDeal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Animation complete - add to hand and remove from animating
      setInternalHands(prev => {
        const newHands = [...prev];
        const targetHand = newHands[handIndex] || [];
        const cardWithId = {
          ...cardData,
          id: currentCardId,
          faceUp: cardData.isHoleCard ? false : true, // Hole cards start face down
          position: targetPosition,
        };
        
        newHands[handIndex] = [...targetHand, cardWithId];
        onHandUpdate(newHands);
        return newHands;
      });
      
      setAnimatingCards(prev => prev.filter(c => c.id !== currentCardId));
    });
    
    // Flip animation - skip for hole cards
    if (!cardData.isHoleCard) {
      // Calculate timing so flip midpoint aligns with deal midpoint
      // Deal midpoint: gameConfig.durations.cardDeal / 2
      // Flip should start at: deal_midpoint - flip_duration / 2
      const dealMidpoint = gameConfig.durations.cardDeal / 2;
      const flipStartTime = dealMidpoint - (gameConfig.durations.cardFlip / 2);
      
      setTimeout(() => {
        Animated.timing(animatingCard.animateRotateY, {
          toValue: 180,
          duration: gameConfig.durations.cardFlip,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start();
      }, flipStartTime);
      
      // Set flipping flag at flip midpoint (when card is fully rotated)
      setTimeout(() => {
        setAnimatingCards(prev => prev.map(c => 
          c.id === currentCardId ? { ...c, isFlipping: true } : c
        ));
      }, dealMidpoint);
    }
  };
  
  // Handle new card data - deal immediately (timing controlled by parent)
  useEffect(() => {
    if (cardData) {
      if (cardData.revealHoleCard) {
        revealHoleCard(cardData, activeHandIndex);
      } else {
        dealCard(cardData, activeHandIndex);
      }
    }
  }, [cardData]);
  
  // Detect when cards are being dealt and reposition immediately
  useEffect(() => {
    if (animatingCards.length > 0) {
      repositionCards();
    }
  }, [animatingCards.length]); // Trigger when dealing starts
  
  // Use internal hands state for display
  const displayHands = internalHands.length > 0 ? internalHands : [[]];
  const displayLabels = handLabels.length > 0 ? handLabels : ['Player Hand'];
  const displayValues = handValues.length > 0 ? handValues : [0];
  
  // Sync internal hands with prop changes
  useEffect(() => {
    setInternalHands(hands);
  }, [hands]);
  
  const { width: screenWidth } = Dimensions.get('window');
  const isSplit = displayHands.length > 1;

  const calculateHandPosition = (handIndex, totalHands) => {
    if (totalHands === 1) {
      return { x: position.x, y: position.y };
    }
    
    // For split hands, position them side by side
    const currentHand = displayHands[handIndex] || [];
    const effectiveLayout = getEffectiveLayout(currentHand);
    let cardSpacingValue;
    if (effectiveLayout === 'spread') {
      // Spread layout: 20% of card width between cards
      cardSpacingValue = gameConfig.cardWidth + (gameConfig.cardWidth * 0.2);
    } else {
      // Overlap layout: Show portion of previous card
      cardSpacingValue = gameConfig.cardWidth * gameConfig.cardSpacing;
    }
    
    const handWidth = gameConfig.cardWidth + (Math.max(0, (displayHands[handIndex]?.length || 1) - 1) * cardSpacingValue);
    const totalWidth = handWidth * totalHands + (totalHands - 1) * 40; // 40px gap between hands
    const startX = (screenWidth - totalWidth) / 2;
    const handX = startX + handIndex * (handWidth + 40);
    
    return { x: handX, y: position.y };
  };
  
  // Dynamic styles using gameConfig
  const dynamicStyles = {
    handContainer: {
      position: 'absolute',
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
    <View style={[dynamicStyles.handContainer, {
      backgroundColor: isDealer ? 'rgba(0, 0, 255, 0.3)' : 'rgba(255, 0, 0, 0.3)',
      left: position.x,
      top: position.y
    }]}>
      {displayHands.map((handCards, handIndex) => {
        const handPosition = calculateHandPosition(handIndex, displayHands.length);
        const isActive = handIndex === activeHandIndex;
        
        return (
          <View key={`hand-${handIndex}`} style={styles.singleHandContainer}>
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
                    const effectiveLayout = getEffectiveLayout(handCards);
                    let cardSpacingValue;
                    if (effectiveLayout === 'spread') {
                      cardSpacingValue = cardWidth + (cardWidth * 0.2);
                    } else {
                      cardSpacingValue = cardWidth * cardSpacing;
                    }
                    return cardWidth + (Math.max(0, (handCards?.length || 1) - 1) * cardSpacingValue) + 20;
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
                const effectiveLayout = getEffectiveLayout(handCards);
                
                let cardSpacingValue;
                if (effectiveLayout === 'spread') {
                  // Spread layout: 20% of card width between cards
                  cardSpacingValue = gameConfig.cardWidth + (gameConfig.cardWidth * 0.2);
                } else {
                  // Overlap layout: Show portion of previous card
                  cardSpacingValue = gameConfig.cardWidth * gameConfig.cardSpacing;
                }
                
                const totalWidth = gameConfig.cardWidth + (totalCards - 1) * cardSpacingValue;
                const centeredStartX = (gameConfig.handWidth - totalWidth) / 2; // Center within Hand container
                
                cardAnimations.current.set(animKey, {
                  x: new Animated.Value(card.position?.x !== undefined ? card.position.x : (centeredStartX + cardIndex * cardSpacingValue)),
                  y: new Animated.Value(card.position?.y !== undefined ? card.position.y : 0) // Relative to Hand container
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
                    faceUp={card.faceUp}
                    gameConfig={gameConfig}
                    style={styles.cardInHand}
                  />
                </Animated.View>
              );
            })}
          </View>
        );
      })}
      
      {/* Animating Cards */}
      {animatingCards.map((card) => {
        const rotateY = card.animateRotateY.interpolate({
          inputRange: [0, 90, 180],
          outputRange: ['0deg', '90deg', '0deg'],
        });
        
        return (
          <Animated.View
            key={card.id}
            style={[
              dynamicStyles.animatingCard,
              {
                transform: [
                  { translateX: card.animateX },
                  { translateY: card.animateY },
                  ...(card.isHoleCard ? [] : [{ rotateY }]), // Don't apply rotation to hole cards
                ],
                zIndex: 1000,
              }
            ]}
          >
            <Card
              suit={card.suit}
              value={card.value}
              faceUp={card.isFlipping}
              animateFlip={false}
              gameConfig={gameConfig}
              style={styles.cardInHand}
            />
          </Animated.View>
        );
      })}
    </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  cardInHand: {
    width: '100%',
    height: '100%',
  },
};

export default Hand;