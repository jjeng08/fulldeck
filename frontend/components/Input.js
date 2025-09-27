import React from 'react';
import { View, Text } from 'react-native';

import { inputStyles as s } from './InputStyles';
import TextInput from 'components/TextInput';

export default function Input({ 
  label, 
  placeholder, 
  value, 
  onChangeText,
  style,
  classes = {}
}) {
  return (
    <View style={[s.container, style, classes.container]}>
      {label && (
        <Text style={[s.label, classes.label]}>{label}</Text>
      )}
      <TextInput
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        style={[s.input, classes.input]}
      />
    </View>
  );
}