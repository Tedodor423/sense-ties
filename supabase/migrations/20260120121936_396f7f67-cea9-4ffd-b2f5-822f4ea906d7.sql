-- Add birth_month and birth_year columns to children table
ALTER TABLE public.children 
ADD COLUMN birth_month integer,
ADD COLUMN birth_year integer;

-- Migrate existing age data to approximate birth_year (current year minus age)
UPDATE public.children 
SET birth_year = EXTRACT(YEAR FROM CURRENT_DATE)::integer - age,
    birth_month = 1
WHERE age IS NOT NULL;

-- Add constraints for valid month/year values
ALTER TABLE public.children 
ADD CONSTRAINT valid_birth_month CHECK (birth_month >= 1 AND birth_month <= 12),
ADD CONSTRAINT valid_birth_year CHECK (birth_year >= 1900 AND birth_year <= EXTRACT(YEAR FROM CURRENT_DATE)::integer);

-- Drop the old age column
ALTER TABLE public.children DROP COLUMN age;