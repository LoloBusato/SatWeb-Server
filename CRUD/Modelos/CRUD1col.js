const express = require('express');
const db = require('../../database/dbConfig');

function createCRUDRoutes(config) {
    const { tableName, columnName, idName, variableFront } = config;

    const router = express.Router();

    router.post('/', async (req, res) => {
        const value = req.body[variableFront];
        const qInsert = `INSERT INTO ${tableName} (${columnName}) VALUES (?)`;

        db.query(qInsert, [value], (err, data) => {
        if (err) {
            console.log("error: ", err);
            return res.status(400).send(err);
        }
        return res.status(200).send(data);
        });
    });

    router.get('/', (req, res) => {
        const qSelectAll = `SELECT * FROM ${tableName} ORDER BY ${columnName}`;
        db.query(qSelectAll, (err, data) => {
        if (err) {
            console.log(err);
            return res.status(400).json(err);
        }
        return res.status(200).json(data);
        });
    });

    router.put(`/:id`, (req, res) => {
        const id = req.params.id;
        const value = req.body[columnName];
        const qUpdate = `UPDATE ${tableName} SET ${columnName} = ? WHERE ${idName} = ?`;

        db.query(qUpdate, [value, id], (err, data) => {
        if (err) return res.status(400).send(err);
        return res.status(200).json(data);
        });
    });

    router.delete(`/:id`, (req, res) => {
        const id = req.params.id;
        const qDelete = `DELETE FROM ${tableName} WHERE ${idName} = ?`;

        db.query(qDelete, [id], (err, data) => {
        if (err) return res.status(400).send(err);
        return res.status(200).json(data);
        });
    });

    return router;
}

module.exports = createCRUDRoutes;