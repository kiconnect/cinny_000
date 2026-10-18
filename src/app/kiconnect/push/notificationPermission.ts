export const NOTIFICATION_PERMISSION_CHANGED = 'kiconnect.notification-permission-changed';

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const permission = await window.Notification.requestPermission();
  window.dispatchEvent(new Event(NOTIFICATION_PERMISSION_CHANGED));
  return permission;
}
