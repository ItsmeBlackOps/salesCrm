/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import { useToast } from './use-toast';

interface Notification {
  id: number;
  message: string;
  time: string;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (message: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

let nextId = 1;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (message: string) => {
    const notification = { id: nextId++, message, time: new Date().toISOString() };
    setNotifications(prev => [notification, ...prev]);
    toast({ title: message });
  };

  return (
    <NotificationContext.Provider value={{ notifications, addNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
