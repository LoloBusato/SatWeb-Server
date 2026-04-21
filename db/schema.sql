-- MySQL dump 10.13  Distrib 9.6.0, for macos14.8 (arm64)
--
-- Host: brggm6jmjl2xhjbtuira-mysql.services.clever-cloud.com    Database: brggm6jmjl2xhjbtuira
-- ------------------------------------------------------
-- Server version	8.0.43-34

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `almacenamientos_repuestos`
--

DROP TABLE IF EXISTS `almacenamientos_repuestos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `almacenamientos_repuestos` (
  `almacenamientos_repuestos_id` int NOT NULL AUTO_INCREMENT,
  `almacenamiento_repuestos` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`almacenamientos_repuestos_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `branches`
--

DROP TABLE IF EXISTS `branches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `branches` (
  `idbranches` int NOT NULL AUTO_INCREMENT,
  `branch` varchar(45) NOT NULL,
  `contact` varchar(100) NOT NULL,
  `info` varchar(255) NOT NULL,
  `ganancia` float NOT NULL,
  PRIMARY KEY (`idbranches`),
  UNIQUE KEY `idbranches_UNIQUE` (`idbranches`),
  UNIQUE KEY `branch_UNIQUE` (`branch`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `brands`
--

DROP TABLE IF EXISTS `brands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `brands` (
  `brandid` int NOT NULL AUTO_INCREMENT COMMENT 'id de la tabla que corresponde a las marcas de los equipos\n',
  `brand` varchar(20) NOT NULL COMMENT 'nombre de las marcas de los diferentes equipos',
  PRIMARY KEY (`brandid`),
  UNIQUE KEY `brandid_UNIQUE` (`brandid`),
  UNIQUE KEY `brand_UNIQUE` (`brand`)
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `calidades_repuestos`
--

DROP TABLE IF EXISTS `calidades_repuestos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calidades_repuestos` (
  `calidades_repuestos_id` int NOT NULL AUTO_INCREMENT,
  `calidad_repuestos` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`calidades_repuestos_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `clients`
--

DROP TABLE IF EXISTS `clients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clients` (
  `idclients` int NOT NULL AUTO_INCREMENT,
  `name` varchar(45) NOT NULL,
  `surname` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `email` varchar(45) DEFAULT NULL COMMENT 'email / instagram',
  `postal` varchar(10) DEFAULT NULL,
  `instagram` varchar(45) DEFAULT NULL,
  `phone` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`idclients`),
  UNIQUE KEY `idclients_UNIQUE` (`idclients`)
) ENGINE=InnoDB AUTO_INCREMENT=7725 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cobros`
--

DROP TABLE IF EXISTS `cobros`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cobros` (
  `idcobros` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `fecha` varchar(45) NOT NULL,
  `movname_id` int NOT NULL,
  `pesos` int DEFAULT NULL,
  `dolares` int DEFAULT NULL,
  `banco` int DEFAULT NULL,
  `mercado_pago` int DEFAULT NULL,
  `encargado` int DEFAULT NULL,
  `devuelto` tinyint NOT NULL DEFAULT '0',
  `fecha_devolucion` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`idcobros`),
  KEY `order_id_FKEY_idx` (`order_id`),
  KEY `movname_id_FKEY_idx` (`movname_id`),
  CONSTRAINT `movname_id_FKEY` FOREIGN KEY (`movname_id`) REFERENCES `movname` (`idmovname`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `order_id_FKEY` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4339 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `colores`
--

DROP TABLE IF EXISTS `colores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `colores` (
  `colores_id` int NOT NULL AUTO_INCREMENT,
  `color` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`colores_id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `devices`
--

DROP TABLE IF EXISTS `devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `devices` (
  `iddevices` int NOT NULL AUTO_INCREMENT,
  `brand_id` int NOT NULL,
  `type_id` int NOT NULL,
  `model` varchar(45) NOT NULL,
  PRIMARY KEY (`iddevices`),
  UNIQUE KEY `iddevices_UNIQUE` (`iddevices`),
  UNIQUE KEY `model_UNIQUE` (`model`),
  KEY `type_id_idx` (`type_id`),
  CONSTRAINT `type_id` FOREIGN KEY (`type_id`) REFERENCES `types` (`typeid`)
) ENGINE=InnoDB AUTO_INCREMENT=773 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `garantia`
--

DROP TABLE IF EXISTS `garantia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `garantia` (
  `idgarantia` int NOT NULL AUTO_INCREMENT,
  `estado_garantia_id` int NOT NULL,
  `stock_id` int NOT NULL,
  PRIMARY KEY (`idgarantia`),
  KEY `estado_garantia_FKEY_idx` (`estado_garantia_id`),
  KEY `garatia_order_id_FKEY_idx` (`stock_id`),
  CONSTRAINT `estado_garantia_FKEY` FOREIGN KEY (`estado_garantia_id`) REFERENCES `garantia_estados` (`idgarantia_estados`),
  CONSTRAINT `garatia_order_id_FKEY` FOREIGN KEY (`stock_id`) REFERENCES `stock` (`idstock`)
) ENGINE=InnoDB AUTO_INCREMENT=84 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `garantia_estados`
--

DROP TABLE IF EXISTS `garantia_estados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `garantia_estados` (
  `idgarantia_estados` int NOT NULL AUTO_INCREMENT,
  `estado_nombre` varchar(45) NOT NULL,
  `estado_color` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`idgarantia_estados`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `grupousuarios`
--

DROP TABLE IF EXISTS `grupousuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `grupousuarios` (
  `idgrupousuarios` int NOT NULL AUTO_INCREMENT,
  `grupo` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `permisos` varchar(127) DEFAULT NULL,
  PRIMARY KEY (`idgrupousuarios`)
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `messages`
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `idmessages` int NOT NULL AUTO_INCREMENT,
  `message` varchar(1000) NOT NULL,
  `username` varchar(35) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `created_at` varchar(45) NOT NULL,
  `orderId` int NOT NULL,
  PRIMARY KEY (`idmessages`),
  KEY `order_id_idx` (`orderId`)
) ENGINE=InnoDB AUTO_INCREMENT=28076 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `movcategories`
--

DROP TABLE IF EXISTS `movcategories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `movcategories` (
  `idmovcategories` int NOT NULL AUTO_INCREMENT,
  `categories` varchar(45) NOT NULL,
  `tipo` varchar(100) NOT NULL,
  `branch_id` int DEFAULT NULL,
  `es_dolar` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`idmovcategories`),
  UNIQUE KEY `categorias_UNIQUE` (`categories`),
  KEY `categorie_branch_FKEY_idx` (`branch_id`),
  CONSTRAINT `categorie_branch_FKEY` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`idbranches`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `movements`
--

DROP TABLE IF EXISTS `movements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `movements` (
  `idmovements` int NOT NULL AUTO_INCREMENT,
  `movcategories_id` int NOT NULL,
  `unidades` decimal(11,2) NOT NULL,
  `movname_id` int NOT NULL,
  `branch_id` int NOT NULL,
  PRIMARY KEY (`idmovements`),
  UNIQUE KEY `movcategories_id` (`movcategories_id`,`movname_id`),
  KEY `categoriaId_idx` (`movcategories_id`),
  KEY `movnameId_FKEY_idx` (`movname_id`),
  KEY `branchid_FKEY` (`branch_id`),
  CONSTRAINT `branchid_FKEY` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`idbranches`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `categoriesId` FOREIGN KEY (`movcategories_id`) REFERENCES `movcategories` (`idmovcategories`),
  CONSTRAINT `movnameId_FKEY` FOREIGN KEY (`movname_id`) REFERENCES `movname` (`idmovname`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=33607 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `movname`
--

DROP TABLE IF EXISTS `movname`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `movname` (
  `idmovname` int NOT NULL AUTO_INCREMENT,
  `ingreso` varchar(155) NOT NULL,
  `egreso` varchar(155) NOT NULL,
  `operacion` varchar(255) NOT NULL,
  `monto` int NOT NULL,
  `fecha` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `userId` int NOT NULL,
  `branch_id` int NOT NULL,
  `order_id` int DEFAULT NULL,
  PRIMARY KEY (`idmovname`),
  KEY `userId_idx` (`userId`),
  KEY `branch_id_FKEY` (`branch_id`),
  KEY `order_id_movname_FKEY_idx` (`order_id`),
  CONSTRAINT `branch_id_FKEY` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`idbranches`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `order_id_movname_FKEY` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `user_id_FKEY` FOREIGN KEY (`userId`) REFERENCES `users` (`idusers`)
) ENGINE=InnoDB AUTO_INCREMENT=12037 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `nombres_repuestos`
--

DROP TABLE IF EXISTS `nombres_repuestos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `nombres_repuestos` (
  `nombres_repuestos_id` int NOT NULL AUTO_INCREMENT,
  `nombre_repuestos` text NOT NULL,
  PRIMARY KEY (`nombres_repuestos_id`)
) ENGINE=InnoDB AUTO_INCREMENT=102 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `order_id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `device_id` int NOT NULL,
  `branches_id` int NOT NULL,
  `created_at` varchar(11) NOT NULL,
  `returned_at` varchar(11) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `state_id` int NOT NULL,
  `problem` varchar(500) NOT NULL,
  `password` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `accesorios` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `serial` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `users_id` int NOT NULL,
  `device_color` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `order_primary_id` int DEFAULT NULL,
  PRIMARY KEY (`order_id`),
  KEY `client_id_idx` (`client_id`),
  KEY `device_id_idx` (`device_id`),
  KEY `branches_id_idx` (`branches_id`),
  KEY `state_id_idx` (`state_id`),
  KEY `users_id_idx` (`users_id`),
  CONSTRAINT `branches_id` FOREIGN KEY (`branches_id`) REFERENCES `branches` (`idbranches`),
  CONSTRAINT `client_id` FOREIGN KEY (`client_id`) REFERENCES `clients` (`idclients`),
  CONSTRAINT `device_id` FOREIGN KEY (`device_id`) REFERENCES `devices` (`iddevices`),
  CONSTRAINT `state_id` FOREIGN KEY (`state_id`) REFERENCES `states` (`idstates`)
) ENGINE=InnoDB AUTO_INCREMENT=13291 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `proveedores`
--

DROP TABLE IF EXISTS `proveedores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `proveedores` (
  `idproveedores` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(45) NOT NULL,
  `telefono` int NOT NULL,
  `direccion` varchar(45) DEFAULT 'null',
  PRIMARY KEY (`idproveedores`),
  UNIQUE KEY `nombre_UNIQUE` (`nombre`),
  UNIQUE KEY `telefono_UNIQUE` (`telefono`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reducestock`
--

DROP TABLE IF EXISTS `reducestock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reducestock` (
  `idreducestock` int NOT NULL AUTO_INCREMENT,
  `orderid` int DEFAULT NULL,
  `userid` int NOT NULL,
  `stockid` int DEFAULT NULL,
  `date` varchar(50) NOT NULL,
  `stockbranch_id` int DEFAULT NULL,
  `es_garantia` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`idreducestock`),
  KEY `order_id_idx` (`orderid`),
  KEY `user_id_idx` (`userid`),
  KEY `FK_stock_id_idx` (`stockid`),
  KEY `FK_stockbranch_id` (`stockbranch_id`),
  CONSTRAINT `FK_order_id` FOREIGN KEY (`orderid`) REFERENCES `orders` (`order_id`),
  CONSTRAINT `FK_user_id` FOREIGN KEY (`userid`) REFERENCES `users` (`idusers`)
) ENGINE=InnoDB AUTO_INCREMENT=7357 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `repuestos`
--

DROP TABLE IF EXISTS `repuestos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repuestos` (
  `idrepuestos` int NOT NULL AUTO_INCREMENT,
  `repuesto` varchar(155) NOT NULL,
  `cantidad_limite` int NOT NULL DEFAULT '0',
  `color_id` int DEFAULT NULL,
  `nombre_repuestos_id` int DEFAULT NULL,
  `calidad_repuestos_id` int DEFAULT NULL,
  `almacenamiento_repuestos_id` int DEFAULT NULL,
  `venta` tinyint DEFAULT '0',
  `mostrar` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`idrepuestos`),
  UNIQUE KEY `repuesto_UNIQUE` (`repuesto`),
  KEY `color_id_FKEY` (`color_id`),
  KEY `nombre_repuestos_id_FKEY` (`nombre_repuestos_id`),
  KEY `calidad_repuestos_FKEY` (`calidad_repuestos_id`),
  KEY `almacenaminto_repuestos_id_FKEY_idx` (`almacenamiento_repuestos_id`),
  CONSTRAINT `almacenaminto_repuestos_id_FKEY` FOREIGN KEY (`almacenamiento_repuestos_id`) REFERENCES `almacenamientos_repuestos` (`almacenamientos_repuestos_id`),
  CONSTRAINT `calidad_repuestos_FKEY` FOREIGN KEY (`calidad_repuestos_id`) REFERENCES `calidades_repuestos` (`calidades_repuestos_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `color_id_FKEY` FOREIGN KEY (`color_id`) REFERENCES `colores` (`colores_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `nombre_repuestos_id_FKEY` FOREIGN KEY (`nombre_repuestos_id`) REFERENCES `nombres_repuestos` (`nombres_repuestos_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1537 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `repuestosdevices`
--

DROP TABLE IF EXISTS `repuestosdevices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repuestosdevices` (
  `repuestosdevicesid` int NOT NULL AUTO_INCREMENT,
  `repuestos_id` int NOT NULL,
  `devices_id` int NOT NULL,
  PRIMARY KEY (`repuestosdevicesid`),
  KEY `FK_repuestos_repuestosdevices` (`repuestos_id`),
  KEY `FK_devices_repuestosdevices` (`devices_id`),
  CONSTRAINT `FK_devices_repuestosdevices` FOREIGN KEY (`devices_id`) REFERENCES `devices` (`iddevices`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_repuestos_repuestosdevices` FOREIGN KEY (`repuestos_id`) REFERENCES `repuestos` (`idrepuestos`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1623 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `states`
--

DROP TABLE IF EXISTS `states`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `states` (
  `idstates` int NOT NULL AUTO_INCREMENT,
  `state` varchar(155) NOT NULL,
  `color` varchar(25) DEFAULT NULL,
  PRIMARY KEY (`idstates`),
  UNIQUE KEY `state_UNIQUE` (`state`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stock`
--

DROP TABLE IF EXISTS `stock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock` (
  `idstock` int NOT NULL AUTO_INCREMENT,
  `repuesto_id` int NOT NULL,
  `cantidad` int NOT NULL,
  `precio_compra` decimal(10,2) NOT NULL,
  `proveedor_id` int NOT NULL,
  `fecha_compra` date NOT NULL,
  `cantidad_limite` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `modelo` varchar(100) NOT NULL,
  `capacidad` varchar(100) DEFAULT NULL,
  `color` varchar(100) DEFAULT NULL,
  `porcentaje_bateria` varchar(100) DEFAULT NULL,
  `bateria_original` tinyint(1) DEFAULT NULL,
  `titulo` varchar(100) DEFAULT NULL,
  `descripcion` text,
  `comerciable` tinyint(1) DEFAULT '0',
  `ocultar` tinyint(1) DEFAULT '0',
  `precioVenta` int DEFAULT NULL,
  PRIMARY KEY (`idstock`),
  KEY `repuesto_id_FKEY` (`repuesto_id`),
  KEY `proveedor_id_FKEY` (`proveedor_id`),
  KEY `branch_id_FKEY` (`branch_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4187 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stock_images`
--

DROP TABLE IF EXISTS `stock_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_images` (
  `id` int NOT NULL AUTO_INCREMENT,
  `image_url` varchar(512) NOT NULL,
  `stock_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_stock_images_stock` (`stock_id`),
  CONSTRAINT `fk_stock_images_stock` FOREIGN KEY (`stock_id`) REFERENCES `stock` (`idstock`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stockbranch`
--

DROP TABLE IF EXISTS `stockbranch`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stockbranch` (
  `stockbranchid` int NOT NULL AUTO_INCREMENT,
  `stock_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `cantidad_branch` int NOT NULL,
  `cantidad_restante` int NOT NULL,
  PRIMARY KEY (`stockbranchid`),
  UNIQUE KEY `stock_id_2` (`stock_id`,`branch_id`),
  KEY `stock_id` (`stock_id`),
  KEY `branch_id_stock_fkey` (`branch_id`),
  CONSTRAINT `branch_id_stock_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`idbranches`),
  CONSTRAINT `stock_id_fkey` FOREIGN KEY (`stock_id`) REFERENCES `stock` (`idstock`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5711 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `types`
--

DROP TABLE IF EXISTS `types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `types` (
  `typeid` int NOT NULL AUTO_INCREMENT,
  `type` varchar(30) NOT NULL COMMENT 'los diferentes tipos de equipos que fabrican las marcas',
  PRIMARY KEY (`typeid`),
  UNIQUE KEY `idtypes_UNIQUE` (`typeid`),
  UNIQUE KEY `types_UNIQUE` (`type`)
) ENGINE=InnoDB AUTO_INCREMENT=52 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `idusers` int NOT NULL AUTO_INCREMENT,
  `username` varchar(45) NOT NULL,
  `password` varchar(45) NOT NULL,
  `grupos_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `user_color` varchar(45) DEFAULT '#374151',
  PRIMARY KEY (`idusers`),
  UNIQUE KEY `username_UNIQUE` (`username`),
  KEY `grupos_id_fkey` (`grupos_id`),
  KEY `branch_id_users_fkey` (`branch_id`),
  CONSTRAINT `branch_id_users_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`idbranches`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `grupos_id_fkey` FOREIGN KEY (`grupos_id`) REFERENCES `grupousuarios` (`idgrupousuarios`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping events for database 'brggm6jmjl2xhjbtuira'
--

--
-- Dumping routines for database 'brggm6jmjl2xhjbtuira'
--
--
-- WARNING: can't read the INFORMATION_SCHEMA.libraries table. It's most probably an old server 8.0.43-34.
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed
