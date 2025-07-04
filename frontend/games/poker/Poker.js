import React from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from 'systems/AppContext';
import Button from 'components/Button';

export default function Poker() {
  const navigation = useNavigation();
  const { user } = useApp();

  const onLeaveTable = () => {
    navigation.navigate('Lobby');
  };

  return (
    <View style={{
      flex: 1,
      backgroundColor: '#0f5132',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20
    }}>
      <Text style={{
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 20,
        textAlign: 'center'
      }}>
        Poker
      </Text>
      
      <Text style={{
        fontSize: 18,
        color: '#4ade80',
        marginBottom: 10,
        textAlign: 'center'
      }}>
        Welcome, {user?.username || 'Player'}!
      </Text>
      
      <Text style={{
        fontSize: 16,
        color: '#ccc',
        marginBottom: 40,
        textAlign: 'center'
      }}>
        Poker is coming soon! 🃏
      </Text>
      
      <Button 
        label="Back to Lobby"
        onPress={onLeaveTable}
        style={{
          backgroundColor: '#6c757d',
          minWidth: 150,
          paddingVertical: 12
        }}
      />
    </View>
  );
}