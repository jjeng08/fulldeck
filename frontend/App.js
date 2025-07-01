import React from 'react';
import { AppProvider } from './systems/AppContext';
import AppNavigator from './systems/AppNavigator';

export default function App() {
  return (
    <AppProvider>
      <AppNavigator />
    </AppProvider>
  );
}