import React, { useState, useRef } from 'react';
import { View, Text, Image, Dimensions, Animated } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');
import { useNavigation } from '@react-navigation/native';

import { useApp } from 'systems/AppContext';
import { text as t } from 'shared/text';
import { styleConstants as sc } from 'shared/styleConstants';
import Button from 'components/Button';

// Game assets mapping - internal to component
const gameAssets = {
  blackjack: {
    logo: require('../assets/logo-blackjack.png'),
  },
  poker: {
    logo: require('../assets/logo-placeholder.png'),
  },
  baccarat: {
    logo: require('../assets/logo-placeholder.png'),
  }
};

// Helper function to get game with assets
const getGameWithAssets = (game) => {
  const assets = gameAssets[game.id] || {};
  return {
    ...game,
    logo: assets.logo
  };
};

export default function GamesCarousel() {
  const navigation = useNavigation();
  const { availableGames } = useApp();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [expandedCards, setExpandedCards] = useState({});
  const slideAnim = useRef(new Animated.Value(0)).current;
  const cardSlideAnims = useRef({}).current;

  // Get games with assets
  const gamesWithAssets = (availableGames || []).map(game => getGameWithAssets(game));
  
  const onPlayGame = (game) => {
    if (game.available) {
      const cardKey = `${game.id}`;
      
      // Initialize animation if not exists
      if (!cardSlideAnims[cardKey]) {
        cardSlideAnims[cardKey] = new Animated.Value(0);
      }
      
      const isCurrentlyExpanded = expandedCards[cardKey];
      
      // Animate the fade
      Animated.timing(cardSlideAnims[cardKey], {
        toValue: isCurrentlyExpanded ? 0 : 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      
      setExpandedCards(prev => ({
        ...prev,
        [cardKey]: !prev[cardKey]
      }));
    }
  };

  const onSelectTier = (game, tierIndex) => {
    navigation.navigate(game.route, { 
      tierConfig: game.tiers[tierIndex],
      maxMulti: game.maxMulti 
    });
  };

  const formatCurrency = (cents) => {
    if (cents < 100) {
      return `${cents}¢`;
    }
    return `$${(cents / 100).toLocaleString()}`;
  };

  const animateSlide = (direction, callback) => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    
    // Always slide in the visual direction clicked
    const currentValue = slideAnim._value;
    const slideDistance = screenWidth * 0.5;
    const targetValue = currentValue + (direction === 'next' ? -slideDistance : slideDistance);
    
    // Animate to new position
    Animated.timing(slideAnim, {
      toValue: targetValue,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      // Update index after animation
      callback();
      
      // Check if we need to reset position for seamless infinite scroll
      const currentPos = slideAnim._value;
      const maxOffset = gamesWithAssets.length * slideDistance;
      
      if (currentPos <= -maxOffset) {
        // Moved too far right, reset to left side
        slideAnim.setValue(currentPos + maxOffset);
      } else if (currentPos >= maxOffset) {
        // Moved too far left, reset to right side  
        slideAnim.setValue(currentPos - maxOffset);
      }
      
      setIsAnimating(false);
    });
  };

  const resetAllCards = () => {
    // Reset all expanded states
    setExpandedCards({});
    
    // Reset all animations
    Object.keys(cardSlideAnims).forEach(cardKey => {
      cardSlideAnims[cardKey].setValue(0);
    });
  };

  const goToNext = () => {
    animateSlide('next', () => {
      setActiveIndex((prevIndex) => (prevIndex + 1) % gamesWithAssets.length);
      resetAllCards();
    });
  };

  const goToPrevious = () => {
    animateSlide('prev', () => {
      setActiveIndex((prevIndex) => (prevIndex - 1 + gamesWithAssets.length) % gamesWithAssets.length);
      resetAllCards();
    });
  };

  const currentGame = gamesWithAssets[activeIndex];

  // Don't render if no games available
  if (!gamesWithAssets.length) {
    return (
      <View style={carouselStyles.container} testID="container">
        <Text style={carouselStyles.title} testID="title">No games available</Text>
      </View>
    );
  }

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
        {[...gamesWithAssets, ...gamesWithAssets, ...gamesWithAssets].map((game, index) => {
          const cardWidth = screenWidth * 0.5;
          const baseOffset = (index - gamesWithAssets.length) * cardWidth;
          const cardKey = `${game.id}`;
          const isExpanded = expandedCards[cardKey];
          
          return (
            <Animated.View 
              key={`${game.id}-${index}`}
              style={[
                carouselStyles.card,
                {
                  position: 'absolute',
                  transform: [{ 
                    translateX: Animated.add(slideAnim, baseOffset) 
                  }]
                }
              ]} 
              testID="card"
            >
              <View style={carouselStyles.cardContent}>
                <Image 
                  source={game.logo} 
                  style={carouselStyles.logo} 
                  testID="logo"
                  resizeMode="contain" 
                />
                <Text style={carouselStyles.gameName} testID="gameName">{game.name}</Text>
                <Text style={carouselStyles.description} testID="description">
                  {game.description}
                </Text>
              </View>
              
              <View style={carouselStyles.buttonContainer}>
                <Button 
                  label={game.available ? (isExpanded ? 'Back' : 'Play') : 'Coming Soon'}
                  onPress={() => onPlayGame(game)}
                  style={[
                    carouselStyles.playButton,
                    !game.available && carouselStyles.disabledButton
                  ]}
                  disabled={!game.available}
                  testID="playButton"
                />
              </View>
              
              {game.available && game.tiers && (
                <Animated.View 
                  style={[
                    carouselStyles.tierContainer,
                    {
                      opacity: cardSlideAnims[cardKey] || 0
                    }
                  ]}
                  testID="tierContainer"
                >
                  {game.tiers.map((tier, tierIndex) => {
                    const tierBackgrounds = ['bronze', 'silver', 'gold'];
                    const tierBg = tierBackgrounds[tierIndex] || 'bronze';
                    const minBet = tier[0];
                    const maxBet = tier[tier.length - 1];
                    
                    return (
                      <Button
                        key={tierIndex}
                        label={`${formatCurrency(minBet)} - ${formatCurrency(maxBet)}`}
                        onPress={() => onSelectTier(game, tierIndex)}
                        style={[
                          carouselStyles.tierButton,
                          carouselStyles[`${tierBg}Button`]
                        ]}
                        testID={`tierButton-${tierIndex}`}
                      />
                    );
                  })}
                </Animated.View>
              )}
            </Animated.View>
          );
        })}
      </View>
      
      <View style={carouselStyles.indicators} testID="indicators">
        {gamesWithAssets.map((_, index) => (
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

// GamesCarousel specific styles using styleConstants
const carouselStyles = {
  container: {
    width: '50%',
    height: '70%',
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
    maxWidth: 500,
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
    height: '80%',
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
    height: '100%',
    width: '100%',
    overflow: 'hidden',
  },
  cardContent: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 20,
    flex: 1,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
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
  tierContainer: {
    position: 'absolute',
    bottom: 70,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: sc.borderRadius.md,
    padding: sc.size.md,
    gap: sc.size.sm,
  },
  tierButton: {
    ...sc.componentStyles.button,
    minWidth: 120,
    paddingHorizontal: sc.size.sm,
  },
  bronzeButton: {
    backgroundColor: '#CD7F32',
    borderColor: '#8B4513',
  },
  silverButton: {
    backgroundColor: '#C0C0C0',
    borderColor: '#808080',
  },
  goldButton: {
    backgroundColor: '#FFD700',
    borderColor: '#B8860B',
  },
};