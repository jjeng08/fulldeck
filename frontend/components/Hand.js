import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Dimensions, Animated, Easing } from 'react-native';

import Card from './Card';

const Hand = ({ 
  hands = [], // Array of hands for split support
  activeHandIndex = 0, // Which hand is currently active
  handLabels = [], // Labels for each hand
  handValues = [], // Values for each hand
  position = { x: 0, y: 0 },
  cardWidth = 90,
  cardSpacing = 0.3,
  style = {},
  deckCoordinates = { x: 0, y: 0 },
  durations = { cardDeal: 1000, cardFlip: 300 },
  cardData = null, // New card data to deal
  onHandUpdate = () => {} // Callback when hand is updated
}) => {
  
  const previousHandSizes = useRef(hands.map(hand => hand.length));
  const cardAnimations = useRef(new Map());
  const [internalHands, setInternalHands] = useState(hands);
  const [animatingCards, setAnimatingCards] = useState([]);
  const [nextCardId, setNextCardId] = useState(0);
  
  const repositionCards = () => {
    // Force re-render to trigger new positioning calculations
    displayHands.forEach((handCards, handIndex) => {
      const totalCards = handCards.length + 1; // +1 for the incoming card
      const overlapWidth = cardWidth * cardSpacing;
      const totalWidth = cardWidth + (totalCards - 1) * overlapWidth;
      const centeredStartX = (screenWidth - totalWidth) / 2;
      
      handCards.forEach((card, cardIndex) => {
        const targetX = centeredStartX + cardIndex * overlapWidth;
        const targetY = position.y;
        
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
          duration: 300,
          useNativeDriver: true,
        }).start();
        
        Animated.timing(cardAnim.y, {
          toValue: targetY,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    });
  };
  
  // Calculate card position in hand - updated for split hands and blackjack positioning
  const getCardPosition = (cardIndex, totalCards, handIndex = 0, totalHands = 1) => {
    const CARD_WIDTH = cardWidth;
    const CARD_OVERLAP = cardSpacing * CARD_WIDTH; // Show 30% of previous card
    
    if (totalHands === 1) {
      // Single hand - center on screen
      // For blackjack: first two cards use 2-card positioning, then normal shifting
      const positioningCards = totalCards <= 2 ? 2 : totalCards;
      const totalWidth = CARD_WIDTH + (positioningCards - 1) * CARD_OVERLAP;
      const centerStart = (screenWidth - totalWidth) / 2;
      const leftOffset = cardIndex * CARD_OVERLAP;
      
      return {
        x: centerStart + leftOffset,
        y: position.y,
      };
    } else {
      // Split hands - position side by side
      // For blackjack: first two cards use 2-card positioning, then normal shifting
      const positioningCards = totalCards <= 2 ? 2 : totalCards;
      const handWidth = CARD_WIDTH + (positioningCards - 1) * CARD_OVERLAP;
      const handGap = 40; // Gap between hands
      const totalWidth = handWidth * totalHands + handGap * (totalHands - 1);
      const startX = (screenWidth - totalWidth) / 2;
      const handStartX = startX + handIndex * (handWidth + handGap);
      const cardX = handStartX + cardIndex * CARD_OVERLAP;
      
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
    
    const startPos = { x: deckCoordinates.x - 9, y: deckCoordinates.y + 9 };
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
        duration: durations.cardDeal,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(animatingCard.animateY, {
        toValue: targetPosition.y,
        duration: durations.cardDeal,
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
          faceUp: true,
          position: targetPosition,
        };
        
        newHands[handIndex] = [...targetHand, cardWithId];
        onHandUpdate(newHands);
        return newHands;
      });
      
      setAnimatingCards(prev => prev.filter(c => c.id !== currentCardId));
    });
    
    // Flip animation
    setTimeout(() => {
      Animated.timing(animatingCard.animateRotateY, {
        toValue: 180,
        duration: durations.cardFlip,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, durations.cardDeal / 2);
    
    // Set flipping flag
    setTimeout(() => {
      setAnimatingCards(prev => prev.map(c => 
        c.id === currentCardId ? { ...c, isFlipping: true } : c
      ));
    }, durations.cardDeal / 2 + durations.cardFlip / 2);
  };
  
  // Handle new card data - deal immediately (timing controlled by parent)
  useEffect(() => {
    if (cardData) {
      dealCard(cardData, activeHandIndex);
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
    const handWidth = cardWidth + (Math.max(0, (displayHands[handIndex]?.length || 1) - 1) * cardWidth * cardSpacing);
    const totalWidth = handWidth * totalHands + (totalHands - 1) * 40; // 40px gap between hands
    const startX = (screenWidth - totalWidth) / 2;
    const handX = startX + handIndex * (handWidth + 40);
    
    return { x: handX, y: position.y };
  };
  
  return (
    <View style={styles.handContainer}>
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
                  width: cardWidth + (Math.max(0, (handCards?.length || 1) - 1) * cardWidth * cardSpacing) + 20,
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
                const overlapWidth = cardWidth * cardSpacing;
                const totalWidth = cardWidth + (totalCards - 1) * overlapWidth;
                const centeredStartX = (screenWidth - totalWidth) / 2;
                
                cardAnimations.current.set(animKey, {
                  x: new Animated.Value(card.position?.x || (centeredStartX + cardIndex * overlapWidth)),
                  y: new Animated.Value(card.position?.y || handPosition.y)
                });
              }
              
              const cardAnim = cardAnimations.current.get(animKey);
              
              return (
                <Animated.View
                  key={card.id}
                  style={[
                    styles.handCard,
                    {
                      transform: [
                        { translateX: cardAnim.x },
                        { translateY: cardAnim.y }
                      ],
                      zIndex: 1 + cardIndex,
                    }
                  ]}
                >
                  <Card
                    testID={`hand-${handIndex}-card-${card.id}`}
                    suit={card.suit}
                    value={card.value}
                    faceUp={card.faceUp}
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
              styles.animatingCard,
              {
                transform: [
                  { translateX: card.animateX },
                  { translateY: card.animateY },
                  { rotateY },
                ],
                zIndex: 1000,
              }
            ]}
          >
            <Card
              suit={card.suit}
              value={card.value}
              faceUp={card.isFlipping}
              style={styles.cardInHand}
            />
          </Animated.View>
        );
      })}
    </View>
  );
};

const styles = {
  handContainer: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
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
  handCard: {
    position: 'absolute',
    width: 90,
    height: 126,
  },
  cardInHand: {
    width: '100%',
    height: '100%',
  },
  animatingCard: {
    position: 'absolute',
    width: 90,
    height: 126,
  },
};

export default Hand;