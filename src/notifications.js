export const defaultNotificationRoles = Object.freeze({ live: '1568356044131012699', video: '1567842947238465608' });
export const notificationRoleId = (config, kind) => config.notificationRoles?.[kind] || defaultNotificationRoles[kind];
