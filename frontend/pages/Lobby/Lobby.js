import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from '../../systems/AppContext';
import { lobbyStyles as s } from './LobbyStyles';
import { text as t } from '../../core/text';
import { formatCurrency } from '../../shared/utils';
import Button from '../../components/Button';
import GamesCarousel from '../../components/GamesCarousel';

export default function LobbyPage() {
  const navigation = useNavigation();
  const { user, sendMessage, playerBalance } = useApp();

  useEffect(() => {
    // Get current balance when entering lobby
    sendMessage('balance');
  }, []);

  // Table navigation will be handled by individual game components

  const onViewAccount = () => {
    // TODO: Navigate to account details or show modal
    console.log('View account info');
  };

  const onDeposit = () => {
    // TODO: Handle deposit transaction
    console.log('Handle deposit');
  };

  const onWithdraw = () => {
    // TODO: Handle withdraw transaction
    console.log('Handle withdraw');
  };

  const onLogout = () => {
    sendMessage('logout');
    navigation.navigate('Intro');
  };

  return (
    <View style={s.container}>
      <View style={s.leftMenu}>
        <Text style={s.menuTitle}>{t.Account}</Text>
        <Button 
          label={t.viewAccount}
          onPress={onViewAccount}
          style={s.menuButton}
        />
        <Button 
          label={t.deposit}
          onPress={onDeposit}
          style={s.menuButton}
        />
        <Button 
          label={t.withdraw}
          onPress={onWithdraw}
          style={s.menuButton}
        />
      </View>

      <View style={s.centerContent}>
        <View style={s.topBar}>
          <View style={s.header}>
            <Text style={s.welcomeText}>
              {t.welcomeUser.replace('{username}', user?.username || 'Guest')}
            </Text>
            <Text style={s.balanceText}>
              {t.balance.replace('{balance}', formatCurrency(playerBalance))}
            </Text>
          </View>
          <Button 
            label={t.logOut}
            onPress={onLogout}
            style={s.logoutButton}
          />
        </View>

        <View style={s.mainContent}>
          <GamesCarousel />
        </View>
      </View>
    </View>
  );
}