import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { lobbyModalStyles as s } from './LobbyModalStyles';
import { text as t } from 'core/text';
import { formatCurrency } from '../../shared/utils';
import Button from '../../components/Button';
import Modal from '../../components/Modal';

export default function LobbyModal({ visible, onClose, activeSection, setActiveSection, user, playerBalance }) {
  const [activeTimePeriod, setActiveTimePeriod] = useState('thisWeek');

  const timePeriods = [
    { id: 'thisWeek', label: 'This Week' },
    { id: 'thisMonth', label: 'This Month' },
    { id: 'thisYear', label: 'This Year' },
    { id: 'allTime', label: 'All Time' }
  ];
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
            
            <Text style={s.modalText}>Showing {timePeriods.find(p => p.id === activeTimePeriod)?.label} leaders</Text>
            <Text style={s.modalText}>Coming soon...</Text>
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