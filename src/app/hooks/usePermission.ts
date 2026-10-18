import { useEffect, useState } from 'react';
import { NOTIFICATION_PERMISSION_CHANGED } from '../kiconnect/push/notificationPermission';

export const getNotificationState = (): PermissionState => {
  if ('Notification' in window) {
    if (window.Notification.permission === 'default') {
      return 'prompt';
    }

    return window.Notification.permission;
  }

  return 'denied';
};

export function usePermissionState(name: PermissionName, initialValue: PermissionState = 'prompt') {
  const [permissionState, setPermissionState] = useState<PermissionState>(initialValue);

  useEffect(() => {
    let permissionStatus: PermissionStatus;
    let disposed = false;

    const refreshNotification = () => {
      if (name === 'notifications' && !disposed) setPermissionState(getNotificationState());
    };
    refreshNotification();
    window.addEventListener(NOTIFICATION_PERMISSION_CHANGED, refreshNotification);
    window.addEventListener('focus', refreshNotification);
    document.addEventListener('visibilitychange', refreshNotification);

    function handlePermissionChange(this: PermissionStatus) {
      setPermissionState(this.state);
    }

    navigator.permissions?.query({ name })
      .then((permStatus: PermissionStatus) => {
        if (disposed) return;
        permissionStatus = permStatus;
        handlePermissionChange.apply(permStatus);
        permStatus.addEventListener('change', handlePermissionChange);
      })
      .catch(() => {
        // Silence error since FF doesn't support microphone permission
      });

    return () => {
      disposed = true;
      window.removeEventListener(NOTIFICATION_PERMISSION_CHANGED, refreshNotification);
      window.removeEventListener('focus', refreshNotification);
      document.removeEventListener('visibilitychange', refreshNotification);
      permissionStatus?.removeEventListener('change', handlePermissionChange);
    };
  }, [name]);

  return permissionState;
}
