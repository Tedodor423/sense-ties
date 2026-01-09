-- Fix the handle_new_user function - the EXCEPTION block wasn't working correctly
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _first_name text;
  _last_name text;
  _role app_role;
  _full_name text;
  _role_text text;
BEGIN
  -- Try to get first_name from metadata, fallback to extracting from full_name/name
  _first_name := NEW.raw_user_meta_data->>'first_name';
  _last_name := NEW.raw_user_meta_data->>'last_name';
  
  -- For OAuth providers, extract from full_name or name
  IF _first_name IS NULL THEN
    _full_name := COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    );
    -- Split full_name into first and last
    _first_name := COALESCE(NULLIF(split_part(_full_name, ' ', 1), ''), 'User');
    _last_name := COALESCE(NULLIF(split_part(_full_name, ' ', 2), ''), '');
  END IF;
  
  -- Ensure we have at least a default first name
  _first_name := COALESCE(NULLIF(_first_name, ''), 'User');
  _last_name := COALESCE(_last_name, '');

  -- Insert into users_extended
  INSERT INTO public.users_extended (auth_user_id, first_name, last_name)
  VALUES (NEW.id, _first_name, _last_name);
  
  -- Get role from metadata, default to 'Parent' if null or invalid
  _role_text := NEW.raw_user_meta_data->>'role';
  
  IF _role_text IS NULL OR _role_text = '' OR _role_text NOT IN ('Parent', 'Teacher', 'Clinician') THEN
    _role := 'Parent'::app_role;
  ELSE
    _role := _role_text::app_role;
  END IF;
  
  -- Insert role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);
  
  RETURN NEW;
END;
$$;