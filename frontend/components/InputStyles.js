import { StyleSheet } from 'react-native';

import { styleConstants as sc } from 'shared/styleConstants';

export const inputStyles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    width: '100%',
    fontSize: sc.fontSizes.md,
    fontWeight: 'bold',
    color: sc.colors.text,
    marginBottom: sc.size.sm,
    textAlign: 'left',
  },
  input: {
    marginBottom: 0,
  },
});