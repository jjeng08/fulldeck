import React, { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import { styleConstants as sc } from 'shared/styleConstants';

export default function Button({ label, onPress, style, textStyle, disabled, submit }) {
  const [isLoading, setIsLoading] = useState(false);
  
  const isDisabled = disabled || (submit && isLoading);
  
  const handlePress = async () => {
    if (submit) {
      setIsLoading(true);
      try {
        await onPress();
      } finally {
        setIsLoading(false);
      }
    } else {
      onPress();
    }
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
        {isLoading && (
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