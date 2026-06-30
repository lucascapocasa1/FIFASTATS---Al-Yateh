require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS - permite requests desde el frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rutas
app.use('/api', routes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('Error global:', err);
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor FIFA Stats corriendo en http://localhost:${PORT}`);
  console.log(`📋 Endpoints disponibles:`);
  console.log(`   POST http://localhost:${PORT}/api/upload`);
  console.log(`   POST http://localhost:${PORT}/api/save`);
  console.log(`   GET  http://localhost:${PORT}/api/stats`);
  console.log(`   DELETE http://localhost:${PORT}/api/stats/:id`);
  console.log(`   GET  http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
