const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('about', { 
    title: 'About',
    active: 'about',
    user: {
      username: 'KS_Warrior',
      rank: 'Diamond',
      level: 87,
      coins: 124500
    }
  });
});

module.exports = router;