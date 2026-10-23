const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const loginLimit=rateLimit({windowMs:10*60_000,limit:20,standardHeaders:true,legacyHeaders:false});

router.post('/login', loginLimit, async (req, res, next) => {
  try {
    const login = String(req.body.login || '').trim();
    const password = String(req.body.password || '');
    const result = await query('SELECT id, login, name, role, password_hash, active FROM staff_users WHERE login=$1 LIMIT 1', [login]);
    const user = result.rows[0];
    if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Невірний логін або пароль' });
    }
    const token = jwt.sign({ id: user.id, login: user.login, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, login: user.login, name: user.name, role: user.role } });
  } catch (e) { next(e); }
});

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

module.exports = router;
