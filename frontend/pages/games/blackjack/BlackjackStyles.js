import { StyleSheet } from 'react-native';

import { styleConstants as sc } from 'shared/styleConstants';

export const tableStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: sc.colors.green,
    justifyContent: 'space-between'
  },
  tableHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: sc.screen.isSmall ? 'column' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: sc.size.lg,
    paddingVertical: sc.size.md,
    backgroundColor: sc.colors.greenDark,
    borderBottomWidth: 1,
    borderBottomColor: sc.colors.gray400,
    zIndex: 100
  },
  tableId: {
    fontSize: sc.fontSizes.lg,
    fontWeight: 'bold',
    color: sc.colors.text
  },
  tableBetLevel: {
    fontSize: sc.fontSizes.base,
    color: sc.colors.success,
    fontWeight: '500'
  },
  userBalance: {
    fontSize: sc.fontSizes['5xl'],
    color: sc.colors.success,
    fontWeight: '600',
    paddingBottom: sc.size.lg
  },
  dealerArea: {
    alignItems: 'center',
    paddingVertical: sc.size['2xl'],
    backgroundColor: sc.colors.greenDark,
    borderBottomWidth: 1,
    borderBottomColor: sc.colors.surface,
    paddingTop: sc.size.xl
  },
  dealerLabel: {
    fontSize: sc.fontSizes.xl,
    fontWeight: 'bold',
    color: sc.colors.text,
    paddingBottom: sc.size.md
  },
  dealerCards: {
    minHeight: sc.size['4xl'] * 2,
    backgroundColor: sc.colors.green,
    borderRadius: sc.borderRadius.base,
    padding: sc.size.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: sc.colors.surface,
    minWidth: 150
  },
  cardCount: {
    fontSize: sc.fontSizes.lg,
    color: sc.colors.success,
    fontWeight: 'bold'
  },
  placeholder: {
    fontSize: sc.fontSizes.base,
    color: sc.colors.textSecondary,
    fontStyle: 'italic'
  },
  tableSeating: {
    paddingHorizontal: sc.size.lg,
    paddingVertical: sc.size.base,
    maxHeight: sc.size['4xl'] * 3
  },
  playerSeat: {
    backgroundColor: sc.colors.surface,
    borderRadius: sc.borderRadius.base,
    padding: sc.size.md,
    paddingBottom: sc.size.base,
    borderWidth: 1,
    borderColor: sc.colors.gray400,
    alignItems: 'center'
  },
  currentPlayerSeat: {
    backgroundColor: sc.colors.greenLight,
    borderRadius: sc.borderRadius.base,
    padding: sc.size.md,
    paddingTop: sc.size.base,
    borderWidth: 2,
    borderColor: sc.colors.success,
    alignItems: 'center'
  },
  playerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: sc.colors.text
  },
  playerBalance: {
    fontSize: 14,
    color: sc.colors.text,
    paddingTop: 5
  },
  playerStatus: {
    fontSize: 12,
    color: sc.colors.text,
    paddingTop: 3,
    textTransform: 'capitalize'
  },
  playerBet: {
    fontSize: 12,
    color: sc.colors.text,
    paddingTop: 3,
    fontWeight: 'bold'
  },
  currentPlayerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: sc.colors.text
  },
  currentPlayerStatus: {
    fontSize: 14,
    color: sc.colors.text,
    paddingTop: 5,
    textTransform: 'capitalize'
  },
  currentPlayerBet: {
    fontSize: 14,
    color: sc.colors.text,
    paddingTop: 5,
    fontWeight: 'bold'
  },
  controls: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#134e2a',
    borderTopWidth: 1,
    borderTopColor: '#2d7a4d'
  },
  observerMessage: {
    fontSize: 16,
    color: sc.colors.text,
    fontStyle: 'italic'
  },
  waitingMessage: {
    fontSize: 16,
    color: sc.colors.text,
    fontStyle: 'italic'
  },
  gameStatus: {
    fontSize: 16,
    color: sc.colors.text,
    textTransform: 'capitalize'
  },
  bettingArea: {
    alignItems: 'center',
    width: '100%'
  },
  currentBetLabel: {
    fontSize: 22,
    color: sc.colors.text,
    fontWeight: 'bold',
    paddingBottom: 10
  },
  bettingTimer: {
    fontSize: 16,
    color: sc.colors.text,
    fontWeight: 'bold',
    paddingBottom: 20
  },
  betButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingBottom: 20
  },
  betGroup: {
    alignItems: 'center'
  },
  betButton: {
    backgroundColor: '#28a745',
    minWidth: 80,
    paddingBottom: 5
  },
  betButtonMinus: {
    backgroundColor: '#dc3545',
    minWidth: 80
  },
  placeBetButton: {
    backgroundColor: '#ffc107',
    minWidth: 150,
    paddingVertical: 15
  },
  disabled: {
    backgroundColor: '#6c757d',
    opacity: 0.6
  },
  actionButton: {
    backgroundColor: '#dc3545',
    minWidth: 100,
    marginHorizontal: 10
  },
  bottomArea: {
    backgroundColor: '#0A3B26', // Darker green for betting area
    borderTopWidth: 2,
    borderTopColor: '#1A5C3A',
    paddingTop: 15,
    paddingBottom: 10,
    paddingHorizontal: 20
  },
  leaveButton: {
    backgroundColor: '#6c757d',
    minWidth: 100,
    paddingVertical: 8,
    paddingHorizontal: 15
  },
  betLimitsContainer: {
    alignItems: 'center',
    flex: 1
  },
  spacer: {
    width: 100
  },
  messagePillRow: {
    position: 'absolute',
    top: sc.components.headerHeight,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    zIndex: 1000
  },
  timerCirclePosition: {
    position: 'absolute',
    top: sc.components.headerHeight,
    right: sc.size.lg,
    alignItems: 'center',
    zIndex: 1000
  },
  timerCircle: {
    width: sc.components.timerSize,
    height: sc.components.timerSize,
    borderRadius: sc.components.timerSize / 2,
    backgroundColor: sc.colors.warningAlpha10,
    alignItems: 'center',
    justifyContent: 'center',
    ...sc.shadows.base
  },
  timerText: {
    color: sc.colors.text,
    fontSize: sc.fontSizes.lg,
    fontWeight: 'bold'
  },
  messagePill: {
    backgroundColor: sc.colors.successAlpha10,
    borderRadius: sc.borderRadius.xl,
    paddingVertical: sc.size.base,
    paddingHorizontal: sc.size.lg,
    ...sc.shadows.base
  },
  messageText: {
    color: sc.colors.text,
    fontSize: sc.fontSizes.lg,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  otherPlayersContainer: {
    backgroundColor: '#1a5c3a',
    borderRadius: 8,
    padding: 10,
    paddingTop: 10,
    alignItems: 'center'
  },
  otherPlayersLabel: {
    fontSize: 14,
    color: sc.colors.text,
    fontWeight: '500'
  },
  playerCardsContainer: {
    backgroundColor: sc.colors.surface,
    borderRadius: sc.borderRadius.base,
    padding: sc.size.md,
    paddingBottom: sc.size.lg,
    alignItems: 'center',
  },
  playerCardsLabel: {
    fontSize: sc.fontSizes.lg,
    fontWeight: 'bold',
    color: sc.colors.text,
    paddingBottom: sc.size.sm,
  },
  handValue: {
    fontSize: sc.fontSizes.base,
    color: sc.colors.gold,
    fontWeight: 'bold',
    paddingTop: sc.size.xs,
  }
});