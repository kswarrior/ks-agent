const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
  try {
    const resJson = await fetch('https://api.mojang.com/users/profiles/minecraft/KsWarrior');
    if (!resJson.ok) throw new Error('Player not found');
    const data = await resJson.json();
    res.render('index', { player: data, error: null });
  } catch (e) {
    res.render('index', { player: null, error: 'Unable to fetch player data' });
  }
});

app.get('/api/player/:name', async (req, res) => {
  try {
    const name = encodeURIComponent(req.params.name);
    const r = await fetch(`https://api.mojang.com/users/profiles/minecraft/${name}`);
    if (!r.ok) return res.status(404).json({ error: 'Player not found' });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));