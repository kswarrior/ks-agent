const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('dashboard', { 
    title: 'Dashboard',
    active: 'dashboard',
    user: {
      username: 'KS_Warrior',
      rank: 'Diamond',
      level: 87,
      coins: 124500
    }
  });
});

router.get('/dashboard', (req, res) => {
  res.redirect('/');
});

module.exports = router;