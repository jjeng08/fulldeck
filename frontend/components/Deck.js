import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View, Dimensions, ImageBackground, Animated, Easing } from 'react-native';
import { styleConstants as sc } from 'shared/styleConstants';
import Card from './Card';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const Deck = forwardRef(({ 
    style = {},
    cards = [],
    portalCards = [],
    isShuffling = false,
    shuffleTimes = 0,
    durations = { deckShuffle: 800, cardDeal: 1000, cardFlip: 300 },
    onDeckCoordinatesChange = () => {}
  }, ref) => {
  // Animated values for shuffle animations
  const shuffleProgress = useRef(new Animated.Value(0)).current;
  
  // Toggle for alternating animation direction
  const evenGoesUp = useRef(true);
  
  // Deck position tracking
  const deckContainerRef = useRef(null);

  // Arc animation function using React Native Animated API
  const animateShuffle = () => {
    // Reset animation value
    shuffleProgress.setValue(0);
    
    // Toggle animation direction for this shuffle
    evenGoesUp.current = !evenGoesUp.current;
    
    // Start 3-phase arc animation: up -> right with rotation -> back down
    Animated.timing(shuffleProgress, {
      toValue: 1,
      duration: durations.deckShuffle,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  // Trigger animation when isShuffling becomes true or when more shuffles remain
  useEffect(() => {
    if (isShuffling && shuffleTimes > 0) {
      animateShuffle();
    }
  }, [isShuffling, shuffleTimes]);

  // Measure deck position on screen
  const onDeckLayout = (event) => {
    deckContainerRef.current?.measureInWindow((x, y, width, height) => {
      onDeckCoordinatesChange({ x, y });
    });
  };
  

  // Render deck cards using React Native Animated API
  const renderDeckStack = () => {
    // Sort cards by z-index to ensure proper rendering order (higher z-index renders last = on top)
    const sortedCards = [...cards].sort((a, b) => a.zIndex - b.zIndex);
    
    return sortedCards.map((card) => {
      let animatedStyle = {};
      
      // Check if card should be animating
      const cardIsAnimating = isShuffling && shuffleTimes > 0;
      
      if (cardIsAnimating) {
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
            styles.deckCardContainer,
            {
              top: card.top,
              right: card.right,
            },
            animatedStyle
          ]}
        >
          <ImageBackground
            source={require('assets/card-back.png')}
            style={styles.deckCard}
            imageStyle={styles.deckCardImage}
          />
        </Animated.View>
      );
    });
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    // Empty for now since all functionality moved to parent
  }));


  return (
    <>
      {/* Deck Stack */}
      <View 
        testID='DECK'
        ref={deckContainerRef}
        onLayout={onDeckLayout}
        style={[
          styles.deckContainer,
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
            outputRange: ['0deg', '90deg', '180deg'],
          });
          
          return (
            <Animated.View
              key={card.id}
              style={[
                styles.portalCard,
                {
                  transform: [
                    { translateX: card.animateX },
                    { translateY: card.animateY },
                    { rotateY },
                  ],
                  zIndex: 100 + card.id,
                }
              ]}
            >
              {card.isFlipping ? (
                <View
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'red',
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: 'black',
                  }}
                />
              ) : (
                <ImageBackground
                  source={require('assets/card-back.png')}
                  style={styles.cardInPortal}
                  imageStyle={styles.cardBackImage}
                />
              )}
            </Animated.View>
          );
        })}
      </View>



    </>
  );
});

const styles = {
  deckContainer: {
    position: 'relative',  // Reference point for absolute children
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
  portalContainer: {
    position: 'fixed', // Changed from absolute to fixed to ignore parent positioning
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  portalCard: {
    position: 'absolute',
    width: 90,
    height: 126,
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