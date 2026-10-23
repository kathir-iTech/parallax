-- New, dedicated PARALLAX Free-plan database only. No personal answer payloads.
CREATE TABLE IF NOT EXISTS parallax_quota (
  id text PRIMARY KEY, used integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS parallax_evidence (
  id uuid PRIMARY KEY, session_id text NOT NULL, payload jsonb NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS parallax_leases (id text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE OR REPLACE FUNCTION parallax_reserve(keys text[], limits integer[], ttls integer[]) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE idx integer; current_used integer;
BEGIN
  IF array_length(keys,1) IS NULL OR array_length(keys,1)>12 OR array_length(keys,1)<>array_length(limits,1) OR array_length(keys,1)<>array_length(ttls,1) THEN
    RAISE EXCEPTION 'Invalid quota reservation';
  END IF;
  -- All quota dimensions are checked and incremented in one serialized transaction.
  PERFORM pg_advisory_xact_lock(728413902);
  FOR idx IN 1..array_length(keys,1) LOOP
    SELECT used INTO current_used FROM parallax_quota WHERE id=keys[idx] AND expires_at>now();
    IF COALESCE(current_used,0)>=limits[idx] THEN RETURN false; END IF;
  END LOOP;
  FOR idx IN 1..array_length(keys,1) LOOP
    INSERT INTO parallax_quota(id,used,expires_at) VALUES(keys[idx],1,now()+make_interval(secs=>ttls[idx]))
    ON CONFLICT(id) DO UPDATE SET used=CASE WHEN parallax_quota.expires_at<now() THEN 1 ELSE parallax_quota.used+1 END,
      expires_at=CASE WHEN parallax_quota.expires_at<now() THEN EXCLUDED.expires_at ELSE parallax_quota.expires_at END;
  END LOOP;
  DELETE FROM parallax_quota WHERE expires_at<now();
  DELETE FROM parallax_leases WHERE expires_at<now();
  RETURN true;
END;
$$;
