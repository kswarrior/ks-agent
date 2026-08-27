const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.render('stats', { title: 'Stats & Achievements', user: req.user }));

module.exports = router;