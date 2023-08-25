const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json())
app.use(cors())

// Agregar base de datos
const db = require('./database/dbConfig');

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

const colores = require('./CRUD/color');
const calidadRepuestos = require('./CRUD/calidadRepuestos');
const nombreRepuestos = require('./CRUD/nombreRepuestos');
// Finanzas
const categoriesRoutes = require('./CRUD/categories');
const movementsRoutes = require('./CRUD/movements');
const movnameRoutes = require('./CRUD/movname');

// Usar rutas CRUD
app.use('/users/login', loginRoutes);
app.use('/users', usersRoutes);
app.use('/grupousuarios', grupoRoutes);
// Ordenes
app.use('/devices', devicesRoutes);
app.use('/brand', brandRoutes);
app.use('/type', typeRoutes);
app.use('/branches', branchesRoutes);
app.use('/clients', clientsRoutes);
app.use('/orders/messages', messagesRoutes);
app.use('/orders', ordersRoutes);
app.use('/reasignOrder', reasignOrderRoutes);
// Stock
app.use('/stock', stockRoutes);
app.use('/reduceStock', reduceStockRoutes);
app.use('/stockitem', stockItemRoutes);
app.use('/supplier', supplierRoutes);
app.use('/states', statesRoutes);

app.use('/nombresRepuestos', nombreRepuestos);
app.use('/calidadesRepuestos', calidadRepuestos);
app.use('/colores', colores);
// Finanzas
app.use('/movcategories', categoriesRoutes);
app.use('/movements', movementsRoutes);
app.use('/movname', movnameRoutes);


// Agregar puerto de escucha
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});