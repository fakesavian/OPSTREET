"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export type NotificationType = "reservation" | "deploy" | "trade" | "system" | "tx";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  /** For "tx" type — the BTC transaction ID so it can be re-opened */
  txId?: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  /** Returns the generated notification ID */
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => string;
  updateNotification: (id: string, updates: Partial<Pick<Notification, "title" | "message" | "read">>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const STORAGE_KEY = "opfun:notifications";
const MAX_ITEMS = 50;

function loadFromStorage(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Notification[];
  } catch {
    return [];
  }
}

function saveToStorage(items: Notification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    setNotifications(loadFromStorage());
  }, []);

  const persist = useCallback((items: Notification[]) => {
    setNotifications(items);
    saveToStorage(items);
  }, []);

  const addNotification = useCallback(
    (n: Omit<Notification, "id" | "timestamp" | "read">): string => {
      const id = crypto.randomUUID();
      const item: Notification = {
        ...n,
        id,
        timestamp: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => {
        const next = [item, ...prev].slice(0, MAX_ITEMS);
        saveToStorage(next);
        return next;
      });
      return id;
    },
    [],
  );

  const updateNotification = useCallback(
    (id: string, updates: Partial<Pick<Notification, "title" | "message" | "read">>) => {
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, ...updates } : n));
        saveToStorage(next);
        return next;
      });
    },
    [],
  );

  const markRead = useCallback(
    (id: string) => {
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
        saveToStorage(next);
        return next;
      });
    },
    [],
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveToStorage(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    persist([]);
  }, [persist]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, updateNotification, markRead, markAllRead, clearAll, unreadCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
