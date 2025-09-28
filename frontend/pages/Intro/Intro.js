import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';

import { useApp } from 'systems/AppContext';
import WebSocketService from 'systems/websocket';
import { introStyles as s } from './IntroStyles';
import { text as t } from 'core/text';
import AdminModal from 'pages/AdminModal/AdminModal';
import Button from 'components/Button';
import TextInput from 'components/TextInput';
import Toast from 'components/Toast';

export default function IntroPage() {
  const navigation = useNavigation();
  const { connected, hideToast, addLoadingAction, toast, user } = useApp();
  
  // Form state
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loginData, setLoginData] = useState({
    username: '',
    password: ''
  });
  const [registerData, setRegisterData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });

  // Admin modal state
  // TODO: RESTORE AFTER DEV
  const [showAdminModal, setShowAdminModal] = useState(true);
  const [clickCount, setClickCount] = useState(0);
  const [clickTimer, setClickTimer] = useState(null);

  useEffect(() => {
    // Navigate to blackjack when user successfully logs in
    if (user) {
      // Clear form data before navigation
      setShowLoginForm(false);
      setShowRegisterForm(false);
      setErrorMessage('');
      setLoginData({ username: '', password: '' });
      setRegisterData({ username: '', password: '', confirmPassword: '' });
      // TODO: REMOVE AFTER TESTING
      // navigation.navigate('Lobby')
      navigation.navigate('Blackjack', {
        selectedTier: 0,
        tiers: [[100, 200, 500]],
        maxMulti: 5
      });
    }
  }, [user, navigation]);

  const onAdminTrigger = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);

    if (clickTimer) {
      clearTimeout(clickTimer);
    }

    if (newCount >= 3) {
      setShowAdminModal(true);
      setClickCount(0);
      setClickTimer(null);
    } else {
      const timer = setTimeout(() => {
        setClickCount(0);
        setClickTimer(null);
      }, 3000);
      setClickTimer(timer);
    }
  };

  const onCloseAdminModal = () => {
    setShowAdminModal(false);
  };

  const onShowLoginForm = () => {
    setShowLoginForm(true);
    setShowRegisterForm(false);
    setErrorMessage('');
    // Clear both forms when switching
    setLoginData({ username: '', password: '' });
    setRegisterData({ username: '', password: '', confirmPassword: '' });
  };

  const onShowRegisterForm = () => {
    setShowRegisterForm(true);
    setShowLoginForm(false);
    setErrorMessage('');
    // Clear both forms when switching
    setLoginData({ username: '', password: '' });
    setRegisterData({ username: '', password: '', confirmPassword: '' });
  };

  const onCancelForm = () => {
    setShowLoginForm(false);
    setShowRegisterForm(false);
    setErrorMessage('');
    setLoginData({ username: '', password: '' });
    setRegisterData({ username: '', password: '', confirmPassword: '' });
  };

  const onLoginDataChange = (field, value) => {
    setLoginData({ ...loginData, [field]: value });
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const onRegisterDataChange = (field, value) => {
    setRegisterData({ ...registerData, [field]: value });
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const onLoginSubmit = () => {
    if (loginData.username && loginData.password) {
      // Store navigation reference for auto-redirect after login
      global.navigation = navigation;
      addLoadingAction('login');
      WebSocketService.sendMessage('login', { 
        username: loginData.username, 
        password: loginData.password 
      });
    } else {
      setErrorMessage(t.enterUsernameAndPassword);
    }
  };

  const onRegisterSubmit = () => {
    if (registerData.username && registerData.password && registerData.confirmPassword) {
      if (registerData.password === registerData.confirmPassword) {
        // Store navigation reference for auto-redirect after registration
        global.navigation = navigation;
        addLoadingAction('register');
        WebSocketService.sendMessage('register', { 
          username: registerData.username, 
          password: registerData.password 
        });
      } else {
        setErrorMessage(t.passwordMismatch);
      }
    } else {
      setErrorMessage(t.enterAllFields);
    }
  };


  return (
    <View style={s.container}>
      <View style={s.connectionStatus}>
        <Text style={[
          s.connectionText, 
          { color: connected ? '#4ade80' : '#ef4444' }
        ]}>
          {connected ? `● ${t.connected}` : `● ${t.disconnected}`}
        </Text>
      </View>

      <Image source={require('../../assets/logo-fulldeck.png')} style={s.logo} resizeMode="contain" />
      <Text style={s.subtitle}>{t.welcome}</Text>

      {!showLoginForm && !showRegisterForm && (
        <View style={s.buttonContainer}>
          <Button 
            label={t.logIn}
            onPress={onShowLoginForm}
            style={s.loginButton}
          />
          <Button 
            label={t.register}
            onPress={onShowRegisterForm}
            style={s.registerButton}
          />
        </View>
      )}

      {showLoginForm && (
        <View style={s.formContainer}>
          <Text style={s.formTitle}>{t.login}</Text>
          <form style={{ display: 'contents' }}>
            <TextInput
              placeholder={t.enterUsername}
              value={loginData.username}
              onChangeText={(text) => onLoginDataChange('username', text)}
            />
            <TextInput
              placeholder={t.enterPassword}
              value={loginData.password}
              onChangeText={(text) => onLoginDataChange('password', text)}
              secureTextEntry
            />
          </form>
          {errorMessage ? <Text style={s.errorText}>{errorMessage}</Text> : null}
          <View style={s.formButtons}>
            <Button 
              label={t.cancel}
              onPress={onCancelForm}
              style={s.cancelButton}
            />
            <Button 
              label={t.submit}
              onPress={onLoginSubmit}
              style={s.submitButton}
              submit
              messageType="login"
            />
          </View>
        </View>
      )}

      {showRegisterForm && (
        <View style={s.formContainer}>
          <Text style={s.formTitle}>{t.register}</Text>
          <form style={{ display: 'contents' }}>
            <TextInput
              placeholder={t.enterUsername}
              value={registerData.username}
              onChangeText={(text) => onRegisterDataChange('username', text)}
            />
            <TextInput
              placeholder={t.enterPassword}
              value={registerData.password}
              onChangeText={(text) => onRegisterDataChange('password', text)}
              secureTextEntry
            />
            <TextInput
              placeholder={t.confirmYourPassword}
              value={registerData.confirmPassword}
              onChangeText={(text) => onRegisterDataChange('confirmPassword', text)}
              secureTextEntry
            />
          </form>
          {errorMessage ? <Text style={s.errorText}>{errorMessage}</Text> : null}
          <View style={s.formButtons}>
            <Button 
              label={t.cancel}
              onPress={onCancelForm}
              style={s.cancelButton}
            />
            <Button 
              label={t.submit}
              onPress={onRegisterSubmit}
              style={s.submitButton}
              submit
              messageType="register"
            />
          </View>
        </View>
      )}
      
      <Toast 
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={hideToast}
      />
      
      <Pressable 
        style={s.adminTrigger}
        onPress={onAdminTrigger}
        testID="adminTrigger"
      />
      
      <AdminModal 
        visible={showAdminModal}
        onClose={onCloseAdminModal}
      />
      
      <StatusBar style='auto' />
    </View>
  );
}