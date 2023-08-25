const createCRUDRoutes = require('./Modelos/CRUD1col');

// CRUD de nombres de repuestos
const nombresRepuestosRoutes = createCRUDRoutes({
  tableName: 'nombres_repuestos',
  columnName: 'nombre_repuestos',
  idName: 'nombres_repuestos_id',
  variableFront: 'nombreRepuestos'
});

module.exports = nombresRepuestosRoutes  