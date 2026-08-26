const fs = require('fs');

function fixUser() {
  const path = 'c:/Code/vault/server/models/user.ts';
  const target = `  'username' | 'meta' | 'twoFactorBackupCodes'\r\n> & {`;
  const replacement = `  'username' | 'meta' | 'twoFactorBackupCodes' | 'emergencyAccess' | 'lastActiveAt'\r\n> & {\r\n  lastActiveAt?: Date | null\r\n  emergencyAccess?: {\r\n    enabled: boolean\r\n    contactEmail: string | null\r\n    inactivityDays: number\r\n    shareA: string | null\r\n    requestStatus: 'none' | 'pending' | 'approved'\r\n    requestedAt: Date | null\r\n  }`;
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.renameSync(path, path + '.old');
    fs.writeFileSync(path, content, 'utf8');
    fs.unlinkSync(path + '.old');
    console.log('Fixed user.ts');
  } else {
    console.log('Target not found in user.ts or already fixed');
  }
}

function fixSecurityRoutes() {
  const path = 'c:/Code/vault/server/routes/securityRoutes.ts';
  let content = fs.readFileSync(path, 'utf8');
  let changed = false;

  const replace = (t, r) => {
    if (content.includes(t)) {
      content = content.replace(t, r);
      changed = true;
    }
  };

  replace(
    'const success = requestFingerprintService.forgetDevice(id, userId)',
    'const success = requestFingerprintService.forgetDevice(id as string, userId)',
  );

  replace(
    'const incident = await securityDashboardService.getIncidentDetails(\r\n      req.params.id,\r\n    )',
    'const incident = await securityDashboardService.getIncidentDetails(\r\n      req.params.id as string,\r\n    )',
  );
  replace(
    'const incident = await securityDashboardService.getIncidentDetails(\n      req.params.id,\n    )',
    'const incident = await securityDashboardService.getIncidentDetails(\n      req.params.id as string,\n    )',
  );

  replace(
    'await securityDashboardService.updateIncidentStatus(\r\n      req.params.id,\r\n      status as any,\r\n      notes,\r\n    )',
    'await securityDashboardService.updateIncidentStatus(\r\n      req.params.id as string,\r\n      status as any,\r\n      notes,\r\n    )',
  );
  replace(
    'await securityDashboardService.updateIncidentStatus(\n      req.params.id,\n      status as any,\n      notes,\n    )',
    'await securityDashboardService.updateIncidentStatus(\n      req.params.id as string,\n      status as any,\n      notes,\n    )',
  );

  replace(
    `      emergencyAccess: {\r\n        enabled: user.emergencyAccess?.enabled || false,\r\n        contactEmail: user.emergencyAccess?.contactEmail || null,\r\n        inactivityDays: user.emergencyAccess?.inactivityDays || 30,\r\n        requestStatus: user.emergencyAccess?.requestStatus || 'none',\r\n        requestedAt: user.emergencyAccess?.requestedAt || null,\r\n      }`,
    `      emergencyAccess: {\r\n        enabled: (user as any).emergencyAccess?.enabled || false,\r\n        contactEmail: (user as any).emergencyAccess?.contactEmail || null,\r\n        inactivityDays: (user as any).emergencyAccess?.inactivityDays || 30,\r\n        requestStatus: (user as any).emergencyAccess?.requestStatus || 'none',\r\n        requestedAt: (user as any).emergencyAccess?.requestedAt || null,\r\n      }`,
  );
  replace(
    `      emergencyAccess: {\n        enabled: user.emergencyAccess?.enabled || false,\n        contactEmail: user.emergencyAccess?.contactEmail || null,\n        inactivityDays: user.emergencyAccess?.inactivityDays || 30,\n        requestStatus: user.emergencyAccess?.requestStatus || 'none',\n        requestedAt: user.emergencyAccess?.requestedAt || null,\n      }`,
    `      emergencyAccess: {\n        enabled: (user as any).emergencyAccess?.enabled || false,\n        contactEmail: (user as any).emergencyAccess?.contactEmail || null,\n        inactivityDays: (user as any).emergencyAccess?.inactivityDays || 30,\n        requestStatus: (user as any).emergencyAccess?.requestStatus || 'none',\n        requestedAt: (user as any).emergencyAccess?.requestedAt || null,\n      }`,
  );

  replace(
    `    if (user.emergencyAccess) {\r\n      user.emergencyAccess.requestStatus = 'none'\r\n      user.emergencyAccess.requestedAt = null\r\n      await user.save()\r\n    }`,
    `    if ((user as any).emergencyAccess) {\r\n      (user as any).emergencyAccess.requestStatus = 'none'\r\n      (user as any).emergencyAccess.requestedAt = null\r\n      await user.save()\r\n    }`,
  );
  replace(
    `    if (user.emergencyAccess) {\n      user.emergencyAccess.requestStatus = 'none'\n      user.emergencyAccess.requestedAt = null\n      await user.save()\n    }`,
    `    if ((user as any).emergencyAccess) {\n      (user as any).emergencyAccess.requestStatus = 'none'\n      (user as any).emergencyAccess.requestedAt = null\n      await user.save()\n    }`,
  );

  replace(
    `    const owner = await User.findOne({ username: ownerUsername.trim().toLowerCase() })\r\n    if (!owner || !owner.emergencyAccess?.enabled || \r\n        String(owner.emergencyAccess.contactEmail).trim().toLowerCase() !== contactEmail.trim().toLowerCase()) {\r\n      throw AppError.badRequest('Invalid claim credentials or emergency access is not configured.', 'CLAIM_DENIED')\r\n    }\r\n\r\n    let status = owner.emergencyAccess.requestStatus\r\n    let requestedAt = owner.emergencyAccess.requestedAt\r\n\r\n    if (status === 'none') {\r\n      owner.emergencyAccess.requestStatus = 'pending'\r\n      owner.emergencyAccess.requestedAt = new Date()\r\n      await owner.save()\r\n      status = 'pending'\r\n      requestedAt = owner.emergencyAccess.requestedAt\r\n    }`,
    `    const owner = await User.findOne({ username: ownerUsername.trim().toLowerCase() })\r\n    if (!owner || !(owner as any).emergencyAccess?.enabled || \r\n        String((owner as any).emergencyAccess.contactEmail).trim().toLowerCase() !== contactEmail.trim().toLowerCase()) {\r\n      throw AppError.badRequest('Invalid claim credentials or emergency access is not configured.', 'CLAIM_DENIED')\r\n    }\r\n\r\n    let status = (owner as any).emergencyAccess.requestStatus\r\n    let requestedAt = (owner as any).emergencyAccess.requestedAt\r\n\r\n    if (status === 'none') {\r\n      (owner as any).emergencyAccess.requestStatus = 'pending'\r\n      (owner as any).emergencyAccess.requestedAt = new Date()\r\n      await owner.save()\r\n      status = 'pending'\r\n      requestedAt = (owner as any).emergencyAccess.requestedAt\r\n    }`,
  );
  replace(
    `    const owner = await User.findOne({ username: ownerUsername.trim().toLowerCase() })\n    if (!owner || !owner.emergencyAccess?.enabled || \n        String(owner.emergencyAccess.contactEmail).trim().toLowerCase() !== contactEmail.trim().toLowerCase()) {\n      throw AppError.badRequest('Invalid claim credentials or emergency access is not configured.', 'CLAIM_DENIED')\n    }\n\n    let status = owner.emergencyAccess.requestStatus\n    let requestedAt = owner.emergencyAccess.requestedAt\n\n    if (status === 'none') {\n      owner.emergencyAccess.requestStatus = 'pending'\n      owner.emergencyAccess.requestedAt = new Date()\n      await owner.save()\n      status = 'pending'\n      requestedAt = owner.emergencyAccess.requestedAt\n    }`,
    `    const owner = await User.findOne({ username: ownerUsername.trim().toLowerCase() })\n    if (!owner || !(owner as any).emergencyAccess?.enabled || \n        String((owner as any).emergencyAccess.contactEmail).trim().toLowerCase() !== contactEmail.trim().toLowerCase()) {\n      throw AppError.badRequest('Invalid claim credentials or emergency access is not configured.', 'CLAIM_DENIED')\n    }\n\n    let status = (owner as any).emergencyAccess.requestStatus\n    let requestedAt = (owner as any).emergencyAccess.requestedAt\n\n    if (status === 'none') {\n      (owner as any).emergencyAccess.requestStatus = 'pending'\n      (owner as any).emergencyAccess.requestedAt = new Date()\n      await owner.save()\n      status = 'pending'\n      requestedAt = (owner as any).emergencyAccess.requestedAt\n    }`,
  );

  replace(
    `    const owner = await User.findOne({ username: ownerUsername.trim().toLowerCase() })\r\n    if (!owner || !owner.emergencyAccess?.enabled || \r\n        String(owner.emergencyAccess.contactEmail).trim().toLowerCase() !== contactEmail.trim().toLowerCase()) {\r\n      throw AppError.badRequest('Invalid credentials or emergency access is not configured.', 'CLAIM_DENIED')\r\n    }\r\n\r\n    const access = owner.emergencyAccess\r\n    if (access.requestStatus === 'none') {\r\n      throw AppError.badRequest('No claim request has been initiated for this account.', 'NO_REQUEST')\r\n    }\r\n\r\n    const requestedTime = access.requestedAt ? new Date(access.requestedAt).getTime() : Date.now()\r\n    const inactivityPeriodMs = access.inactivityDays * 24 * 60 * 60 * 1000\r\n    const timeElapsed = Date.now() - requestedTime\r\n\r\n    // Double check last active safety net\r\n    const lastActive = owner.lastActiveAt ? new Date(owner.lastActiveAt).getTime() : 0\r\n    if (lastActive > requestedTime) {\r\n      owner.emergencyAccess.requestStatus = 'none'\r\n      owner.emergencyAccess.requestedAt = null\r\n      await owner.save()\r\n      throw AppError.badRequest('Owner activity detected since request. Claim cancelled.', 'OWNER_ACTIVE')\r\n    }\r\n\r\n    if (timeElapsed < inactivityPeriodMs) {\r\n      const daysRemaining = Math.max(0, ((inactivityPeriodMs - timeElapsed) / (24 * 60 * 60 * 1000))).toFixed(1)\r\n      return res.json({\r\n        success: false,\r\n        message: 'Request is pending. Owner inactivity period has not elapsed.',\r\n        requestStatus: 'pending',\r\n        daysRemaining: Number(daysRemaining),\r\n        requestedAt: access.requestedAt,\r\n        inactivityDays: access.inactivityDays,\r\n      })\r\n    }\r\n\r\n    if (access.requestStatus !== 'approved') {\r\n      owner.emergencyAccess.requestStatus = 'approved'\r\n      await owner.save()\r\n    }`,
    `    const owner = await User.findOne({ username: ownerUsername.trim().toLowerCase() })\r\n    if (!owner || !(owner as any).emergencyAccess?.enabled || \r\n        String((owner as any).emergencyAccess.contactEmail).trim().toLowerCase() !== contactEmail.trim().toLowerCase()) {\r\n      throw AppError.badRequest('Invalid credentials or emergency access is not configured.', 'CLAIM_DENIED')\r\n    }\r\n\r\n    const access = (owner as any).emergencyAccess\r\n    if (access.requestStatus === 'none') {\r\n      throw AppError.badRequest('No claim request has been initiated for this account.', 'NO_REQUEST')\r\n    }\r\n\r\n    const requestedTime = access.requestedAt ? new Date(access.requestedAt).getTime() : Date.now()\r\n    const inactivityPeriodMs = access.inactivityDays * 24 * 60 * 60 * 1000\r\n    const timeElapsed = Date.now() - requestedTime\r\n\r\n    // Double check last active safety net\r\n    const lastActive = (owner as any).lastActiveAt ? new Date((owner as any).lastActiveAt).getTime() : 0\r\n    if (lastActive > requestedTime) {\r\n      (owner as any).emergencyAccess.requestStatus = 'none'\r\n      (owner as any).emergencyAccess.requestedAt = null\r\n      await owner.save()\r\n      throw AppError.badRequest('Owner activity detected since request. Claim cancelled.', 'OWNER_ACTIVE')\r\n    }\r\n\r\n    if (timeElapsed < inactivityPeriodMs) {\r\n      const daysRemaining = Math.max(0, ((inactivityPeriodMs - timeElapsed) / (24 * 60 * 60 * 1000))).toFixed(1)\r\n      return res.json({\r\n        success: false,\r\n        message: 'Request is pending. Owner inactivity period has not elapsed.',\r\n        requestStatus: 'pending',\r\n        daysRemaining: Number(daysRemaining),\r\n        requestedAt: access.requestedAt,\r\n        inactivityDays: access.inactivityDays,\r\n      })\r\n    }\r\n\r\n    if (access.requestStatus !== 'approved') {\r\n      (owner as any).emergencyAccess.requestStatus = 'approved'\r\n      await owner.save()\r\n    }`,
  );
  replace(
    `    const owner = await User.findOne({ username: ownerUsername.trim().toLowerCase() })\n    if (!owner || !owner.emergencyAccess?.enabled || \n        String(owner.emergencyAccess.contactEmail).trim().toLowerCase() !== contactEmail.trim().toLowerCase()) {\n      throw AppError.badRequest('Invalid credentials or emergency access is not configured.', 'CLAIM_DENIED')\n    }\n\n    const access = owner.emergencyAccess\n    if (access.requestStatus === 'none') {\n      throw AppError.badRequest('No claim request has been initiated for this account.', 'NO_REQUEST')\n    }\n\n    const requestedTime = access.requestedAt ? new Date(access.requestedAt).getTime() : Date.now()\n    const inactivityPeriodMs = access.inactivityDays * 24 * 60 * 60 * 1000\n    const timeElapsed = Date.now() - requestedTime\n\n    // Double check last active safety net\n    const lastActive = owner.lastActiveAt ? new Date(owner.lastActiveAt).getTime() : 0\n    if (lastActive > requestedTime) {\n      owner.emergencyAccess.requestStatus = 'none'\n      owner.emergencyAccess.requestedAt = null\n      await owner.save()\n      throw AppError.badRequest('Owner activity detected since request. Claim cancelled.', 'OWNER_ACTIVE')\n    }\n\n    if (timeElapsed < inactivityPeriodMs) {\n      const daysRemaining = Math.max(0, ((inactivityPeriodMs - timeElapsed) / (24 * 60 * 60 * 1000))).toFixed(1)\n      return res.json({\n        success: false,\n        message: 'Request is pending. Owner inactivity period has not elapsed.',\n        requestStatus: 'pending',\n        daysRemaining: Number(daysRemaining),\n        requestedAt: access.requestedAt,\n        inactivityDays: access.inactivityDays,\n      })\n    }\n\n    if (access.requestStatus !== 'approved') {\n      owner.emergencyAccess.requestStatus = 'approved'\n      await owner.save()\n    }`,
    `    const owner = await User.findOne({ username: ownerUsername.trim().toLowerCase() })\n    if (!owner || !(owner as any).emergencyAccess?.enabled || \n        String((owner as any).emergencyAccess.contactEmail).trim().toLowerCase() !== contactEmail.trim().toLowerCase()) {\n      throw AppError.badRequest('Invalid credentials or emergency access is not configured.', 'CLAIM_DENIED')\n    }\n\n    const access = (owner as any).emergencyAccess\n    if (access.requestStatus === 'none') {\n      throw AppError.badRequest('No claim request has been initiated for this account.', 'NO_REQUEST')\n    }\n\n    const requestedTime = access.requestedAt ? new Date(access.requestedAt).getTime() : Date.now()\n    const inactivityPeriodMs = access.inactivityDays * 24 * 60 * 60 * 1000\n    const timeElapsed = Date.now() - requestedTime\n\n    // Double check last active safety net\n    const lastActive = (owner as any).lastActiveAt ? new Date((owner as any).lastActiveAt).getTime() : 0\n    if (lastActive > requestedTime) {\n      (owner as any).emergencyAccess.requestStatus = 'none'\n      (owner as any).emergencyAccess.requestedAt = null\n      await owner.save()\n      throw AppError.badRequest('Owner activity detected since request. Claim cancelled.', 'OWNER_ACTIVE')\n    }\n\n    if (timeElapsed < inactivityPeriodMs) {\n      const daysRemaining = Math.max(0, ((inactivityPeriodMs - timeElapsed) / (24 * 60 * 60 * 1000))).toFixed(1)\n      return res.json({\n        success: false,\n        message: 'Request is pending. Owner inactivity period has not elapsed.',\n        requestStatus: 'pending',\n        daysRemaining: Number(daysRemaining),\n        requestedAt: access.requestedAt,\n        inactivityDays: access.inactivityDays,\n      })\n    }\n\n    if (access.requestStatus !== 'approved') {\n      (owner as any).emergencyAccess.requestStatus = 'approved'\n      await owner.save()\n    }`,
  );

  if (changed) {
    fs.renameSync(path, path + '.old');
    fs.writeFileSync(path, content, 'utf8');
    fs.unlinkSync(path + '.old');
    console.log('Fixed securityRoutes.ts');
  } else {
    console.log('Target not found in securityRoutes.ts or already fixed');
  }
}

