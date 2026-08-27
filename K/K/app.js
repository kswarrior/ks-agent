const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', require('./routes/index'));
app.use('/about', require('./routes/about'));
app.use('/stats', require('./routes/stats'));

app.get('*', (req, res) => res.send('<h1>404 - Page Not Found</h1><a href="/">Go Home</a>'));

app.listen(PORT, () => console.log(`KS Warrior running on port ${PORT}`));