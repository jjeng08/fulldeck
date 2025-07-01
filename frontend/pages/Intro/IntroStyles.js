import { StyleSheet } from 'react-native';

import { styleConstants as sc } from 'shared/styleConstants';

export const introStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: sc.colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    padding: sc.size.md,
  },
  logo: {
    height: '40%',
    maxWidth: '80%',
    marginBottom: sc.size.base,
  },
  subtitle: {
    fontSize: sc.fontSizes.lg,
    color: sc.colors.textSecondary,
    marginBottom: sc.size['3xl'],
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 400,
    gap: sc.size.lg,
  },
  loginButton: {
    backgroundColor: sc.colors.green,
  },
  registerButton: {
    backgroundColor: sc.colors.gray600,
  },
  connectionStatus: {
    position: 'absolute',
    top: sc.size['4xl'],
    right: sc.size.lg,
    paddingHorizontal: sc.size.md,
    paddingVertical: sc.size.xs,
    borderRadius: sc.borderRadius.xl,
    backgroundColor: sc.colors.overlay,
  },
  connectionText: {
    fontSize: sc.fontSizes.xs,
    fontWeight: 'bold',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: sc.colors.surface,
    padding: sc.size.md,
    borderRadius: sc.borderRadius.md,
    gap: sc.size.base,
  },
  formTitle: {
    fontSize: sc.fontSizes['3xl'],
    fontWeight: 'bold',
    color: sc.colors.text,
    textAlign: 'center',
    marginBottom: sc.size.md,
  },
  formButtons: {
    flexDirection: 'row',
    gap: sc.size.md,
    marginTop: sc.size.base,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: sc.colors.gray600,
  },
  submitButton: {
    flex: 1,
    backgroundColor: sc.colors.green,
  },
  errorText: {
    color: sc.colors.danger,
    fontSize: sc.fontSizes.sm,
    textAlign: 'center',
    marginTop: sc.size.xs,
    backgroundColor: sc.colors.dangerAlpha10,
    padding: sc.size.sm,
    borderRadius: sc.borderRadius.sm,
  },
});