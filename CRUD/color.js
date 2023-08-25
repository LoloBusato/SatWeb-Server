const createCRUDRoutes = require('./Modelos/CRUD1col');

// CRUD de nombres de repuestos
const nombresRepuestosRoutes = createCRUDRoutes({
  tableName: 'colores',
  columnName: 'color',
  idName: 'colores_id',
  variableFront: 'color'
});

module.exports = nombresRepuestosRoutes  