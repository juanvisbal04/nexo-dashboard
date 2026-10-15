-- Shared atomic public-endpoint throttling; reuse existing private rate bucket table.
CREATE OR REPLACE FUNCTION public.nexo_public_rate_limit(
  p_rate_key text, p_window_start timestamptz, p_limit integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  IF p_rate_key IS NULL OR p_rate_key !~ '^[0-9a-f]{64}$'
     OR p_window_start IS NULL OR p_window_start < now()-interval '2 days'
     OR p_window_start > now()+interval '1 hour'
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 500
  THEN RETURN false; END IF;

  INSERT INTO public.nora_web_rate_limits(rate_key,window_start,request_count,updated_at)
  VALUES(p_rate_key,p_window_start,1,now())
  ON CONFLICT(rate_key) DO UPDATE SET
    request_count=public.nora_web_rate_limits.request_count+1,
    updated_at=now()
  WHERE public.nora_web_rate_limits.request_count < p_limit
  RETURNING request_count INTO v_count;
  RETURN v_count IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.nexo_public_rate_limit(text,timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nexo_public_rate_limit(text,timestamptz,integer) TO service_role;
