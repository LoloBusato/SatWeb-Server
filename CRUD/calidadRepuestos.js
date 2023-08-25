const createCRUDRoutes = require('./Modelos/CRUD1col');

// CRUD de nombres de repuestos
const nombresRepuestosRoutes = createCRUDRoutes({
  tableName: 'calidades_repuestos',
  columnName: 'calidad_repuestos',
  idName: 'calidades_repuestos_id',
  variableFront: 'calidadRepuestos'
});

module.exports = nombresRepuestosRoutes  