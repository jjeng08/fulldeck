import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useApp } from '../../systems/AppContext';
import { lobbyStyles as s } from './LobbyStyles';
import { text as t } from '../../core/text';
import { formatCurrency } from '../../shared/utils';
import Button from '../../components/Button';
import GamesCarousel from '../../components/GamesCarousel';
import LobbyModal from '../LobbyModal/LobbyModal';

export default function LobbyPage() {
  const navigation = useNavigation();
  const { user, sendMessage, playerBalance } = useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [activeModalSection, setActiveModalSection] = useState('viewAccount');

  useEffect(() => {
    // Get current balance when entering lobby
    sendMessage('balance');
  }, []);

  // Table navigation will be handled by individual game components

  const onViewAccountClick = () => {
    setActiveModalSection('viewAccount');
    setModalVisible(true);
  };

  const onLeaderBoardClick = () => {
    setActiveModalSection('leaderBoard');
    setModalVisible(true);
  };

  const onDailyQuestsClick = () => {
    setActiveModalSection('dailyQuests');
    setModalVisible(true);
  };

  const onSwagClick = () => {
    setActiveModalSection('swag');
    setModalVisible(true);
  };

  const onCloseModal = () => {
    setModalVisible(false);
    setActiveModalSection(null);
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
          onPress={onViewAccountClick}
          style={[
            s.menuButton,
            activeModalSection === 'viewAccount' && s.menuButtonActive
          ]}
        />
        <Button 
          label={'Leader Board'}
          onPress={onLeaderBoardClick}
          style={[
            s.menuButton,
            activeModalSection === 'leaderBoard' && s.menuButtonActive
          ]}
        />
        <Button 
          label={'Daily Quests'}
          onPress={onDailyQuestsClick}
          style={[
            s.menuButton,
            activeModalSection === 'dailyQuests' && s.menuButtonActive
          ]}
        />
        <Button 
          label={'Swag'}
          onPress={onSwagClick}
          style={[
            s.menuButton,
            activeModalSection === 'swag' && s.menuButtonActive
          ]}
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
          {modalVisible ? (
            <LobbyModal
              visible={modalVisible}
              onClose={onCloseModal}
              activeSection={activeModalSection}
              setActiveSection={setActiveModalSection}
              user={user}
              playerBalance={playerBalance}
            />
          ) : (
            <GamesCarousel />
          )}
        </View>
      </View>
    </View>
  );
}