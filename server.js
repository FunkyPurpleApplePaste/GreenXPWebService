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

function requireAdmin(req, res, next) {
    if (req.header('x-admin') === 'true') next();
    else res.status(403).json({ error: 'Admin only route' });
}

app.get('/', (req, res) => res.send('🌱 GreenXP API is running! Better go catch it.'));

app.get('/missions', async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM missions');
        await connection.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/missions', requireAdmin, async (req, res) => {
    const { title, category, xp } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'INSERT INTO missions (title, category, xp) VALUES (?, ?, ?)',
            [title, category, xp]
        );
        await connection.end();
        res.status(201).json({ message: `Mission "${title}" added.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/missions/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, category, xp } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'UPDATE missions SET title=?, category=?, xp=? WHERE id=?',
            [title, category, xp, id]
        );
        await connection.end();
        res.json({ message: `Mission ${id} updated.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/missions/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('DELETE FROM missions WHERE id=?', [id]);
        await connection.end();
        res.json({ message: `Mission ${id} deleted.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/user_missions', async (req, res) => {
    const { user_id, mission_id } = req.body;
    if (!user_id || !mission_id)
        return res.status(400).json({ error: 'user_id and mission_id required' });

    try {
        const connection = await mysql.createConnection(dbConfig);

        // prevent duplicate
        const [exists] = await connection.execute(
            'SELECT id FROM user_missions WHERE user_id=? AND mission_id=?',
            [user_id, mission_id]
        );
        if (exists.length > 0) {
            await connection.end();
            return res.status(409).json({ error: 'Mission already accepted by this user' });
        }

        await connection.execute(
            'INSERT INTO user_missions (user_id, mission_id) VALUES (?, ?)',
            [user_id, mission_id]
        );
        await connection.end();
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
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('UPDATE user_missions SET completed=? WHERE id=?', [
            completed,
            id,
        ]);
        await connection.end();
        res.json({ message: `Mission ${id} marked ${completed ? 'completed' : 'incomplete'}.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/user_missions/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('DELETE FROM user_missions WHERE id=?', [id]);
        await connection.end();
        res.json({ message: `Mission ${id} removed.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/missions/public/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
            `SELECT * FROM missions
       WHERE id NOT IN (SELECT mission_id FROM user_missions WHERE user_id = ?)`,
            [userId]
        );
        await connection.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/missions/accepted/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
            `SELECT um.id AS user_mission_id, m.title, m.category, m.xp, um.completed
       FROM user_missions um
       JOIN missions m ON um.mission_id = m.id
       WHERE um.user_id = ? AND um.completed = FALSE`,
            [userId]
        );
        await connection.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/missions/completed/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
            `SELECT um.id AS user_mission_id, m.title, m.category, m.xp, um.completed
       FROM user_missions um
       JOIN missions m ON um.mission_id = m.id
       WHERE um.user_id = ? AND um.completed = TRUE`,
            [userId]
        );
        await connection.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/users', async (req, res) => {
    const { username, email } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('INSERT INTO users (username, email) VALUES (?, ?)', [
            username,
            email,
        ]);
        await connection.end();
        res.status(201).json({ message: 'User added' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/users', async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM users');
        await connection.end();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`🌿 GreenXP server running on port ${port}`);
});
