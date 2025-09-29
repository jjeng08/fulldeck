import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { lobbyModalStyles as s } from './LobbyModalStyles';
import { text as t } from 'core/text';
import { formatCurrency } from '../../shared/utils';
import { useApp } from '../../systems/AppContext';
import Button from '../../components/Button';
import Modal from '../../components/Modal';

export default function LobbyModal({ visible, onClose, activeSection, setActiveSection, user, playerBalance }) {
  const { leaderboards, sendMessage } = useApp();
  const [activeTimePeriod, setActiveTimePeriod] = useState('today');

  const timePeriods = [
    { id: 'today', label: 'Today' },
    { id: 'thisWeek', label: 'This Week' },
    { id: 'thisMonth', label: 'This Month' },
    { id: 'thisYear', label: 'This Year' },
    { id: 'allTime', label: 'All Time' }
  ];

  // Request leaderboard data when modal opens and shows leaderboard section
  React.useEffect(() => {
    if (visible && activeSection === 'leaderBoard' && !leaderboards) {
      sendMessage('leaderboards');
    }
  }, [visible, activeSection, leaderboards, sendMessage]);
  const modalSections = [
    { id: 'viewAccount', label: t.viewAccount },
    { id: 'leaderBoard', label: 'Leader Board' },
    { id: 'dailyQuests', label: 'Daily Quests' },
    { id: 'swag', label: 'Swag' }
  ];

  const renderModalContent = () => {
    switch (activeSection) {
      case 'viewAccount':
        return (
          <View style={s.modalContent}>
            <Text style={s.modalText}>Account Details</Text>
            <Text style={s.modalText}>Username: {user?.username}</Text>
            <Text style={s.modalText}>Balance: {formatCurrency(playerBalance)}</Text>
          </View>
        );
      case 'leaderBoard':
        return (
          <View style={s.modalContent}>
            <Text style={s.modalText}>Leader Board</Text>
            
            <View style={s.timePeriodRow}>
              {timePeriods.map((period) => (
                <Button
                  key={period.id}
                  label={period.label}
                  onPress={() => setActiveTimePeriod(period.id)}
                  style={[
                    s.timePeriodButton,
                    activeTimePeriod === period.id && s.timePeriodButtonActive
                  ]}
                  textStyle={s.timePeriodButtonText}
                />
              ))}
            </View>
            
            {leaderboards ? (
              <View style={s.leaderboardContainer}>
                <Text style={s.leaderboardTitle}>
                  {timePeriods.find(p => p.id === activeTimePeriod)?.label} Leaders
                </Text>
                {leaderboards.leaderboards[activeTimePeriod]?.length > 0 ? (
                  <View style={s.leaderboardList}>
                    {leaderboards.leaderboards[activeTimePeriod].map((player, index) => (
                      <View key={`${player.username}-${index}`} style={s.leaderboardItem}>
                        <Text style={s.rankText}>#{index + 1}</Text>
                        <Text style={s.usernameText}>{player.username}</Text>
                        <Text style={s.winningsText}>{player.winnings}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={s.modalText}>No winners yet for this period</Text>
                )}
                <Text style={s.lastUpdatedText}>
                  Last updated: {new Date(leaderboards.lastUpdated).toLocaleTimeString()}
                </Text>
              </View>
            ) : (
              <Text style={s.modalText}>Loading leaderboard data...</Text>
            )}
          </View>
        );
      case 'dailyQuests':
        return (
          <View style={s.modalContent}>
            <Text style={s.modalText}>Daily Quests</Text>
            <Text style={s.modalText}>Complete daily challenges to earn rewards!</Text>
          </View>
        );
      case 'swag':
        return (
          <View style={s.modalContent}>
            <Text style={s.modalText}>Swag Shop</Text>
            <Text style={s.modalText}>Redeem your points for cool items!</Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      sections={modalSections}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
      {renderModalContent()}
    </Modal>
  );
}