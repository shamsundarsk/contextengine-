import dotenv from 'dotenv';
dotenv.config();

async function runStressTest() {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const modelName = 'openai/gpt-oss-20b';
  const proxyUrl = 'http://127.0.0.1:4000/v1/chat/completions';
  const sessionId = `stress_test_${Date.now()}`;

  console.log('=======================================================');
  console.log('=== REAL PROXY GROQ STRESS TEST (15 REQUESTS / 60s) ===');
  console.log('=======================================================\n');

  const results: { index: number; status: number; latencyMs: number; errorText?: string; retryAfter?: string }[] = [];

  for (let i = 1; i <= 15; i++) {
    const start = performance.now();
    const prompt = `Short request ${i}: What is ${i} + ${i}? Answer in 1 word.`;
    
    try {
      const resp = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'x-session-id': sessionId,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 50,
        }),
      });

      const latencyMs = Math.round(performance.now() - start);
      const retryAfter = resp.headers.get('retry-after') || undefined;

      if (!resp.ok) {
        const errorText = await resp.text();
        console.log(`[Req ${i}/15] HTTP ${resp.status} | Latency: ${latencyMs} ms | Retry-After: ${retryAfter || 'none'}`);
        results.push({ index: i, status: resp.status, latencyMs, errorText, retryAfter });
      } else {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content?.trim() || '';
        console.log(`[Req ${i}/15] HTTP ${resp.status} | Latency: ${latencyMs} ms | Ans: "${content}"`);
        results.push({ index: i, status: resp.status, latencyMs });
      }
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - start);
      console.error(`[Req ${i}/15] Network Error: ${err.message} | Latency: ${latencyMs} ms`);
      results.push({ index: i, status: 0, latencyMs, errorText: err.message });
    }

    // Wait 2 seconds between requests (~15 requests in 30-45s)
    await new Promise((r) => setTimeout(r, 2000));
  }

  const slowReqs = results.filter((r) => r.latencyMs > 3000 || r.status !== 200);
  console.log('\n=======================================================');
  console.log('=== STRESS TEST RESULTS ===');
  console.log('=======================================================');
  console.log(`Total Requests Sent: ${results.length}`);
  console.log(`Successful (200 OK): ${results.filter((r) => r.status === 200).length}`);
  console.log(`Requests > 3s or Failed: ${slowReqs.length}`);
  if (slowReqs.length > 0) {
    console.log('\nDetails of Slow/Failed Requests:');
    console.log(JSON.stringify(slowReqs, null, 2));
  }
}

runStressTest();
