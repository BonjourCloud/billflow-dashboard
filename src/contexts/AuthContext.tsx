import { configureApiAuth } from '@/lib/api';
import { useEffect } from 'react';
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { useAuth as useClerkAuth, useClerk, useUser } from '@clerk/react';

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  getToken: () => Promise<string | null>;
  session: { access_token: string | null } | null;
  user: {
    id: string;
    email: string | null;
    user_metadata: {
      full_name: string | null;
      avatar_url: string | null;
    };
  } | null;
  profile: Profile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  /** Signs in with a one-time ticket from the API (used by the demo account). */
  signInWithTicket: (ticket: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const clerk = useClerk();
  useEffect(() => {
    configureApiAuth(() => getToken());
  }, [getToken]);
  const [signInLoading, setSignInLoading] = useState(false);

  const user = clerkUser
    ? {
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress ?? null,
        user_metadata: {
          full_name: clerkUser.fullName ?? null,
          avatar_url: clerkUser.imageUrl ?? null,
        },
      }
    : null;

  const profile: Profile | null = clerkUser
    ? {
        id: clerkUser.id,
        display_name: clerkUser.fullName ?? null,
        avatar_url: clerkUser.imageUrl ?? null,
        created_at: clerkUser.createdAt?.toISOString() ?? '',
        updated_at: clerkUser.updatedAt?.toISOString() ?? '',
      }
    : null;

  const session = isSignedIn
    ? { access_token: null as string | null }
    : null;

  const signInWithGoogle = async () => {
    setSignInLoading(true);
    try {
      await clerk.openSignIn({
        signUpForceRedirectUrl: '/dashboard',
        forceRedirectUrl: '/dashboard',
      });
    } finally {
      setSignInLoading(false);
    }
  };

  const signInWithTicket = async (ticket: string) => {
    const attempt = await clerk.client?.signIn.create({
      strategy: 'ticket',
      ticket,
    });
    if (!attempt || attempt.status !== 'complete' || !attempt.createdSessionId) {
      throw new Error('Could not start the demo. Please try again.');
    }
    await clerk.setActive({ session: attempt.createdSessionId });
  };

  const signOut = async () => {
    await clerk.signOut({ redirectUrl: '/' });
  };

  return (
    <AuthContext.Provider
      value={{
        getToken,
        session,
        user,
        profile,
        loading: !isLoaded || signInLoading,
        signInWithGoogle,
        signInWithTicket,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return ctx;
}
