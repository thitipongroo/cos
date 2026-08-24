-- platform.users.phone_number must identify exactly ONE account.
--
-- WHAT WAS WRONG
-- --------------
-- Path A (SMS OTP) login resolves the caller with `WHERE u.phone_number = $1 … LIMIT 1` and no
-- ORDER BY (identity.service.ts issueTokensForPhone). With two rows for one number, PostgreSQL
-- returns an arbitrary one, and the choice is not stable: a table rewrite, a plan change or plain
-- concurrent activity can hand the same worker a DIFFERENT row — and therefore a different
-- tenant_id, a different role, and a token scoped to someone else's data — on the next login. The
-- Redis OTP keys are keyed on the phone number alone (`otp:value:<phone>`), so nothing downstream
-- disambiguates either.
--
-- WHY UNIQUE IS THE RIGHT INVARIANT (and not an assumption)
-- --------------------------------------------------------
-- The application already enforces it, everywhere except the database:
--   * UserService.createUser rejects a second account on the same number with 409 Conflict, and it
--     checks ACROSS TENANTS — no tenant_id predicate (user.service.ts).
--   * Before 20260610000001 the number WAS the primary key of the identity: `keycloak_user_id` held
--     the phone for Path A users and carries UNIQUE NOT NULL (spec §11 platform.users). Splitting the
--     column out to hold a real Keycloak UUID moved the value into a column with only a plain index
--     and silently dropped the constraint with it. This restores what that migration lost.
-- The application check is also a TOCTOU: two concurrent creates both read "no existing row" and
-- both insert. Only the index below actually closes that, and only it constrains seeds, imports and
-- manual fixes, none of which go through UserService at all.
--
-- IF THIS MIGRATION FAILS
-- -----------------------
-- Duplicates already exist, and the pre-flight below stops with a count rather than letting
-- PostgreSQL's own unique-violation echo the offending phone number into the deploy log — the number
-- is PII (@pdpa(category: "contact")). Resolve them before retrying: decide which account owns the
-- number, and clear phone_number on the others (`UPDATE platform.users SET phone_number = NULL WHERE
-- user_id = …`), which leaves the account intact and only removes its Path A login. Every duplicate
-- is an account that could already have been logged into by the wrong person, so treat the list as an
-- incident to review, not just data to clean.

DO $$
DECLARE
  dup_numbers INT;
  dup_rows    INT;
BEGIN
  SELECT count(*), coalesce(sum(c), 0)
    INTO dup_numbers, dup_rows
    FROM (
      SELECT count(*) AS c
        FROM platform.users
       WHERE phone_number IS NOT NULL
       GROUP BY phone_number
      HAVING count(*) > 1
    ) d;

  IF dup_numbers > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce unique platform.users.phone_number: % number(s) are shared by % user rows.',
      dup_numbers, dup_rows
      USING HINT = 'Path A OTP login cannot tell these accounts apart and may authenticate into either tenant. List them with: SELECT phone_number, count(*) FROM platform.users WHERE phone_number IS NOT NULL GROUP BY phone_number HAVING count(*) > 1; then NULL the phone_number on every account that should not own it. The numbers are deliberately not printed here - they are PII.';
  END IF;
END $$;

-- Partial, matching the index it replaces: phone_number is NULL for every Path B (email) account, and
-- NULLs are not equal to one another in a unique index, so the partial clause is not what makes those
-- rows legal — it keeps the index off the majority of rows that will never be probed by it.
CREATE UNIQUE INDEX users_phone_number_key
  ON platform.users (phone_number)
  WHERE phone_number IS NOT NULL;

-- The old non-unique index has exactly the same key and predicate, so the unique one above already
-- serves every lookup it served. Keeping both would pay two index writes per user row for nothing.
DROP INDEX IF EXISTS platform.users_phone_number_idx;