function fixAuthMiddleware() {
  const path = 'c:/Code/vault/server/middleware/authMiddleware.ts';
  let content = fs.readFileSync(path, 'utf8');
  let changed = false;

  const replace = (t, r) => {
    if (content.includes(t)) {
      content = content.replace(t, r);
      changed = true;
    }
  };

  replace(
    `    let isModified = false;\r\n    if (userWithSession.emergencyAccess && userWithSession.emergencyAccess.requestStatus === 'pending') {\r\n      logger.info(\`[Auth] Auto-cancelling pending emergency access request for user \${userWithSession.username} due to user activity\`);\r\n      userWithSession.emergencyAccess.requestStatus = 'none';\r\n      userWithSession.emergencyAccess.requestedAt = null;\r\n      isModified = true;\r\n    }`,
    `    let isModified = false;\r\n    if ((userWithSession as any).emergencyAccess && (userWithSession as any).emergencyAccess.requestStatus === 'pending') {\r\n      logger.info(\`[Auth] Auto-cancelling pending emergency access request for user \${userWithSession.username} due to user activity\`);\r\n      (userWithSession as any).emergencyAccess.requestStatus = 'none';\r\n      (userWithSession as any).emergencyAccess.requestedAt = null;\r\n      isModified = true;\r\n    }`,
  );
  replace(
    `    let isModified = false;\n    if (userWithSession.emergencyAccess && userWithSession.emergencyAccess.requestStatus === 'pending') {\n      logger.info(\`[Auth] Auto-cancelling pending emergency access request for user \${userWithSession.username} due to user activity\`);\n      userWithSession.emergencyAccess.requestStatus = 'none';\n      userWithSession.emergencyAccess.requestedAt = null;\n      isModified = true;\n    }`,
    `    let isModified = false;\n    if ((userWithSession as any).emergencyAccess && (userWithSession as any).emergencyAccess.requestStatus === 'pending') {\n      logger.info(\`[Auth] Auto-cancelling pending emergency access request for user \${userWithSession.username} due to user activity\`);\n      (userWithSession as any).emergencyAccess.requestStatus = 'none';\n      (userWithSession as any).emergencyAccess.requestedAt = null;\n      isModified = true;\n    }`,
  );

  replace(
    `    const now = new Date();\r\n    const lastActive = userWithSession.lastActiveAt;\r\n    if (!lastActive || now.getTime() - lastActive.getTime() > 60 * 1000) { // update at most once per minute\r\n      userWithSession.lastActiveAt = now;\r\n      isModified = true;\r\n    }`,
    `    const now = new Date();\r\n    const lastActive = (userWithSession as any).lastActiveAt;\r\n    if (!lastActive || now.getTime() - lastActive.getTime() > 60 * 1000) { // update at most once per minute\r\n      (userWithSession as any).lastActiveAt = now;\r\n      isModified = true;\r\n    }`,
  );
  replace(
    `    const now = new Date();\n    const lastActive = userWithSession.lastActiveAt;\n    if (!lastActive || now.getTime() - lastActive.getTime() > 60 * 1000) { // update at most once per minute\n      userWithSession.lastActiveAt = now;\n      isModified = true;\n    }`,
    `    const now = new Date();\n    const lastActive = (userWithSession as any).lastActiveAt;\n    if (!lastActive || now.getTime() - lastActive.getTime() > 60 * 1000) { // update at most once per minute\n      (userWithSession as any).lastActiveAt = now;\n      isModified = true;\n    }`,
  );

  if (changed) {
    fs.renameSync(path, path + '.old');
    fs.writeFileSync(path, content, 'utf8');
    fs.unlinkSync(path + '.old');
    console.log('Fixed authMiddleware.ts');
  } else {
    console.log('Target not found in authMiddleware.ts or already fixed');
  }
}

try {
  fixUser();
} catch (e) {
  console.log('Failed to fix user:', e);
}
try {
  fixSecurityRoutes();
} catch (e) {
  console.log('Failed to fix securityRoutes:', e);
}
try {
  fixAuthMiddleware();
} catch (e) {
  console.log('Failed to fix authMiddleware:', e);
}
