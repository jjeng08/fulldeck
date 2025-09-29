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
  leaderboardContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: sc.size.lg,
  },
  leaderboardTitle: {
    fontSize: sc.fontSizes.lg,
    fontWeight: 'bold',
    color: sc.colors.gold,
    textAlign: 'center',
    marginBottom: sc.size.md,
  },
  leaderboardList: {
    width: '100%',
    backgroundColor: sc.colors.overlayOnRed,
    borderRadius: sc.borderRadius.md,
    padding: sc.size.md,
    borderWidth: 1,
    borderColor: sc.colors.gold,
  },
  leaderboardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: sc.size.sm,
    paddingHorizontal: sc.size.md,
    marginBottom: sc.size.xs,
    backgroundColor: sc.colors.green,
    borderRadius: sc.borderRadius.sm,
  },
  rankText: {
    fontSize: sc.fontSizes.md,
    fontWeight: 'bold',
    color: sc.colors.gold,
    minWidth: 40,
  },
  usernameText: {
    fontSize: sc.fontSizes.md,
    color: sc.colors.text,
    flex: 1,
    textAlign: 'center',
  },
  winningsText: {
    fontSize: sc.fontSizes.md,
    fontWeight: 'bold',
    color: sc.colors.success,
    minWidth: 80,
    textAlign: 'right',
  },
  lastUpdatedText: {
    fontSize: sc.fontSizes.xs,
    color: sc.colors.textSecondary,
    textAlign: 'center',
    marginTop: sc.size.md,
  },
});