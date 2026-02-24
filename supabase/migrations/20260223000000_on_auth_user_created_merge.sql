-- When a new Supabase auth user is created, ensure a corresponding row
-- exists in public.users and migrate any pre-registered placeholder
-- memberships (created when a user was invited before they registered an
-- account) to the new authenticated user ID.
--
-- IMPORTANT: The INSERT into public.users must happen BEFORE the
-- UPDATE on project_members, otherwise the FK constraint
-- project_members_user_id_fkey fires because the new user ID is not
-- yet present in public.users.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_user_id UUID;
BEGIN
  -- Find any pre-registered placeholder user with the same email.
  -- These are created by the invite flow when someone is added to a
  -- project before they have a Supabase auth account.
  SELECT id INTO old_user_id
  FROM public.users
  WHERE lower(email) = lower(NEW.email)
    AND id != NEW.id
  LIMIT 1;

  IF old_user_id IS NOT NULL THEN
    -- Temporarily rename the placeholder's email so the unique constraint
    -- on public.users.email does not block inserting the new row.
    UPDATE public.users
    SET email = '__migrating__' || old_user_id::text
    WHERE id = old_user_id;
  END IF;

  -- Insert the authenticated user into public.users FIRST so that the
  -- FK constraint on project_members is satisfied before we reassign rows.
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  IF old_user_id IS NOT NULL THEN
    -- Re-assign all project memberships from the placeholder to the real user.
    UPDATE public.project_members
    SET user_id = NEW.id
    WHERE user_id = old_user_id;

    -- Remove the now-orphaned placeholder row.
    DELETE FROM public.users WHERE id = old_user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Replace any existing trigger of this name so the migration is idempotent.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
