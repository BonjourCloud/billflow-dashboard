-- =====================================================================
-- ADMIN USERS RPC
-- Run AFTER db/admin_panel.sql. Adds RPCs to list users and manage the
-- admin role from the UI without exposing the service-role key.
-- =====================================================================

-- List all users with their admin status. Admin-only.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_admin boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = u.id AND r.role = 'admin'
    ) AS is_admin
  FROM auth.users u
  ORDER BY u.created_at DESC;
END;
$$;

-- Grant admin role to a user. Admin-only.
CREATE OR REPLACE FUNCTION public.admin_grant_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Revoke admin role from a user. Admin-only. Cannot revoke from yourself
-- (prevents accidentally locking out the last admin from the UI).
CREATE OR REPLACE FUNCTION public.admin_revoke_admin(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot revoke admin from yourself';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND role = 'admin';
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_admin(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_admin(uuid)  TO authenticated;
