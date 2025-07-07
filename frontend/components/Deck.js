import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { View, Dimensions, ImageBackground } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  runOnJS,
  interpolate
} from 'react-native-reanimated';
import { styleConstants as sc } from 'shared/styleConstants';
import Card from './Card';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const Deck = forwardRef(({ 
  position = { x: screenWidth / 2 - 45, y: 100 }, 
  onDealCard = () => {},
  shuffling = false,
  style = {}
}, ref) => {
  // Reanimated values for shuffle animations
  const shuffleProgress = useSharedValue(0);
  const shufflePhase = useSharedValue(0); // 0: none, 1: initial, 2: half-second, 3: full-second
  
  const [dealtCards, setDealtCards] = useState([]);
  const [nextCardId, setNextCardId] = useState(0);
  const [isShuffling, setIsShuffling] = useState(false);

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

  // Single shuffle animation with reset
  const startSingleShuffle = (onComplete) => {
    shuffleProgress.value = withTiming(1, { duration: 800 }, () => {
      shuffleProgress.value = 0;
      runOnJS(resetCardStates)();
      if (onComplete) runOnJS(onComplete)();
    });
  };

  // Triple shuffle animation - loops 3 times
  const startShuffle = () => {
    if (isShuffling) return;
    
    setIsShuffling(true);
    
    // First shuffle
    startSingleShuffle(() => {
      // Second shuffle
      startSingleShuffle(() => {
        // Third shuffle
        startSingleShuffle(() => {
          setIsShuffling(false);
        });
      });
    });
  };

  // Auto-start shuffle when shuffling prop is true
  React.useEffect(() => {
    if (shuffling && !isShuffling) {
      startShuffle();
    }
  }, [shuffling]);

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
      startPosition: position,
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

  // Card refs for direct DOM manipulation
  const cardRefs = React.useRef([]);
  
  
  // Set up card positions and styles
  const [cardStates, setCardStates] = React.useState(() => 
    Array.from({ length: 10 }, (_, i) => ({
      zIndex: 10 - i,  // Card 0 gets z-index 10, Card 9 gets z-index 1
      top: (10 - i - 1) * 1,  // Higher z-index = more down
      left: -(10 - i - 1) * 1,  // Higher z-index = more left
      transform: ''
    }))
  );
  
  // Create animated styles for transform only
  const createCardAnimatedStyle = (arrayIndex) => {
    return useAnimatedStyle(() => {
      const isRemovedCard = [1, 3, 5, 7].includes(arrayIndex);
      
      if (shuffleProgress.value > 0 && isRemovedCard) {
        const translateY = interpolate(
          shuffleProgress.value,
          [0, 0.16, 0.33, 0.5, 0.67, 0.84, 1],
          [0, -60, -120, -180, -120, -60, 0]
        );
        
        const translateX = interpolate(
          shuffleProgress.value,
          [0, 0.16, 0.33, 0.5, 0.67, 0.84, 1],
          [0, 0, 30, 60, 30, 0, 0]
        );
        
        const rotate = interpolate(
          shuffleProgress.value,
          [0, 0.16, 0.33, 0.5, 0.67, 0.84, 1],
          [0, 8, 17, 25, 17, 8, 0]
        );
        
        // At apex (0.5), trigger DOM manipulation
        if (shuffleProgress.value >= 0.5) {
          runOnJS(updateCardPositions)();
        }
        
        return {
          transform: [{ translateX }, { translateY }, { rotate: `${rotate}deg` }]
        };
      }
      
      return {};
    });
  };
  
  // Direct DOM manipulation for instant z-index changes
  const updateCardPositions = () => {
    setCardStates(prev => prev.map((state, i) => {
      const isRemovedCard = [1, 3, 5, 7].includes(i);
      const isRemainingCard = [0, 2, 4, 6].includes(i);
      
      if (isRemovedCard) {
        const originalZIndex = 10 - i;
        const originalTop = (originalZIndex - 1) * 1;
        const originalLeft = -(originalZIndex - 1) * 1;
        
        return {
          ...state,
          zIndex: originalZIndex + 1,  // +1 to z-index
          top: originalTop + 1,        // +1 to position
          left: originalLeft - 1,      // -1 to position (more left)
        };
      } else if (isRemainingCard) {
        // Only specific remaining cards get -1
        const originalZIndex = 10 - i;
        const originalTop = (originalZIndex - 1) * 1;
        const originalLeft = -(originalZIndex - 1) * 1;
        
        return {
          ...state,
          zIndex: originalZIndex - 1,  // -1 to z-index
          top: originalTop - 1,        // -1 to position
          left: originalLeft + 1,      // +1 to position (less left)
        };
      } else {
        // Cards 8,9 don't move
        return state;
      }
    }));
  };

  // Reset all card states to original positions
  const resetCardStates = () => {
    setCardStates(Array.from({ length: 10 }, (_, i) => ({
      zIndex: 10 - i,
      top: (10 - i - 1) * 1,
      left: -(10 - i - 1) * 1,
      transform: ''
    })));
  };

  // Create individual animated styles for each card position
  const card0Style = createCardAnimatedStyle(0);
  const card1Style = createCardAnimatedStyle(1);
  const card2Style = createCardAnimatedStyle(2);
  const card3Style = createCardAnimatedStyle(3);
  const card4Style = createCardAnimatedStyle(4);
  const card5Style = createCardAnimatedStyle(5);
  const card6Style = createCardAnimatedStyle(6);
  const card7Style = createCardAnimatedStyle(7);
  const card8Style = createCardAnimatedStyle(8);
  const card9Style = createCardAnimatedStyle(9);

  // Render deck cards (visual stack effect) - exactly 10 cards
  const renderDeckStack = () => {
    const cardStyles = [
      card0Style, card1Style, card2Style, card3Style, card4Style,
      card5Style, card6Style, card7Style, card8Style, card9Style
    ];
    
    const stackCards = [];
    const totalCards = 10; // Exactly 10 cards as requested
    
    for (let i = 0; i < totalCards; i++) {
      const cardState = cardStates[i];
      
      // Create animated style for smooth transitions
      const positionAnimatedStyle = useAnimatedStyle(() => {
        return {
          zIndex: cardState.zIndex,
          top: withTiming(cardState.top, { duration: 300 }),
          left: withTiming(cardState.left, { duration: 300 }),
        };
      });
      
      stackCards.push(
        <Animated.View
          key={i}
          ref={el => cardRefs.current[i] = el}
          style={[
            styles.deckCardContainer,
            cardStyles[i],
            positionAnimatedStyle
          ]}
        >
          <ImageBackground
            source={require('assets/card-back.png')}
            style={styles.deckCard}
            imageStyle={styles.deckCardImage}
          />
        </Animated.View>
      );
    }
    return stackCards;
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    dealToPlayer,
    dealToDealer,
    shuffle: startShuffle,
    remainingCards: deck.length,
    isShuffling,
  }));

  // Clean up completed dealt cards
  const handleCardAnimationComplete = (cardId) => {
    // Keep dealt cards for now - they'll be managed by the game component
    // setDealtCards(prev => prev.filter(card => card.id !== cardId));
  };

  return (
    <>
      {/* Deck Stack */}
      <View 
        style={[
          styles.deckContainer,
          {
            left: position.x,
            top: position.y,
          },
          style
        ]}
      >
        {renderDeckStack()}
      </View>

      {/* Dealt Cards with Animations */}
      {dealtCards.map((card) => {
        // Update card position and flip state
        const targetPosition = card.targetPosition || card.startPosition;
        
        return (
          <Card
            key={card.id}
            suit={card.suit}
            value={card.value}
            faceUp={card.faceUp || false}
            animateFlip={true}
            position={targetPosition}
            animatePosition={true}
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
              zIndex: 1000 + card.id,
            }}
          />
        );
      })}
    </>
  );
});

const styles = {
  deckContainer: {
    position: 'absolute',
    width: 90,  // 60 * 1.5
    height: 126, // 84 * 1.5
  },
  deckCardContainer: {
    position: 'absolute',
    width: 90,  // 60 * 1.5
    height: 126, // 84 * 1.5
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  deckCard: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deckCardImage: {
    borderRadius: 7, // Slightly smaller than container to account for border
  },
};

export default Deck;