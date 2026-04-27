-- Convert orchestrator_plan from text to jsonb so structured plan objects round-trip cleanly.
-- Idempotent: only runs if column is still text.
do $$
declare
  current_type text;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'agent_jobs'
    and column_name = 'orchestrator_plan';

  if current_type = 'text' then
    alter table public.agent_jobs
      alter column orchestrator_plan type jsonb
      using case
        when orchestrator_plan is null then null
        when orchestrator_plan ~ '^[[:space:]]*[\{\[]' then orchestrator_plan::jsonb
        else to_jsonb(orchestrator_plan)
      end;
  end if;
end $$;

-- Allow user reads of their own jobs (service role retains full access).
drop policy if exists agent_jobs_owner_select on public.agent_jobs;
create policy agent_jobs_owner_select on public.agent_jobs
  for select using (auth.uid() = user_id);
