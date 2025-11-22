-- Create security definer function to check child access
CREATE OR REPLACE FUNCTION public.user_has_child_access(_user_id uuid, _child_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.child_access
    WHERE user_id = _user_id AND child_id = _child_id
  )
$$;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Parents can view their own children" ON public.children;
DROP POLICY IF EXISTS "Parents can manage access to their children" ON public.child_access;

-- Recreate children SELECT policy without recursion
CREATE POLICY "Parents can view their own children" 
ON public.children 
FOR SELECT 
USING (
  parent_id = auth.uid() 
  OR public.user_has_child_access(auth.uid(), id)
);

-- Recreate child_access policy without recursion
CREATE POLICY "Parents can manage access to their children" 
ON public.child_access 
FOR ALL 
USING (
  child_id IN (
    SELECT id FROM public.children WHERE parent_id = auth.uid()
  )
);