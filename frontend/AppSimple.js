import React from 'react';
import { View, Text } from 'react-native';

export default function AppSimple() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>FullDeck App Test</Text>
      <Text style={{ fontSize: 16, marginTop: 10 }}>If you see this, React Native is working!</Text>
    </View>
  );
}