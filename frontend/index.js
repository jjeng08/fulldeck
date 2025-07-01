import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import AppSimple from './AppSimple';
import { name as appName } from './package.json';

// Switch back to main app
AppRegistry.registerComponent(appName, () => App);
AppRegistry.runApplication(appName, {
  initialProps: {},
  rootTag: document.getElementById('root') || document.getElementById('main')
});