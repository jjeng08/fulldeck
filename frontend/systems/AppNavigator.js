import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import IntroPage from '../pages/Intro/Intro';
import LobbyPage from '../pages/Lobby/Lobby';
import Blackjack from '../pages/games/blackjack/Blackjack';
import Poker from '../pages/games/poker/Poker';
import Baccarat from '../pages/games/baccarat/Baccarat';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Intro"
        screenOptions={{
          headerShown: false // Hide headers globally for all screens
        }}
      >
        <Stack.Screen 
          name="Intro" 
          component={IntroPage} 
        />
        <Stack.Screen 
          name="Lobby" 
          component={LobbyPage} 
        />
        <Stack.Screen 
          name="Blackjack" 
          component={Blackjack} 
        />
        <Stack.Screen 
          name="Poker" 
          component={Poker} 
        />
        <Stack.Screen 
          name="Baccarat" 
          component={Baccarat} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}