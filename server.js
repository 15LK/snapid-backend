const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.warn('Warning: ANTHROPIC_API_KEY is not set. Set it before starting the server.');
}
app.get('/', (req, res) => res.json({ status: 'SnapID backend running' }));
app.post('/identify', async (req, res) => {
  const { image, mediaType } = req.body;
  if (!image || !mediaType) {
    return res.status(400).json({ error: 'Both image and mediaType are required.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              {
                type: 'text',
                text: 'You are an expert identifier. Analyze this image and respond ONLY with JSON: {"name":"...","confidence":"95%","category":"...","estimated_value":"...","origin_period":"...","rarity":"...","description":"..."}'
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({ error: `Anthropic API error: ${errorBody}` });
    }

    const data = await response.json();
    const content = data?.messages?.[0]?.content?.[0]?.text || data?.content?.[0]?.text || '';
    const text = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SnapID backend running on port ${port}`));
