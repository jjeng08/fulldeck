import React, { useEffect } from 'react';
import { View, Text, ImageBackground } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming,
  interpolate,
  runOnJS
} from 'react-native-reanimated';
import { styleConstants as sc } from 'shared/styleConstants';

const Card = ({ 
  suit, 
  value, 
  position = { x: 0, y: 0 },
  animatePosition = false,
  onAnimationComplete = () => {},
  gameConfig = { 
    cardWidth: 90,
    cardHeight: 126,
    durations: { cardFlip: 300 }
  },
  style = {}
}) => {
  // Determine flip state based on data presence
  const shouldBeFaceUp = suit !== null && value !== null;
  const flipProgress = useSharedValue(shouldBeFaceUp ? 1 : 0);
  const positionX = useSharedValue(position?.x || 0);
  const positionY = useSharedValue(position?.y || 0);

  // Suit symbols and colors
  const suitSymbols = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  };

  const suitColors = {
    hearts: '#FF0000',
    diamonds: '#FF0000',
    clubs: '#000000',
    spades: '#000000'
  };

  // Animate flip when card data changes
  useEffect(() => {
    flipProgress.value = withTiming(shouldBeFaceUp ? 1 : 0, { duration: gameConfig.durations.cardFlip }, (finished) => {
      if (finished) {
        runOnJS(onAnimationComplete)();
      }
    });
  }, [shouldBeFaceUp, gameConfig.durations.cardFlip]);

  // Animate position when position changes
  useEffect(() => {
    if (animatePosition && position) {
      positionX.value = withTiming(position.x, { duration: 500 });
      positionY.value = withTiming(position.y, { duration: 500 }, (finished) => {
        if (finished) {
          runOnJS(onAnimationComplete)();
        }
      });
    } else if (position) {
      positionX.value = position.x;
      positionY.value = position.y;
    }
  }, [position?.x, position?.y, animatePosition]);

  // Create animated styles for flip effect
  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [180, 0]);
    const scaleX = interpolate(flipProgress.value, [0, 0.5, 1], [0, 0, 1]);
    
    return {
      transform: [{ rotateY: `${rotateY}deg` }, { scaleX }],
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    const scaleX = interpolate(flipProgress.value, [0, 0.5, 1], [1, 0, 0]);
    
    return {
      transform: [{ rotateY: `${rotateY}deg` }, { scaleX }],
    };
  });

  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: positionX.value },
        { translateY: positionY.value }
      ]
    };
  });

  const renderCardFront = () => (
    <Animated.View 
      style={[
        styles.cardFace,
        styles.cardFront,
        frontAnimatedStyle
      ]}
    >
      {/* Corner values */}
      <View style={styles.topLeftCorner}>
        <Text style={[styles.cornerValue, { color: suitColors[suit] }]}>
          {value}
        </Text>
        <Text style={[styles.cornerSuit, { color: suitColors[suit] }]}>
          {suitSymbols[suit]}
        </Text>
      </View>
      
      <View style={styles.bottomRightCorner}>
        <Text style={[styles.cornerValue, styles.rotated, { color: suitColors[suit] }]}>
          {value}
        </Text>
        <Text style={[styles.cornerSuit, styles.rotated, { color: suitColors[suit] }]}>
          {suitSymbols[suit]}
        </Text>
      </View>

      {/* Center suit symbol */}
      <View style={styles.centerSymbol}>
        <Text style={[styles.centerSuit, { color: suitColors[suit] }]}>
          {suitSymbols[suit]}
        </Text>
        <Text style={[styles.centerValue, { color: suitColors[suit] }]}>
          {value}
        </Text>
      </View>
    </Animated.View>
  );

  const renderCardBack = () => (
    <Animated.View 
      style={[
        styles.cardFace,
        styles.cardBack,
        backAnimatedStyle
      ]}
    >
      <ImageBackground
        source={require('assets/card-back.png')}
        style={styles.cardBackPattern}
        imageStyle={styles.cardBackImage}
      />
    </Animated.View>
  );

  // Dynamic styles using gameConfig
  const dynamicStyles = {
    cardContainer: {
      width: gameConfig.cardWidth,
      height: gameConfig.cardHeight,
      position: 'absolute',
    },
  };

  return (
    <Animated.View 
      style={[
        dynamicStyles.cardContainer,
        containerAnimatedStyle,
        style
      ]}
    >
      {renderCardBack()}
      {renderCardFront()}
    </Animated.View>
  );
};

const styles = {
  cardFace: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    backfaceVisibility: 'hidden',
  },
  cardFront: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
    padding: 4,
  },
  cardBack: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  topLeftCorner: {
    position: 'absolute',
    top: 4,
    left: 4,
    alignItems: 'center',
  },
  bottomRightCorner: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    alignItems: 'center',
  },
  cornerValue: {
    fontSize: 10,
    fontWeight: 'bold',
    lineHeight: 10,
  },
  cornerSuit: {
    fontSize: 8,
    lineHeight: 8,
  },
  rotated: {
    transform: [{ rotate: '180deg' }],
  },
  centerSymbol: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -15 }, { translateY: -15 }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSuit: {
    fontSize: 24,
    lineHeight: 24,
  },
  centerValue: {
    fontSize: 8,
    fontWeight: 'bold',
    marginTop: 2,
  },
  cardBackPattern: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  cardBackImage: {
    borderRadius: 7,
  },
};

export default Card;