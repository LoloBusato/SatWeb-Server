const mysql = require('mysql2');

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "ACM1pt++",
  database: "satweb"
});

module.exports = db;