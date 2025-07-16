import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { View, Dimensions, ImageBackground, Animated, Easing } from 'react-native';
import { styleConstants as sc } from 'shared/styleConstants';
import Card from './Card';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const Deck = forwardRef(({ 
  onDealCard = () => {},
  style = {},
  cards = [],
  portalCards = [],
  isShuffling = false,
  shuffleTimes = 0,
  gameConfig = { 
    cardWidth: 90,
    cardHeight: 126,
    durations: { deckShuffle: 800, cardDeal: 1000, cardFlip: 300 }
  },
  onDeckCoordinatesChange = () => {}
}, ref) => {
  // Animated values for shuffle animations
  const shuffleProgress = React.useRef(new Animated.Value(0)).current;
  
  // Toggle for alternating animation direction
  const evenGoesUp = React.useRef(true);
  
  const [dealtCards, setDealtCards] = useState([]);
  const [nextCardId, setNextCardId] = useState(0);
  const [internalIsShuffling, setInternalIsShuffling] = useState(false);

  // Standard deck of cards
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // Create a shuffled deck
  const createDeck = () => {
    const deck = [];
    suits.forEach(suit => {
      values.forEach(value => {
        deck.push({ suit, value });
      });
    });
    return shuffleDeck(deck);
  };

  const shuffleDeck = (deck) => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const [deck, setDeck] = useState(createDeck());

  // Card refs for direct DOM manipulation
  const cardRefs = React.useRef([]);
  
  // Build deck with specified number of cards
  const buildDeck = (numCards) => {
    const deck = [];
    for (let i = 0; i < numCards; i++) {
      deck.push({
        id: `card${i}`,
        zIndex: i,
        top: i * 1,
        right: i * 1
      });
    }
    return deck;
  };

  const [internalCards, setInternalCards] = React.useState(buildDeck(10));
  const [internalShuffleTimes, setInternalShuffleTimes] = React.useState(0);

  // Deck position tracking
  const deckContainerRef = React.useRef(null);

  // Arc animation function using React Native Animated API
  const animateShuffle = () => {
    // Reset animation value
    shuffleProgress.setValue(0);
    
    // Toggle animation direction for this shuffle
    evenGoesUp.current = !evenGoesUp.current;
    
    // Mark all cards as animating
    setInternalCards(prev => prev.map(card => ({ ...card, animating: true })));
    
    // Z-index swapping: always swap based on current z-index positions
    setTimeout(() => {
      setInternalCards(prev => prev.map(card => {
        let newZIndex;
        if (card.zIndex % 2 === 0) {
          // Even z-index cards move to next odd z-index
          newZIndex = card.zIndex + 1;
        } else {
          // Odd z-index cards move to previous even z-index
          newZIndex = card.zIndex - 1;
        }
        return { 
          ...card, 
          zIndex: newZIndex, 
          top: newZIndex, 
          right: newZIndex 
        };
      }));
    }, gameConfig.durations.deckShuffle / 2); // At peak of animation when cards are most separated
    
    // Start 3-phase arc animation: up -> right with rotation -> back down
    Animated.timing(shuffleProgress, {
      toValue: 1,
      duration: gameConfig.durations.deckShuffle,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      // Animation complete - remove animation flag and complete shuffle
      setInternalCards(prev => prev.map(card => ({ ...card, animating: false })));
      
      setInternalShuffleTimes(prev => {
        const remaining = prev - 1;
        if (remaining <= 0) {
          setInternalIsShuffling(false);
        }
        return remaining;
      });
    });
  };

  // Trigger animation when isShuffling becomes true or when more shuffles remain
  React.useEffect(() => {
    if (internalIsShuffling && internalShuffleTimes > 0) {
      animateShuffle();
    }
  }, [internalIsShuffling, internalShuffleTimes]);

  // Simple shuffle function
  const shuffle = (times = 1) => {
    if (internalIsShuffling) return;
    setInternalShuffleTimes(times);
    setInternalIsShuffling(true);
  };

  // Measure deck position on screen
  const onDeckLayout = (event) => {
    deckContainerRef.current?.measureInWindow((x, y, width, height) => {
      onDeckCoordinatesChange({ x, y });
    });
  };

  // Deal a card animation
  const dealCard = (targetPosition, flipDelay = 250) => {
    if (deck.length === 0) return null;

    const cardToDeal = deck[0];
    const newCardId = nextCardId;
    setNextCardId(prev => prev + 1);
    
    // Remove card from deck
    setDeck(prev => prev.slice(1));

    // Create dealt card with animation
    const newDealtCard = {
      id: newCardId,
      ...cardToDeal,
      startPosition: { x: 0, y: 0 },
      targetPosition,
      flipDelay,
    };

    setDealtCards(prev => [...prev, newDealtCard]);
    onDealCard(newDealtCard);

    return newDealtCard;
  };

  // Deal card to player hand position
  const dealToPlayer = (cardIndex = 0) => {
    const playerAreaY = screenHeight - 200; // Above dark green section
    const cardSpacing = 70; // Space between cards
    const totalCards = cardIndex + 1;
    const startX = screenWidth / 2 - (totalCards * cardSpacing) / 2;
    const targetX = startX + (cardIndex * cardSpacing);
    
    return dealCard({ x: targetX, y: playerAreaY });
  };

  // Deal card to dealer position
  const dealToDealer = (cardIndex = 0) => {
    const dealerAreaY = 150;
    const cardSpacing = 70;
    const totalCards = cardIndex + 1;
    const startX = screenWidth / 2 - (totalCards * cardSpacing) / 2;
    const targetX = startX + (cardIndex * cardSpacing);
    
    return dealCard({ x: targetX, y: dealerAreaY });
  };
  

  // Render deck cards using React Native Animated API
  const renderDeckStack = () => {
    // Sort cards by z-index to ensure proper rendering order (higher z-index renders last = on top)
    const sortedCards = [...internalCards].sort((a, b) => a.zIndex - b.zIndex);
    
    return sortedCards.map((card) => {
      let animatedStyle = {};
      
      if (card.animating) {
        // Animation targeting: use toggle to alternate between even/odd cards
        const originalCardIndex = parseInt(card.id.replace('card', ''));
        const cardIsEven = originalCardIndex % 2 === 0; // card0,2,4,6,8 are even
        
        const shouldAnimateUp = cardIsEven ? evenGoesUp.current : !evenGoesUp.current;
        
        if (shouldAnimateUp) {
          // Cards animating up and right with rotation
          
          const translateY = shuffleProgress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, -120, 0],
          });
          
          const translateX = shuffleProgress.interpolate({
            inputRange: [0, 0.5, 1], 
            outputRange: [0, 60, 0],
          });
          
          const rotate = shuffleProgress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: ['0deg', '35deg', '0deg'],
          });
          
          animatedStyle = {
            transform: [
              { translateY },
              { translateX },
              { rotate }
            ]
          };
        } else {
          // Cards animating down and left with rotation
          
          const translateY = shuffleProgress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 120, 0],
          });
          
          const translateX = shuffleProgress.interpolate({
            inputRange: [0, 0.5, 1], 
            outputRange: [0, -60, 0],
          });
          
          const rotate = shuffleProgress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: ['0deg', '35deg', '0deg'],
          });
          
          animatedStyle = {
            transform: [
              { translateY },
              { translateX },
              { rotate }
            ]
          };
        }
      }

      return (
        <Animated.View
          key={card.id}
          style={[
            dynamicStyles.deckCardContainer,
            {
              top: card.top,
              right: card.right,
            },
            animatedStyle
          ]}
        >
          <Card
            faceUp={false}
            gameConfig={gameConfig}
            style={styles.deckCard}
          />
        </Animated.View>
      );
    });
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    dealToPlayer,
    dealToDealer,
    shuffle,
    remainingCards: deck.length,
    isShuffling: internalIsShuffling,
  }));

  // Clean up completed dealt cards
  const handleCardAnimationComplete = (cardId) => {
    // Keep dealt cards for now - they'll be managed by the game component
    // setDealtCards(prev => prev.filter(card => card.id !== cardId));
  };

  // Dynamic styles using gameConfig
  const dynamicStyles = {
    deckContainer: {
      position: 'relative',
      width: gameConfig.cardWidth,
      height: gameConfig.cardHeight,
    },
    deckCardContainer: {
      position: 'absolute',
      width: gameConfig.cardWidth,
      height: gameConfig.cardHeight,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#333',
      overflow: 'hidden',
    },
    portalCard: {
      position: 'absolute',
      width: gameConfig.cardWidth,
      height: gameConfig.cardHeight,
    },
  };

  return (
    <>
      {/* Deck Stack */}
      <View 
        ref={deckContainerRef}
        onLayout={onDeckLayout}
        style={[
          dynamicStyles.deckContainer,
          style
        ]}
      >
        {renderDeckStack()}
      </View>

      {/* Portal Layer for Card Dealing Animations */}
      <View style={styles.portalContainer}>
        {portalCards.map((card) => {
          if (!card.animateX || !card.animateY || !card.animateRotateY) {
            return null; // Skip cards without animation values
          }
          
          const rotateY = card.animateRotateY.interpolate({
            inputRange: [0, 90, 180],
            outputRange: ['0deg', '90deg', '0deg'],
          });
          
          return (
            <Animated.View
              key={card.id}
              style={[
                dynamicStyles.portalCard,
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
              {card.isFlipping ? (
                <Card
                  suit={card.suit}
                  value={card.value}
                  faceUp={true}
                  gameConfig={gameConfig}
                  style={{
                    width: '100%',
                    height: '100%',
                  }}
                />
              ) : (
                <Card
                  suit={card.suit}
                  value={card.value}
                  faceUp={false}
                  gameConfig={gameConfig}
                  style={styles.cardInPortal}
                />
              )}
            </Animated.View>
          );
        })}
      </View>

      {/* Dealt Cards with Animations */}
      {dealtCards.map((card) => {
        // Update card position and flip state
        const targetPosition = card.targetPosition || card.startPosition;
        
        return (
          <Card
            testID={'deck-card-'+ card.id}
            key={card.id}
            suit={card.suit}
            value={card.value}
            faceUp={card.faceUp || false}
            animateFlip={true}
            position={targetPosition}
            animatePosition={true}
            gameConfig={gameConfig}
            onAnimationComplete={() => {
              // Flip the card after it reaches target position
              if (!card.faceUp) {
                setTimeout(() => {
                  setDealtCards(prev => 
                    prev.map(c => 
                      c.id === card.id 
                        ? { ...c, faceUp: true }
                        : c
                    )
                  );
                }, card.flipDelay);
              }
              handleCardAnimationComplete(card.id);
            }}
            style={{
              position: 'absolute',
              zIndex: 20 + card.id,
            }}
          />
        );
      })}
    </>
  );
});

const styles = {
  deckCard: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  deckCardImage: {
    borderRadius: 7, // Slightly smaller than container to account for border
  },
  portalContainer: {
    position: 'fixed', // Changed from absolute to fixed to ignore parent positioning
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  cardInPortal: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  cardBackImage: {
    borderRadius: 7,
  },
};

export default Deck;