export const gameConfig = {
  blackjack: {
    id: 'blackjack',
    name: 'Blackjack',
    available: true,
    logo: require('../assets/logo-blackjack.png'),
    description: 'Classic 21 card game',
    route: 'Blackjack'
  },
  poker: {
    id: 'poker',
    name: 'Poker',
    available: false,
    logo: require('../assets/logo-placeholder.png'),
    description: 'Coming Soon',
    route: 'Poker'
  },
  baccarat: {
    id: 'baccarat',
    name: 'Baccarat',
    available: false,
    logo: require('../assets/logo-placeholder.png'),
    description: 'Coming Soon',
    route: 'Baccarat'
  }
};

export const availableGames = Object.values(gameConfig).filter(game => game.available);
export const allGames = Object.values(gameConfig);