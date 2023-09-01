const createCRUDRoutes = require('./Modelos/CRUD1col');

// CRUD de nombres de repuestos
const nombresRepuestosRoutes = createCRUDRoutes({
  tableName: 'almacenamientos_repuestos',
  columnName: 'almacenamiento_repuestos',
  idName: 'almacenamientos_repuestos_id',
  variableFront: 'almacenamientoRepuestos'
});

module.exports = nombresRepuestosRoutes  