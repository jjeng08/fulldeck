import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from '../../systems/AppContext';
import { lobbyStyles as s } from './LobbyStyles';
import { text as t } from '../../shared/text';
import { formatCurrency } from '../../shared/utils';
import Button from '../../components/Button';
import GameCarousel from '../../components/GameCarousel';

export default function LobbyPage() {
  const navigation = useNavigation();
  const { user, tableState, sendMessage } = useApp();

  useEffect(() => {
    // Get current balance when entering lobby
    sendMessage('getBalance');
  }, []);

  // Navigate to appropriate table when successfully joined
  useEffect(() => {
    if (tableState.tableId) {
      if (tableState.gameType === 'blackjack') {
        navigation.navigate('Blackjack');
      } else if (tableState.gameType === 'poker') {
        navigation.navigate('Poker');
      } else if (tableState.gameType === 'baccarat') {
        navigation.navigate('Baccarat');
      }
    }
  }, [tableState.tableId, tableState.gameType, navigation]);

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
    sendMessage('performLogout');
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
              {t.balance.replace('{balance}', formatCurrency(user?.balance || 0))}
            </Text>
          </View>
          <Button 
            label={t.logOut}
            onPress={onLogout}
            style={s.logoutButton}
          />
        </View>

        <View style={s.mainContent}>
          <GameCarousel />
        </View>
      </View>
    </View>
  );
}