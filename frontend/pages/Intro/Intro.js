import { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';

import { useApp } from 'systems/AppContext';
import { introStyles as s } from './IntroStyles';
import { text as t } from 'shared/text';
import Button from 'components/Button';
import TextInput from 'components/TextInput';
import Toast from 'components/Toast';
import logger from 'shared/logger';

export default function IntroPage() {
  const navigation = useNavigation();
  const { connected, hideToast, isAuthenticated, isLoadingAuth, sendMessage, setAuthenticatedUser, showToast, toast } = useApp();
  
  // Form state
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [loginData, setLoginData] = useState({
    username: '',
    password: ''
  });
  const [registerData, setRegisterData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    // Navigate to lobby when user successfully logs in
    if (isAuthenticated) {
      // Clear form data before navigation
      setShowLoginForm(false);
      setShowRegisterForm(false);
      setFormError('');
      setLoginData({ username: '', password: '' });
      setRegisterData({ username: '', password: '', confirmPassword: '' });
      navigation.navigate('Lobby');
    }
  }, [isAuthenticated, navigation]);


  const onShowLoginForm = () => {
    setShowLoginForm(true);
    setShowRegisterForm(false);
    setFormError('');
    // Clear both forms when switching
    setLoginData({ username: '', password: '' });
    setRegisterData({ username: '', password: '', confirmPassword: '' });
  };

  const onShowRegisterForm = () => {
    setShowRegisterForm(true);
    setShowLoginForm(false);
    setFormError('');
    // Clear both forms when switching
    setLoginData({ username: '', password: '' });
    setRegisterData({ username: '', password: '', confirmPassword: '' });
  };

  const onCancelForm = () => {
    setShowLoginForm(false);
    setShowRegisterForm(false);
    setLoginData({ username: '', password: '' });
    setRegisterData({ username: '', password: '', confirmPassword: '' });
  };

  const onLoginDataChange = (field, value) => {
    setLoginData({ ...loginData, [field]: value });
    if (formError && formError.length > 0) {
      setFormError('');
    }
  };

  const onRegisterDataChange = (field, value) => {
    setRegisterData({ ...registerData, [field]: value });
    if (formError) {
      setFormError('');
    }
  };

  const onLoginSubmit = () => {
    if (loginData.username && loginData.password) {
      sendMessage('login', {
        username: loginData.username,
        password: loginData.password
      });
    }
  };

  const onRegisterSubmit = () => {
    if (registerData.username && registerData.password && registerData.confirmPassword) {
      if (registerData.password === registerData.confirmPassword) {
        sendMessage('register', {
          username: registerData.username,
          password: registerData.password
        });
      } else {
        setFormError(t.passwordMismatch);
      }
    }
  };

  // Show loading while checking saved auth
  if (isLoadingAuth) {
    return (
      <View style={s.container}>
        <Image source={require('../../assets/logo-fulldeck.png')} style={s.logo} resizeMode="contain" />
        <Text style={s.subtitle}>Loading...</Text>
      </View>
    );
  }

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
          {formError ? <Text style={s.errorText}>{formError}</Text> : null}
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
            />
          </View>
        </View>
      )}

      {showRegisterForm && (
        <View style={s.formContainer}>
          <Text style={s.formTitle}>{t.register}</Text>
          <form>
            <TextInput
              placeholder={t.enterUsername}
              value={registerData.username}
              onChangeText={(text) => onRegisterDataChange('username', text)}
            />
            <TextInput
              style={s.formInput}
              placeholder={t.enterPassword}
              value={registerData.password}
              onChangeText={(text) => onRegisterDataChange('password', text)}
              secureTextEntry
            />
            <TextInput
              style={s.formInput}
              placeholder={t.confirmYourPassword}
              value={registerData.confirmPassword}
              onChangeText={(text) => onRegisterDataChange('confirmPassword', text)}
              secureTextEntry
            />
          </form>
          {formError ? <Text style={s.errorText}>{formError}</Text> : null}
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
      
      <StatusBar style='auto' />
    </View>
  );
}