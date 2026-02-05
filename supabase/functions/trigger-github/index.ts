export default async () => {
  const token = Deno.env.get("GITHUB_CRON_TOKEN");

  const res = await fetch(
    "https://api.github.com/repos/CWestwood/fantasy-cricket-app/dispatches",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event_type: "supabase-cron"
      })
    }
  );

  return new Response(
    `Status: ${res.status}`,
    { status: 200 }
  );
};