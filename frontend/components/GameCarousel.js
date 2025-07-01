import React, { useState, useRef } from 'react';
import { View, Text, Image, Dimensions, Animated } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');
import { useNavigation } from '@react-navigation/native';

import { allGames } from 'shared/gameConfig';
import { text as t } from 'shared/text';
import { styleConstants as sc } from 'shared/styleConstants';
import Button from 'components/Button';

export default function GameCarousel() {
  const navigation = useNavigation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  
  const onPlayGame = (game) => {
    if (game.available) {
      navigation.navigate(game.route);
    }
  };

  const animateSlide = (direction, callback) => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    const slideDistance = 360; // 300px card width + 20% = 360px
    
    // Slide out current card
    Animated.timing(slideAnim, {
      toValue: direction === 'next' ? -slideDistance : slideDistance,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      // Update index
      callback();
      
      // Reset position for slide in
      slideAnim.setValue(direction === 'next' ? slideDistance : -slideDistance);
      
      // Slide in new card
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setIsAnimating(false);
      });
    });
  };

  const goToNext = () => {
    animateSlide('next', () => {
      setActiveIndex((prevIndex) => (prevIndex + 1) % allGames.length);
    });
  };

  const goToPrevious = () => {
    animateSlide('prev', () => {
      setActiveIndex((prevIndex) => (prevIndex - 1 + allGames.length) % allGames.length);
    });
  };

  const currentGame = allGames[activeIndex];

  return (
    <View style={carouselStyles.container} testID="container">
      <View style={carouselStyles.header} testID="header">
        <Button
          label="‹"
          onPress={goToPrevious}
          style={carouselStyles.arrowButton}
          testID="arrowButton"
        />
        <Text style={carouselStyles.title} testID="title">{t.chooseYourGame}</Text>
        <Button
          label="›"
          onPress={goToNext}
          style={carouselStyles.arrowButton}
          testID="arrowButton"
        />
      </View>
      
      <View style={carouselStyles.cardContainer} testID="cardContainer">
        <Animated.View 
          style={[
            carouselStyles.card, 
            {
              transform: [{ translateX: slideAnim }]
            }
          ]} 
          testID="card"
        >
          <Image 
            source={currentGame.logo} 
            style={carouselStyles.logo} 
            testID="logo"
            resizeMode="contain" 
          />
          <Text style={carouselStyles.gameName} testID="gameName">{currentGame.name}</Text>
          <Text style={carouselStyles.description} testID="description">
            {currentGame.description}
          </Text>
          <Button 
            label={currentGame.available ? 'Play' : 'Coming Soon'}
            onPress={() => onPlayGame(currentGame)}
            style={[
              carouselStyles.playButton,
              !currentGame.available && carouselStyles.disabledButton
            ]}
            disabled={!currentGame.available}
            testID="playButton"
          />
        </Animated.View>
      </View>
      
      <View style={carouselStyles.indicators} testID="indicators">
        {allGames.map((_, index) => (
          <View 
            key={index}
            style={[
              carouselStyles.indicator,
              index === activeIndex && carouselStyles.activeIndicator
            ]}
            testID="indicator"
          />
        ))}
      </View>
    </View>
  );
}

// GameCarousel specific styles using styleConstants
const carouselStyles = {
  container: {
    width: '100%',
    height: 500,
    paddingVertical: sc.size.lg,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sc.size.lg,
    marginBottom: sc.size.md,
    maxWidth: 360,
  },
  title: {
    ...sc.baseComponents.heading,
    flex: 1,
    textAlign: 'center',
  },
  arrowButton: {
    ...sc.componentStyles.button,
    backgroundColor: sc.colors.black,
    borderWidth: 2,
    borderColor: sc.colors.gold,
    minWidth: 60,
    minHeight: 50,
    borderRadius: sc.borderRadius.full,
    paddingHorizontal: sc.size.md,
    paddingVertical: sc.size.sm,
  },
  carousel: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ffd700',
    height: 400,
    width: 300,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  activeCard: {
    ...sc.shadows.lg,
  },
  logo: {
    width: '80%',
    height: '60%',
    marginBottom: sc.size.md,
  },
  gameName: {
    ...sc.baseComponents.heading,
    fontSize: sc.fontSizes.lg,
    marginBottom: sc.size.sm,
  },
  description: {
    ...sc.baseComponents.text,
    fontSize: sc.fontSizes.sm,
    textAlign: 'center',
    marginBottom: sc.size.md,
    flex: 1,
  },
  playButton: {
    ...sc.componentStyles.button,
    backgroundColor: sc.colors.green,
    minWidth: 100,
  },
  disabledButton: {
    backgroundColor: sc.colors.gray500,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: sc.size.md,
    gap: sc.size.xs,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: sc.borderRadius.full,
    backgroundColor: sc.colors.gray400,
  },
  activeIndicator: {
    backgroundColor: sc.colors.primary,
    width: 12,
    height: 12,
  },
};