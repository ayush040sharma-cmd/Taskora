import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

// Singleton socket — one connection per browser session
let socketInstance = null;

function getSocket() {
  if (!socketInstance) {
    const url = import.meta.env.VITE_API_URL || "http://localhost:3001";
    socketInstance = io(url, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
  }
  return socketInstance;
}

/**
 * useSocket(workspaceId, handlers)
 *
 * Connects to the workspace room and registers event handlers.
 * Cleans up on unmount or when workspaceId changes.
 *
 * handlers shape:
 *   { "task:created": fn, "task:updated": fn, "task:deleted": fn, ... }
 */
export function useSocket(workspaceId, handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!workspaceId) return;

    const socket = getSocket();

    if (!socket.connected) socket.connect();

    const onConnect = () => {
      socket.emit("join_workspace", workspaceId);
    };

    // If already connected, join immediately
    if (socket.connected) {
      socket.emit("join_workspace", workspaceId);
    }

    socket.on("connect", onConnect);

    // Register all handlers with stable wrapper
    const wrappers = {};
    Object.keys(handlersRef.current).forEach((event) => {
      wrappers[event] = (...args) => handlersRef.current[event]?.(...args);
      socket.on(event, wrappers[event]);
    });

    return () => {
      socket.off("connect", onConnect);
      socket.emit("leave_workspace", workspaceId);
      Object.keys(wrappers).forEach((event) => {
        socket.off(event, wrappers[event]);
      });
    };
  }, [workspaceId]);
}

export { getSocket };
