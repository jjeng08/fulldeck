import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { adminModalStyles as s } from './AdminModalStyles';
import { text as t } from 'core/text';
import { useUtils } from 'systems/UtilsContext';
import Button from 'components/Button';
import Input from 'components/Input';

export default function AdminModal({ visible, onClose }) {
  const { callAPI } = useUtils();
  const [activeSection, setActiveSection] = useState('buyCredits');
  const [searchValue, setSearchValue] = useState('');
  const [playerData, setPlayerData] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [creditAmount, setCreditAmount] = useState(0);

  if (!visible) return null;

  const sections = [
    { id: 'gameReport', label: 'Game Report' },
    { id: 'leaderBoard', label: 'Leader Board' },
    { id: 'playerActivity', label: 'Player Activity' },
    { id: 'buyCredits', label: 'Buy Credits' }
  ];

  const onSearch = async () => {
    if (!searchValue.trim()) {
      setSearchError('Please enter a username');
      return;
    }

    setSearchError('');
    setPlayerData(null);

    callAPI(
      'getPlayerByUsername',
      handleSearchResponse,
      { username: searchValue },
      { token: 'exterminatus' }
    );
  };

  const handleSearchResponse = (response) => {
    if (response.status !== 200) {
      setSearchError(response.errorMessage);
      return;
    }

    setPlayerData(response.data.player);
  };

  const onCreditAmountClick = (amount) => {
    setCreditAmount(prev => prev + amount);
  };

  const onCreditSubmit = () => {
    if (!playerData || creditAmount <= 0) return;

    callAPI(
      'creditAccount',
      handleCreditResponse,
      { 
        playerId: playerData.id,
        amount: creditAmount * 100
      },
      { token: 'exterminatus' }
    );
  };

  const handleCreditResponse = (response) => {
    if (response.status === 200) {
      setCreditAmount(0);
      setPlayerData(prev => ({
        ...prev,
        balance: response.data.newBalance
      }));
    }
  };

  const onClearPlayer = () => {
    setPlayerData(null);
    setCreditAmount(0);
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'buyCredits':
        return (
          <>
            <View style={s.searchRow}>
              <Input
                label="Search User"
                placeholder="Enter username"
                value={searchValue}
                onChangeText={setSearchValue}
                style={s.searchInputContainer}
                classes={s.searchInputCustom}
              />
              <Button
                label="Search"
                onPress={onSearch}
                style={s.searchButton}
              />
            </View>
            {searchError && (
              <Text style={s.errorText}>{searchError}</Text>
            )}
            {playerData && (
              <>
                <View style={s.playerDataContainer}>
                  <Text style={s.playerDataTitle}>Player Information</Text>
                  <View style={s.playerDataRow}>
                    <Text style={s.playerDataLabel}>ID:</Text>
                    <Text style={s.playerDataValue}>{playerData.id}</Text>
                  </View>
                  <View style={s.playerDataRow}>
                    <Text style={s.playerDataLabel}>Username:</Text>
                    <Text style={s.playerDataValue}>{playerData.username}</Text>
                  </View>
                  <View style={s.playerDataRow}>
                    <Text style={s.playerDataLabel}>Balance:</Text>
                    <Text style={s.playerDataValue}>${(playerData.balance / 100).toLocaleString()}</Text>
                  </View>
                  <View style={s.playerDataRow}>
                    <Text style={s.playerDataLabel}>Winnings:</Text>
                    <Text style={s.playerDataValue}>${(playerData.winnings / 100).toLocaleString()}</Text>
                  </View>
                  <View style={s.playerDataRow}>
                    <Text style={s.playerDataLabel}>Last Seen:</Text>
                    <Text style={s.playerDataValue}>{new Date(playerData.lastSeen).toLocaleString()}</Text>
                  </View>
                </View>
                
                <Button
                  label="Clear Player"
                  onPress={onClearPlayer}
                  style={s.clearPlayerButton}
                />
                
                <View style={s.creditContainer}>
                  <Text style={s.creditTitle}>Credit Amount: ${creditAmount}</Text>
                  
                  <View style={s.creditButtonsGrid}>
                    <View style={s.creditButtonsRow}>
                      <Button
                        label="$10"
                        onPress={() => onCreditAmountClick(10)}
                        style={s.creditAmountButton}
                      />
                      <Button
                        label="$20"
                        onPress={() => onCreditAmountClick(20)}
                        style={s.creditAmountButton}
                      />
                      <Button
                        label="$30"
                        onPress={() => onCreditAmountClick(30)}
                        style={s.creditAmountButton}
                      />
                    </View>
                    <View style={s.creditButtonsRow}>
                      <Button
                        label="$50"
                        onPress={() => onCreditAmountClick(50)}
                        style={s.creditAmountButton}
                      />
                      <Button
                        label="$100"
                        onPress={() => onCreditAmountClick(100)}
                        style={s.creditAmountButton}
                      />
                      <Button
                        label="$200"
                        onPress={() => onCreditAmountClick(200)}
                        style={s.creditAmountButton}
                      />
                    </View>
                  </View>
                  
                  <Button
                    label="Submit Credit"
                    onPress={onCreditSubmit}
                    style={[
                      s.creditSubmitButton,
                      (!playerData || creditAmount <= 0) && s.creditSubmitButtonDisabled
                    ]}
                    disabled={!playerData || creditAmount <= 0}
                  />
                </View>
              </>
            )}
          </>
        );
      case 'playerActivity':
        return null;
      case 'leaderBoard':
        return null;
      case 'gameReport':
        return null;
      default:
        return null;
    }
  };

  return (
    <View style={s.overlay}>
      <View style={s.container}>
        <View style={s.content}>
          <View style={s.navRow}>
            {sections.map((section) => (
              <Button
                key={section.id}
                label={section.label}
                onPress={() => setActiveSection(section.id)}
                style={[
                  s.navButton,
                  activeSection === section.id && s.navButtonSelected
                ]}
                textStyle={s.navButtonText}
              />
            ))}
          </View>
          
          <View style={s.contentArea}>
            <View style={s.sectionContent}>
              {renderSectionContent()}
            </View>
          </View>
        </View>
        
        <View style={s.footer}>
          <Button 
            label={t.close}
            onPress={onClose}
            style={s.closeButton}
          />
        </View>
      </View>
    </View>
  );
}