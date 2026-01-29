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

app.get('/', (req, res) => res.send('GreenXP API is running! Better go catch it.'));

app.get('/missions', async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM missions');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching missions' });
    }
});

app.post('/missions', requireAdmin, async (req, res) => {
    const { title, category, xp } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('INSERT INTO missions (title, category, xp) VALUES (?, ?, ?)', [title, category, xp]);
        res.status(201).json({ message: `Mission "${title}" added successfully.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error adding mission' });
    }
});

app.put('/missions/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, category, xp } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('UPDATE missions SET title=?, category=?, xp=? WHERE id=?', [title, category, xp, id]);
        res.json({ message: `Mission ${id} updated successfully.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error updating mission' });
    }
});

app.delete('/missions/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('DELETE FROM missions WHERE id=?', [id]);
        res.json({ message: `Mission ${id} deleted.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error deleting mission' });
    }
});



app.get('/user_missions/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
            `SELECT um.id, um.completed, m.title, m.category, m.xp
       FROM user_missions um
       JOIN missions m ON um.mission_id = m.id
       WHERE um.user_id = ?`,
            [userId]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching user missions' });
    }
});

app.post('/user_missions', async (req, res) => {
    const { user_id, mission_id } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'INSERT INTO user_missions (user_id, mission_id) VALUES (?, ?)',
            [user_id, mission_id]
        );
        res.status(201).json({ message: 'Mission accepted!' });
    } catch (err) {
        console.error('POST /user_missions error:', err);  // full log in Render
        res.status(500).json({ error: err.message });       // <-- send real MySQL message
    }
});


app.put('/user_missions/:id', async (req, res) => {
    const { id } = req.params;
    const { completed } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('UPDATE user_missions SET completed=? WHERE id=?', [completed, id]);
        res.json({ message: `Mission ${id} updated.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error updating mission status' });
    }
});

app.delete('/user_missions/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute('DELETE FROM user_missions WHERE id=?', [id]);
        res.json({ message: `Mission ${id} removed.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error deleting user mission' });
    }
});

app.listen(port, () => {
    console.log(`GreenXP server running on port ${port}`);
});
