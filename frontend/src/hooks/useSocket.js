import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

// Singleton socket — one connection per browser session
let socketInstance = null;

function getSocket() {
  if (!socketInstance) {
    const url   = import.meta.env.VITE_API_URL || "http://localhost:3001";
    const token = localStorage.getItem("token");

    socketInstance = io(url, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      auth: token ? { token } : {},  // pass JWT so server auth middleware accepts it
    });
  }
  return socketInstance;
}

/**
 * Reset the singleton when the token changes (login / logout).
 * Call this from AuthContext after login/logout.
 */
export function resetSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
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

    // Refresh auth token in case it changed since singleton was created
    const freshToken = localStorage.getItem("token") || "";
    if (socket.auth && socket.auth.token !== freshToken) {
      socket.auth = { token: freshToken };
    }

    if (!socket.connected) socket.connect();

    const onConnect = () => {
      socket.emit("join_workspace", workspaceId);
    };

    const onConnectError = (err) => {
      console.warn("[Socket] Connection error:", err.message);
    };

    // If already connected, join immediately
    if (socket.connected) {
      socket.emit("join_workspace", workspaceId);
    }

    socket.on("connect",       onConnect);
    socket.on("connect_error", onConnectError);

    // Register all handlers with a stable wrapper so stale closures don't bite us
    const wrappers = {};
    Object.keys(handlersRef.current).forEach((event) => {
      wrappers[event] = (...args) => handlersRef.current[event]?.(...args);
      socket.on(event, wrappers[event]);
    });

    return () => {
      socket.off("connect",       onConnect);
      socket.off("connect_error", onConnectError);
      socket.emit("leave_workspace", workspaceId);
      Object.keys(wrappers).forEach((event) => {
        socket.off(event, wrappers[event]);
      });
    };
  }, [workspaceId]);
}

export { getSocket };
