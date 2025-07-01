import { StyleSheet } from 'react-native';

import { styleConstants as sc } from 'shared/styleConstants';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f5132',
    alignItems: 'center',
    justifyContent: 'center',
    padding: sc.size.lg,
  },
  title: {
    fontSize: sc.fontSizes['4xl'],
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: sc.fontSizes.lg,
    marginBottom: 20,
  },
  messageArea: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    width: '100%',
    minHeight: 100,
  },
  message: {
    color: '#4ade80',
    fontSize: sc.fontSizes.xs,
    marginBottom: 5,
    fontFamily: 'monospace',
  },
  gameArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  label: {
    fontSize: sc.fontSizes.lg,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  hand: {
    backgroundColor: '#1a5c3a',
    borderRadius: 10,
    padding: sc.size.lg,
    marginBottom: 30,
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    color: '#888',
    fontStyle: 'italic',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
});