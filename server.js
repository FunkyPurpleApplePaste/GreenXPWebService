const express = require('express');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 100,
};

const DIFFICULTY_XP = {
    easy: 10,
    medium: 25,
    hard: 50,
};

function requireAdmin(req, res, next) {
    if (req.header('x-admin') === 'true') next();
    else res.status(403).json({ error: 'Admin only route' });
}

app.get('/', (req, res) => res.send('🌱 GreenXP API is running!'));

app.get('/missions', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.execute('SELECT * FROM missions ORDER BY id ASC');
        await conn.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/missions', requireAdmin, async (req, res) => {
    try {
        const { title, category, difficulty, xp } = req.body;
        if (!title) return res.status(400).json({ error: 'title required' });

        // Determine xp: preference to difficulty mapping, else use provided xp or default 0
        let finalXp = 0;
        if (difficulty && DIFFICULTY_XP[difficulty]) finalXp = DIFFICULTY_XP[difficulty];
        else finalXp = Number(xp || 0);

        const conn = await mysql.createConnection(dbConfig);
        await conn.execute(
            'INSERT INTO missions (title, category, xp, difficulty) VALUES (?, ?, ?, ?)',
            [title, category || null, finalXp, difficulty || 'easy']
        );
        await conn.end();
        res.status(201).json({ message: `Mission "${title}" added.` });
    } catch (err) {
        console.error('POST /missions error', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/missions/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, category, difficulty, xp } = req.body;

        const fields = [];
        const params = [];

        if (title !== undefined) { fields.push('title = ?'); params.push(title); }
        if (category !== undefined) { fields.push('category = ?'); params.push(category); }
        if (difficulty !== undefined) {
            const finalXp = DIFFICULTY_XP[difficulty] ?? Number(xp || 0);
            fields.push('difficulty = ?'); params.push(difficulty);
            fields.push('xp = ?'); params.push(finalXp);
        } else if (xp !== undefined) {
            fields.push('xp = ?'); params.push(Number(xp));
        }

        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(id);
        const sql = `UPDATE missions SET ${fields.join(', ')} WHERE id = ?`;
        const conn = await mysql.createConnection(dbConfig);
        const [result] = await conn.execute(sql, params);
        await conn.end();

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Mission not found' });

        res.json({ message: `Mission ${id} updated.` });
    } catch (err) {
        console.error('PUT /missions/:id error', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/missions/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const conn = await mysql.createConnection(dbConfig);
        const [result] = await conn.execute('DELETE FROM missions WHERE id = ?', [id]);
        await conn.end();
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Mission not found' });
        res.json({ message: `Mission ${id} deleted.` });
    } catch (err) {
        console.error('DELETE /missions/:id error', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/user_missions', async (req, res) => {
    const { user_id, mission_id } = req.body;
    if (!user_id || !mission_id) return res.status(400).json({ error: 'user_id and mission_id required' });

    try {
        const conn = await mysql.createConnection(dbConfig);
        const [exists] = await conn.execute('SELECT id FROM user_missions WHERE user_id = ? AND mission_id = ?', [user_id, mission_id]);
        if (exists.length > 0) {
            await conn.end();
            return res.status(409).json({ error: 'Mission already accepted by this user' });
        }
        await conn.execute('INSERT INTO user_missions (user_id, mission_id) VALUES (?, ?)', [user_id, mission_id]);
        await conn.end();
        res.status(201).json({ message: 'Mission accepted!' });
    } catch (err) {
        console.error('POST /user_missions error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/user_missions/:id', async (req, res) => {
    const { id } = req.params;
    const { completed } = req.body;
    try {
        const conn = await mysql.createConnection(dbConfig);
        await conn.execute('UPDATE user_missions SET completed = ? WHERE id = ?', [completed ? 1 : 0, id]);
        await conn.end();
        res.json({ message: `User mission ${id} updated.` });
    } catch (err) {
        console.error('PUT /user_missions/:id', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/user_missions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const conn = await mysql.createConnection(dbConfig);
        await conn.execute('DELETE FROM user_missions WHERE id = ?', [id]);
        await conn.end();
        res.json({ message: `User mission ${id} removed.` });
    } catch (err) {
        console.error('DELETE /user_missions/:id', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/missions/public/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.execute(
            `SELECT * FROM missions WHERE id NOT IN (SELECT mission_id FROM user_missions WHERE user_id = ?)`,
            [userId]
        );
        await conn.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/missions/accepted/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.execute(
            `SELECT um.id AS user_mission_id, m.* 
       FROM user_missions um JOIN missions m ON um.mission_id = m.id
       WHERE um.user_id = ? AND um.completed = FALSE`,
            [userId]
        );
        await conn.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/missions/completed/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.execute(
            `SELECT um.id AS user_mission_id, m.*
       FROM user_missions um JOIN missions m ON um.mission_id = m.id
       WHERE um.user_id = ? AND um.completed = TRUE`,
            [userId]
        );
        await conn.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/users', async (req, res) => {
    const { username, email } = req.body;
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [result] = await conn.execute('INSERT INTO users (username, email) VALUES (?, ?)', [username, email]);
        await conn.end();
        res.status(201).json({ id: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/users', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.execute('SELECT * FROM users');
        await conn.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`🌿 GreenXP server running on port ${port}`);
});
