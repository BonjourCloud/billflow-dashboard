import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) {
      toast.error(error.message);
      setUsers([]);
    } else {
      setUsers((data ?? []) as AdminUser[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleAdmin = async (u: AdminUser) => {
    setBusyId(u.id);
    const fn = u.is_admin ? 'admin_revoke_admin' : 'admin_grant_admin';
    const { error } = await supabase.rpc(fn, { _user_id: u.id });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(u.is_admin ? 'Admin revoked' : 'Admin granted');
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, is_admin: !x.is_admin } : x)));
    }
    setBusyId(null);
  };

  const filtered = users.filter(u =>
    !query || (u.email ?? '').toLowerCase().includes(query.toLowerCase()) || u.id.includes(query)
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground mt-1">Manage admin access. {users.length} total.</p>
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
                        </Badge>
                      ) : (
                        <Badge variant="secondary">User</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={u.is_admin ? 'outline' : 'default'}
                        disabled={busyId === u.id || (u.is_admin && isMe)}
                        onClick={() => toggleAdmin(u)}
                        title={u.is_admin && isMe ? "You can't revoke your own admin" : undefined}
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
        Note: requires <code className="text-foreground">db/admin_users_rpc.sql</code> to be applied in Supabase.
      </p>
    </div>
  );
}
