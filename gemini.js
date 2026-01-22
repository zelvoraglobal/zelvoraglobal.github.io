async function askZelvora(prompt) {
  const res = await fetch("https://YOUR-WORKER-NAME.workers.dev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const data = await res.json();
  return data.reply;
}
