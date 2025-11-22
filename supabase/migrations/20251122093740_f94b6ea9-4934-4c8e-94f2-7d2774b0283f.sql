-- Drop existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('Parent', 'Teacher', 'Clinician');

-- Drop and recreate users_extended table to remove role column
DROP TABLE IF EXISTS public.users_extended CASCADE;

CREATE TABLE public.users_extended (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.users_extended ENABLE ROW LEVEL SECURITY;

-- Create user_roles table for secure role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (bypasses RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user's primary role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Create children table
CREATE TABLE public.children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age > 0 AND age < 120),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

-- Create child_access table
CREATE TABLE public.child_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(child_id, user_id)
);

ALTER TABLE public.child_access ENABLE ROW LEVEL SECURITY;

-- Create meltdowns table
CREATE TABLE public.meltdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID REFERENCES public.children(id) ON DELETE CASCADE NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  environment_trigger TEXT,
  noise_level TEXT,
  environment_description TEXT,
  meltdown_level INTEGER NOT NULL CHECK (meltdown_level >= 1 AND meltdown_level <= 10),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.meltdowns ENABLE ROW LEVEL SECURITY;

-- Trigger function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_children_updated_at
  BEFORE UPDATE ON public.children
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meltdowns_updated_at
  BEFORE UPDATE ON public.meltdowns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.users_extended (auth_user_id, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'role')::app_role
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for users_extended
CREATE POLICY "Users can view their own profile"
  ON public.users_extended FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.users_extended FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for children
CREATE POLICY "Parents can view their own children"
  ON public.children FOR SELECT
  TO authenticated
  USING (parent_id = auth.uid() OR id IN (
    SELECT child_id FROM public.child_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "Parents can create children"
  ON public.children FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'Parent') AND parent_id = auth.uid());

CREATE POLICY "Parents can update their own children"
  ON public.children FOR UPDATE
  TO authenticated
  USING (parent_id = auth.uid());

CREATE POLICY "Parents can delete their own children"
  ON public.children FOR DELETE
  TO authenticated
  USING (parent_id = auth.uid());

-- RLS Policies for child_access
CREATE POLICY "Parents can manage access to their children"
  ON public.child_access FOR ALL
  TO authenticated
  USING (child_id IN (
    SELECT id FROM public.children WHERE parent_id = auth.uid()
  ));

CREATE POLICY "Users can view their own access"
  ON public.child_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for meltdowns
CREATE POLICY "Users can view meltdowns for accessible children"
  ON public.meltdowns FOR SELECT
  TO authenticated
  USING (child_id IN (
    SELECT id FROM public.children 
    WHERE parent_id = auth.uid() OR id IN (
      SELECT child_id FROM public.child_access WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can create meltdowns for accessible children"
  ON public.meltdowns FOR INSERT
  TO authenticated
  WITH CHECK (child_id IN (
    SELECT id FROM public.children 
    WHERE parent_id = auth.uid() OR id IN (
      SELECT child_id FROM public.child_access WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can update meltdowns for accessible children"
  ON public.meltdowns FOR UPDATE
  TO authenticated
  USING (child_id IN (
    SELECT id FROM public.children 
    WHERE parent_id = auth.uid() OR id IN (
      SELECT child_id FROM public.child_access WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Parents can delete meltdowns for their children"
  ON public.meltdowns FOR DELETE
  TO authenticated
  USING (child_id IN (
    SELECT id FROM public.children WHERE parent_id = auth.uid()
  ));