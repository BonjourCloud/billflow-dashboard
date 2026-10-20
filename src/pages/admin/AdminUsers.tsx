import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Search, ShieldCheck, ShieldOff } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  is_bootstrap_admin?: boolean;
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<AdminUser[]>('/api/admin/users');
      setUsers(data ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load users';
      toast.error(msg);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleAdmin = async (u: AdminUser) => {
    setBusyId(u.id);
    const endpoint = u.is_admin
      ? `/api/admin/users/${encodeURIComponent(u.id)}/revoke-admin`
      : `/api/admin/users/${encodeURIComponent(u.id)}/grant-admin`;
    try {
      await apiRequest(endpoint, { method: 'POST' });
      toast.success(u.is_admin ? 'Admin revoked' : 'Admin granted');
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, is_admin: !x.is_admin } : x)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update admin role';
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  };

  const filtered = users.filter(u =>
    !query || (u.email ?? '').toLowerCase().includes(query.toLowerCase()) || u.id.includes(query)
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground mt-1">
          Manage admin access. {users.length} {users.length === 1 ? 'user' : 'users'} shown
          {users.length >= 500 ? ' (capped at 500 most recent)' : ''}.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by email or id…"
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-border/40 bg-card/30 backdrop-blur-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading users…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(u => {
                const isMe = u.id === me?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.email ?? <span className="text-muted-foreground italic">no email</span>}
                      {isMe && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      {u.is_admin ? (
                        <Badge variant="default" className="gap-1">
                          <ShieldCheck className="w-3 h-3" /> Admin
                          {u.is_bootstrap_admin && (
                            <span className="text-[10px] opacity-75 font-normal ml-0.5">(Bootstrap)</span>
                          )}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">User</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={u.is_admin ? 'outline' : 'default'}
                        disabled={busyId === u.id || (u.is_admin && (isMe || Boolean(u.is_bootstrap_admin)))}
                        onClick={() => toggleAdmin(u)}
                        title={
                          u.is_admin && isMe
                            ? "You can't revoke your own admin"
                            : u.is_admin && u.is_bootstrap_admin
                              ? "Environment bootstrap admins cannot be revoked via the UI"
                              : undefined
                        }
                      >
                        {busyId === u.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : u.is_admin ? (
                          <><ShieldOff className="w-4 h-4 mr-1.5" /> Revoke</>
                        ) : (
                          <><ShieldCheck className="w-4 h-4 mr-1.5" /> Make admin</>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Admin roles are managed through the MERN backend and synchronized with Clerk and MongoDB.
      </p>
    </div>
  );
}
