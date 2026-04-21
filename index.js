const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json())
app.use(cors())

// Agregar rutas CRUD
// Usuarios
const loginRoutes = require('./CRUD/login');
const usersRoutes = require('./CRUD/users');
const grupoRoutes = require('./CRUD/usergroup')
// Ordenes
const devicesRoutes = require('./CRUD/devices');
const brandRoutes = require('./CRUD/brand');
const typeRoutes = require('./CRUD/type');
const branchesRoutes = require('./CRUD/branches');
const clientsRoutes = require('./CRUD/clients');
const messagesRoutes = require('./CRUD/messages');
const ordersRoutes = require('./CRUD/orders');
const reasignOrderRoutes = require('./CRUD/reasignOrder');
// Stock
const stockRoutes = require('./CRUD/stock');
const reduceStockRoutes = require('./CRUD/reduceStock');
const stockItemRoutes = require('./CRUD/stockItem');
const supplierRoutes = require('./CRUD/supplier');
const statesRoutes = require('./CRUD/states');

const estadoGarantiaRoutes = require('./CRUD/estadoGarantia');
const garantiaRoutes = require('./CRUD/garantia');

const colores = require('./CRUD/color');
const calidadRepuestos = require('./CRUD/calidadRepuestos');
const nombreRepuestos = require('./CRUD/nombreRepuestos');
const almacenamientoRepuestos = require('./CRUD/almacenamientoRepuestos');
// Finanzas
const categoriesRoutes = require('./CRUD/categories');
const movementsRoutes = require('./CRUD/movements');
const movnameRoutes = require('./CRUD/movname');
const cobrosRoutes = require('./CRUD/cobros')

// Usar rutas CRUD
app.use('/api/users/login', loginRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/grupousuarios', grupoRoutes);
// Ordenes
app.use('/api/devices', devicesRoutes);
app.use('/api/brand', brandRoutes);
app.use('/api/type', typeRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/orders/messages', messagesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/reasignOrder', reasignOrderRoutes);
// Stock
app.use('/api/stock', stockRoutes);
app.use('/api/reduceStock', reduceStockRoutes);
app.use('/api/stockitem', stockItemRoutes);
app.use('/api/supplier', supplierRoutes);
app.use('/api/states', statesRoutes);

app.use('/api/estadoGarantia', estadoGarantiaRoutes)
app.use('/api/garantia', garantiaRoutes)

app.use('/api/nombresRepuestos', nombreRepuestos);
app.use('/api/calidadesRepuestos', calidadRepuestos);
app.use('/api/almacenamientosRepuestos', almacenamientoRepuestos);
app.use('/api/colores', colores);
// Finanzas
app.use('/api/movcategories', categoriesRoutes);
app.use('/api/movements', movementsRoutes);
app.use('/api/movname', movnameRoutes);
app.use('/api/cobros', cobrosRoutes);

// Mount /api/v2/* router (TypeScript backend, built to dist/ by `npm run build`).
// Wrapped in try/catch so `node index.js` still works if dist/ is missing
// (e.g. in a fresh clone before running the build).
try {
  const { createV2Router } = require('./dist/v2');
  app.use('/api/v2', createV2Router());
  console.log('v2 API mounted at /api/v2');
} catch (err) {
  console.warn('v2 API not mounted (dist missing?):', err.message);
}

// Agregar puerto de escucha
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});