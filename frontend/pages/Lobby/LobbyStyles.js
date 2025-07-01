import { StyleSheet } from 'react-native';

import { styleConstants as sc } from 'shared/styleConstants';

export const lobbyStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: sc.colors.red,
    flexDirection: sc.screen.isSmall ? 'column' : 'row',
  },
  leftMenu: {
    width: sc.components.sidebarWidth,
    height: sc.screen.isSmall ? 'auto' : '100%',
    backgroundColor: sc.colors.overlay,
    borderRightWidth: sc.screen.isSmall ? 0 : 2,
    borderBottomWidth: sc.screen.isSmall ? 2 : 0,
    borderRightColor: sc.colors.gold,
    borderBottomColor: sc.colors.gold,
    paddingLeft: sc.size.sm,
    paddingRight: sc.size.sm
  },
  menuTitle: {
    fontSize: sc.fontSizes.lg,
    fontWeight: 'bold',
    color: sc.colors.gold,
    marginBottom: sc.size.lg,
    textAlign: 'center',
  },
  menuButton: {
    backgroundColor: '#8B4513', // Wood-tone brown (saddle brown)
    borderWidth: 2,
    borderColor: sc.colors.gold,
    marginBottom: sc.size.md,
    paddingVertical: sc.size.base,
  },
  centerContent: {
    flex: 1,
  },
  topBar: {
    flexDirection: sc.screen.isSmall ? 'column' : 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  header: {
    alignItems: 'center',
    flex: 1,
  },
  welcomeText: {
    fontSize: sc.fontSizes.lg,
    fontWeight: 'bold',
    color: sc.colors.text,
    textAlign: 'center',
  },
  balanceText: {
    fontSize: sc.fontSizes.lg,
    color: sc.colors.gold,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  logoutButton: {
    backgroundColor: sc.colors.warning,
    minWidth: Math.max(60, sc.size['4xl'] * 2),
    paddingHorizontal: sc.size.md,
    paddingVertical: sc.size.sm,
    position: 'absolute',
    right: 10,
    top: 10
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: sc.fontSizes['5xl'],
    fontWeight: 'bold',
    color: sc.colors.text,
    marginBottom: sc.size['2xl'],
    textAlign: 'center',
  },
});