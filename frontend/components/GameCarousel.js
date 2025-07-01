import React, { useState, useRef } from 'react';
import { View, Text, Image, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Carousel from 'react-native-reanimated-carousel';

import { allGames } from 'shared/gameConfig';
import { text as t } from 'shared/text';
import { styleConstants as sc } from 'shared/styleConstants';
import Button from 'components/Button';

export default function GameCarousel() {
  const navigation = useNavigation();
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef(null);
    
  const onPlayGame = (game) => {
    if (game.available) {
      navigation.navigate(game.route);
    }
  };

  const goToNext = () => {
    carouselRef.current?.next();
  };

  const goToPrevious = () => {
    carouselRef.current?.prev();
  };

  const renderItem = ({ item, index }) => (
    <View style={carouselStyles.cardContainer} testID="cardContainer">
      <View 
        style={[
          carouselStyles.card,
          index === activeIndex && carouselStyles.activeCard
        ]}
        testID="card"
      >
        <Image 
          source={item.logo} 
          style={carouselStyles.logo} 
          testID="logo"
          resizeMode="contain" 
        />
        <Text style={carouselStyles.gameName} testID="gameName">{item.name}</Text>
        <Text style={carouselStyles.description} testID="description">
          {item.description}
        </Text>
        <Button 
          label={item.available ? 'Play' : 'Coming Soon'}
          onPress={() => onPlayGame(item)}
          style={[
            carouselStyles.playButton,
            !item.available && carouselStyles.disabledButton
          ]}
          disabled={!item.available}
          testID="playButton"
        />
      </View>
    </View>
  );

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
      
      <Carousel
        ref={carouselRef}
        loop={true}
        width={sc.components.carouselCardWidth}
        height={sc.components.carouselCardHeight}
        data={allGames}
        scrollAnimationDuration={300}
        onSnapToItem={(index) => setActiveIndex(index)}
        renderItem={renderItem}
        mode="parallax"
        modeConfig={{
          parallaxScrollingScale: 0.9,
          parallaxScrollingOffset: 50,
        }}
        style={carouselStyles.carousel}
      />
      
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
    height: sc.components.carouselContainerHeight,
    paddingVertical: sc.size.lg,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sc.size.lg,
    marginBottom: sc.size.md,
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
    width: sc.components.carouselCardWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    ...sc.baseComponents.card,
    height: sc.components.carouselCardHeight,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: sc.size.lg,
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