import React, { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import { styleConstants as sc } from 'shared/styleConstants';
import { useApp } from 'systems/AppContext';

export default function Button({ label, onPress, style, textStyle, disabled, submit, messageType }) {
  const { loadingActions, addLoadingAction } = useApp();
  
  const isPageBlocked = loadingActions.size > 0;
  const isSpecificLoading = messageType && loadingActions.has(messageType);
  const isDisabled = disabled || isPageBlocked || isSpecificLoading;
  
  const handlePress = () => {
    // Add this message type to loading actions when button is clicked
    if (messageType) {
      addLoadingAction(messageType);
    }
    onPress();
  };
  
  return (
    <TouchableOpacity 
      style={[
        sc.componentStyles.button, 
        style,
        isDisabled && { opacity: 0.5 }
      ]} 
      onPress={handlePress}
      disabled={isDisabled}
    >
      <View style={sc.componentStyles.buttonContent}>
        {isSpecificLoading && (
          <ActivityIndicator 
            size="small" 
            color="#fff" 
            style={sc.componentStyles.buttonSpinner}
          />
        )}
        <Text style={[sc.componentStyles.buttonText, textStyle]}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}