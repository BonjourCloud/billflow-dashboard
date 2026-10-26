/* eslint-disable react-refresh/only-export-components -- mirrors @clerk/react's mixed exports; only used in the e2e build, never with fast refresh */
/**
 * TEST-ONLY stand-in for the parts of @clerk/react that BillWill uses.
 * Aliased in by vite.e2e.config.ts for the full-stack browser journeys; the
 * production build (vite.config.ts) always uses the real Clerk SDK.
 *
 * The signed-in user comes from localStorage, and API tokens are
 * `e2e:<userId>`, which only the test API server (api-server.ts) accepts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export const E2E_USER_KEY = 'billwill-e2e-user';
export const E2E_NEXT_USER_KEY = 'billwill-e2e-next-user';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

interface FakeSession {
  isLoaded: boolean;
  userId: string | null;
  setUserId: (id: string | null) => void;
  getToken: () => Promise<string | null>;
}

const SessionContext = createContext<FakeSession>({
  isLoaded: false,
  userId: null,
  setUserId: () => {},
  getToken: async () => null,
});

export function ClerkProvider({ children }: { children: ReactNode; publishableKey?: string }) {
  // Like the real SDK, start unloaded with no user and resolve the session
  // after mount, so the app's loading paths are exercised the same way.
  const [isLoaded, setIsLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Like Clerk's getToken: one stable function that reads the current session.
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;
  const getToken = useCallback(
    async () => (userIdRef.current ? `e2e:${userIdRef.current}` : null),
    [],
  );
  useEffect(() => {
    setUserId(read(E2E_USER_KEY));
    setIsLoaded(true);
  }, []);
  const value = useMemo(
    () => ({ isLoaded, userId, setUserId, getToken }),
    [isLoaded, userId, getToken],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useAuth() {
  const { isLoaded, userId, getToken } = useContext(SessionContext);
  return { isLoaded, isSignedIn: isLoaded ? Boolean(userId) : undefined, userId, getToken };
}

export function useUser() {
  const { isLoaded, userId } = useContext(SessionContext);
  const user = useMemo(() => {
    if (!userId) return null;
    const handle = userId.replace(/^user_/, '');
    return {
      id: userId,
      fullName: `${handle} (e2e)`,
      imageUrl: '',
      primaryEmailAddress: { emailAddress: `${handle}@e2e.test` },
      createdAt: new Date(Date.UTC(2026, 0, 1)),
      updatedAt: new Date(Date.UTC(2026, 0, 1)),
    };
  }, [userId]);
  return { isLoaded, isSignedIn: isLoaded ? Boolean(userId) : undefined, user };
}

export function useClerk() {
  const { setUserId } = useContext(SessionContext);
  return {
    // Real Clerk shows its sign-in modal; the stand-in signs in the user the
    // test chose (E2E_NEXT_USER_KEY) and follows the same redirect.
    openSignIn: async (options: { forceRedirectUrl?: string } = {}) => {
      const next = read(E2E_NEXT_USER_KEY) ?? 'user_e2e_default';
      localStorage.setItem(E2E_USER_KEY, next);
      setUserId(next);
      window.location.assign(options.forceRedirectUrl ?? '/dashboard');
    },
    signOut: async (options: { redirectUrl?: string } = {}) => {
      localStorage.removeItem(E2E_USER_KEY);
      setUserId(null);
      window.location.assign(options.redirectUrl ?? '/');
    },
  };
}
