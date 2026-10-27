// In-memory stand-in for the Clerk Backend API, used by integration tests.

export interface FakeClerkUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

const users = new Map<string, FakeClerkUser>();

export function registerClerkUser(user: FakeClerkUser): void {
  users.set(user.id, user);
}

export function resetClerkUsers(): void {
  users.clear();
}

function toClerkUser(user: FakeClerkUser) {
  const emailId = `idn_${user.id}`;
  return {
    id: user.id,
    primaryEmailAddressId: emailId,
    emailAddresses: [{ id: emailId, emailAddress: user.email }],
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    imageUrl: `https://img.example.com/${user.id}.png`,
    createdAt: Date.UTC(2026, 0, 1),
    lastSignInAt: null,
  };
}

export const fakeClerkClient = {
  signInTokens: {
    async createSignInToken({ userId }: { userId: string; expiresInSeconds: number }) {
      return { token: `ticket_${userId}` };
    },
  },
  users: {
    async getUser(id: string) {
      const user = users.get(id);
      if (!user) {
        throw Object.assign(new Error("Not Found"), { status: 404 });
      }
      return toClerkUser(user);
    },
    async getUserList({
      limit = 100,
      offset = 0,
    }: { limit?: number; offset?: number } = {}) {
      const all = [...users.values()];
      return {
        data: all.slice(offset, offset + limit).map(toClerkUser),
        totalCount: all.length,
      };
    },
  },
};
