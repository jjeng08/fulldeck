import React from 'react';
import { AppProvider } from './systems/AppContext';
import { UtilsProvider } from './systems/UtilsContext';
import AppNavigator from './systems/AppNavigator';

export default function App() {
  return (
    <AppProvider>
      <UtilsProvider>
        <AppNavigator />
      </UtilsProvider>
    </AppProvider>
  );
}