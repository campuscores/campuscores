-- migrate:up
CREATE TABLE staff_invitations (
  id bigserial PRIMARY KEY,
  email text NOT NULL CHECK (email = lower(email)),
  role text NOT NULL CHECK (role IN ('SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR')),
  invited_by bigint NOT NULL REFERENCES admin_accounts(id),
  clerk_invitation_id text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED')),
  expires_at timestamptz NOT NULL,
  accepted_account_id bigint REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'ACCEPTED') = (accepted_account_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_pending_invitation ON staff_invitations (email) WHERE status = 'PENDING';

-- migrate:down
DROP TABLE staff_invitations;
