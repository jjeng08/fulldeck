import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// Screen breakpoints
const screenBreakpoints = {
  small: 768,
  medium: 1024,
  large: 1440,
};

const isSmallScreen = width < screenBreakpoints.small;
const isMediumScreen = width >= screenBreakpoints.small && width < screenBreakpoints.medium;
const isLargeScreen = width >= screenBreakpoints.large;

// Base spacing unit
const baseSpacing = 8;

// Shadow helper
const createShadow = (offset, blur, opacity = 0.25, color = '#000') => ({
  boxShadow: `0 ${offset}px ${blur}px rgba(0, 0, 0, ${opacity})`,
  elevation: Math.max(1, offset * 2),
});

// Single styleConstants object export
export const styleConstants = {
  // Screen information
  screen: {
    width,
    height,
    isSmall: isSmallScreen,
    isMedium: isMediumScreen,
    isLarge: isLargeScreen,
  },
  
  // Colors
  colors: {
    // Base Colors
    white: '#fff',
    black: '#000',
    
    // Grays
    gray100: '#f8f9fa',
    gray200: '#e9ecef', 
    gray300: '#dee2e6',
    gray400: '#ced4da',
    gray500: '#adb5bd',
    gray600: '#6c757d',
    gray700: '#495057',
    gray800: '#343a40',
    gray900: '#212529',
    
    // Casino Theme
    green: '#0B4D2F',
    greenDark: '#0A3B26',
    greenLight: '#134e2a',
    red: '#8B2635',
    gold: '#FFD700',
    
    // Semantic Colors
    primary: '#28a745',
    secondary: '#17a2b8', 
    success: '#4ade80',
    warning: '#ffc107',
    danger: '#dc3545',
    info: '#17a2b8',
    
    // Surface Colors
    surface: '#2A2A2A',
    surfaceActive: '#333',
    background: '#121212',
    overlay: 'rgba(0, 0, 0, 0.7)',
    
    // Text Colors
    text: '#ffffff',
    textSecondary: '#cccccc',
    textMuted: '#888888',
    textInverted: '#000000',
    
    // Alpha variants
    successAlpha10: 'rgba(74, 222, 128, 0.1)',
    dangerAlpha10: 'rgba(220, 53, 69, 0.1)', 
    warningAlpha10: 'rgba(255, 193, 7, 0.1)',
    infoAlpha10: 'rgba(23, 162, 184, 0.1)',
  },
  
  // Typography
  fontSizes: {
    xs: isSmallScreen ? 10 : 12,
    sm: isSmallScreen ? 12 : 14,
    base: isSmallScreen ? 14 : 16,
    lg: isSmallScreen ? 16 : 18,
    xl: isSmallScreen ? 18 : 20,
    '2xl': isSmallScreen ? 20 : 24,
    '3xl': isSmallScreen ? 24 : 30,
    '4xl': isSmallScreen ? 30 : 36,
    '5xl': isSmallScreen ? 36 : 48,
  },
  
  // Spacing
  size: {
    none: 0,
    xs: baseSpacing * 0.5,    // 4px
    sm: baseSpacing * 0.75,   // 6px
    base: baseSpacing,        // 8px
    md: baseSpacing * 1.5,    // 12px
    lg: baseSpacing * 2,      // 16px
    xl: baseSpacing * 2.5,    // 20px
    '2xl': baseSpacing * 3,   // 24px
    '3xl': baseSpacing * 4,   // 32px
    '4xl': baseSpacing * 6,   // 48px
    '5xl': baseSpacing * 8,   // 64px
    '6xl': baseSpacing * 10,  // 80px
    '7xl': baseSpacing * 12,  // 96px
  },
  
  // Border Radius
  borderRadius: {
    none: 0,
    sm: 4,
    base: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    full: 9999,
  },
  
  // Shadows
  shadows: {
    none: { elevation: 0 },
    sm: createShadow(1, 2, 0.18),
    base: createShadow(2, 4, 0.25), 
    md: createShadow(4, 8, 0.3),
    lg: createShadow(8, 16, 0.35),
    xl: createShadow(12, 24, 0.4),
  },
  
  // Base Component Styles
  baseComponents: {
    button: {
      paddingVertical: baseSpacing * 1.5,
      paddingHorizontal: baseSpacing * 2,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    
    input: {
      paddingVertical: baseSpacing * 1.5,
      paddingHorizontal: baseSpacing * 2,
      borderRadius: 12,
      borderWidth: 1,
      fontSize: isSmallScreen ? 14 : 16,
      minHeight: 44,
    },
    
    card: {
      backgroundColor: '#2A2A2A',
      borderRadius: 16,
      padding: baseSpacing * 2,
      width: '100%',
      ...createShadow(2, 4, 0.25),
    },
    
    text: {
      fontSize: isSmallScreen ? 14 : 16,
      color: '#ffffff',
    },
    
    heading: {
      fontSize: isSmallScreen ? 20 : 24,
      fontWeight: 'bold',
      color: '#ffffff',
    }
  },
  
  // Complete Component Styles
  componentStyles: {
    // Button component styles
    button: {
      paddingVertical: baseSpacing * 1.5,
      paddingHorizontal: baseSpacing * 2,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      backgroundColor: '#dc3545',
    },
    buttonText: {
      color: '#ffffff',
      fontSize: isSmallScreen ? 14 : 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonSpinner: {
      marginRight: 8,
    },
    
    // Toast component styles
    toastContainer: {
      position: 'absolute',
      top: baseSpacing * 6,
      left: baseSpacing * 2,
      right: baseSpacing * 2,
      paddingHorizontal: baseSpacing * 2,
      paddingVertical: baseSpacing * 1.5,
      borderRadius: 8,
      zIndex: 1000,
      ...createShadow(4, 8, 0.3),
    },
    toastSuccess: {
      backgroundColor: '#4ade80',
    },
    toastError: {
      backgroundColor: '#dc3545',
    },
    toastWarning: {
      backgroundColor: '#ffc107',
    },
    toastMessage: {
      color: '#ffffff',
      fontSize: isSmallScreen ? 14 : 16,
      fontWeight: '500',
      textAlign: 'center',
    },
  },
  
  // Component Dimensions (responsive)
  components: {
    // Carousel
    carouselCardWidth: isSmallScreen ? width * 0.9 : width * 0.6,
    carouselCardHeight: isSmallScreen ? height * 0.7 : Math.min(500, height * 0.7),
    carouselContainerHeight: (isSmallScreen ? height * 0.7 : Math.min(500, height * 0.7)) + baseSpacing * 6,
    
    // Layout
    sidebarWidth: isSmallScreen ? '100%' : Math.max(150, Math.min(250, width * 0.15)),
    headerHeight: isSmallScreen ? baseSpacing * 8 : baseSpacing * 10,
    
    // Interactive Elements  
    buttonMinWidth: 80,
    inputHeight: 48,
    iconSize: Math.max(24, Math.min(32, width * 0.05)),
    timerSize: Math.max(40, Math.min(60, width * 0.08)),
  },
};

// Alias for easier imports
export default styleConstants;