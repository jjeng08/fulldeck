import { StyleSheet } from 'react-native';

import { styleConstants as sc } from 'shared/styleConstants';

export const lobbyModalStyles = StyleSheet.create({
  modalContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: sc.size.lg,
  },
  modalText: {
    fontSize: sc.fontSizes.md,
    color: sc.colors.text,
    marginBottom: sc.size.md,
    textAlign: 'center',
  },
  timePeriodRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: sc.size.lg,
    width: '100%',
    paddingHorizontal: sc.size.md,
  },
  timePeriodButton: {
    backgroundColor: '#8B4513',
    paddingVertical: sc.size.sm,
    paddingHorizontal: sc.size.md,
    borderRadius: sc.borderRadius.base,
    minWidth: 70,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: sc.colors.gold,
    marginHorizontal: sc.size.xs,
  },
  timePeriodButtonActive: {
    borderColor: '#FF8C00',
    borderWidth: 3,
  },
  timePeriodButtonText: {
    color: sc.colors.text,
    fontSize: sc.fontSizes.xs,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});