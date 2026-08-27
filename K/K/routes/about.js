const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.render('about', { title: 'About', user: req.user }));

module.exports = router;