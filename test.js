const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
app.use(express.json())
app.use(cors()) // Use this after the variable declaration


const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "ACM1pt++",
  database: "satweb"
});

connection.connect(function(err) {
  if (err) throw err;
  console.log("Connected!");
});

async function verificarTypeId(type) {
    try {
        const [rows] = await connection.execute(
            'SELECT * FROM types',
        );
        return rows
    } catch (error) {
        console.error(error);
        throw new Error('Error al verificar el tipo de equipo');
    }
}

app.get('/devices/type', async (req, res) => {
  let rows = await verificarTypeId("iPhone");
  res.send(rows);
})

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});