# Claude Code Assistant Guidelines

This file contains coding conventions and rules for this project that Claude should always follow.

## 🚫 CRITICAL RULES - NEVER BREAK THESE

### Text Management
- **NEVER hardcode text strings in code**
- **ALWAYS use text constants from shared/text.js**
- **ALWAYS import text with alias `t`**: `import { text as t } from 'shared/text'`
- **ALWAYS use placeholders** for dynamic content: `t.welcomeUser.replace('{username}', username)`

### Import Organization
1. **NPM packages first** (React, React Native, etc.)
2. **Empty line**
3. **Systems, styles, and text imports** (systems/*, styleConstants as sc, shared/text)
4. **Components in alphabetical order**

### Naming Conventions
- **Event handlers**: Use `on*` prefix (e.g., `onLogin`, `onRegister`)
- **Styles alias**: Always use `s` (e.g., `import { introStyles as s }`)
- **Text alias**: Always use `t` (e.g., `import { text as t }`)
- **StyleConstants alias**: Always use `sc` (e.g., `import { styleConstants as sc }`)
- **Message handlers**: 
  - **outgoingMessages** (frontend → backend): `verbNoun` in present tense (e.g., `getBalance`, `placeBet`, `sendData`)
  - **incomingMessages** (backend → frontend): `nounVerb` in past tense (e.g., `balanceUpdated`, `betAccepted`, `gameStarted`)

### Code Style
- **Single quotes** for strings (not double quotes)
- **Alphabetize** object properties when order doesn't matter
- **Object formatting**: If 2+ properties, each on separate lines with brackets on own lines
- **No comments** unless explicitly requested
- **Currency formatting**: Always display as `$1,234` (whole numbers, commas every 3 digits, no decimals)
- **NO MARGINS**: Use padding and containers for spacing. Margins cause alignment issues and layout breaks.
- **TESTID = STYLE NAMES**: The testID attribute MUST ALWAYS match the style property name exactly. If style is `carouselContainer`, testID must be `testID="carouselContainer"`
- **When listing anything (arguments, imports, etc.) ALWAYS ALPHABETIZE UNLESS EXPLICITLY TOLD OTHERWISE!**

### File Structure
- `frontend/systems/` - App-wide logic (Context, WebSocket, etc.)
- `frontend/shared/` - Shared constants (text.js)
- `frontend/pages/` - Page components with co-located styles
- `frontend/components/` - Reusable components

### Backend
- **Use text constants** with alias `t` from `src/shared/text.js`
- **Alphabetize** message handlers and object properties
- **JWT tokens**: Access token (1 hour), Refresh token (7 days)
- **MANDATORY LOGGING**: ALL backend functionality MUST include proper logging
  - **Import logger**: `const logger = require('../shared/utils/logger')`
  - **Use structured logging**: `logger.logInfo('User action', { userId, action })`
  - **Log all user actions, errors, and significant events**
  - **Never develop backend features without logging - no functionality should be invisible**

## Project-Specific Rules

### Authentication
- **Per-message token authentication** (not connection-level)
- **Automatic token refresh** with message queuing
- **Unauthenticated messages**: `login`, `register`, `refreshToken`

### WebSocket
- **Connect once** without token
- **Include access token in each message** (except unauthenticated ones)
- **Queue messages during token refresh**

### State Management
- **React Context** for global state
- **Local state** for component-specific data
- **AsyncStorage** for auth persistence

## Example Code

```javascript
// ✅ CORRECT
import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { useApp } from 'systems/AppContext';
import { introStyles as s } from './IntroStyles';
import { text as t } from 'shared/text';
import Button from 'components/Button/Button';

const onLogin = () => {
  sendMessage('login', {
    username: formData.username,
    password: formData.password
  });
};

setGameMessage(t.insufficientBalance);

// ❌ WRONG
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Button from 'components/Button/Button';
import { useApp } from 'systems/AppContext';
import { introStyles } from './IntroStyles';

const handleLogin = () => {
  sendMessage("login", { username: formData.username, password: formData.password });
};

setGameMessage("Insufficient balance for this bet!");
```

## Reminders for Claude
- Check this file at the start of each session
- Reference these rules when making code changes
- Always validate text usage before completing tasks

## CRITICAL BEHAVIOR RULES
- **ONLY DO WHAT THE USER EXPLICITLY TELLS YOU TO DO**
- **NEVER automatically do additional steps or "continue" without explicit instruction**
- **NEVER automatically fix/revert when user asks diagnostic questions**
- When user asks "Is this because you did X?", ONLY answer the question - do NOT take action
- **User must explicitly request changes** before making any modifications
- **Separate diagnosis from execution** - answer questions first, wait for instructions
- If user asks about a problem, explain the cause but do NOT automatically attempt fixes
- **STOP and WAIT for user instruction after completing each requested task**

## PACKAGE.JSON RULES
- **Create package.json files where needed for proper project structure**
- **Root package.json for overall project coordination and shared dependencies**
- **Frontend package.json for frontend-specific dependencies and scripts**
- **Backend package.json for backend-specific dependencies and scripts**
- **Each package.json should contain only the dependencies relevant to its scope**

## SYSTEM COMMAND PERMISSIONS
Claude is authorized to run ALL system commands necessary for project development within the fulldeck application directory including but not limited to:
- Package management: `npm`, `npx`, `yarn`, `pnpm`
- Development tools: `expo`, `react-native`, `next`, `node`, `nodemon`
- File operations: `ls`, `cd`, `mkdir`, `rm`, `cp`, `mv`, `touch`, `ln`
- Permissions: `chmod`, `chown`
- Process management: `kill`, `pkill`, `ps`
- Git operations: `git` (all subcommands)
- Database tools: `prisma`, `pg`, `psql`
- Build tools: `webpack`, `babel`, `eslint`, `prettier`
- System utilities: `grep`, `find`, `curl`, `wget`, `which`, `whereis`, `ss`, `ps`, `aux`
- Directory management: `mkdir`, `rmdir`, `mv`, `cp` within /mnt/c/src/fulldeck
- All other commands needed for full-stack development within this project

## DATABASE MIGRATION RULES - CRITICAL
- **NEVER perform database schema changes without data migration**
- **ALWAYS preserve existing data when changing models/tables**
- **Before any Prisma schema changes**:
  1. Export existing data from affected tables
  2. Create migration script to transfer data to new schema
  3. Verify data integrity after migration
  4. Test rollback procedures
- **NEVER use `prisma db push` in production - always use proper migrations**
- **ALWAYS backup database before schema changes**
- **Data loss is NEVER acceptable in any environment**

## System Command Authorizations
- **CRITICAL AUTHORIZATION**: 
  - NEVER ASK ME FOR Yes, and don't ask again for mv commands in /mnt/c/src/fulldeck MOVE COMMAND PERMISSIONS AGAIN!