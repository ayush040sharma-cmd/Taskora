-- v10: onboarding role, plan, team_size columns
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_role  VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS team_size        VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS plan            VARCHAR(20)  DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS suspended       BOOLEAN      DEFAULT FALSE;

-- Ensure plan has a value for existing rows
UPDATE users SET plan = 'free' WHERE plan IS NULL;

-- Add constraint
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_plan_check
    CHECK (plan IN ('free','pro','enterprise'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_onboarding_role_check
    CHECK (onboarding_role IN ('solo','member','manager') OR onboarding_role IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
