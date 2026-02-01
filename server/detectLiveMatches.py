import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const now = new Date();
const soon = new Date(now.getTime() + 30 * 60 * 1000);

const { data: matches } = await supabase
  .from('matches')
  .select('*')
  .in('status', ['NS', 'live']);

const live = matches.filter(m => {
  const start = new Date(m.start_time);
  return (
    m.status === 'live' ||
    (start <= soon && start >= now)
  );
});

// update DB flag
await supabase
  .from('matches')
  .update({ currently_live: false })
  .neq('is_live', false);

if (live.length > 0) {
  await supabase
    .from('matches')
    .update({ currently_live: true })
    .in('id', live.map(m => m.id));

  // trigger live workflow
  await fetch(
    "https://api.github.com/repos/YOU/REPO/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `token ${process.env.GH_TOKEN}`,
        Accept: "application/vnd.github+json"
      },
      body: JSON.stringify({
        event_type: "live-match"
      })
    }
  );
}
