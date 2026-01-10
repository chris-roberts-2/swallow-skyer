import React, { useCallback, useEffect, useState } from 'react';

const DEFAULT_MESSAGE = 'You do not have permission for this action.';

export const usePermissionToast = () => {
  const [toastMessage, setToastMessage] = useState('');

  const showForbiddenToast = useCallback(
    (message = DEFAULT_MESSAGE) => {
      setToastMessage(message);
    },
    [setToastMessage]
  );

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = setTimeout(() => setToastMessage(''), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const Toast = toastMessage ? (
    <div
      role="alert"
      data-testid="permission-toast"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        background: '#323232',
        color: '#fff',
        padding: '8px 12px',
        borderRadius: 6,
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        zIndex: 9999,
      }}
    >
      {toastMessage}
    </div>
  ) : null;

  return { toastMessage, showForbiddenToast, Toast };
};

export default usePermissionToast;
