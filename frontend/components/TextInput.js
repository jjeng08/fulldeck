import React from 'react';
import { TextInput as RNTextInput } from 'react-native';
import { styleConstants as sc } from 'shared/styleConstants';

export default function TextInput({ 
  placeholder, 
  value, 
  onChangeText, 
  style, 
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  disabled 
}) {
  return (
    <RNTextInput
      style={[
        {
          ...sc.baseComponents.input,
          backgroundColor: sc.colors.white,
          borderColor: sc.colors.gray300,
          marginBottom: 8,
        },
        style,
        disabled && { opacity: 0.5 }
      ]}
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      editable={!disabled}
    />
  );
}