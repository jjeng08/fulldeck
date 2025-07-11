import React from 'react';
import { View } from 'react-native';

import Card from './Card';

const Hand = ({ 
  cards = [], 
  position = { x: 0, y: 0 },
  cardWidth = 90,
  cardOverlap = 0.3,
  style = {} 
}) => {

  return (
    <View style={styles.handContainer}>
      {cards.map((card, index) => {
        return (
          <View
            key={card.id}
            style={[
              styles.handCard,
              {
                left: card.position?.x || position.x,
                top: card.position?.y || position.y,
                zIndex: 50 + index,
              }
            ]}
          >
            <Card
              testID={`hand-card-${card.id}`}
              suit={card.suit}
              value={card.value}
              faceUp={card.faceUp}
              style={[
                styles.cardInHand,
                { 
                  backgroundColor: 'red',
                  borderRadius: 8,
                  overflow: 'hidden'
                }
              ]}
            />
          </View>
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
  handCard: {
    position: 'absolute',
    width: 90,
    height: 126,
  },
  cardInHand: {
    width: '100%',
    height: '100%',
  },
};

export default Hand;